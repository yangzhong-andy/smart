import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVideoProductPerformance, getVideoPerformanceDetail, refreshAccessToken } from "@/lib/tiktok-shop-api";
import { decryptTikTokSecret, encryptTikTokSecret } from "@/lib/tiktok-secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/tiktok/video-products?shopId=xxx&videoId=xxx&startDate=2026-07-19&endDate=2026-07-26
 * 获取某条视频的商品性能 + 视频性能详情（流量+画像）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const videoId = searchParams.get("videoId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!shopId || !videoId || !startDate || !endDate) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
    if (!shop || !shop.accessToken || !shop.shopCipher) {
      return NextResponse.json({ error: "店铺未授权" }, { status: 400 });
    }

    const appConfig = shop.appKey ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } }) : null;
    const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const appSecret = decryptTikTokSecret(appConfig?.appSecret) || process.env.TIKTOK_APP_SECRET || "";

    let accessToken = decryptTikTokSecret(shop.accessToken)!;
    if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
      const refreshed = await refreshAccessToken(decryptTikTokSecret(shop.refreshToken)!, appKey, appSecret);
      accessToken = refreshed.accessToken;
      await prisma.tikTokShopSetting.update({
        where: { shopId },
        data: {
          accessToken: encryptTikTokSecret(refreshed.accessToken),
          refreshToken: encryptTikTokSecret(refreshed.refreshToken),
          tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
        },
      });
    }

    // 获取商品性能
    const productData = await getVideoProductPerformance(accessToken, shop.shopCipher, appKey, appSecret, videoId, {
      start_date_ge: startDate, end_date_lt: endDate,
    });
    const products = (productData.products || []).map((p: any) => ({
      productId: p.id,
      gmv: p.gmv?.amount || "0",
      unitsSold: p.units_sold || 0,
      dailyAvgBuyers: p.daily_avg_buyers || "0",
    }));

    // 获取视频性能详情（流量+互动+画像）
    let detail: any = null;
    try {
      const detailData = await getVideoPerformanceDetail(accessToken, shop.shopCipher, appKey, appSecret, videoId, {
        start_date_ge: startDate, end_date_lt: endDate,
      });
      const interval = detailData.performance?.intervals?.[0];
      const sales = interval?.sales?.overall || {};
      const traffic = interval?.traffic || {};
      detail = {
        sales: {
          gmv: sales.gmv?.amount || "0",
          gpm: sales.gpm?.amount || "0",
          itemsSold: sales.items_sold || 0,
          customers: sales.customers || 0,
          ctr: sales.ctr || "0",
          productClicks: sales.product_clicks || 0,
          productImpressions: sales.product_impressions || 0,
        },
        traffic: {
          views: traffic.views || 0,
          likes: traffic.likes || 0,
          comments: traffic.comments || 0,
          shares: traffic.shares || 0,
          newFollowers: traffic.new_followers || 0,
        },
      };
    } catch (e: any) {
      console.error("[TikTok Video Products] 详情失败:", e.message);
    }

    return NextResponse.json({ success: true, products, detail, totalCount: productData.total_count || 0 });
  } catch (error: any) {
    console.error("[TikTok Video Products] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
