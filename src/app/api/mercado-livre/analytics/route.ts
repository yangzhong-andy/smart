import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  addBusinessDays,
  businessDateUtcRange,
  orderBusinessDate,
  relativeBusinessDate,
} from "@/lib/order-business-time";

export const dynamic = "force-dynamic";

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCountedSale(status: string | null) {
  return !["cancelled", "invalid", "payment_required", "payment_in_process"]
    .includes((status || "").toLowerCase());
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

type ProductPerformance = {
  itemId: string;
  title: string;
  thumbnail: string | null;
  orders: number;
  units: number;
  gmv: number;
  visits: number;
};

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;
  const requestedPeriod = params.get("period")?.trim().toLowerCase() || "last7";
  const supportedPeriods = new Set(["today", "yesterday", "last7", "last30", "all", "custom"]);
  if (!supportedPeriods.has(requestedPeriod)) {
    return NextResponse.json({ error: "不支持的时间范围" }, { status: 400 });
  }

  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", appConfig: { status: "active" } },
    select: {
      id: true,
      userId: true,
      nickname: true,
      country: true,
      currency: true,
      lastSyncAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const requestedAccountId = params.get("accountId")?.trim();
  const account = requestedAccountId
    ? accounts.find((candidate) => candidate.id === requestedAccountId)
    : accounts[0];
  if (!account) return NextResponse.json({ error: "没有已授权的 Mercado Livre 店铺" }, { status: 404 });

  const today = relativeBusinessDate(account.country || "BR");
  const earliestOrder = requestedPeriod === "all"
    ? await prisma.mercadoLivreOrder.findFirst({
      where: { accountId: account.id, dateCreated: { not: null } },
      select: { dateCreated: true },
      orderBy: { dateCreated: "asc" },
    })
    : null;
  let startDate = params.get("startDate")?.trim() || addBusinessDays(today, -6);
  let endDate = params.get("endDate")?.trim() || today;
  if (requestedPeriod === "today") startDate = endDate = today;
  if (requestedPeriod === "yesterday") startDate = endDate = addBusinessDays(today, -1);
  if (requestedPeriod === "last7") startDate = addBusinessDays(today, -6);
  if (requestedPeriod === "last30") startDate = addBusinessDays(today, -29);
  if (requestedPeriod === "all") {
    startDate = earliestOrder?.dateCreated
      ? orderBusinessDate(earliestOrder.dateCreated, account.country)
      : today;
    endDate = today;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "日期格式必须为 YYYY-MM-DD" }, { status: 400 });
  }
  const daySpan = Math.floor((utcDate(endDate).getTime() - utcDate(startDate).getTime()) / 86_400_000) + 1;
  if (!Number.isFinite(daySpan) || daySpan < 1) {
    return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
  }
  if (daySpan > 730) return NextResponse.json({ error: "单次最多查询 730 天" }, { status: 400 });

  const comparisonStartDate = addBusinessDays(startDate, -1);
  const visitRange = { gte: utcDate(comparisonStartDate), lte: utcDate(endDate) };
  const [orders, visits, products, operationActions, advertisingAccounts] = await prisma.$transaction([
    prisma.mercadoLivreOrder.findMany({
      where: {
        accountId: account.id,
        dateCreated: businessDateUtcRange(comparisonStartDate, endDate, account.country),
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        dateCreated: true,
        items: {
          select: { itemId: true, title: true, quantity: true, unitPrice: true },
        },
      },
      orderBy: { dateCreated: "asc" },
    }),
    prisma.mercadoLivreProductVisitDaily.findMany({
      where: { product: { accountId: account.id }, date: visitRange },
      select: { date: true, visits: true, product: { select: { itemId: true } } },
    }),
    prisma.mercadoLivreProduct.findMany({
      where: { accountId: account.id },
      select: {
        itemId: true,
        title: true,
        thumbnail: true,
        status: true,
        availableQuantity: true,
        soldQuantity: true,
        syncedAt: true,
      },
    }),
    prisma.mercadoLivreDailyOperationAction.findMany({
      where: { accountId: account.id, date: { gte: startDate, lte: endDate } },
      select: { date: true, operationAction: true },
    }),
    prisma.mercadoLivreAdvertisingAccount.findMany({
      where: { accountId: account.id },
      select: {
        id: true,
        advertiserId: true,
        advertiserName: true,
        accountName: true,
        status: true,
        lastSyncAt: true,
        lastSyncError: true,
        dailyMetrics: {
          where: { date: { gte: utcDate(comparisonStartDate), lte: utcDate(endDate) } },
          select: {
            date: true,
            clicks: true,
            prints: true,
            ctr: true,
            cost: true,
            cpc: true,
            acos: true,
            roas: true,
            tacos: true,
            cvr: true,
            directAmount: true,
            indirectAmount: true,
            totalAmount: true,
            directUnitsQuantity: true,
            indirectUnitsQuantity: true,
            unitsQuantity: true,
            organicUnitsQuantity: true,
            advertisingItemsQuantity: true,
            directItemsQuantity: true,
            indirectItemsQuantity: true,
            organicItemsQuantity: true,
            organicUnitsAmount: true,
            organicItemsAmount: true,
            impressionShare: true,
          },
        },
      },
    }),
  ]);

  const daily = new Map<string, {
    date: string;
    orders: number;
    units: number;
    gmv: number;
    visits: number;
    canceledOrders: number;
    adSpend: number | null;
    adImpressions: number | null;
    adClicks: number | null;
    adCtr: number | null;
    adSales: number | null;
    adOrders: number | null;
    adUnits: number | null;
    adRoas: number | null;
    adAcos: number | null;
  }>();
  for (let cursor = comparisonStartDate; cursor <= endDate; cursor = addBusinessDays(cursor, 1)) {
    daily.set(cursor, {
      date: cursor,
      orders: 0,
      units: 0,
      gmv: 0,
      visits: 0,
      canceledOrders: 0,
      adSpend: null,
      adImpressions: null,
      adClicks: null,
      adCtr: null,
      adSales: null,
      adOrders: null,
      adUnits: null,
      adRoas: null,
      adAcos: null,
    });
  }

  const productMeta = new Map(products.map((product) => [product.itemId, product]));
  const productPerformance = new Map<string, ProductPerformance>();
  for (const order of orders) {
    if (!order.dateCreated) continue;
    const businessDate = orderBusinessDate(order.dateCreated, account.country);
    const row = daily.get(businessDate);
    if (!row) continue;
    if (!isCountedSale(order.status)) {
      row.canceledOrders += 1;
      continue;
    }
    const units = order.items.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
    const itemGmv = order.items.reduce(
      (sum, item) => sum + decimal(item.unitPrice) * Math.max(0, item.quantity),
      0,
    );
    row.orders += 1;
    row.units += units;
    row.gmv += itemGmv || decimal(order.totalAmount);

    if (businessDate < startDate) continue;
    const seenItems = new Set<string>();
    for (const item of order.items) {
      const itemId = item.itemId;
      const meta = productMeta.get(itemId);
      const performance = productPerformance.get(itemId) || {
        itemId,
        title: item.title || meta?.title || itemId,
        thumbnail: meta?.thumbnail || null,
        orders: 0,
        units: 0,
        gmv: 0,
        visits: 0,
      };
      if (!seenItems.has(itemId)) performance.orders += 1;
      performance.units += Math.max(0, item.quantity);
      performance.gmv += decimal(item.unitPrice) * Math.max(0, item.quantity);
      productPerformance.set(itemId, performance);
      seenItems.add(itemId);
    }
  }
  for (const visit of visits) {
    const businessDate = visit.date.toISOString().slice(0, 10);
    const row = daily.get(businessDate);
    if (row) row.visits += visit.visits;
    if (businessDate < startDate) continue;
    const itemId = visit.product.itemId;
    const meta = productMeta.get(itemId);
    const performance = productPerformance.get(itemId) || {
      itemId,
      title: meta?.title || itemId,
      thumbnail: meta?.thumbnail || null,
      orders: 0,
      units: 0,
      gmv: 0,
      visits: 0,
    };
    performance.visits += visit.visits;
    productPerformance.set(itemId, performance);
  }

  // Advertising rows are already aggregated by Mercado Ads per day. Sum across
  // advertisers while preserving null for dates that were not returned.
  for (const advertisingAccount of advertisingAccounts) {
    for (const metric of advertisingAccount.dailyMetrics) {
      const businessDate = metric.date.toISOString().slice(0, 10);
      const row = daily.get(businessDate);
      if (!row) continue;
      const add = (current: number | null, value: unknown) => {
        const parsed = decimal(value);
        return parsed === 0 && value === null ? current : (current ?? 0) + parsed;
      };
      row.adSpend = add(row.adSpend, metric.cost);
      row.adImpressions = add(row.adImpressions, metric.prints);
      row.adClicks = add(row.adClicks, metric.clicks);
      row.adSales = add(row.adSales, metric.totalAmount);
      row.adOrders = add(row.adOrders, metric.advertisingItemsQuantity);
      row.adUnits = add(row.adUnits, metric.unitsQuantity);
      const ctr = decimal(metric.ctr);
      const roas = decimal(metric.roas);
      const acos = decimal(metric.acos);
      if (ctr !== null) row.adCtr = (row.adCtr ?? 0) + ctr;
      if (roas !== null) row.adRoas = (row.adRoas ?? 0) + roas;
      if (acos !== null) row.adAcos = (row.adAcos ?? 0) + acos;
    }
  }

  const operationActionByDate = new Map(operationActions.map((row) => [row.date, row.operationAction]));
  const fullTrend = [...daily.values()].map((row) => ({
    ...row,
    conversionRate: row.visits ? row.orders / row.visits : 0,
    averageOrderValue: row.orders ? row.gmv / row.orders : 0,
    adCtr: row.adImpressions ? (row.adClicks || 0) / row.adImpressions : null,
    adRoas: row.adSpend ? (row.adSales || 0) / row.adSpend : null,
    adAcos: row.adSales ? (row.adSpend || 0) / row.adSales : null,
    operationAction: operationActionByDate.get(row.date) || "",
  }));
  const fullTrendByDate = new Map(fullTrend.map((row) => [row.date, row]));
  const trend = fullTrend.filter((row) => row.date >= startDate).map((row) => {
    const previous = fullTrendByDate.get(addBusinessDays(row.date, -1));
    return {
      ...row,
      previousDay: previous ? {
        orders: previous.orders,
        units: previous.units,
        gmv: previous.gmv,
        visits: previous.visits,
        conversionRate: previous.conversionRate,
        averageOrderValue: previous.averageOrderValue,
        adSpend: previous.adSpend,
        adImpressions: previous.adImpressions,
        adClicks: previous.adClicks,
        adCtr: previous.adCtr,
        adSales: previous.adSales,
        adOrders: previous.adOrders,
        adUnits: previous.adUnits,
        adRoas: previous.adRoas,
        adAcos: previous.adAcos,
      } : null,
    };
  });
  const totals = trend.reduce((sum, row) => ({
    orders: sum.orders + row.orders,
    units: sum.units + row.units,
    gmv: sum.gmv + row.gmv,
    visits: sum.visits + row.visits,
    canceledOrders: sum.canceledOrders + row.canceledOrders,
    adSpend: sum.adSpend + (row.adSpend ?? 0),
    adImpressions: sum.adImpressions + (row.adImpressions ?? 0),
    adClicks: sum.adClicks + (row.adClicks ?? 0),
    adSales: sum.adSales + (row.adSales ?? 0),
    adOrders: sum.adOrders + (row.adOrders ?? 0),
    adUnits: sum.adUnits + (row.adUnits ?? 0),
  }), {
    orders: 0,
    units: 0,
    gmv: 0,
    visits: 0,
    canceledOrders: 0,
    adSpend: 0,
    adImpressions: 0,
    adClicks: 0,
    adSales: 0,
    adOrders: 0,
    adUnits: 0,
  });
  const performance = [...productPerformance.values()]
    .map((product) => ({
      ...product,
      conversionRate: product.visits ? product.orders / product.visits : 0,
    }))
    .sort((left, right) => right.gmv - left.gmv || right.units - left.units);
  const productSyncedAt = products.reduce<Date | null>(
    (latest, product) => !latest || product.syncedAt > latest ? product.syncedAt : latest,
    null,
  );
  const hasAdvertisingData = advertisingAccounts.some((item) => item.dailyMetrics.length > 0);

  return NextResponse.json({
    startDate,
    endDate,
    trend,
    totals: {
      ...totals,
      ...(hasAdvertisingData ? {} : {
        adSpend: null,
        adImpressions: null,
        adClicks: null,
        adSales: null,
        adOrders: null,
        adUnits: null,
      }),
      conversionRate: totals.visits ? totals.orders / totals.visits : 0,
      averageOrderValue: totals.orders ? totals.gmv / totals.orders : 0,
      adCtr: hasAdvertisingData && totals.adImpressions ? totals.adClicks / totals.adImpressions : null,
      adRoas: hasAdvertisingData && totals.adSpend ? totals.adSales / totals.adSpend : null,
      activeListings: products.filter((product) => product.status === "active").length,
      availableStock: products.reduce((sum, product) => sum + product.availableQuantity, 0),
    },
    productPerformance: performance,
    account: {
      id: account.id,
      userId: account.userId,
      nickname: account.nickname,
      country: account.country,
      currency: account.currency,
      lastOrderSyncAt: account.lastSyncAt,
      lastProductSyncAt: productSyncedAt,
    },
    accounts,
    dataAvailability: {
      orders: true,
      visits: products.length > 0,
      advertising: hasAdvertisingData,
      advertisingReason: advertisingAccounts.length
        ? "广告数据来自 Mercado Ads Product Ads；未返回的日期显示 --，不会用 0 代替。整体 ROI 待利润成本接入后计算。"
        : "尚未同步 Mercado Ads 广告数据，请点击“同步最新数据”",
    },
    advertising: {
      accounts: advertisingAccounts.map((item) => ({
        id: item.id,
        advertiserId: item.advertiserId,
        advertiserName: item.advertiserName,
        accountName: item.accountName,
        status: item.status,
        lastSyncAt: item.lastSyncAt,
        lastSyncError: item.lastSyncError,
      })),
      hasData: hasAdvertisingData,
    },
    warnings: products.length ? [] : ["商品访问量尚未同步，请点击“同步最新数据”"],
    fetchedAt: new Date().toISOString(),
  });
}
