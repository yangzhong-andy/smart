import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getShopPerformance, getShopVideoPerformance, getShopVideoList, refreshAccessToken } from "@/lib/tiktok-shop-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/tiktok/shop-analytics?shopId=xxx&startDate=2026-07-19&endDate=2026-07-26
 * 获取商店分析数据（GMV、订单、客户、访客、转化率等）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!shopId || !startDate || !endDate) {
      return NextResponse.json({ error: "缺少 shopId、startDate 或 endDate" }, { status: 400 });
    }

    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
    if (!shop || !shop.accessToken || !shop.shopCipher) {
      return NextResponse.json({ error: "店铺未授权" }, { status: 400 });
    }

    const appConfig = shop.appKey ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } }) : null;
    const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";

    // 刷新 token
    let accessToken = shop.accessToken;
    if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
      const refreshed = await refreshAccessToken(shop.refreshToken!, appKey, appSecret);
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

    const data = await getShopPerformance(accessToken, shop.shopCipher, appKey, appSecret, {
      start_date_ge: startDate,
      end_date_lt: endDate,
    });

    // 提取关键指标
    const interval = data.performance?.intervals?.[0];
    if (!interval) {
      return NextResponse.json({ error: "无数据" }, { status: 404 });
    }

    const sales = interval.sales || {};
    const traffic = interval.traffic || {};
    const gmvBreakdowns = sales.gmv?.breakdowns || [];

    const result = {
      latestAvailableDate: data.latest_available_date,
      startDate: interval.start_date,
      endDate: interval.end_date,
      // GMV
      gmv: {
        total: sales.gmv?.overall?.amount || "0",
        currency: sales.gmv?.overall?.currency || "BRL",
        breakdowns: gmvBreakdowns.map((b: any) => ({
          type: b.type,
          amount: b.gmv?.amount || "0",
          currency: b.gmv?.currency || "BRL",
        })),
      },
      grossRevenue: {
        amount: sales.gross_revenue?.overall?.amount || "0",
        currency: sales.gross_revenue?.overall?.currency || "BRL",
      },
      // 订单
      ordersCount: sales.orders_count || 0,
      skuOrdersCount: sales.sku_orders_count || 0,
      itemsSold: sales.items_sold || 0,
      avgCustomersCount: sales.avg_customers_count || 0,
      // 退款
      refunds: {
        amount: sales.refunds?.amount || "0",
        currency: sales.refunds?.currency || "BRL",
      },
      // 流量
      avgVisitors: traffic.avg_visitors || 0,
      avgPageViews: traffic.avg_page_views || 0,
      avgConversionRate: traffic.avg_conversation_rate || "0",
    };

    // 获取今日数据
    try {
      const nowUTC = new Date();
      const today = nowUTC.toISOString().split("T")[0];
      const tomorrow = new Date(nowUTC.getTime() + 86400000).toISOString().split("T")[0];
      const todayData = await getShopPerformance(accessToken, shop.shopCipher, appKey, appSecret, {
        start_date_ge: today, end_date_lt: tomorrow,
      });
      const todayInterval = todayData.performance?.intervals?.[0];
      const todaySales = todayInterval?.sales || {};
      const todayTraffic = todayInterval?.traffic || {};
      result.today = {
        gmv: todaySales.gmv?.overall?.amount || "0",
        currency: todaySales.gmv?.overall?.currency || "BRL",
        orders: todaySales.orders_count || 0,
        itemsSold: todaySales.items_sold || 0,
        customers: todaySales.avg_customers_count || 0,
        visitors: todayTraffic.avg_visitors || 0,
      };
    } catch (e: any) {
      console.error("[TikTok Shop Analytics] 今日数据失败:", e.message);
    }

    // 获取视频性能数据
    try {
      const videoData = await getShopVideoPerformance(accessToken, shop.shopCipher, appKey, appSecret, {
        start_date_ge: startDate, end_date_lt: endDate,
      });
      const videoInterval = videoData.performance?.intervals?.[0];
      if (videoInterval) {
        result.video = {
          gmv: videoInterval.gmv?.amount || "0",
          currency: videoInterval.gmv?.currency || "BRL",
          skuOrders: videoInterval.sku_orders || 0,
          avgCustomers: videoInterval.avg_customers || 0,
          productClicks: videoInterval.product_clicks || 0,
          productImpressions: videoInterval.product_impressions || 0,
          clickThroughRate: videoInterval.click_through_rate || "0",
        };
      }
    } catch (e: any) {
      console.error("[TikTok Shop Analytics] 视频概览失败:", e.message);
    }

    // 获取视频性能列表（TOP视频）
    try {
      // 先获取该店铺的渠道号列表
      const channels = await prisma.tikTokChannel.findMany({ where: { shopId } });
      const channelSet = new Set(channels.map(c => c.username));

      const videoListData = await getShopVideoList(accessToken, shop.shopCipher, appKey, appSecret, {
        start_date_ge: startDate, end_date_lt: endDate, page_size: 20,
      });
      result.topVideos = (videoListData.videos || []).slice(0, 20).map((v: any) => ({
        id: v.id,
        title: v.title?.substring(0, 80),
        username: v.username,
        isChannel: channelSet.has(v.username), // true=渠道号, false=达人
        postTime: v.video_post_time,
        duration: v.duration,
        views: v.views || 0,
        gmv: v.gmv?.amount || "0",
        currency: v.gmv?.currency || "BRL",
        gpm: v.gpm?.amount || "0",
        itemsSold: v.items_sold || 0,
        skuOrders: v.sku_orders || 0,
        avgCustomers: v.avg_customers || 0,
        clickThroughRate: v.click_through_rate || "0",
        hashtags: v.hash_tags || [],
        productName: v.products?.[0]?.name?.substring(0, 50),
      }));
      result.videoTotalCount = videoListData.total_count || 0;
    } catch (e: any) {
      console.error("[TikTok Shop Analytics] 视频列表失败:", e.message);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("[TikTok Shop Analytics] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
