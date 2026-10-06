import { NextRequest, NextResponse } from "next/server";
import { GET as getTikTokProfitReport } from "@/app/api/profit-report/route";
import { GET as getShopeeProfitReport } from "@/app/api/shopee/profit/route";
import { requireApiUser } from "@/lib/api-auth";
import { addBusinessDays, isBusinessDate, relativeBusinessDate } from "@/lib/order-business-time";
import {
  COMMERCE_PLATFORMS,
  normalizeCommercePlatform,
  type CommercePlatform,
} from "@/lib/platform-orders/contract";
import type { ProfitMetricRow, ProfitReportResponse, ProfitStorePeriodRow, ProfitStoreRow } from "@/lib/profit-report-types";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<CommercePlatform, string> = {
  TIKTOK: "TikTok Shop",
  SHOPEE: "Shopee",
  AMAZON: "Amazon",
  MERCADO_LIVRE: "Mercado Livre",
};
const CONNECTED_PLATFORMS = new Set<CommercePlatform>(["TIKTOK", "SHOPEE", "MERCADO_LIVRE"]);
const DAY_MS = 86_400_000;

type RelativeDay = "today" | "yesterday";
type Amounts = {
  gmv: number;
  costs: number;
  profit: number;
  orders: number;
  units: number;
  actualUnits: number;
  completeOrders: number;
  partialOrders: number;
  original: Record<string, number>;
};
type ShopSpec = {
  platform: CommercePlatform;
  shopId: string;
  shopName: string;
  region: string;
  startDate: string;
  endDate: string;
};
type DetailPlan = {
  platform: "TIKTOK" | "SHOPEE" | "MERCADO_LIVRE";
  startDate: string;
  endDate: string;
  countryCode?: string;
  shopId?: string;
};
type NormalizedShop = {
  shopId: string;
  shopName: string;
  region: string;
  amounts: Amounts;
};
type NormalizedShopPeriod = NormalizedShop & { date: string };
type NormalizedDetail = {
  summary: Amounts;
  periods: Array<{ date: string; amounts: Amounts }>;
  shops: NormalizedShop[];
  shopPeriods: NormalizedShopPeriod[];
  rates: Record<string, number>;
  warnings: string[];
};

