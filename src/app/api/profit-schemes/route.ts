import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { dayBefore } from "@/lib/profit-scheme-resolution";
import {
  defaultProfitComponents,
  defaultTimeZone,
  normalizeCountryCode,
  validateProfitComponents,
} from "@/lib/profit-schemes";

export const dynamic = "force-dynamic";

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

function jsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function dateValue(value: unknown, required = false) {
  const text = String(value || "").trim();
  if (!text) return required ? null : undefined;
  return VALID_DATE.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
}

async function storeIdentities() {
  const [stores, tikTokShops] = await Promise.all([
    prisma.store.findMany({
      select: {
        id: true,
        name: true,
        platform: true,
        country: true,
        currency: true,
        accountId: true,
        accountName: true,
        overseasCompanyId: true,
        overseasCompanyName: true,
      },
      orderBy: [{ country: "asc" }, { platform: "asc" }, { name: "asc" }],
    }),
    prisma.tikTokShopSetting.findMany({
      select: { shopId: true, shopName: true, region: true, bankAccountId: true, storeId: true, status: true },
      orderBy: { shopName: "asc" },
    }),
  ]);
  const tikTokByAccount = new Map(
    tikTokShops.flatMap((shop) => shop.bankAccountId ? [[shop.bankAccountId, shop] as const] : []),
  );
  const tikTokByStoreId = new Map(
    tikTokShops.flatMap((shop) => shop.storeId ? [[shop.storeId, shop] as const] : []),
  );
  const identities = stores.map((store) => {
    const platform = String(store.platform).toUpperCase();
    const platformShop = platform === "TIKTOK"
      ? tikTokByStoreId.get(store.id) || tikTokByAccount.get(store.accountId) || null
      : null;
    const countryCode = normalizeCountryCode(store.country || platformShop?.region);
    const authorizedCountryCode = normalizeCountryCode(platformShop?.region);
    const externalShopId = platformShop?.shopId || null;
    const missingFields = [
      !countryCode || countryCode === "UNSET" ? "国家" : null,
      !platform ? "平台" : null,
      !store.currency ? "币种" : null,
      platform === "TIKTOK" && !externalShopId ? "平台店铺ID" : null,
      platformShop && authorizedCountryCode !== "UNSET" && authorizedCountryCode !== countryCode
        ? "授权国家与系统店铺国家不一致"
        : null,
    ].filter(Boolean) as string[];
    return {
      ...store,
      platform,
      countryCode,
      currency: store.currency.toUpperCase(),
      timeZone: defaultTimeZone(countryCode),
      externalShopId,
      externalShopName: platformShop?.shopName || null,
      platformConnectionStatus: platformShop?.status || null,
      identityStatus: missingFields.length === 0 ? "COMPLETE" : "INCOMPLETE",
      missingFields,
    };
  });
  const mappedShopIds = new Set(identities.map((identity) => identity.externalShopId).filter(Boolean));
  const unmappedPlatformStores = tikTokShops
    .filter((shop) => !mappedShopIds.has(shop.shopId))
    .map((shop) => ({
      platform: "TIKTOK",
      externalShopId: shop.shopId,
      externalShopName: shop.shopName,
      countryCode: normalizeCountryCode(shop.region),
      status: shop.status,
      issue: "未绑定系统店铺",
    }));
  return { identities, unmappedPlatformStores };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const selectedStoreId = request.nextUrl.searchParams.get("storeId") || null;
    const [{ identities, unmappedPlatformStores }, schemes] = await Promise.all([
      storeIdentities(),
      prisma.profitScheme.findMany({
        where: selectedStoreId ? { storeId: selectedStoreId } : undefined,
        include: { components: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] } },
        orderBy: [{ storeId: "asc" }, { version: "desc" }],
      }),
    ]);
    return NextResponse.json({
      stores: selectedStoreId ? identities.filter((store) => store.id === selectedStoreId) : identities,
      unmappedPlatformStores,
      schemes: schemes.map((scheme) => ({
        ...scheme,
        effectiveFrom: scheme.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: scheme.effectiveTo?.toISOString().slice(0, 10) || null,
      })),
    });
  } catch (error: any) {
    console.error("[Profit Schemes GET]", error);
    return NextResponse.json({ error: error?.message || "利润方案读取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const action = String(body?.action || "").trim();

    if (action === "bootstrapBrazilTikTok") {
      const { identities } = await storeIdentities();
      const requestedStoreIds = Array.isArray(body?.storeIds)
        ? new Set(body.storeIds.map((value: unknown) => String(value)))
        : null;
      const candidates = identities.filter((identity) => (
        identity.platform === "TIKTOK"
        && identity.countryCode === "BR"
        && identity.externalShopId
        && identity.identityStatus === "COMPLETE"
        && (!requestedStoreIds || requestedStoreIds.has(identity.id))
      ));
      const createdIds: string[] = [];
      for (const identity of candidates) {
        const exists = await prisma.profitScheme.findFirst({ where: { storeId: identity.id }, select: { id: true } });
        if (exists) continue;
        const created = await prisma.profitScheme.create({
          data: {
            storeId: identity.id,
            externalShopId: identity.externalShopId,
            name: `${identity.name} 巴西 TikTok 利润方案`,
            platform: identity.platform,
            countryCode: identity.countryCode,
            currency: identity.currency,
            timeZone: identity.timeZone,
            version: 1,
            status: "PUBLISHED",
            effectiveFrom: new Date("1970-01-01T00:00:00.000Z"),
            notes: "由现有巴西利润核算规则初始化；不改变当前计算结果",
            components: {
              create: defaultProfitComponents(identity.countryCode, identity.platform).map((component) => ({
                ...component,
                config: jsonInput(component.config),
              })),
            },
          },
          select: { id: true },
        });
        createdIds.push(created.id);
      }
      return NextResponse.json({ success: true, created: createdIds.length, ids: createdIds });
    }

    if (action === "createVersion") {
      const storeId = String(body?.storeId || "").trim();
      const effectiveFrom = dateValue(body?.effectiveFrom, true);
      if (!storeId || !effectiveFrom) return NextResponse.json({ error: "店铺和生效日期不能为空" }, { status: 400 });
      const [{ identities }, existingDraft, latest] = await Promise.all([
        storeIdentities(),
        prisma.profitScheme.findFirst({ where: { storeId, status: "DRAFT" }, select: { id: true, version: true } }),
        prisma.profitScheme.findFirst({
          where: { storeId },
          include: { components: { orderBy: { sortOrder: "asc" } } },
          orderBy: { version: "desc" },
        }),
      ]);
      const store = identities.find((identity) => identity.id === storeId);
      if (!store) return NextResponse.json({ error: "店铺不存在" }, { status: 404 });
      if (store.identityStatus !== "COMPLETE") {
        return NextResponse.json({ error: `店铺身份档案不完整：${store.missingFields.join("、")}` }, { status: 409 });
      }
      if (existingDraft) return NextResponse.json({ error: `该店铺已有待编辑的V${existingDraft.version}方案`, id: existingDraft.id }, { status: 409 });
      const countryCode = normalizeCountryCode(store.country);
      const platform = String(store.platform).toUpperCase();
      const components = latest?.components.length
        ? latest.components.map((component) => ({
            code: component.code,
            label: component.label,
            category: component.category,
            direction: component.direction,
            calculationMode: component.calculationMode,
            sourceKey: component.sourceKey,
            includeInGmv: component.includeInGmv,
            includeInProfit: component.includeInProfit,
            required: component.required,
            visible: component.visible,
            sortOrder: component.sortOrder,
            config: jsonInput(component.config),
          }))
        : defaultProfitComponents(countryCode, platform).map((component) => ({ ...component, config: jsonInput(component.config) }));
      const created = await prisma.profitScheme.create({
        data: {
          storeId,
          externalShopId: latest?.externalShopId || store.externalShopId,
          name: String(body?.name || latest?.name || `${store.name} 利润方案`).trim(),
          platform,
          countryCode,
          currency: store.currency.toUpperCase(),
          timeZone: latest?.timeZone || defaultTimeZone(countryCode),
          version: (latest?.version || 0) + 1,
          status: "DRAFT",
          effectiveFrom,
          notes: String(body?.notes || "").trim() || null,
          components: { create: components },
        },
        include: { components: { orderBy: { sortOrder: "asc" } } },
      });
      return NextResponse.json({ success: true, scheme: created });
    }

    if (action === "saveDraft") {
      const schemeId = String(body?.schemeId || "").trim();
      const effectiveFrom = dateValue(body?.effectiveFrom, true);
      const effectiveTo = dateValue(body?.effectiveTo);
      const validated = validateProfitComponents(body?.components);
      const name = String(body?.name || "").trim();
      const currency = String(body?.currency || "").trim().toUpperCase();
      const timeZone = String(body?.timeZone || "").trim();
      if (!schemeId) return NextResponse.json({ error: "缺少利润方案ID" }, { status: 400 });
      if (!name || name.length > 120) return NextResponse.json({ error: "利润方案名称无效" }, { status: 400 });
      if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "利润方案币种无效" }, { status: 400 });
      if (!validTimeZone(timeZone)) return NextResponse.json({ error: "利润方案时区无效" }, { status: 400 });
      if (!effectiveFrom || effectiveTo === null || (effectiveTo && effectiveTo < effectiveFrom)) {
        return NextResponse.json({ error: "利润方案生效日期无效" }, { status: 400 });
      }
      if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 });
      const existing = await prisma.profitScheme.findUnique({ where: { id: schemeId }, select: { status: true } });
      if (!existing) return NextResponse.json({ error: "利润方案不存在" }, { status: 404 });
      if (existing.status !== "DRAFT") return NextResponse.json({ error: "已发布方案不能直接修改，请创建新版本" }, { status: 409 });
      await prisma.$transaction(async (tx) => {
        await tx.profitScheme.update({
          where: { id: schemeId },
          data: {
            name,
            currency,
            timeZone,
            effectiveFrom,
            effectiveTo,
            notes: String(body?.notes || "").trim() || null,
          },
        });
        await tx.profitSchemeComponent.deleteMany({ where: { schemeId } });
        await tx.profitSchemeComponent.createMany({
          data: validated.components.map((component) => ({
            schemeId,
            ...component,
            config: jsonInput(component.config),
          })),
        });
      });
      return NextResponse.json({ success: true, id: schemeId });
    }

    if (action === "publish") {
      const schemeId = String(body?.schemeId || "").trim();
      const scheme = await prisma.profitScheme.findUnique({
        where: { id: schemeId },
        include: { components: true },
      });
      if (!scheme) return NextResponse.json({ error: "利润方案不存在" }, { status: 404 });
      if (scheme.status !== "DRAFT") return NextResponse.json({ error: "只有草稿方案可以发布" }, { status: 409 });
      const validated = validateProfitComponents(scheme.components);
      if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 });
      const previous = await prisma.profitScheme.findFirst({
        where: { storeId: scheme.storeId, status: "PUBLISHED" },
        orderBy: { effectiveFrom: "desc" },
      });
      if (previous && previous.effectiveFrom >= scheme.effectiveFrom) {
        return NextResponse.json({ error: "新版本生效日期必须晚于当前已发布版本" }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        if (previous) {
          await tx.profitScheme.update({
            where: { id: previous.id },
            data: { effectiveTo: dayBefore(scheme.effectiveFrom), status: "ARCHIVED" },
          });
        }
        await tx.profitScheme.update({ where: { id: scheme.id }, data: { status: "PUBLISHED" } });
      });
      return NextResponse.json({ success: true, id: scheme.id });
    }

    return NextResponse.json({ error: "利润方案操作无效" }, { status: 400 });
  } catch (error: any) {
    console.error("[Profit Schemes POST]", error);
    return NextResponse.json({ error: error?.message || "利润方案保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const id = request.nextUrl.searchParams.get("id") || "";
    const scheme = await prisma.profitScheme.findUnique({ where: { id }, select: { status: true } });
    if (!scheme) return NextResponse.json({ error: "利润方案不存在" }, { status: 404 });
    if (scheme.status !== "DRAFT") return NextResponse.json({ error: "只能删除草稿方案" }, { status: 409 });
    await prisma.profitScheme.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Profit Schemes DELETE]", error);
    return NextResponse.json({ error: error?.message || "利润方案删除失败" }, { status: 500 });
  }
}
