import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHOP_COST_TYPES = new Set(["PLATFORM_FULFILLMENT", "TAX", "INFLUENCER_COMMISSION"]);
const BILLING_UNITS = new Set(["SELLER_UNIT", "INTERNAL_COMPONENT"]);
const WAREHOUSE_PRICING_MODES = new Set(["FLAT_UNIT", "WEIGHT_TIER", "PACKAGE_TIER"]);

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value: unknown, required = false) {
  const text = String(value || "").trim();
  if (!text) return required ? null : undefined;
  return VALID_DATE.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
}

function normalizeTiers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((raw: any) => ({
    minOrderAmount: raw?.minOrderAmount === "" || raw?.minOrderAmount == null ? null : finiteNumber(raw.minOrderAmount),
    maxOrderAmount: raw?.maxOrderAmount === "" || raw?.maxOrderAmount == null ? null : finiteNumber(raw.maxOrderAmount),
    minInclusive: raw?.minInclusive !== false,
    maxInclusive: raw?.maxInclusive === true,
    platformRatePercent: finiteNumber(raw?.platformRatePercent),
    perUnitFee: finiteNumber(raw?.perUnitFee),
    currency: String(raw?.currency || "BRL").trim().toUpperCase(),
  })).filter((tier) => (
    tier.platformRatePercent >= 0
    && tier.platformRatePercent <= 100
    && tier.perUnitFee >= 0
    && (tier.minOrderAmount == null || tier.minOrderAmount >= 0)
    && (tier.maxOrderAmount == null || tier.maxOrderAmount >= 0)
    && (tier.minOrderAmount == null || tier.maxOrderAmount == null || tier.maxOrderAmount >= tier.minOrderAmount)
  ));
}

