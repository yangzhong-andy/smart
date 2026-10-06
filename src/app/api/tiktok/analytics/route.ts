import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  addBusinessDays,
  businessDateUtcRange,
  isBusinessDate,
  orderBusinessDate,
  orderTimeZone,
  relativeBusinessDate,
} from "@/lib/order-business-time";
import { isTikTokSalesOrder, tiktokOrderUnitCounts } from "@/lib/order-actual-units";
import { tiktokAffiliateCommissionCost } from "@/lib/profit-affiliate-commissions";
import { tiktokShopProductDiscountOriginal } from "@/lib/profit-gmv";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import { getShopPerformance, getShopVideoList, getShopVideoPerformance, refreshAccessToken } from "@/lib/tiktok-shop-api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type DailyMetric = {
  date: string;
  orders: number;
  salesUnits: number;
  physicalUnits: number;
  gmv: number;
  canceledOrders: number;
  unpaidOrders: number;
  sampleOrders: number;
};

type AnalyticsOrder = {
  orderId: string;
  shopId: string;
  status: string | null;
  totalAmount: string | null;
  currency: string | null;
  itemCount: number | null;
  createTime: Date | null;
  updateTime: Date | null;
  rawData: unknown;
};

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanUsername(value: unknown) {
  return String(value || "").trim().replace(/^@+/, "").trim();
}

function normalizedCurrency(value: unknown, fallback = "BRL") {
  const currency = String(value || "").trim().toUpperCase();
  return currency || fallback;
}

function positiveQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.trunc(parsed)) : 1;
}

function emptyDaily(date: string): DailyMetric {
  return { date, orders: 0, salesUnits: 0, physicalUnits: 0, gmv: 0, canceledOrders: 0, unpaidOrders: 0, sampleOrders: 0 };
}

function normalizedStatus(value: string | null | undefined) {
  return String(value || "UNKNOWN").trim().toUpperCase();
}

function isSampleOrder(rawData: unknown) {
  return Boolean(rawData && typeof rawData === "object" && !Array.isArray(rawData) && (rawData as { is_sample_order?: unknown }).is_sample_order === true);
}

