import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { addBusinessDays, businessDateUtcRange, orderBusinessDate, relativeBusinessDate } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import { getShopeeDailyAdPerformance } from "@/lib/shopee-ads";

export const dynamic = "force-dynamic";

function shiftDate(value: string, days: number) {
  return addBusinessDays(value, days);
}

function decimal(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isCountedSale(status: string | null) {
  const normalized = (status || "").toUpperCase();
  return !normalized.includes("CANCEL") && normalized !== "UNPAID" && normalized !== "INCOMPLETE";
}

function errorChain(error: unknown) {
  const messages: string[] = [];
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message);
    const cause = typeof current === "object" && current && "cause" in current
      ? (current as { cause?: unknown }).cause
      : null;
    if (!cause || cause === current) break;
    current = cause;
  }
  return messages.join(" | ");
}

function isTemporaryNetworkError(error: unknown) {
  return /fetch failed|timeout|timed out|connect|econnreset|socket|und_err/i.test(errorChain(error));
}

async function retryTemporaryShopeeRead<T>(label: string, call: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (attempt === 3 || !isTemporaryNetworkError(error)) throw error;
      console.warn(`[Shopee analytics] ${label} temporary failure; retrying`, {
        attempt,
        error: errorChain(error),
      });
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function settled<T>(call: () => Promise<T>) {
  try {
    return { ok: true as const, value: await call() };
  } catch (error) {
    return { ok: false as const, error };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const legacyRealtime = params.get("mode")?.trim().toLowerCase() === "realtime";
  const requestedPeriod = params.get("period")?.trim().toLowerCase() || (legacyRealtime ? "today" : "");
  const supportedPeriods = new Set(["today", "yesterday", "last7", "last30"]);
  if (requestedPeriod && !supportedPeriods.has(requestedPeriod)) {
    return NextResponse.json({ error: "不支持的时间范围" }, { status: 400 });
  }
  const requestedShopId = params.get("shopId")?.trim();
  const shops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active", appConfig: { status: "active" } },
    select: { id: true, shopId: true, shopName: true, region: true, currency: true },
    orderBy: { createdAt: "asc" },
  });
  const shop = requestedShopId ? shops.find((candidate) => candidate.shopId === requestedShopId) : shops[0];
  if (!shop) return NextResponse.json({ error: "没有已授权的 Shopee 店铺" }, { status: 404 });
  const countryCode = normalizeCountryCode(shop.region);
  const today = relativeBusinessDate(countryCode);
  const defaultEnd = today;
  const requestedStartDate = params.get("startDate")?.trim() || "";
  const requestedEndDate = params.get("endDate")?.trim() || "";
  const earliestOrder = !requestedPeriod && !requestedStartDate
    ? await prisma.shopeeOrder.findFirst({
      where: { shopSettingId: shop.id, createTime: { not: null } },
      select: { createTime: true },
      orderBy: { createTime: "asc" },
    })
    : null;
  let startDate = requestedStartDate || (earliestOrder?.createTime ? orderBusinessDate(earliestOrder.createTime, countryCode) : defaultEnd);
  let endDate = requestedEndDate || defaultEnd;
  if (requestedPeriod === "today") {
    startDate = today;
    endDate = today;
  } else if (requestedPeriod === "yesterday") {
    startDate = shiftDate(today, -1);
    endDate = startDate;
  } else if (requestedPeriod === "last7") {
    startDate = shiftDate(today, -6);
    endDate = today;
  } else if (requestedPeriod === "last30") {
    startDate = shiftDate(today, -29);
    endDate = today;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return NextResponse.json({ error: "日期格式必须为 YYYY-MM-DD" }, { status: 400 });
  const daySpan = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (!Number.isFinite(daySpan) || daySpan < 1) return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
  const comparisonStartDate = shiftDate(startDate, -1);

  const [orders, operationActions, adsResult] = await Promise.all([
    prisma.shopeeOrder.findMany({
      where: { shopSettingId: shop.id, createTime: businessDateUtcRange(comparisonStartDate, endDate, countryCode) },
      select: { status: true, totalAmount: true, createTime: true, items: { select: { quantity: true } } },
      orderBy: { createTime: "asc" },
    }),
    prisma.shopeeDailyOperationAction.findMany({
      where: { shopSettingId: shop.id, date: { gte: startDate, lte: endDate } },
      select: { date: true, operationAction: true },
    }),
    settled(() => retryTemporaryShopeeRead("daily ads", () => getShopeeDailyAdPerformance(shop.id, comparisonStartDate, endDate))),
  ]);
  const ads = adsResult.ok ? adsResult.value : [];
  if (!adsResult.ok) console.error("[Shopee analytics] daily ads unavailable after retries", adsResult.error);

  const daily = new Map<string, { date: string; orders: number; units: number; gmv: number; canceledOrders: number }>();
  for (let cursor = comparisonStartDate; cursor <= endDate; cursor = shiftDate(cursor, 1)) {
    daily.set(cursor, { date: cursor, orders: 0, units: 0, gmv: 0, canceledOrders: 0 });
  }
  for (const order of orders) {
    if (!order.createTime) continue;
    const row = daily.get(orderBusinessDate(order.createTime, countryCode));
    if (!row) continue;
    if (isCountedSale(order.status)) {
      row.orders += 1;
      row.units += order.items.reduce((sum, item) => sum + item.quantity, 0);
      row.gmv += decimal(order.totalAmount);
    } else {
      row.canceledOrders += 1;
    }
  }

  const adsByDate = new Map(ads.map((row) => [row.date, row]));
  const operationActionByDate = new Map(operationActions.map((row) => [row.date, row.operationAction]));
  const fullTrend = [...daily.values()].map((row) => {
    const ad = adsByDate.get(row.date);
    const impressions = decimal(ad?.impressions);
    const clicks = decimal(ad?.clicks);
    return {
      ...row,
      adExpense: decimal(ad?.expense),
      adGmv: decimal(ad?.broadGmv),
      adOrders: decimal(ad?.broadOrders),
      adItemSold: decimal(ad?.broadItemSold),
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      roas: decimal(ad?.broadRoas),
      operationAction: operationActionByDate.get(row.date) || "",
    };
  });
  const fullTrendByDate = new Map(fullTrend.map((row) => [row.date, row]));
  const trend = fullTrend
    .filter((row) => row.date >= startDate)
    .map((row) => {
      const previous = fullTrendByDate.get(shiftDate(row.date, -1));
      return {
        ...row,
        previousDay: previous ? {
          orders: previous.orders,
          units: previous.units,
          gmv: previous.gmv,
          adExpense: previous.adExpense,
          adGmv: previous.adGmv,
          adOrders: previous.adOrders,
          adItemSold: previous.adItemSold,
          impressions: previous.impressions,
          clicks: previous.clicks,
          ctr: previous.ctr,
          roas: previous.roas,
        } : null,
      };
    });
  const totals = trend.reduce((sum, row) => ({
    orders: sum.orders + row.orders,
    units: sum.units + row.units,
    gmv: sum.gmv + row.gmv,
    canceledOrders: sum.canceledOrders + row.canceledOrders,
    adExpense: sum.adExpense + row.adExpense,
    adGmv: sum.adGmv + row.adGmv,
    adOrders: sum.adOrders + row.adOrders,
    adItemSold: sum.adItemSold + row.adItemSold,
    impressions: sum.impressions + row.impressions,
    clicks: sum.clicks + row.clicks,
  }), { orders: 0, units: 0, gmv: 0, canceledOrders: 0, adExpense: 0, adGmv: 0, adOrders: 0, adItemSold: 0, impressions: 0, clicks: 0 });
  const warnings = [
    ...(!adsResult.ok ? ["Shopee 广告数据暂时连接失败，店铺订单数据已正常显示，请稍后刷新"] : []),
  ];

  return NextResponse.json({
    startDate,
    endDate,
    trend,
    totals: {
      ...totals,
      averageOrderValue: totals.orders ? totals.gmv / totals.orders : 0,
      adRoas: totals.adExpense ? totals.adGmv / totals.adExpense : 0,
      ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    },
    adsBalance: {},
    health: {},
    dataStatus: {
      ads: adsResult.ok,
    },
    warnings,
    shop: { shopId: shop.shopId, shopName: shop.shopName, region: shop.region, currency: shop.currency },
    shops: shops.map(({ id: _id, ...candidate }) => candidate),
    fetchedAt: new Date().toISOString(),
  });
}
