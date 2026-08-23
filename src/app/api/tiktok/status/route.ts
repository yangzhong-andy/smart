import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { requireApiUser } from "@/lib/api-auth";
import { ensureTikTokStoreBinding } from "@/lib/tiktok-shop-binding";
import {
  evaluateTikTokCountryIdentity,
  expectedCurrencyForRegion,
  normalizeTikTokRegion,
} from "@/lib/tiktok-shop-identity";
import { recordTikTokAuthEvent } from "@/lib/tiktok-auth-audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/status
 * 查看已授权的 TikTok 店铺列表和状态
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const [shops, orderCurrencies, statementCurrencies, paymentCurrencies, stores] = await Promise.all([
      prisma.tikTokShopSetting.findMany({
        include: { store: { select: { id: true, name: true, platform: true, country: true, currency: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tikTokOrder.groupBy({
        by: ["shopId", "currency"],
        where: { currency: { not: null } },
        _count: { _all: true },
      }),
      prisma.tikTokStatement.groupBy({
        by: ["shopId", "currency"],
        where: { currency: { not: null } },
        _count: { _all: true },
      }),
      prisma.tikTokPayment.groupBy({
        by: ["shopId", "currency"],
        where: { currency: { not: null } },
        _count: { _all: true },
      }),
      prisma.store.findMany({
        select: { id: true, name: true, platform: true, country: true, currency: true, accountId: true },
      }),
    ]);

    const currencyEvidence = new Map<string, Set<string>>();
    for (const row of [...orderCurrencies, ...statementCurrencies, ...paymentCurrencies]) {
      const currency = String(row.currency || "").trim().toUpperCase();
      if (!currency) continue;
      if (!currencyEvidence.has(row.shopId)) currencyEvidence.set(row.shopId, new Set());
      currencyEvidence.get(row.shopId)?.add(currency);
    }
    const legacyStoresByAccount = new Map<string, typeof stores>();
    for (const store of stores) {
      if (!store.accountId) continue;
      const matches = legacyStoresByAccount.get(store.accountId) || [];
      matches.push(store);
      legacyStoresByAccount.set(store.accountId, matches);
    }

    return NextResponse.json({
      shops: shops.map((s) => {
        const identity = evaluateTikTokCountryIdentity({
          region: s.region,
          regionSource: s.regionSource,
          observedCurrencies: currencyEvidence.get(s.shopId),
        });
        const legacyMatches = s.bankAccountId ? legacyStoresByAccount.get(s.bankAccountId) || [] : [];
        const linkedStore = s.store || (legacyMatches.length === 1 ? legacyMatches[0] : null);
        const storeCountry = normalizeTikTokRegion(linkedStore?.country);
        const bindingStatus = !linkedStore
          ? "MISSING"
          : identity.region && storeCountry !== identity.region
            ? "CONFLICT"
            : String(linkedStore.platform) !== "TIKTOK"
              ? "CONFLICT"
              : "BOUND";
        return {
          id: s.id,
          shopId: s.shopId,
          shopName: s.shopName,
          region: identity.region || "UNSET",
          countryName: identity.countryName,
          regionSource: s.regionSource,
          regionVerifiedAt: s.regionVerifiedAt?.toISOString() || null,
          countryStatus: identity.status,
          expectedCurrency: identity.expectedCurrency,
          observedCurrencies: identity.observedCurrencies,
          bindingStatus,
          storeId: linkedStore?.id || null,
          storeName: linkedStore?.name || null,
          storeCountry: linkedStore?.country || null,
          storeCurrency: linkedStore?.currency || null,
          sellerType: s.sellerType,
          status: s.status,
          tokenExpireAt: s.tokenExpireAt?.toISOString() || null,
          lastSyncAt: s.lastSyncAt?.toISOString() || null,
          isExpired: s.tokenExpireAt ? s.tokenExpireAt < new Date() : true,
        };
      }),
      appKey: process.env.TIKTOK_APP_KEY || "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/tiktok/status
 * 人工确认授权店铺国家；没有内部店铺时按 shopId 自动创建并绑定。
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const shopId = String(body?.shopId || "").trim();
    const region = normalizeTikTokRegion(body?.region);
    const currency = expectedCurrencyForRegion(region);
    if (!shopId || !region || !currency) {
      return NextResponse.json({ error: "请选择系统已支持的国家/站点" }, { status: 400 });
    }

    const shop = await prisma.tikTokShopSetting.findUnique({
      where: { shopId },
      include: { store: { select: { id: true, country: true, platform: true } } },
    });
    if (!shop) return NextResponse.json({ error: "授权店铺不存在" }, { status: 404 });

    const linkedCountry = normalizeTikTokRegion(shop.store?.country);
    if (shop.store && (String(shop.store.platform) !== "TIKTOK" || linkedCountry !== region)) {
      return NextResponse.json({
        error: `该授权已绑定系统店铺（${shop.store.country}），请先在店铺管理中核对国家`,
      }, { status: 409 });
    }

    const storeId = await ensureTikTokStoreBinding({
      shopId: shop.shopId,
      shopName: shop.shopName,
      region,
      existingStoreId: shop.storeId,
      bankAccountId: shop.bankAccountId,
      createIfMissing: true,
    });
    const updated = await prisma.tikTokShopSetting.update({
      where: { shopId },
      data: {
        region,
        regionSource: "MANUAL",
        regionVerifiedAt: new Date(),
        ...(storeId ? { storeId } : {}),
      },
      select: { shopId: true, region: true, storeId: true },
    });
    await clearCacheByPrefix("tiktok");
    await clearCacheByPrefix("stores");
    await recordTikTokAuthEvent({ eventType: "COUNTRY_CONFIRMED", status: "SUCCESS", shopId, userId: auth.user.id, metadata: { region } });
    return NextResponse.json({ success: true, shop: updated });
  } catch (error: any) {
    console.error("[TikTok status PATCH]", error);
    return NextResponse.json({ error: error.message || "国家确认失败" }, { status: 500 });
  }
}

/**
 * DELETE /api/tiktok/status?shopId=xxx
 * 断开店铺授权
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "缺少 shopId" }, { status: 400 });
    }

    await prisma.tikTokShopSetting.update({
      where: { shopId },
      data: {
        status: "disconnected",
        accessToken: null,
        refreshToken: null,
        tokenExpireAt: null,
      },
    });

    await clearCacheByPrefix("tiktok");

    await recordTikTokAuthEvent({ eventType: "AUTHORIZATION_DISCONNECTED", status: "SUCCESS", shopId, userId: auth.user.id });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