function orderGmv(order: AnalyticsOrder, countryCode: string) {
  const raw = order.rawData && typeof order.rawData === "object" && !Array.isArray(order.rawData) ? order.rawData as any : {};
  const payment = raw.payment || {};
  const currency = String(order.currency || payment.currency || "").toUpperCase();
  const productDiscount = countryCode === "BR" && currency === "BRL"
    ? tiktokShopProductDiscountOriginal(raw)
    : 0;
  for (const value of [payment.sub_total, payment.subtotal, payment.product_subtotal, raw.product_amount, raw.product_subtotal]) {
    if (value == null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.max(0, parsed + productDiscount);
  }
  const lines = Array.isArray(raw.line_items) ? raw.line_items : [];
  const lineTotal = lines.reduce((sum: number, item: any) => sum + Math.max(0, decimal(item?.sale_price) * positiveQuantity(item?.quantity)), 0);
  if (lineTotal > 0) return lineTotal;
  const shipping = decimal(payment.shipping_fee ?? raw.shipping_fee);
  return Math.max(0, decimal(order.totalAmount) - Math.max(0, shipping));
}

function addOrderToDaily(
  row: DailyMetric,
  order: AnalyticsOrder,
  physicalFactorForSku: (sellerSku: string) => number,
  countryCode: string,
) {
  const status = normalizedStatus(order.status);
  if (status.includes("CANCEL")) {
    row.canceledOrders += 1;
    return;
  }
  if (status === "UNPAID") {
    row.unpaidOrders += 1;
    return;
  }
  if (isSampleOrder(order.rawData)) {
    row.sampleOrders += 1;
    return;
  }
  if (!isTikTokSalesOrder(status, order.rawData)) return;

  const units = tiktokOrderUnitCounts(order.rawData, order.itemCount || 0, physicalFactorForSku);
  row.orders += 1;
  row.salesUnits += units.salesUnits;
  row.physicalUnits += units.physicalUnits;
  row.gmv += orderGmv(order, countryCode);
}

function completedDaily(row: DailyMetric) {
  const cancellationBase = row.orders + row.canceledOrders;
  return {
    ...row,
    gmv: Number(row.gmv.toFixed(2)),
    averageOrderValue: row.orders > 0 ? Number((row.gmv / row.orders).toFixed(2)) : 0,
    cancelRate: cancellationBase > 0 ? row.canceledOrders / cancellationBase : 0,
  };
}

function dateSpan(startDate: string, endDate: string) {
  return Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
}

async function settled<T>(call: () => Promise<T>) {
  try {
    return { ok: true as const, value: await call() };
  } catch (error) {
    return { ok: false as const, error };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

async function readAllShopVideos(
  accessToken: string,
  shopCipher: string,
  appKey: string,
  appSecret: string,
  startDate: string,
  endDate: string,
) {
  const videos: any[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let latestAvailableDate: string | null = null;
  let truncated = false;

  for (let page = 0; page < 100; page += 1) {
    const response = await getShopVideoList(accessToken, shopCipher, appKey, appSecret, {
      start_date_ge: startDate,
      end_date_lt: addBusinessDays(endDate, 1),
      page_size: 100,
      page_token: pageToken,
    });
    latestAvailableDate = latestAvailableDate || response?.latest_available_date || null;
    if (Array.isArray(response?.videos)) videos.push(...response.videos);
    const nextToken = typeof response?.next_page_token === "string" ? response.next_page_token.trim() : "";
    if (!nextToken) break;
    if (seenTokens.has(nextToken)) throw new Error("TikTok 返回了重复的视频分页游标");
    seenTokens.add(nextToken);
    pageToken = nextToken;
    if (page === 99) truncated = true;
  }

  return { videos, latestAvailableDate, truncated };
}

async function readOfficialPerformance(
  shop: {
    shopId: string;
    shopCipher: string | null;
    appKey: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpireAt: Date | null;
  },
  startDate: string,
  endDate: string,
) {
  if (dateSpan(startDate, endDate) > 90) {
    return { data: null, warning: "所选范围超过90天，平台经营指标暂不实时请求；订单指标仍按完整范围统计" };
  }
  if (!shop.accessToken || !shop.shopCipher) {
    return { data: null, warning: "TikTok 店铺缺少有效授权，平台经营指标暂不可用" };
  }

  try {
    const appConfig = shop.appKey
      ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } })
      : null;
    const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";
    let accessToken = shop.accessToken;

    if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60_000)) {
      if (!shop.refreshToken) throw new Error("访问令牌已过期且缺少刷新令牌");
      const refreshed = await refreshAccessToken(shop.refreshToken, appKey, appSecret);
      accessToken = refreshed.accessToken;
      await prisma.tikTokShopSetting.update({
        where: { shopId: shop.shopId },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
        },
      });
    }

    const exclusiveEnd = addBusinessDays(endDate, 1);
    const [shopResult, videoResult, videoListResult, channels] = await Promise.all([
      settled(() => getShopPerformance(accessToken, shop.shopCipher!, appKey, appSecret, {
        start_date_ge: startDate,
        end_date_lt: exclusiveEnd,
      })),
      settled(() => getShopVideoPerformance(accessToken, shop.shopCipher!, appKey, appSecret, {
        start_date_ge: startDate,
        end_date_lt: exclusiveEnd,
      })),
      settled(() => readAllShopVideos(accessToken, shop.shopCipher!, appKey, appSecret, startDate, endDate)),
      prisma.tikTokChannel.findMany({ where: { shopId: shop.shopId }, select: { username: true, remark: true } }),
    ]);
    if (!shopResult.ok) throw shopResult.error;

    const interval = shopResult.value?.performance?.intervals?.[0];
    if (!interval) return { data: null, warning: "TikTok 平台在所选日期范围没有返回经营数据" };
    const sales = interval.sales || {};
    const traffic = interval.traffic || {};
    const videoInterval = videoResult.ok ? videoResult.value?.performance?.intervals?.[0] : null;
    const selfChannelNames = new Set(channels.map((channel) => cleanUsername(channel.username).toLowerCase()).filter(Boolean));
    const videoRows = videoListResult.ok
      ? videoListResult.value.videos.map((video: any) => {
        const username = cleanUsername(video?.username);
        return {
          id: String(video?.id || ""),
          title: String(video?.title || "").slice(0, 120),
          username,
          channelType: selfChannelNames.has(username.toLowerCase()) ? "SELF" : "CREATOR",
          postTime: video?.video_post_time || null,
          duration: decimal(video?.duration),
          views: decimal(video?.views),
          likes: decimal(video?.likes),
          gmv: decimal(video?.gmv?.amount),
          currency: normalizedCurrency(video?.gmv?.currency, sales.gmv?.overall?.currency || "BRL"),
          gpm: decimal(video?.gpm?.amount),
          itemsSold: decimal(video?.items_sold),
          skuOrders: decimal(video?.sku_orders),
          customers: decimal(video?.avg_customers),
          productClicks: decimal(video?.product_clicks),
          productImpressions: decimal(video?.product_impressions),
          clickThroughRate: decimal(video?.click_through_rate),
          productName: String(video?.products?.[0]?.name || "").slice(0, 100),
        };
      })
      : [];
    const channelMap = new Map<string, {
      username: string;
      channelType: "SELF" | "CREATOR";
      currency: string;
      videoCount: number;
      views: number;
      likes: number;
      gmv: number;
      itemsSold: number;
      skuOrders: number;
      productClicks: number;
      productImpressions: number;
    }>();
    for (const video of videoRows) {
      const key = `${video.channelType}:${video.username.toLowerCase()}:${video.currency}`;
      const current = channelMap.get(key) || {
        username: video.username || "未识别账号",
        channelType: video.channelType as "SELF" | "CREATOR",
        currency: video.currency,
        videoCount: 0,
        views: 0,
        likes: 0,
        gmv: 0,
        itemsSold: 0,
        skuOrders: 0,
        productClicks: 0,
        productImpressions: 0,
      };
      current.videoCount += 1;
      current.views += video.views;
      current.likes += video.likes;
      current.gmv += video.gmv;
      current.itemsSold += video.itemsSold;
      current.skuOrders += video.skuOrders;
      current.productClicks += video.productClicks;
      current.productImpressions += video.productImpressions;
      channelMap.set(key, current);
    }
    const channelRows = [...channelMap.values()]
      .map((row) => ({
        ...row,
        gmv: Number(row.gmv.toFixed(2)),
        clickThroughRate: row.productImpressions > 0 ? row.productClicks / row.productImpressions : null,
      }))
      .sort((left, right) => right.skuOrders - left.skuOrders || right.views - left.views);
    const contentSummary = ["SELF", "CREATOR"].flatMap((channelType) => {
      const rows = channelRows.filter((row) => row.channelType === channelType);
      const currencies = [...new Set(rows.map((row) => row.currency))];
      return currencies.map((currency) => {
        const currencyRows = rows.filter((row) => row.currency === currency);
        return {
          channelType,
          currency,
          channels: new Set(currencyRows.map((row) => row.username.toLowerCase())).size,
          videoCount: currencyRows.reduce((sum, row) => sum + row.videoCount, 0),
          views: currencyRows.reduce((sum, row) => sum + row.views, 0),
          likes: currencyRows.reduce((sum, row) => sum + row.likes, 0),
          gmv: Number(currencyRows.reduce((sum, row) => sum + row.gmv, 0).toFixed(2)),
          itemsSold: currencyRows.reduce((sum, row) => sum + row.itemsSold, 0),
          skuOrders: currencyRows.reduce((sum, row) => sum + row.skuOrders, 0),
        };
      });
    });
    const performanceWarnings: string[] = [];
    if (!videoResult.ok) performanceWarnings.push(`视频表现数据暂不可用：${errorMessage(videoResult.error)}`);
    if (!videoListResult.ok) performanceWarnings.push(`视频排行数据暂不可用：${errorMessage(videoListResult.error)}`);
    if (videoListResult.ok && videoListResult.value.truncated) performanceWarnings.push("视频数量超过10000条，当前排行仅统计前10000条");

    return {
      data: {
        latestAvailableDate: shopResult.value?.latest_available_date || null,
        startDate,
        endDate,
        gmv: decimal(sales.gmv?.overall?.amount),
        currency: sales.gmv?.overall?.currency || "BRL",
        grossRevenue: decimal(sales.gross_revenue?.overall?.amount),
        orders: decimal(sales.orders_count),
        skuOrders: decimal(sales.sku_orders_count),
        itemsSold: decimal(sales.items_sold),
        customers: decimal(sales.avg_customers_count),
        refunds: decimal(sales.refunds?.amount),
        visitors: decimal(traffic.avg_visitors),
        pageViews: decimal(traffic.avg_page_views),
        conversionRate: decimal(traffic.avg_conversation_rate),
        gmvBreakdowns: Array.isArray(sales.gmv?.breakdowns)
          ? sales.gmv.breakdowns.map((item: any) => ({
            type: String(item.type || "UNKNOWN"),
            amount: decimal(item.gmv?.amount),
          }))
          : [],
        video: videoInterval ? {
          gmv: decimal(videoInterval.gmv?.amount),
          currency: videoInterval.gmv?.currency || sales.gmv?.overall?.currency || "BRL",
          skuOrders: decimal(videoInterval.sku_orders),
          customers: decimal(videoInterval.avg_customers),
          productClicks: decimal(videoInterval.product_clicks),
          productImpressions: decimal(videoInterval.product_impressions),
          clickThroughRate: decimal(videoInterval.click_through_rate),
        } : null,
        videoAvailable: videoResult.ok,
        content: videoListResult.ok ? {
          latestAvailableDate: videoListResult.value.latestAvailableDate,
          configuredSelfChannels: channels.length,
          summary: contentSummary,
          channels: channelRows.slice(0, 30),
          videos: videoRows
            .sort((left, right) => right.gmv - left.gmv || right.skuOrders - left.skuOrders || right.views - left.views)
            .slice(0, 30),
        } : null,
      },
      warning: performanceWarnings.length ? performanceWarnings.join("；") : null,
    };
  } catch (error) {
    console.error("[TikTok operations analytics] official performance unavailable", error);
    return { data: null, warning: `TikTok 平台经营数据暂不可用：${errorMessage(error)}` };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const params = new URL(request.url).searchParams;
    const requestedShopId = params.get("shopId")?.trim() || "";
    const requestedPeriod = params.get("period")?.trim().toLowerCase() || "last7";
    const supportedPeriods = new Set(["today", "yesterday", "last7", "last30", "all", "custom"]);
    if (!supportedPeriods.has(requestedPeriod)) {
      return NextResponse.json({ error: "不支持的时间范围" }, { status: 400 });
    }

    const shops = await prisma.tikTokShopSetting.findMany({
      where: { status: "active" },
      select: {
        shopId: true,
        shopName: true,
        region: true,
        sellerType: true,
        appKey: true,
        shopCipher: true,
        accessToken: true,
        refreshToken: true,
        tokenExpireAt: true,
        lastSyncAt: true,
        storeId: true,
      },
      orderBy: { shopName: "asc" },
    });
    const shop = shops.find((item) => item.shopId === requestedShopId) || shops[0];
    if (!shop) return NextResponse.json({ error: "没有已授权的 TikTok 店铺" }, { status: 404 });

    const countryCode = normalizeCountryCode(shop.region);
    const today = relativeBusinessDate(countryCode);
    let startDate = today;
    let endDate = today;
    if (requestedPeriod === "yesterday") startDate = endDate = addBusinessDays(today, -1);
    if (requestedPeriod === "last7") startDate = addBusinessDays(today, -6);
    if (requestedPeriod === "last30") startDate = addBusinessDays(today, -29);
    if (requestedPeriod === "custom") {
      startDate = params.get("startDate")?.trim() || "";
      endDate = params.get("endDate")?.trim() || "";
    }
    if (requestedPeriod === "all") {
      const earliestOrder = await prisma.tikTokOrder.findFirst({
        where: { shopId: shop.shopId, createTime: { not: null } },
        select: { createTime: true },
        orderBy: { createTime: "asc" },
      });
      startDate = earliestOrder?.createTime ? orderBusinessDate(earliestOrder.createTime, countryCode) : today;
    }
    if (!isBusinessDate(startDate) || !isBusinessDate(endDate)) {
      return NextResponse.json({ error: "日期格式必须为 YYYY-MM-DD" }, { status: 400 });
    }
    const span = dateSpan(startDate, endDate);
    if (!Number.isFinite(span) || span < 1) {
      return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
    }

    const comparisonStartDate = addBusinessDays(startDate, -1);
    const yesterday = addBusinessDays(today, -1);
    const officialEndDate = endDate < yesterday ? endDate : yesterday;
    const orderSelect = {
      orderId: true,
      shopId: true,
      status: true,
      totalAmount: true,
      currency: true,
      itemCount: true,
      createTime: true,
      updateTime: true,
      rawData: true,
    } as const;

    const [orders, recentOrders, skuMappings, operationActions, fallbackCurrency, officialResult, linkedAdAccounts, adConsumptions, qianchuanMetrics] = await Promise.all([
      prisma.tikTokOrder.findMany({
        where: { shopId: shop.shopId, createTime: businessDateUtcRange(comparisonStartDate, endDate, countryCode) },
        select: orderSelect,
        orderBy: { createTime: "asc" },
      }),
      prisma.tikTokOrder.findMany({
        where: { shopId: shop.shopId, createTime: businessDateUtcRange(yesterday, today, countryCode) },
        select: orderSelect,
        orderBy: { createTime: "asc" },
      }),
      prisma.profitSkuMapping.findMany({
        where: { platform: "TIKTOK", shopId: shop.shopId, enabled: true },
        select: { sellerSku: true, components: { select: { quantity: true } } },
      }),
      prisma.tikTokDailyOperationAction.findMany({
        where: { shopId: shop.shopId, date: { gte: startDate, lte: endDate } },
        select: { date: true, operationAction: true },
      }),
      prisma.tikTokOrder.findFirst({
        where: { shopId: shop.shopId, currency: { not: null } },
        select: { currency: true },
        orderBy: { createTime: "desc" },
      }),
      startDate <= officialEndDate
        ? readOfficialPerformance(shop, startDate, officialEndDate)
        : Promise.resolve({ data: null, warning: "今日平台经营数据尚未完成汇总，当前显示本地实时订单" }),
      prisma.adAccount.findMany({
        where: shop.storeId ? { storeIds: { has: shop.storeId }, agency: { platform: "TikTok" } } : { id: "__NO_LINKED_TIKTOK_STORE__" },
        select: { id: true, accountName: true, currency: true, storeIds: true, agency: { select: { platform: true } } },
      }),
      prisma.adConsumption.findMany({
        where: shop.storeId ? {
          date: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lt: new Date(`${addBusinessDays(endDate, 1)}T00:00:00.000Z`),
          },
          account: { agency: { platform: "TikTok" } },
          OR: [
            { storeId: shop.storeId },
            { storeId: null, account: { storeIds: { has: shop.storeId } } },
          ],
        } : { id: "__NO_LINKED_TIKTOK_STORE__" },
        select: {
          adAccountId: true,
          storeId: true,
          date: true,
          amount: true,
          currency: true,
          giftConsumption: true,
          estimatedRebate: true,
          account: { select: { accountName: true, currency: true, storeIds: true, agency: { select: { platform: true } } } },
        },
        orderBy: { date: "asc" },
      }),
      prisma.qianchuanDailyMetric.findMany({
        where: shop.storeId ? {
          date: {
            gte: new Date(`${startDate}T00:00:00.000Z`),
            lt: new Date(`${addBusinessDays(endDate, 1)}T00:00:00.000Z`),
          },
          connection: {
            enabled: true,
            adAccount: { storeIds: { has: shop.storeId }, agency: { platform: "TikTok" } },
          },
        } : { id: "__NO_LINKED_TIKTOK_STORE__" },
        select: {
          date: true,
          spend: true,
          conversions: true,
          attributedRevenue: true,
          roi: true,
          connection: {
            select: { id: true, name: true, currency: true, adAccount: { select: { id: true, storeIds: true } } },
          },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    const physicalFactors = new Map(skuMappings.map((mapping) => [
      mapping.sellerSku.trim().toLowerCase(),
      Math.max(1, mapping.components.reduce((sum, component) => sum + Math.max(1, component.quantity), 0)),
    ]));
    const physicalFactorForSku = (sellerSku: string) => physicalFactors.get(sellerSku.trim().toLowerCase()) || 1;
    const actionByDate = new Map(operationActions.map((item) => [item.date, item.operationAction]));

    const fullDaily = new Map<string, DailyMetric>();
    for (let cursor = comparisonStartDate; cursor <= endDate; cursor = addBusinessDays(cursor, 1)) {
      fullDaily.set(cursor, emptyDaily(cursor));
    }
    for (const order of orders as AnalyticsOrder[]) {
      if (!order.createTime) continue;
      const row = fullDaily.get(orderBusinessDate(order.createTime, countryCode));
      if (row) addOrderToDaily(row, order, physicalFactorForSku, countryCode);
    }

    const completedByDate = new Map([...fullDaily.entries()].map(([date, row]) => [date, completedDaily(row)]));
    const baseTrend = [...completedByDate.values()]
      .filter((row) => row.date >= startDate)
      .map((row) => {
        const previous = completedByDate.get(addBusinessDays(row.date, -1));
        return {
          ...row,
          operationAction: actionByDate.get(row.date) || "",
          previousDay: previous ? {
            orders: previous.orders,
            salesUnits: previous.salesUnits,
            physicalUnits: previous.physicalUnits,
            gmv: previous.gmv,
            averageOrderValue: previous.averageOrderValue,
            canceledOrders: previous.canceledOrders,
            cancelRate: previous.cancelRate,
          } : null,
        };
      });

    const totals = baseTrend.reduce((sum, row) => ({
      orders: sum.orders + row.orders,
      salesUnits: sum.salesUnits + row.salesUnits,
      physicalUnits: sum.physicalUnits + row.physicalUnits,
      gmv: sum.gmv + row.gmv,
      canceledOrders: sum.canceledOrders + row.canceledOrders,
      unpaidOrders: sum.unpaidOrders + row.unpaidOrders,
      sampleOrders: sum.sampleOrders + row.sampleOrders,
    }), { orders: 0, salesUnits: 0, physicalUnits: 0, gmv: 0, canceledOrders: 0, unpaidOrders: 0, sampleOrders: 0 });
    const cancellationBase = totals.orders + totals.canceledOrders;
    const currency = orders.find((order) => order.currency)?.currency || fallbackCurrency?.currency || officialResult.data?.currency || (countryCode === "BR" ? "BRL" : "USD");

    const recentDaily = new Map([[yesterday, emptyDaily(yesterday)], [today, emptyDaily(today)]]);
    for (const order of recentOrders as AnalyticsOrder[]) {
      if (!order.createTime) continue;
      const row = recentDaily.get(orderBusinessDate(order.createTime, countryCode));
      if (row) addOrderToDaily(row, order, physicalFactorForSku, countryCode);
    }

    const selectedOrders = (orders as AnalyticsOrder[]).filter((order) => {
      if (!order.createTime) return false;
      const date = orderBusinessDate(order.createTime, countryCode);
      return date >= startDate && date <= endDate;
    });

    const selectedSalesOrders = selectedOrders.filter((order) => {
      const raw = order.rawData && typeof order.rawData === "object" && !Array.isArray(order.rawData) ? order.rawData : {};
      return isTikTokSalesOrder(normalizedStatus(order.status), raw);
    });
    const selectedSalesOrderIds = selectedSalesOrders.map((order) => order.orderId);
    const selectedSalesOrderById = new Map(selectedSalesOrders.map((order) => [order.orderId, order]));
    const [creatorAttributions, settlementTransactions, latestCreatorAttribution] = await Promise.all([
      prisma.creatorOrderAttribution.findMany({
        where: {
          platform: "TIKTOK",
          shopId: shop.shopId,
          orderId: { in: selectedSalesOrderIds.length ? selectedSalesOrderIds : ["__NO_TIKTOK_SALES_ORDER__"] },
        },
        select: {
          orderId: true,
          externalSkuId: true,
          creatorUsername: true,
          creatorUserId: true,
          creatorNickname: true,
          collaborationType: true,
          quantity: true,
          currency: true,
          unitPrice: true,
          syncedAt: true,
        },
      }),
      prisma.platformSettlementTransaction.findMany({
        where: {
          platform: "TIKTOK",
          externalShopId: shop.shopId,
          orderId: { in: selectedSalesOrderIds.length ? selectedSalesOrderIds : ["__NO_TIKTOK_SALES_ORDER__"] },
        },
        select: { orderId: true, rawData: true },
      }),
      prisma.creatorOrderAttribution.findFirst({
        where: { platform: "TIKTOK", shopId: shop.shopId },
        select: { syncedAt: true },
        orderBy: { syncedAt: "desc" },
      }),
    ]);
    const creatorUserIds = [...new Set(creatorAttributions.map((row) => row.creatorUserId).filter((value): value is string => Boolean(value)))];
    const creatorProfiles = creatorUserIds.length
      ? await prisma.creatorProfile.findMany({
        where: { platform: "TIKTOK", creatorUserId: { in: creatorUserIds } },
        select: { creatorUserId: true, avatarUrl: true, followerCount: true },
      })
      : [];
    const creatorProfileById = new Map(creatorProfiles.map((profile) => [profile.creatorUserId, profile]));
    const commissionByOrder = new Map<string, number>();
    for (const row of settlementTransactions) {
      commissionByOrder.set(row.orderId, (commissionByOrder.get(row.orderId) || 0) + tiktokAffiliateCommissionCost(row.rawData).total);
    }
    const attributedGrossByOrder = new Map<string, number>();
    for (const row of creatorAttributions) {
      const gross = Math.max(0, decimal(row.unitPrice) * Math.max(0, row.quantity || 0));
      attributedGrossByOrder.set(row.orderId, (attributedGrossByOrder.get(row.orderId) || 0) + gross);
    }

    type CreatorMetric = {
      username: string;
      nickname: string | null;
      creatorUserId: string | null;
      collaborationType: string | null;
      currency: string;
      orderIds: Set<string>;
      skuLines: number;
      units: number;
      gmv: number;
      commission: number;
    };
    type CreatorCurrencyMetric = { currency: string; orderIds: Set<string>; creators: Set<string>; units: number; gmv: number; commission: number };
    const creatorMap = new Map<string, CreatorMetric>();
    const creatorCurrencyMap = new Map<string, CreatorCurrencyMetric>();
    const creatorDailyMap = new Map<string, Map<string, { orderIds: Set<string>; units: number; gmv: number }>>();
    const allAttributedOrderIds = new Set<string>();
    for (const row of creatorAttributions) {
      const order = selectedSalesOrderById.get(row.orderId);
      if (!order?.createTime) continue;
      const username = cleanUsername(row.creatorUsername) || "未识别达人";
      const rowCurrency = normalizedCurrency(row.currency, normalizedCurrency(order.currency, currency));
      const quantity = Math.max(0, row.quantity || 0);
      const gross = Math.max(0, decimal(row.unitPrice) * quantity);
      const orderGross = attributedGrossByOrder.get(row.orderId) || 0;
      const commission = orderGross > 0 ? (commissionByOrder.get(row.orderId) || 0) * gross / orderGross : 0;
      const creatorKey = `${username.toLowerCase()}:${rowCurrency}`;
      const creator = creatorMap.get(creatorKey) || {
        username,
        nickname: row.creatorNickname,
        creatorUserId: row.creatorUserId,
        collaborationType: row.collaborationType,
        currency: rowCurrency,
        orderIds: new Set<string>(),
        skuLines: 0,
        units: 0,
        gmv: 0,
        commission: 0,
      };
      creator.orderIds.add(row.orderId);
      creator.skuLines += 1;
      creator.units += quantity;
      creator.gmv += gross;
      creator.commission += commission;
      creatorMap.set(creatorKey, creator);

      const currencyMetric = creatorCurrencyMap.get(rowCurrency) || {
        currency: rowCurrency,
        orderIds: new Set<string>(),
        creators: new Set<string>(),
        units: 0,
        gmv: 0,
        commission: 0,
      };
      currencyMetric.orderIds.add(row.orderId);
      currencyMetric.creators.add(username.toLowerCase());
      currencyMetric.units += quantity;
      currencyMetric.gmv += gross;
      currencyMetric.commission += commission;
      creatorCurrencyMap.set(rowCurrency, currencyMetric);

      const date = orderBusinessDate(order.createTime, countryCode);
      const dateCurrencies = creatorDailyMap.get(date) || new Map<string, { orderIds: Set<string>; units: number; gmv: number }>();
      const dateMetric = dateCurrencies.get(rowCurrency) || { orderIds: new Set<string>(), units: 0, gmv: 0 };
      dateMetric.orderIds.add(row.orderId);
      dateMetric.units += quantity;
      dateMetric.gmv += gross;
      dateCurrencies.set(rowCurrency, dateMetric);
      creatorDailyMap.set(date, dateCurrencies);
      allAttributedOrderIds.add(row.orderId);
    }
    const creatorByCurrency = [...creatorCurrencyMap.values()]
      .map((row) => ({
        currency: row.currency,
        orders: row.orderIds.size,
        creators: row.creators.size,
        units: row.units,
        gmv: Number(row.gmv.toFixed(2)),
        settledCommission: Number(row.commission.toFixed(2)),
      }))
      .sort((left, right) => right.orders - left.orders || left.currency.localeCompare(right.currency));
    const creatorRanking = [...creatorMap.values()]
      .map((row) => {
        const profile = row.creatorUserId ? creatorProfileById.get(row.creatorUserId) : null;
        return {
          username: row.username,
          nickname: row.nickname,
          creatorUserId: row.creatorUserId,
          collaborationType: row.collaborationType,
          currency: row.currency,
          orders: row.orderIds.size,
          skuLines: row.skuLines,
          units: row.units,
          gmv: Number(row.gmv.toFixed(2)),
          settledCommission: Number(row.commission.toFixed(2)),
          followerCount: profile?.followerCount ?? null,
          avatarUrl: profile?.avatarUrl || null,
        };
      })
      .sort((left, right) => right.orders - left.orders || right.units - left.units || right.gmv - left.gmv)
      .slice(0, 30);

    type AdCurrencyMetric = { currency: string; spend: number; giftConsumption: number; estimatedRebate: number; records: number };
    const ambiguousAdRows = adConsumptions.filter((row) => !row.storeId && row.account.storeIds.length !== 1);
    const resolvedAdRows = adConsumptions.filter((row) => Boolean(row.storeId) || row.account.storeIds.length === 1);
    const adCurrencyMap = new Map<string, AdCurrencyMetric>();
    const adDailyMap = new Map<string, Map<string, AdCurrencyMetric>>();
    const adAccountMap = new Map(linkedAdAccounts.map((account) => [account.id, {
      id: account.id,
      accountName: account.accountName,
      currency: account.currency,
      platform: String(account.agency.platform),
    }]));
    for (const row of resolvedAdRows) {
      const rowCurrency = normalizedCurrency(row.currency, row.account.currency || currency);
      const date = row.date.toISOString().slice(0, 10);
      const amount = Math.max(0, decimal(row.amount));
      const giftConsumption = Math.max(0, decimal(row.giftConsumption));
      const estimatedRebate = Math.max(0, decimal(row.estimatedRebate));
      const current = adCurrencyMap.get(rowCurrency) || { currency: rowCurrency, spend: 0, giftConsumption: 0, estimatedRebate: 0, records: 0 };
      current.spend += amount;
      current.giftConsumption += giftConsumption;
      current.estimatedRebate += estimatedRebate;
      current.records += 1;
      adCurrencyMap.set(rowCurrency, current);
      const dateCurrencies = adDailyMap.get(date) || new Map<string, AdCurrencyMetric>();
      const dateMetric = dateCurrencies.get(rowCurrency) || { currency: rowCurrency, spend: 0, giftConsumption: 0, estimatedRebate: 0, records: 0 };
      dateMetric.spend += amount;
      dateMetric.giftConsumption += giftConsumption;
      dateMetric.estimatedRebate += estimatedRebate;
      dateMetric.records += 1;
      dateCurrencies.set(rowCurrency, dateMetric);
      adDailyMap.set(date, dateCurrencies);
      if (!adAccountMap.has(row.adAccountId)) {
        adAccountMap.set(row.adAccountId, {
          id: row.adAccountId,
          accountName: row.account.accountName,
          currency: row.account.currency,
          platform: String(row.account.agency.platform),
        });
      }
    }
    const advertisingByCurrency = [...adCurrencyMap.values()]
      .map((row) => ({
        ...row,
        spend: Number(row.spend.toFixed(2)),
        giftConsumption: Number(row.giftConsumption.toFixed(2)),
        estimatedRebate: Number(row.estimatedRebate.toFixed(2)),
      }))
      .sort((left, right) => right.spend - left.spend);

    type QianchuanCurrencyMetric = {
      currency: string;
      spend: number;
      attributedOrders: number;
      attributedRevenue: number;
      records: number;
      roiWeightedTotal: number;
      roiWeight: number;
      roiSimpleTotal: number;
      roiRecords: number;
    };
    // 一个广告户绑定多个系统店铺时，千川汇总无法判断店铺归属，因此不把它展示到任一单店。
    const resolvedQianchuanMetrics = qianchuanMetrics.filter((row) => row.connection.adAccount.storeIds.length === 1);
    const ambiguousQianchuanMetrics = qianchuanMetrics.length - resolvedQianchuanMetrics.length;
    const qianchuanCurrencyMap = new Map<string, QianchuanCurrencyMetric>();
    for (const row of resolvedQianchuanMetrics) {
      const rowCurrency = normalizedCurrency(row.connection.currency, "CNY");
      const current = qianchuanCurrencyMap.get(rowCurrency) || {
        currency: rowCurrency,
        spend: 0,
        attributedOrders: 0,
        attributedRevenue: 0,
        records: 0,
        roiWeightedTotal: 0,
        roiWeight: 0,
        roiSimpleTotal: 0,
        roiRecords: 0,
      };
      const rowSpend = Math.max(0, decimal(row.spend));
      current.spend += rowSpend;
      current.attributedOrders += Math.max(0, row.conversions || 0);
      current.attributedRevenue += Math.max(0, decimal(row.attributedRevenue));
      current.records += 1;
      if (row.roi !== null) {
        const rowRoi = decimal(row.roi);
        current.roiSimpleTotal += rowRoi;
        current.roiRecords += 1;
        if (rowSpend > 0) {
          current.roiWeightedTotal += rowRoi * rowSpend;
          current.roiWeight += rowSpend;
        }
      }
      qianchuanCurrencyMap.set(rowCurrency, current);
    }
    const qianchuanByCurrency = [...qianchuanCurrencyMap.values()]
      .map((row) => ({
        currency: row.currency,
        spend: Number(row.spend.toFixed(2)),
        attributedOrders: row.attributedOrders,
        attributedRevenue: Number(row.attributedRevenue.toFixed(2)),
        records: row.records,
        roi: row.roiWeight > 0
          ? Number((row.roiWeightedTotal / row.roiWeight).toFixed(6))
          : row.roiRecords > 0
            ? Number((row.roiSimpleTotal / row.roiRecords).toFixed(6))
            : null,
      }))
      .sort((left, right) => right.spend - left.spend);

    const trend = baseTrend.map((row) => {
      const adCurrencies = [...(adDailyMap.get(row.date)?.values() || [])];
      const creatorCurrencies = [...(creatorDailyMap.get(row.date)?.entries() || [])];
      const creatorOrderIds = new Set(creatorCurrencies.flatMap(([, metric]) => [...metric.orderIds]));
      return {
        ...row,
        adSpend: adCurrencies.length === 1 ? Number(adCurrencies[0].spend.toFixed(2)) : null,
        adCurrency: adCurrencies.length === 1 ? adCurrencies[0].currency : null,
        creatorOrders: creatorOrderIds.size,
        creatorUnits: creatorCurrencies.reduce((sum, [, metric]) => sum + metric.units, 0),
        creatorGmv: creatorCurrencies.length === 1 ? Number(creatorCurrencies[0][1].gmv.toFixed(2)) : null,
        creatorCurrency: creatorCurrencies.length === 1 ? creatorCurrencies[0][0] : null,
      };
    });

    const productMap = new Map<string, { sku: string; name: string; salesUnits: number; physicalUnits: number; sales: number; image: string | null }>();
    const statusMap = new Map<string, number>();
    const cancelReasonMap = new Map<string, number>();
    for (const order of selectedOrders) {
      const status = normalizedStatus(order.status);
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
      const raw = order.rawData && typeof order.rawData === "object" && !Array.isArray(order.rawData) ? order.rawData as any : {};
      if (status.includes("CANCEL")) {
        const reason = String(raw.cancel_reason || "未知原因");
        cancelReasonMap.set(reason, (cancelReasonMap.get(reason) || 0) + 1);
      }
      if (!isTikTokSalesOrder(status, raw)) continue;
      const lineItems = Array.isArray(raw.line_items) ? raw.line_items : [];
      for (const item of lineItems) {
        const sku = String(item?.seller_sku || item?.sku_id || item?.product_id || "未识别SKU").trim();
        const quantity = positiveQuantity(item?.quantity);
        const factor = physicalFactorForSku(sku);
        const current = productMap.get(sku) || {
          sku,
          name: String(item?.product_name || item?.sku_name || sku).slice(0, 100),
          salesUnits: 0,
          physicalUnits: 0,
          sales: 0,
          image: item?.sku_image || null,
        };
        current.salesUnits += quantity;
        current.physicalUnits += quantity * factor;
        current.sales += decimal(item?.sale_price) * quantity;
        productMap.set(sku, current);
      }
    }

    const officialWarnings = [officialResult.warning].filter((item): item is string => Boolean(item));
    if (officialResult.data?.latestAvailableDate && officialResult.data.latestAvailableDate < endDate) {
      officialWarnings.push(`TikTok 官方经营数据最新到 ${officialResult.data.latestAvailableDate}，之后的订单仍按本地实时订单统计`);
    }
    if (!shop.storeId) {
      officialWarnings.push("当前 TikTok 店铺尚未绑定系统店铺，无法匹配广告消耗账户");
    } else if (adAccountMap.size === 0) {
      officialWarnings.push("当前系统店铺尚未绑定广告账户，广告消耗暂不可用");
    }
    if (ambiguousAdRows.length > 0) {
      officialWarnings.push(`有 ${ambiguousAdRows.length} 条广告消耗绑定了多个店铺，因无法确认归属未计入本店数据`);
    }
    if (advertisingByCurrency.length > 1) {
      officialWarnings.push("广告消耗包含多个币种，已分币种展示，未进行跨币种相加");
    }
    if (ambiguousQianchuanMetrics > 0) {
      officialWarnings.push(`有 ${ambiguousQianchuanMetrics} 条千川日报来自多店铺广告户，因无法确认归属未计入本店归因数据`);
    }
    if (creatorByCurrency.length > 1) {
      officialWarnings.push("达人归因包含多个币种，已分币种展示，未进行跨币种相加");
    }

    const reconciliationOrderGmv = officialResult.data
      ? trend
        .filter((row) => row.date >= officialResult.data!.startDate && row.date <= officialResult.data!.endDate)
        .reduce((sum, row) => sum + row.gmv, 0)
      : 0;

    return NextResponse.json({
      startDate,
      endDate,
      countryCode,
      timeZone: orderTimeZone(countryCode),
      currency,
      trend,
      totals: {
        ...totals,
        gmv: Number(totals.gmv.toFixed(2)),
        averageOrderValue: totals.orders > 0 ? Number((totals.gmv / totals.orders).toFixed(2)) : 0,
        cancelRate: cancellationBase > 0 ? totals.canceledOrders / cancellationBase : 0,
      },
      today: completedDaily(recentDaily.get(today) || emptyDaily(today)),
      yesterday: completedDaily(recentDaily.get(yesterday) || emptyDaily(yesterday)),
      official: officialResult.data,
      advertising: {
        available: adAccountMap.size > 0,
        source: qianchuanByCurrency.length ? "AdConsumption + QIANCHUAN_API" : "AdConsumption",
        records: resolvedAdRows.length,
        accounts: [...adAccountMap.values()],
        byCurrency: advertisingByCurrency,
        qianchuanAvailable: qianchuanByCurrency.length > 0,
        qianchuanRecords: resolvedQianchuanMetrics.length,
        qianchuanByCurrency,
        impressions: null,
        clicks: null,
        clickThroughRate: null,
        attributedOrders: qianchuanByCurrency.reduce((sum, row) => sum + row.attributedOrders, 0) || null,
        attributedRevenue: qianchuanByCurrency.length === 1 ? qianchuanByCurrency[0].attributedRevenue : null,
        attributedRevenueCurrency: qianchuanByCurrency.length === 1 ? qianchuanByCurrency[0].currency : null,
        roi: qianchuanByCurrency.length === 1 ? qianchuanByCurrency[0].roi : null,
      },
      creatorAttribution: {
        available: Boolean(latestCreatorAttribution),
        source: "OFFICIAL_AFFILIATE_API",
        latestSyncedAt: latestCreatorAttribution?.syncedAt.toISOString() || null,
        orders: allAttributedOrderIds.size,
        units: creatorAttributions.reduce((sum, row) => sum + Math.max(0, row.quantity || 0), 0),
        orderContributionRate: totals.orders > 0 ? allAttributedOrderIds.size / totals.orders : null,
        gmvContributionRate: totals.gmv > 0
          ? (creatorByCurrency.find((row) => row.currency === normalizedCurrency(currency))?.gmv || 0) / totals.gmv
          : null,
        byCurrency: creatorByCurrency,
        ranking: creatorRanking,
      },
      reconciliation: officialResult.data ? {
        orderGmv: Number(reconciliationOrderGmv.toFixed(2)),
        platformGmv: officialResult.data.gmv,
        difference: Number((officialResult.data.gmv - reconciliationOrderGmv).toFixed(2)),
      } : null,
      productRanking: [...productMap.values()]
        .map((item) => ({ ...item, sales: Number(item.sales.toFixed(2)) }))
        .sort((left, right) => right.salesUnits - left.salesUnits)
        .slice(0, 20),
      statusDistribution: [...statusMap.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((left, right) => right.count - left.count),
      cancelReasons: [...cancelReasonMap.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5),
      shop: {
        shopId: shop.shopId,
        shopName: shop.shopName,
        region: shop.region,
        sellerType: shop.sellerType,
        lastSyncAt: shop.lastSyncAt?.toISOString() || null,
      },
      shops: shops.map((item) => ({
        shopId: item.shopId,
        shopName: item.shopName,
        region: item.region,
        sellerType: item.sellerType,
        lastSyncAt: item.lastSyncAt?.toISOString() || null,
      })),
      dataStatus: {
        orders: true,
        officialPerformance: Boolean(officialResult.data),
        videoPerformance: Boolean(officialResult.data?.videoAvailable),
        videoRanking: Boolean(officialResult.data?.content),
        advertising: adAccountMap.size > 0,
        creatorAttribution: Boolean(latestCreatorAttribution),
      },
      warnings: officialWarnings,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[TikTok operations analytics] error", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