function normalizeFeeTiers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((raw: any) => ({
    minWeightKg: raw?.minWeightKg === "" || raw?.minWeightKg == null ? null : finiteNumber(raw.minWeightKg),
    maxWeightKg: raw?.maxWeightKg === "" || raw?.maxWeightKg == null ? null : finiteNumber(raw.maxWeightKg),
    minInclusive: raw?.minInclusive === true,
    maxInclusive: raw?.maxInclusive !== false,
    maxLengthCm: raw?.maxLengthCm === "" || raw?.maxLengthCm == null ? null : finiteNumber(raw.maxLengthCm),
    maxWidthCm: raw?.maxWidthCm === "" || raw?.maxWidthCm == null ? null : finiteNumber(raw.maxWidthCm),
    maxHeightCm: raw?.maxHeightCm === "" || raw?.maxHeightCm == null ? null : finiteNumber(raw.maxHeightCm),
    baseFee: finiteNumber(raw?.baseFee),
  })).filter((tier) => (
    tier.baseFee >= 0
    && (tier.minWeightKg == null || tier.minWeightKg >= 0)
    && (tier.maxWeightKg == null || tier.maxWeightKg > 0)
    && (tier.minWeightKg == null || tier.maxWeightKg == null || tier.maxWeightKg > tier.minWeightKg)
    && [tier.maxLengthCm, tier.maxWidthCm, tier.maxHeightCm].every((value) => value == null || value > 0)
  ));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const [shops, stores, warehouses, shopRules, warehouseRules] = await Promise.all([
      prisma.tikTokShopSetting.findMany({
        select: { shopId: true, shopName: true, region: true, bankAccountId: true },
        orderBy: { shopName: "asc" },
      }),
      prisma.store.findMany({ select: { id: true, name: true, accountId: true, currency: true } }),
      prisma.warehouse.findMany({
        where: { type: "OVERSEAS", isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.profitShopCostRule.findMany({
        include: { platformFeeTiers: { orderBy: { minOrderAmount: "asc" } } },
        orderBy: [{ shopId: "asc" }, { costType: "asc" }, { effectiveFrom: "desc" }],
      }),
      prisma.warehouseFulfillmentRule.findMany({
        include: {
          warehouse: { select: { name: true, code: true } },
          feeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
        },
        orderBy: [{ warehouseId: "asc" }, { effectiveFrom: "desc" }],
      }),
    ]);
    const storeByAccount = new Map(stores.map((store) => [store.accountId, store]));

    return NextResponse.json({
      shops: shops.map((shop) => ({
        id: shop.shopId,
        name: (shop.bankAccountId && storeByAccount.get(shop.bankAccountId)?.name) || shop.shopName,
        region: shop.region,
        currency: (shop.bankAccountId && storeByAccount.get(shop.bankAccountId)?.currency) || (shop.region === "US" ? "USD" : "BRL"),
      })),
      warehouses,
      shopRules: shopRules.map((rule) => ({
        ...rule,
        ratePercent: Number(rule.ratePercent),
        fixedPerOrder: Number(rule.fixedPerOrder),
        fixedPerUnit: Number(rule.fixedPerUnit),
        platformFeeTiers: rule.platformFeeTiers.map((tier) => ({
          ...tier,
          minOrderAmount: tier.minOrderAmount == null ? null : Number(tier.minOrderAmount),
          maxOrderAmount: tier.maxOrderAmount == null ? null : Number(tier.maxOrderAmount),
          platformRatePercent: Number(tier.platformRatePercent),
          perUnitFee: Number(tier.perUnitFee),
        })),
        effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: rule.effectiveTo?.toISOString().slice(0, 10) || null,
      })),
      warehouseRules: warehouseRules.map((rule) => ({
        ...rule,
        baseOrderFee: Number(rule.baseOrderFee),
        firstUnitFee: Number(rule.firstUnitFee),
        additionalUnitFee: Number(rule.additionalUnitFee),
        overweightThresholdKg: rule.overweightThresholdKg == null ? null : Number(rule.overweightThresholdKg),
        overweightFeePerKg: Number(rule.overweightFeePerKg),
        feeTiers: rule.feeTiers.map((tier) => ({
          ...tier,
          minWeightKg: tier.minWeightKg == null ? null : Number(tier.minWeightKg),
          maxWeightKg: tier.maxWeightKg == null ? null : Number(tier.maxWeightKg),
          maxLengthCm: tier.maxLengthCm == null ? null : Number(tier.maxLengthCm),
          maxWidthCm: tier.maxWidthCm == null ? null : Number(tier.maxWidthCm),
          maxHeightCm: tier.maxHeightCm == null ? null : Number(tier.maxHeightCm),
          baseFee: Number(tier.baseFee),
        })),
        effectiveFrom: rule.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: rule.effectiveTo?.toISOString().slice(0, 10) || null,
      })),
    });
  } catch (error: any) {
    console.error("[Profit Cost Rules]", error);
    return NextResponse.json({ error: error?.message || "成本规则读取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const kind = String(body?.kind || "").trim();
    const effectiveFrom = dateValue(body?.effectiveFrom, true);
    const effectiveTo = dateValue(body?.effectiveTo);
    if (!effectiveFrom || effectiveTo === null || (effectiveTo && effectiveTo < effectiveFrom)) {
      return NextResponse.json({ error: "生效日期范围无效" }, { status: 400 });
    }

    if (kind === "shop") {
      const shopId = String(body?.shopId || "").trim();
      const costType = String(body?.costType || "").trim().toUpperCase();
      const ratePercent = finiteNumber(body?.ratePercent);
      const fixedPerOrder = finiteNumber(body?.fixedPerOrder);
      const fixedPerUnit = finiteNumber(body?.fixedPerUnit);
      const tiers = normalizeTiers(body?.tiers);
      if (costType === "PLATFORM_FULFILLMENT" && Array.isArray(body?.tiers) && tiers.length !== body.tiers.length) {
        return NextResponse.json({ error: "平台费用阶梯参数无效" }, { status: 400 });
      }
      if (!shopId || !SHOP_COST_TYPES.has(costType) || ratePercent < 0 || ratePercent > 100 || fixedPerOrder < 0 || fixedPerUnit < 0) {
        return NextResponse.json({ error: "店铺成本规则参数无效" }, { status: 400 });
      }
      const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { shopId: true } });
      if (!shop) return NextResponse.json({ error: "店铺不存在" }, { status: 400 });
      const rule = await prisma.$transaction(async (tx) => {
        const saved = await tx.profitShopCostRule.upsert({
          where: {
            platform_shopId_costType_effectiveFrom: {
              platform: "TIKTOK",
              shopId,
              costType,
              effectiveFrom,
            },
          },
          create: {
            platform: "TIKTOK",
            shopId,
            costType,
            ratePercent,
            fixedPerOrder,
            fixedPerUnit,
            currency: String(body?.currency || "BRL").trim().toUpperCase(),
            effectiveFrom,
            effectiveTo,
            notes: String(body?.notes || "").trim() || null,
          },
          update: {
            ratePercent,
            fixedPerOrder,
            fixedPerUnit,
            currency: String(body?.currency || "BRL").trim().toUpperCase(),
            effectiveTo,
            enabled: true,
            notes: String(body?.notes || "").trim() || null,
          },
        });
        if (costType === "PLATFORM_FULFILLMENT") {
          await tx.profitPlatformFeeTier.deleteMany({ where: { ruleId: saved.id } });
          if (tiers.length > 0) {
            await tx.profitPlatformFeeTier.createMany({
              data: tiers.map((tier) => ({ ruleId: saved.id, ...tier })),
            });
          }
        }
        return saved;
      });
      return NextResponse.json({ success: true, id: rule.id });
    }

    if (kind === "warehouse") {
      const id = String(body?.id || "").trim();
      const warehouseId = String(body?.warehouseId || "").trim();
      const shopId = String(body?.shopId || "").trim() || null;
      const pricingMode = String(body?.pricingMode || "FLAT_UNIT").trim().toUpperCase();
      const billingUnit = String(body?.billingUnit || "SELLER_UNIT").trim().toUpperCase();
      const baseOrderFee = finiteNumber(body?.baseOrderFee);
      const firstUnitFee = finiteNumber(body?.firstUnitFee);
      const additionalUnitFee = finiteNumber(body?.additionalUnitFee);
      const volumetricDivisor = Math.round(finiteNumber(body?.volumetricDivisor, 6000));
      const overweightThresholdKg = body?.overweightThresholdKg === "" || body?.overweightThresholdKg == null
        ? null
        : finiteNumber(body.overweightThresholdKg);
      const overweightFeePerKg = finiteNumber(body?.overweightFeePerKg);
      const feeTiers = normalizeFeeTiers(body?.feeTiers);
      if (pricingMode !== "FLAT_UNIT" && (!Array.isArray(body?.feeTiers) || feeTiers.length !== body.feeTiers.length || feeTiers.length === 0)) {
        return NextResponse.json({ error: "仓库费用分档参数无效" }, { status: 400 });
      }
      if (
        !warehouseId
        || !WAREHOUSE_PRICING_MODES.has(pricingMode)
        || !BILLING_UNITS.has(billingUnit)
        || [baseOrderFee, firstUnitFee, additionalUnitFee, overweightFeePerKg].some((value) => value < 0)
        || volumetricDivisor <= 0
        || (overweightThresholdKg != null && overweightThresholdKg <= 0)
      ) {
        return NextResponse.json({ error: "仓库代发规则参数无效" }, { status: 400 });
      }
      const [warehouse, shop] = await Promise.all([
        prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, type: true } }),
        shopId ? prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { shopId: true } }) : Promise.resolve(null),
      ]);
      if (!warehouse || warehouse.type !== "OVERSEAS") return NextResponse.json({ error: "海外仓不存在" }, { status: 400 });
      if (shopId && !shop) return NextResponse.json({ error: "店铺不存在" }, { status: 400 });
      const data = {
        warehouseId,
        shopId,
        pricingMode,
        billingUnit,
        baseOrderFee,
        firstUnitFee,
        additionalUnitFee,
        volumetricDivisor,
        overweightThresholdKg,
        overweightFeePerKg,
        currency: String(body?.currency || "BRL").trim().toUpperCase(),
        effectiveFrom,
        effectiveTo,
        enabled: true,
        notes: String(body?.notes || "").trim() || null,
      };
      const rule = await prisma.$transaction(async (tx) => {
        const saved = id
          ? await tx.warehouseFulfillmentRule.update({ where: { id }, data })
          : await tx.warehouseFulfillmentRule.create({ data });
        await tx.warehouseFulfillmentFeeTier.deleteMany({ where: { ruleId: saved.id } });
        if (pricingMode !== "FLAT_UNIT") {
          await tx.warehouseFulfillmentFeeTier.createMany({
            data: feeTiers.map((tier) => ({ ruleId: saved.id, ...tier })),
          });
        }
        return saved;
      });
      return NextResponse.json({ success: true, id: rule.id });
    }

    return NextResponse.json({ error: "成本规则类型无效" }, { status: 400 });
  } catch (error: any) {
    console.error("[Profit Cost Rules]", error);
    return NextResponse.json({ error: error?.message || "成本规则保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const kind = request.nextUrl.searchParams.get("kind");
    const id = request.nextUrl.searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "缺少规则 ID" }, { status: 400 });
    if (kind === "shop") await prisma.profitShopCostRule.delete({ where: { id } });
    else if (kind === "warehouse") await prisma.warehouseFulfillmentRule.delete({ where: { id } });
    else return NextResponse.json({ error: "成本规则类型无效" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Profit Cost Rules]", error);
    return NextResponse.json({ error: error?.message || "成本规则删除失败" }, { status: 500 });
  }
}
