import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import {
  getMarketplaceCreatorPerformance,
  refreshAccessToken,
  searchSellerAffiliateOrders,
} from "@/lib/tiktok-shop-api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_WINDOW_SECONDS = 90 * 24 * 60 * 60;

async function tokenForShop(shopId: string) {
  const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
  if (!shop?.accessToken || !shop.shopCipher) throw new Error("店铺未授权或缺少店铺凭证");
  const appConfig = shop.appKey
    ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } })
    : null;
  const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
  const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";
  if (!appKey || !appSecret) throw new Error("缺少 TikTok 应用配置");

  let accessToken = shop.accessToken;
  if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60_000)) {
    if (!shop.refreshToken) throw new Error("店铺令牌已过期，请重新授权");
    const refreshed = await refreshAccessToken(shop.refreshToken, appKey, appSecret);
    accessToken = refreshed.accessToken;
    await prisma.tikTokShopSetting.update({
      where: { shopId },
      data: {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
      },
    });
  }
  return { accessToken, shopCipher: shop.shopCipher, appKey, appSecret };
}

function positiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function decimalValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function creatorIdFrom(value: Record<string, any>) {
  return stringValue(value.creator_user_id, value.creator_id, value.creator?.user_id, value.creator?.id);
}

async function syncCreatorProfile(shopId: string, creatorUserId: string) {
  const token = await tokenForShop(shopId);
  const data = await getMarketplaceCreatorPerformance(
    token.accessToken,
    token.shopCipher,
    token.appKey,
    token.appSecret,
    creatorUserId,
  );
  const creator = data?.creator || data?.data?.creator || data || {};
  const followerCount = positiveInt(creator.follower_count ?? creator.followers ?? creator.follower_information?.follower_count);
  const profile = await prisma.creatorProfile.upsert({
    where: { platform_creatorUserId: { platform: "TIKTOK", creatorUserId } },
    create: {
      platform: "TIKTOK",
      creatorUserId,
      username: stringValue(creator.username, creator.creator_username),
      nickname: stringValue(creator.nickname, creator.display_name, creator.creator_nickname),
      avatarUrl: stringValue(creator.avatar_url, creator.avatar?.url),
      selectionRegion: stringValue(creator.selection_region, creator.region),
      followerCount,
      rawData: data,
      syncedAt: new Date(),
    },
    update: {
      username: stringValue(creator.username, creator.creator_username),
      nickname: stringValue(creator.nickname, creator.display_name, creator.creator_nickname),
      avatarUrl: stringValue(creator.avatar_url, creator.avatar?.url),
      selectionRegion: stringValue(creator.selection_region, creator.region),
      followerCount,
      rawData: data,
      syncedAt: new Date(),
    },
  });
  return profile;
}