type ShopeeMetric = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  orders: number;
  units: number;
  internalUnits: number;
  gmvCny: number;
  costsCny: number;
  profitCny: number;
  completeOrders: number;
  originalAmounts?: { gmv?: Record<string, number> };
};
type ShopeeStoreMetric = ShopeeMetric & {
  shopId: string;
  shopName: string;
  countryCode: string;
};
type ShopeeStorePeriodMetric = ShopeeStoreMetric & { date: string };
type ShopeeProfitResponse = {
  summary: ShopeeMetric;
  periods: ShopeeMetric[];
  stores: ShopeeStoreMetric[];
  storePeriods: ShopeeStorePeriodMetric[];
  rates?: Record<string, number>;
  warnings?: string[];
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function emptyAmounts(): Amounts {
  return {
    gmv: 0,
    costs: 0,
    profit: 0,
    orders: 0,
    units: 0,
    actualUnits: 0,
    completeOrders: 0,
    partialOrders: 0,
    original: {},
  };
}

function addOriginal(target: Record<string, number>, source: Record<string, number> | null | undefined) {
  for (const [currency, value] of Object.entries(source || {})) {
    const code = String(currency || "CNY").toUpperCase();
    target[code] = (target[code] || 0) + asNumber(value);
  }
}

function addAmounts(target: Amounts, source: Amounts) {
  target.gmv += source.gmv;
  target.costs += source.costs;
  target.profit += source.profit;
  target.orders += source.orders;
  target.units += source.units;
  target.actualUnits += source.actualUnits;
  target.completeOrders += source.completeOrders;
  target.partialOrders += source.partialOrders;
  addOriginal(target.original, source.original);
}

function tikTokAmounts(metric: ProfitMetricRow): Amounts {
  const orders = Math.max(0, asNumber(metric.orderCount));
  const coverage = Math.max(0, Math.min(
    100,
    asNumber(metric.productCoverage),
    asNumber(metric.logisticsCoverage),
    asNumber(metric.settlementCoverage),
  ));
  const completeOrders = Math.min(orders, Math.round(orders * coverage / 100));
  const gmv = asNumber(metric.gmvCny);
  const profit = asNumber(metric.contributionProfitCny);
  return {
    gmv,
    costs: gmv - profit,
    profit,
    orders,
    units: Math.max(0, asNumber(metric.units)),
    actualUnits: Math.max(0, asNumber(metric.internalUnits)),
    completeOrders,
    partialOrders: Math.max(0, orders - completeOrders),
    original: { ...(metric.originalAmounts?.gmv || {}) },
  };
}

function shopeeAmounts(metric: ShopeeMetric): Amounts {
  const orders = Math.max(0, asNumber(metric.orders));
  const completeOrders = Math.min(orders, Math.max(0, asNumber(metric.completeOrders)));
  return {
    gmv: asNumber(metric.gmvCny),
    costs: asNumber(metric.costsCny),
    profit: asNumber(metric.profitCny),
    orders,
    units: Math.max(0, asNumber(metric.units)),
    actualUnits: Math.max(0, asNumber(metric.internalUnits)),
    completeOrders,
    partialOrders: Math.max(0, orders - completeOrders),
    original: { ...(metric.originalAmounts?.gmv || {}) },
  };
}

function normalizeTikTok(body: ProfitReportResponse): NormalizedDetail {
  return {
    summary: tikTokAmounts(body.summary),
    periods: body.periods.map((row) => ({ date: row.startDate, amounts: tikTokAmounts(row) })),
    shops: body.stores.map((row: ProfitStoreRow) => ({
      shopId: row.shopId,
      shopName: row.label,
      region: row.countryCode,
      amounts: tikTokAmounts(row),
    })),
    shopPeriods: (body.storePeriods || []).map((row: ProfitStorePeriodRow) => ({
      date: row.date,
      shopId: row.shopId,
      shopName: row.label,
      region: row.countryCode,
      amounts: tikTokAmounts(row),
    })),
    rates: body.rates || {},
    warnings: body.warnings || [],
  };
}

function normalizeShopee(body: ShopeeProfitResponse): NormalizedDetail {
  return {
    summary: shopeeAmounts(body.summary),
    periods: (body.periods || []).map((row) => ({ date: row.startDate, amounts: shopeeAmounts(row) })),
    shops: (body.stores || []).map((row) => ({
      shopId: row.shopId,
      shopName: row.shopName || row.label,
      region: row.countryCode,
      amounts: shopeeAmounts(row),
    })),
    shopPeriods: (body.storePeriods || []).map((row) => ({
      date: row.date,
      shopId: row.shopId,
      shopName: row.shopName || row.label,
      region: row.countryCode,
      amounts: shopeeAmounts(row),
    })),
    rates: body.rates || {},
    warnings: body.warnings || [],
  };
}

// Mercado Livre uses the same canonical profit report contract as TikTok.
// Keep this adapter explicit so platform-specific response changes do not
// accidentally alter the existing TikTok normalization path.
function normalizeMercadoLivre(body: ProfitReportResponse): NormalizedDetail {
  return normalizeTikTok(body);
}

function detailRequest(source: NextRequest, pathname: string, plan: DetailPlan) {
  const url = new URL(source.url);
  url.pathname = pathname;
  url.search = "";
  url.searchParams.set("startDate", plan.startDate);
  url.searchParams.set("endDate", plan.endDate);
  url.searchParams.set("groupBy", "day");
  if (plan.shopId) url.searchParams.set("shopId", plan.shopId);
  if (plan.countryCode && plan.countryCode !== "UNSET") url.searchParams.set("countryCode", plan.countryCode);
  if (plan.platform === "TIKTOK" || plan.platform === "MERCADO_LIVRE") {
    url.searchParams.set("platform", plan.platform);
  }
  const headers = new Headers();
  const cookie = source.headers.get("cookie");
  const authorization = source.headers.get("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest(url, { method: "GET", headers });
}

async function loadDetail(source: NextRequest, plan: DetailPlan): Promise<NormalizedDetail> {
  const pathname = plan.platform === "SHOPEE" ? "/api/shopee/profit" : "/api/profit-report";
  const subrequest = detailRequest(source, pathname, plan);
  const response = plan.platform === "SHOPEE"
    ? await getShopeeProfitReport(subrequest)
    : await getTikTokProfitReport(subrequest);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${PLATFORM_LABELS[plan.platform]}精细利润读取失败：${body?.error || response.status}`);
  }
  if (plan.platform === "SHOPEE") return normalizeShopee(body as ShopeeProfitResponse);
  if (plan.platform === "MERCADO_LIVRE") return normalizeMercadoLivre(body as ProfitReportResponse);
  return normalizeTikTok(body as ProfitReportResponse);
}

function shopKey(platform: CommercePlatform, shopId: string) {
  return `${platform}\u0000${shopId}`;
}

function serialize(amounts: Amounts) {
  return {
    orders: amounts.orders,
    units: amounts.units,
    actualUnits: amounts.actualUnits,
    gmvCny: round(amounts.gmv),
    costsCny: round(amounts.costs),
    profitCny: round(amounts.profit),
    margin: amounts.gmv > 0 ? round(amounts.profit / amounts.gmv * 100) : 0,
    completeOrders: amounts.completeOrders,
    partialOrders: amounts.partialOrders,
    originalAmounts: Object.fromEntries(
      Object.entries(amounts.original).map(([currency, value]) => [currency, round(value)]),
    ),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const params = request.nextUrl.searchParams;
    const requestedPlatform = params.get("platform");
    const platform = requestedPlatform && requestedPlatform !== "all"
      ? normalizeCommercePlatform(requestedPlatform)
      : null;
    if (requestedPlatform && requestedPlatform !== "all" && !platform) {
      return NextResponse.json({ error: "平台参数无效" }, { status: 400 });
    }
    const platforms = platform ? [platform] : [...COMMERCE_PLATFORMS];
    const shopId = params.get("shopId")?.trim() || null;
    const relativeValue = params.get("relativeDay");
    const relativeDay: RelativeDay | null = relativeValue === "today" || relativeValue === "yesterday"
      ? relativeValue
      : null;
    if (relativeValue && !relativeDay) {
      return NextResponse.json({ error: "相对日期参数无效" }, { status: 400 });
    }

    const requestedStart = params.get("startDate");
    const requestedEnd = params.get("endDate");
    if (!relativeDay && (
      (requestedStart && !isBusinessDate(requestedStart))
      || (requestedEnd && !isBusinessDate(requestedEnd))
    )) {
      return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
    }
    if (!relativeDay && requestedStart && requestedEnd && requestedStart > requestedEnd) {
      return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
    }
    if (!relativeDay && requestedStart && requestedEnd) {
      const rangeDays = Math.floor(
        (Date.parse(`${requestedEnd}T00:00:00Z`) - Date.parse(`${requestedStart}T00:00:00Z`)) / DAY_MS,
      ) + 1;
      if (rangeDays > 366) {
        return NextResponse.json({ error: "日期范围不能超过 366 天" }, { status: 400 });
      }
    }

    const now = new Date();
    const defaultEnd = relativeBusinessDate("UTC", 0, now);
    const defaultStart = addBusinessDays(defaultEnd, -29);
    const [tiktokShops, shopeeShops, mercadoLivreShops] = await Promise.all([
      platforms.includes("TIKTOK")
        ? prisma.tikTokShopSetting.findMany({
            where: shopId ? { shopId } : undefined,
            select: { shopId: true, shopName: true, region: true },
          })
        : Promise.resolve([]),
      platforms.includes("SHOPEE")
        ? prisma.shopeeShopSetting.findMany({
            where: { status: "active", ...(shopId ? { shopId } : {}) },
            select: { shopId: true, shopName: true, region: true },
          })
        : Promise.resolve([]),
      platforms.includes("MERCADO_LIVRE")
        ? prisma.mercadoLivreAccount.findMany({
            where: { status: "active", ...(shopId ? { userId: shopId } : {}) },
            select: { userId: true, nickname: true, country: true },
          })
        : Promise.resolve([]),
    ]);
    const makeSpec = (
      entryPlatform: CommercePlatform,
      shop: { shopId: string; shopName: string | null; region: string },
    ): ShopSpec => {
      const region = normalizeCountryCode(shop.region);
      const localDate = relativeDay
        ? relativeBusinessDate(region, relativeDay === "yesterday" ? -1 : 0, now)
        : null;
      return {
        platform: entryPlatform,
        shopId: shop.shopId,
        shopName: shop.shopName || shop.shopId,
        region,
        startDate: localDate || requestedStart || defaultStart,
        endDate: localDate || requestedEnd || defaultEnd,
      };
    };
    const specs = [
      ...tiktokShops.map((shop) => makeSpec("TIKTOK", shop)),
      ...shopeeShops.map((shop) => makeSpec("SHOPEE", shop)),
      ...mercadoLivreShops.map((shop) => makeSpec("MERCADO_LIVRE", {
        shopId: shop.userId,
        shopName: shop.nickname,
        region: shop.country,
      })),
    ];

    const plans: DetailPlan[] = [];
    for (const entryPlatform of ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"] as const) {
      const platformSpecs = specs.filter((spec) => spec.platform === entryPlatform);
      if (platformSpecs.length === 0) continue;
      if (!relativeDay) {
        plans.push({
          platform: entryPlatform,
          startDate: requestedStart || defaultStart,
          endDate: requestedEnd || defaultEnd,
          ...(shopId ? { shopId } : {}),
        });
        continue;
      }
      if (shopId) {
        const spec = platformSpecs[0];
        plans.push({
          platform: entryPlatform,
          startDate: spec.startDate,
          endDate: spec.endDate,
          shopId: spec.shopId,
        });
        continue;
      }
      const grouped = new Map<string, ShopSpec[]>();
      for (const spec of platformSpecs) {
        const key = `${spec.region}\u0000${spec.startDate}\u0000${spec.endDate}`;
        const rows = grouped.get(key) || [];
        rows.push(spec);
        grouped.set(key, rows);
      }
      for (const rows of grouped.values()) {
        const spec = rows[0];
        if (spec.region === "UNSET") {
          for (const row of rows) {
            plans.push({
              platform: entryPlatform,
              startDate: row.startDate,
              endDate: row.endDate,
              shopId: row.shopId,
            });
          }
        } else {
          plans.push({
            platform: entryPlatform,
            startDate: spec.startDate,
            endDate: spec.endDate,
            countryCode: spec.region,
          });
        }
      }
    }

    const details = await Promise.all(plans.map(async (plan) => ({
      plan,
      detail: await loadDetail(request, plan),
    })));
    const platformTotals = new Map<CommercePlatform, Amounts>();
    const shops = new Map<string, { platform: CommercePlatform; shopId: string; shopName: string; region: string; amounts: Amounts }>();
    const periods = new Map<string, Map<CommercePlatform, Amounts>>();
    const shopPeriods = new Map<string, { date: string; platform: CommercePlatform; shopId: string; shopName: string; region: string; amounts: Amounts }>();
    const rates: Record<string, number> = {};
    const warnings: string[] = [];

    const ensurePlatform = (entryPlatform: CommercePlatform) => {
      const existing = platformTotals.get(entryPlatform);
      if (existing) return existing;
      const created = emptyAmounts();
      platformTotals.set(entryPlatform, created);
      return created;
    };
    for (const { plan, detail } of details) {
      addAmounts(ensurePlatform(plan.platform), detail.summary);
      Object.assign(rates, detail.rates);
      warnings.push(...detail.warnings.map((warning) => `${PLATFORM_LABELS[plan.platform]}：${warning}`));
      for (const row of detail.periods) {
        const byPlatform = periods.get(row.date) || new Map<CommercePlatform, Amounts>();
        const target = byPlatform.get(plan.platform) || emptyAmounts();
        addAmounts(target, row.amounts);
        byPlatform.set(plan.platform, target);
        periods.set(row.date, byPlatform);
      }
      for (const row of detail.shops) {
        const key = shopKey(plan.platform, row.shopId);
        const target = shops.get(key) || {
          platform: plan.platform,
          shopId: row.shopId,
          shopName: row.shopName,
          region: row.region,
          amounts: emptyAmounts(),
        };
        addAmounts(target.amounts, row.amounts);
        shops.set(key, target);
      }
      for (const row of detail.shopPeriods) {
        const key = `${row.date}\u0000${shopKey(plan.platform, row.shopId)}`;
        const target = shopPeriods.get(key) || {
          date: row.date,
          platform: plan.platform,
          shopId: row.shopId,
          shopName: row.shopName,
          region: row.region,
          amounts: emptyAmounts(),
        };
        addAmounts(target.amounts, row.amounts);
        shopPeriods.set(key, target);
      }
    }

    const platformRows = platforms.map((entryPlatform) => {
      const amounts = platformTotals.get(entryPlatform) || emptyAmounts();
      const coverage = amounts.orders > 0 ? round(amounts.completeOrders / amounts.orders * 100) : 0;
      const capable = CONNECTED_PLATFORMS.has(entryPlatform);
      const connected = capable && specs.some((spec) => spec.platform === entryPlatform);
      return {
        platform: entryPlatform,
        label: PLATFORM_LABELS[entryPlatform],
        connected,
        ...serialize(amounts),
        coverage,
        status: amounts.orders > 0
          ? coverage >= 99.995 ? "完整利润核算" : "部分核算"
          : connected ? "暂无订单" : capable ? "未授权店铺" : "未接入",
      };
    });
    const shopRows = [...shops.values()]
      .sort((left, right) => right.amounts.gmv - left.amounts.gmv)
      .map((shop) => ({
        platform: shop.platform,
        label: PLATFORM_LABELS[shop.platform],
        shopId: shop.shopId,
        shopName: shop.shopName,
        region: shop.region,
        ...serialize(shop.amounts),
      }));
    const shopPeriodRows = [...shopPeriods.values()]
      .sort((left, right) => right.date.localeCompare(left.date) || right.amounts.gmv - left.amounts.gmv)
      .map((shop) => ({
        date: shop.date,
        platform: shop.platform,
        label: PLATFORM_LABELS[shop.platform],
        shopId: shop.shopId,
        shopName: shop.shopName,
        region: shop.region,
        ...serialize(shop.amounts),
      }));
    const periodRows = [...periods.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, byPlatform]) => ({
        date,
        ...Object.fromEntries(platforms.map((entryPlatform) => [
          entryPlatform,
          serialize(byPlatform.get(entryPlatform) || emptyAmounts()),
        ])),
      }));
    const summary = emptyAmounts();
    for (const amounts of platformTotals.values()) addAmounts(summary, amounts);
    const responseStart = relativeDay && specs.length
      ? specs.map((spec) => spec.startDate).sort()[0]
      : requestedStart || defaultStart;
    const responseEnd = relativeDay && specs.length
      ? specs.map((spec) => spec.endDate).sort().at(-1) || defaultEnd
      : requestedEnd || defaultEnd;

    return NextResponse.json({
      filters: {
        platform: platform || "all",
        shopId,
        startDate: responseStart,
        endDate: responseEnd,
        relativeDay,
        dateBasis: "DESTINATION_COUNTRY",
        currency: "CNY",
      },
      summary: serialize(summary),
      platforms: platformRows,
      shops: shopRows,
      periods: periodRows,
      shopPeriods: shopPeriodRows,
      rates,
      warnings: [...new Set(warnings)],
      profitSource: "DETAILED_PROFIT_CALCULATION",
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("[Platform Profit Summary]", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "多平台利润汇总失败",
    }, { status: 500 });
  }
}