/**
 * Sync SKU-level creator attribution from TikTok's official affiliate order API.
 * It is deliberately separate from the order webhook: order ingestion stays fast,
 * while the affiliate API supplies auditable creator ownership asynchronously.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const now = Math.floor(Date.now() / 1000);
    const startTime = positiveInt(body.startTime) || now - 30 * 24 * 60 * 60;
    const endTime = positiveInt(body.endTime) || now;
    const requestedShopId = typeof body.shopId === "string" && body.shopId ? body.shopId : null;
    const creatorUsername = typeof body.creatorUsername === "string" ? body.creatorUsername.trim().toLowerCase() : "";
    const creatorUserId = typeof body.creatorUserId === "string" ? body.creatorUserId.trim() : "";

    if (endTime <= startTime || endTime - startTime > MAX_WINDOW_SECONDS) {
      return NextResponse.json({ error: "联盟订单单次同步时间范围必须在 90 天内" }, { status: 400 });
    }
    if (creatorUserId) {
      if (!requestedShopId) return NextResponse.json({ error: "刷新达人档案需要指定店铺" }, { status: 400 });
      const profile = await syncCreatorProfile(requestedShopId, creatorUserId);
      return NextResponse.json({ success: true, profile: { ...profile, followerCount: profile.followerCount ?? 0 } });
    }

    const shops = await prisma.tikTokShopSetting.findMany({
      where: { ...(requestedShopId ? { shopId: requestedShopId } : { status: "active" }) },
      select: { shopId: true, shopName: true },
    });
    if (shops.length === 0) return NextResponse.json({ error: "没有可同步的已授权店铺" }, { status: 404 });

    const results: Array<Record<string, unknown>> = [];
    for (const shop of shops) {
      const result: Record<string, unknown> = { shopId: shop.shopId, shopName: shop.shopName, pages: 0, orders: 0, skuLines: 0, upserts: 0, skippedWithoutCreator: 0 };
      try {
        const token = await tokenForShop(shop.shopId);
        let pageToken: string | undefined;
        const seenTokens = new Set<string>();
        while (Number(result.pages) < 1_000) {
          const data = await searchSellerAffiliateOrders(
            token.accessToken,
            token.shopCipher,
            token.appKey,
            token.appSecret,
            { create_time_ge: startTime, create_time_lt: endTime, page_size: 100, page_token: pageToken },
          );
          result.pages = Number(result.pages) + 1;
          const orders = Array.isArray(data?.orders) ? data.orders : [];
          result.orders = Number(result.orders) + orders.length;

          for (const order of orders) {
            const orderId = stringValue(order.id, order.order_id);
            if (!orderId) continue;
            const skus = Array.isArray(order.skus) ? order.skus : [];
            for (const sku of skus) {
              result.skuLines = Number(result.skuLines) + 1;
              const username = stringValue(sku.creator_username, sku.creator?.username, order.creator_username, order.creator?.username);
              const externalSkuId = stringValue(sku.sku_id, sku.id, sku.seller_sku, sku.external_sku_id);
              if (!username || !externalSkuId) {
                result.skippedWithoutCreator = Number(result.skippedWithoutCreator) + 1;
                continue;
              }
              if (creatorUsername && username.toLowerCase() !== creatorUsername) continue;
              await prisma.creatorOrderAttribution.upsert({
                where: {
                  platform_shopId_orderId_externalSkuId_creatorUsername: {
                    platform: "TIKTOK",
                    shopId: shop.shopId,
                    orderId,
                    externalSkuId,
                    creatorUsername: username,
                  },
                },
                create: {
                  platform: "TIKTOK",
                  shopId: shop.shopId,
                  orderId,
                  externalSkuId,
                  creatorUsername: username,
                  creatorUserId: creatorIdFrom(sku) || creatorIdFrom(order),
                  creatorNickname: stringValue(sku.creator_nickname, sku.creator?.nickname, order.creator_nickname, order.creator?.nickname),
                  collaborationType: stringValue(order.collaboration_type, sku.collaboration_type),
                  programId: stringValue(order.program_id, sku.program_id),
                  openCollaborationId: stringValue(order.open_collaboration_id),
                  targetCollaborationId: stringValue(order.target_collaboration_id),
                  campaignId: stringValue(order.campaign_id, sku.campaign_id),
                  settlementStatus: stringValue(sku.settlement_status, order.settlement_status),
                  quantity: positiveInt(sku.quantity),
                  currency: stringValue(sku.currency, order.currency),
                  unitPrice: decimalValue(sku.price?.amount ?? sku.price?.value ?? sku.price),
                  rawData: { order, sku },
                  syncedAt: new Date(),
                },
                update: {
                  creatorUserId: creatorIdFrom(sku) || creatorIdFrom(order),
                  creatorNickname: stringValue(sku.creator_nickname, sku.creator?.nickname, order.creator_nickname, order.creator?.nickname),
                  collaborationType: stringValue(order.collaboration_type, sku.collaboration_type),
                  programId: stringValue(order.program_id, sku.program_id),
                  openCollaborationId: stringValue(order.open_collaboration_id),
                  targetCollaborationId: stringValue(order.target_collaboration_id),
                  campaignId: stringValue(order.campaign_id, sku.campaign_id),
                  settlementStatus: stringValue(sku.settlement_status, order.settlement_status),
                  quantity: positiveInt(sku.quantity),
                  currency: stringValue(sku.currency, order.currency),
                  unitPrice: decimalValue(sku.price?.amount ?? sku.price?.value ?? sku.price),
                  rawData: { order, sku },
                  syncedAt: new Date(),
                },
              });
              result.upserts = Number(result.upserts) + 1;
            }
          }
          const nextPageToken = stringValue(data?.next_page_token);
          if (!nextPageToken) break;
          if (seenTokens.has(nextPageToken)) throw new Error("TikTok 返回了重复的联盟订单分页游标");
          seenTokens.add(nextPageToken);
          pageToken = nextPageToken;
        }
        result.success = true;
      } catch (error: any) {
        result.success = false;
        result.error = error?.message || "联盟订单同步失败";
        console.error(`[Creator attribution] ${shop.shopName} sync failed:`, error);
      }
      results.push(result);
    }
    return NextResponse.json({ success: results.some((row) => row.success), startTime, endTime, results });
  } catch (error: any) {
    console.error("[Creator attribution] sync error:", error);
    return NextResponse.json({ error: error?.message || "达人订单同步失败" }, { status: 500 });
  }
}
