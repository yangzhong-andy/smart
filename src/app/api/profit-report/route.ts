import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchExchangeRates, getRateToCNY } from "@/lib/exchange";
import {
  allocateActualFeeTotal,
  calculateEstimatedProfitFees,
  type ProfitFeeBreakdown,
} from "@/lib/profit-platform-fees";
import { calculateWarehouseFulfillmentFee } from "@/lib/warehouse-fulfillment-fees";
import { createWarehouseResolver } from "@/lib/profit-warehouse-mapping";
import type {
  ProfitGroupBy,
  ProfitMetricRow,
  ProfitOrderDetailRow,
  ProfitOriginalAmounts,
  ProfitOriginalMetric,
  ProfitReportResponse,
  ProfitSampleRow,
  ProfitSkuRow,
  ProfitStoreRow,
} from "@/lib/profit-report-types";

export const dynamic = "force-dynamic";

type MutableMetric = Omit<ProfitMetricRow, "grossProfitCny" | "contributionProfitCny" | "margin" | "roas" | "productCoverage" | "logisticsCoverage" | "settlementCoverage"> & {
  productCoveredUnits: number;
  logisticsCoveredUnits: number;
  exactSettlementOrders: number;
  warehouseCoveredOrders: number;
  taxCoveredOrders: number;
};

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_GROUPS = new Set<ProfitGroupBy>(["day", "week", "month"]);

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  // Financial values are truncated at the requested precision. The tiny
  // sign-aware epsilon only neutralizes binary floating-point tails.
  const epsilon = value >= 0 ? 1e-9 : -1e-9;
  return Math.trunc((value + epsilon) * factor) / factor;
}

const ORIGINAL_METRICS: ProfitOriginalMetric[] = [
  "gmv", "platformFee", "fulfillmentFee", "logisticsCost", "warehouseFulfillment",
  "adSpend", "rebate", "netAdCost", "taxCost",
];

function emptyOriginalAmounts(): ProfitOriginalAmounts {
  return Object.fromEntries(ORIGINAL_METRICS.map((metric) => [metric, {}])) as ProfitOriginalAmounts;
}

function originalAmounts(
  entries: Array<[ProfitOriginalMetric, string | null | undefined, number]>,
): ProfitOriginalAmounts {
  const result = emptyOriginalAmounts();
  for (const [metric, currency, value] of entries) {
    const code = String(currency || "CNY").trim().toUpperCase();
    if (!code || !Number.isFinite(value) || Math.abs(value) < 0.000001) continue;
    result[metric][code] = (result[metric][code] || 0) + value;
  }
  return result;
}

function roundedOriginalAmounts(values: ProfitOriginalAmounts): ProfitOriginalAmounts {
  const result = emptyOriginalAmounts();
  for (const metric of ORIGINAL_METRICS) {
    for (const [currency, value] of Object.entries(values[metric] || {})) {
      result[metric][currency] = round(value);
    }
  }
  return result;
}

function scaleOriginalAmounts(
  values: ProfitOriginalAmounts,
  metrics: ProfitOriginalMetric[],
  factor: number,
): ProfitOriginalAmounts {
  const result = emptyOriginalAmounts();
  for (const metric of metrics) {
    for (const [currency, value] of Object.entries(values[metric] || {})) {
      result[metric][currency] = value * factor;
    }
  }
  return result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function monthEnd(date: string): string {
  const parsed = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  parsed.setUTCDate(0);
  return parsed.toISOString().slice(0, 10);
}

function timeZoneForRegion(region: string | null | undefined): string {
  if (region === "US") return "America/Denver";
  if (region === "BR") return "America/Sao_Paulo";
  return "UTC";
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function periodFor(date: string, groupBy: ProfitGroupBy) {
  if (groupBy === "day") {
    return {
      id: date,
      label: `${date.slice(5, 7)}月${date.slice(8, 10)}日`,
      startDate: date,
      endDate: date,
    };
  }

  if (groupBy === "month") {
    const startDate = `${date.slice(0, 7)}-01`;
    return {
      id: date.slice(0, 7),
      label: `${date.slice(0, 4)}年${date.slice(5, 7)}月`,
      startDate,
      endDate: monthEnd(startDate),
    };
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDay() || 7;
  const startDate = addDays(date, 1 - day);
  const endDate = addDays(startDate, 6);
  return {
    id: startDate,
    label: `${startDate.slice(5)} - ${endDate.slice(5)}`,
    startDate,
    endDate,
  };
}

function emptyMetric(id: string, label: string, startDate: string, endDate: string): MutableMetric {
  return {
    id,
    label,
    startDate,
    endDate,
    orderCount: 0,
    cancelledOrders: 0,
    units: 0,
    gmvCny: 0,
    platformCostCny: 0,
    platformFeeCny: 0,
    fulfillmentFeeCny: 0,
    productCostCny: 0,
    logisticsCostCny: 0,
    warehouseFulfillmentCostCny: 0,
    adSpendCny: 0,
    rebateCny: 0,
    netAdCostCny: 0,
    taxCostCny: 0,
    originalAmounts: emptyOriginalAmounts(),
    productCoveredUnits: 0,
    logisticsCoveredUnits: 0,
    exactSettlementOrders: 0,
    warehouseCoveredOrders: 0,
    taxCoveredOrders: 0,
  };
}

function finalizeMetric(metric: MutableMetric): ProfitMetricRow {
  const grossProfitCny = metric.gmvCny - metric.platformCostCny - metric.productCostCny
    - metric.logisticsCostCny - metric.warehouseFulfillmentCostCny;
  const contributionProfitCny = grossProfitCny - metric.netAdCostCny - metric.taxCostCny;
  return {
    id: metric.id,
    label: metric.label,
    startDate: metric.startDate,
    endDate: metric.endDate,
    orderCount: metric.orderCount,
    cancelledOrders: metric.cancelledOrders,
    units: metric.units,
    gmvCny: round(metric.gmvCny),
    platformCostCny: round(metric.platformCostCny),
    platformFeeCny: round(metric.platformFeeCny),
    fulfillmentFeeCny: round(metric.fulfillmentFeeCny),
    productCostCny: round(metric.productCostCny),
    logisticsCostCny: round(metric.logisticsCostCny),
    warehouseFulfillmentCostCny: round(metric.warehouseFulfillmentCostCny),
    adSpendCny: round(metric.adSpendCny),
    rebateCny: round(metric.rebateCny),
    netAdCostCny: round(metric.netAdCostCny),
    taxCostCny: round(metric.taxCostCny),
    originalAmounts: roundedOriginalAmounts(metric.originalAmounts),
    grossProfitCny: round(grossProfitCny),
    contributionProfitCny: round(contributionProfitCny),
    margin: metric.gmvCny > 0 ? round((contributionProfitCny / metric.gmvCny) * 100, 2) : 0,
    roas: metric.netAdCostCny > 0 ? round(metric.gmvCny / metric.netAdCostCny, 2) : 0,
    productCoverage: metric.units > 0 ? round((metric.productCoveredUnits / metric.units) * 100, 2) : 100,
    logisticsCoverage: metric.units > 0 ? round((metric.logisticsCoveredUnits / metric.units) * 100, 2) : 100,
    settlementCoverage: metric.orderCount > 0 ? round((metric.exactSettlementOrders / metric.orderCount) * 100, 2) : 100,
  };
}

function addMetric(target: MutableMetric, values: Partial<MutableMetric>) {
  const numericKeys: Array<keyof MutableMetric> = [
    "orderCount", "cancelledOrders", "units", "gmvCny", "platformCostCny", "platformFeeCny",
    "fulfillmentFeeCny", "productCostCny",
    "logisticsCostCny", "warehouseFulfillmentCostCny", "adSpendCny", "rebateCny", "netAdCostCny",
    "taxCostCny", "productCoveredUnits",
    "logisticsCoveredUnits", "exactSettlementOrders", "warehouseCoveredOrders", "taxCoveredOrders",
  ];
  for (const key of numericKeys) {
    if (values[key] != null) (target[key] as number) += number(values[key]);
  }
  if (values.originalAmounts) {
    for (const metric of ORIGINAL_METRICS) {
      for (const [currency, value] of Object.entries(values.originalAmounts[metric] || {})) {
        target.originalAmounts[metric][currency] = (target.originalAmounts[metric][currency] || 0) + number(value);
      }
    }
  }
}

type ProfitOrderDetailMoneyMetric =
  | "gmvCny"
  | "platformFeeCny"
  | "fulfillmentFeeCny"
  | "productCostCny"
  | "logisticsCostCny"
  | "warehouseFulfillmentCostCny"
  | "netAdCostCny"
  | "taxCostCny"
  | "contributionProfitCny";

// Keep the sum of displayed order amounts equal to the truncated daily report.
// Only cent-level tails are distributed; no monetary value is rounded up.
function balanceOrderDetailRounding(
  orders: ProfitOrderDetailRow[],
  metric: ProfitOrderDetailMoneyMetric,
  target: number,
) {
  const includedOrders = orders.filter((order) => order.includedInProfit);
  if (includedOrders.length === 0) return;
  const toCents = (value: number) => Math.trunc((number(value) + (number(value) >= 0 ? 1e-9 : -1e-9)) * 100);
  const targetCents = toCents(target);
  const currentCents = includedOrders.reduce((sum, order) => sum + toCents(order[metric]), 0);
  const delta = targetCents - currentCents;
  if (delta === 0) return;

  const direction = Math.sign(delta);
  const ordered = [...includedOrders].sort((left, right) => {
    const leftFraction = number(left[metric]) * 100 - Math.floor(number(left[metric]) * 100);
    const rightFraction = number(right[metric]) * 100 - Math.floor(number(right[metric]) * 100);
    const byFraction = direction > 0 ? rightFraction - leftFraction : leftFraction - rightFraction;
    return byFraction || left.orderId.localeCompare(right.orderId);
  });
  for (let index = 0; index < Math.abs(delta); index += 1) {
    const order = ordered[index % ordered.length];
    order[metric] = number(order[metric]) + direction / 100;
  }
}

function parseLineItems(rawData: unknown): any[] {
  if (!rawData || typeof rawData !== "object") return [];
  const value = (rawData as any).line_items;
  return Array.isArray(value) ? value : [];
}

/**
 * GMV is the product subtotal only. TikTok's order total is the buyer-paid
 * amount and may include customer shipping, so it must not be used for GMV.
 */
function productAmountOriginal(order: { totalAmount: string | null; rawData: unknown }, lines: Array<{ lineValue: number }>): number {
  const raw = order.rawData as any;
  const payment = raw?.payment;
  for (const value of [payment?.sub_total, payment?.subtotal, payment?.product_subtotal, raw?.product_amount, raw?.product_subtotal]) {
    const parsed = number(value);
    if (value != null && Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const lineTotal = lines.reduce((sum, line) => sum + Math.max(0, number(line.lineValue)), 0);
  if (lineTotal > 0) return lineTotal;
  const shipping = number(payment?.shipping_fee ?? raw?.shipping_fee);
  return Math.max(0, number(order.totalAmount) - Math.max(0, shipping));
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const startDate = searchParams.get("startDate") || addDays(today, -89);
    const endDate = searchParams.get("endDate") || today;
    const requestedGroup = searchParams.get("groupBy") as ProfitGroupBy | null;
    const groupBy: ProfitGroupBy = requestedGroup && VALID_GROUPS.has(requestedGroup) ? requestedGroup : "day";
    const selectedShopId = searchParams.get("shopId") || null;
    const includeOrders = searchParams.get("includeOrders") === "1";

    if (!VALID_DATE.test(startDate) || !VALID_DATE.test(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    const rangeDays = Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
    if (rangeDays > 366) return NextResponse.json({ error: "Date range exceeds 366 days" }, { status: 400 });
    if (includeOrders && (startDate !== endDate || groupBy !== "day")) {
      return NextResponse.json({ error: "Order details support one day only" }, { status: 400 });
    }

    const allShops = await prisma.tikTokShopSetting.findMany({
      select: { shopId: true, shopName: true, region: true, bankAccountId: true },
      orderBy: { shopName: "asc" },
    });
    const shops = selectedShopId ? allShops.filter((shop) => shop.shopId === selectedShopId) : allShops;
    const shopIds = shops.map((shop) => shop.shopId);
    const queryStart = new Date(`${addDays(startDate, -2)}T00:00:00Z`);
    const queryEnd = new Date(`${addDays(endDate, 3)}T00:00:00Z`);

    const [
      ordersRaw, stores, variants, skuMappings, profitSkuMappings, purchaseItems, logisticsCosts,
      adConsumptions, statements, accounts, warehouseMappings, warehouseRules, shopCostRules, influencers,
    ] = await Promise.all([
      prisma.tikTokOrder.findMany({
        where: {
          ...(selectedShopId ? { shopId: selectedShopId } : shopIds.length > 0 ? { shopId: { in: shopIds } } : {}),
          createTime: { gte: queryStart, lt: queryEnd },
        },
        select: { orderId: true, shopId: true, status: true, orderStatus: true, totalAmount: true, currency: true, createTime: true, rawData: true },
        orderBy: { createTime: "asc" },
      }),
      prisma.store.findMany({ select: { id: true, name: true, currency: true, accountId: true } }),
      prisma.productVariant.findMany({
        select: {
          id: true,
          skuId: true,
          costPrice: true,
          weightKg: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          volumetricDivisor: true,
          product: { select: { name: true } },
        },
      }),
      prisma.tikTokSkuMapping.findMany({
        where: selectedShopId ? { tiktokShopId: selectedShopId } : undefined,
        select: { tiktokShopId: true, sellerSku: true, variantId: true },
      }),
      prisma.profitSkuMapping.findMany({
        where: {
          platform: "TIKTOK",
          ...(selectedShopId ? { shopId: selectedShopId } : shopIds.length > 0 ? { shopId: { in: shopIds } } : {}),
        },
        select: {
          shopId: true,
          sellerSku: true,
          components: { select: { variantId: true, quantity: true } },
        },
      }),
      prisma.purchaseContractItem.findMany({
        where: { variantId: { not: null } },
        select: { variantId: true, unitPrice: true, qty: true, totalAmount: true },
      }),
      prisma.logisticsCost.findMany({
        include: {
          outboundBatch: {
            include: {
              container: { select: { id: true } },
              outboundBatchItems: {
                select: {
                  variantId: true,
                  sku: true,
                  qty: true,
                  variant: { select: { lengthCm: true, widthCm: true, heightCm: true } },
                },
              },
            },
          },
        },
      }),
      prisma.adConsumption.findMany({
        where: { date: { gte: new Date(`${startDate}T00:00:00Z`), lt: new Date(`${addDays(endDate, 1)}T00:00:00Z`) } },
        select: { storeId: true, storeName: true, date: true, amount: true, currency: true, giftConsumption: true, estimatedRebate: true },
      }),
      prisma.tikTokStatement.findMany({
        where: selectedShopId ? { shopId: selectedShopId } : undefined,
        select: { shopId: true, revenueAmount: true, feeAmount: true, shippingCost: true, adjustmentAmount: true },
      }),
      prisma.bankAccount.findMany({ select: { currency: true, exchangeRate: true } }),
      prisma.tikTokWarehouseMapping.findMany({
        select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true },
      }),
      prisma.warehouseFulfillmentRule.findMany({
        where: { enabled: true },
        include: {
          warehouse: { select: { name: true } },
          feeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
        },
        orderBy: { effectiveFrom: "desc" },
      }),
      prisma.profitShopCostRule.findMany({
        where: {
          platform: "TIKTOK",
          enabled: true,
          ...(selectedShopId ? { shopId: selectedShopId } : shopIds.length > 0 ? { shopId: { in: shopIds } } : {}),
        },
        include: { platformFeeTiers: { orderBy: { minOrderAmount: "asc" } } },
        orderBy: { effectiveFrom: "desc" },
      }),
      prisma.influencer.findMany({
        where: { sampleOrderNumber: { not: null } },
        select: { id: true, accountName: true, sampleOrderNumber: true },
      }),
    ]);

    const shopById = new Map(allShops.map((shop) => [shop.shopId, shop]));
    const storeByAccountId = new Map(stores.map((store) => [store.accountId, store]));
    const shopStore = new Map(allShops.map((shop) => [shop.shopId, shop.bankAccountId ? storeByAccountId.get(shop.bankAccountId) || null : null]));
    const shopByStoreId = new Map<string, string>();
    for (const [shopId, store] of shopStore) if (store) shopByStoreId.set(store.id, shopId);
    const selectedStoreIds = new Set(shops.map((shop) => shopStore.get(shop.shopId)).filter(Boolean).map((store) => store!.id));

    const orders = ordersRaw.filter((order) => {
      if (!order.createTime) return false;
      const shop = shopById.get(order.shopId);
      const businessDate = dateInTimeZone(order.createTime, timeZoneForRegion(shop?.region));
      return businessDate >= startDate && businessDate <= endDate;
    });
    const orderIds = orders.map((order) => order.orderId);
    const [orderFinancials, sampleCostRows] = await Promise.all([
      prisma.tikTokOrderFinancial.findMany({ where: { orderId: { in: orderIds } } }),
      prisma.influencerSampleCost.findMany({
        where: { orderId: { in: orderIds } },
        include: { influencer: { select: { id: true, accountName: true } } },
      }),
    ]);

    const externalRates = await fetchExchangeRates().catch(() => null);
    const rateTotals = new Map<string, { total: number; count: number }>();
    for (const account of accounts) {
      const currency = (account.currency || "CNY").toUpperCase();
      const rate = number(account.exchangeRate);
      if (rate <= 0) continue;
      const current = rateTotals.get(currency) || { total: 0, count: 0 };
      current.total += rate;
      current.count += 1;
      rateTotals.set(currency, current);
    }
    const rates: Record<string, number> = { CNY: 1, RMB: 1 };
    for (const currency of ["USD", "JPY", "BRL"] as const) {
      const liveRate = externalRates ? getRateToCNY(currency, externalRates.rates) : 0;
      const accountRate = rateTotals.get(currency);
      rates[currency] = round(liveRate || (accountRate ? accountRate.total / accountRate.count : 0), currency === "JPY" ? 6 : 4);
    }
    for (const [currency, value] of rateTotals) {
      if (!rates[currency]) rates[currency] = round(value.total / value.count, 4);
    }
    const missingCurrencies = new Set<string>();
    const toCny = (value: unknown, currency: string | null | undefined) => {
      const code = (currency || "CNY").toUpperCase();
      const rate = rates[code];
      if (!rate) {
        missingCurrencies.add(code);
        return 0;
      }
      return number(value) * rate;
    };
    const fromCny = (valueCny: number, currency: string | null | undefined) => {
      const code = (currency || "CNY").toUpperCase();
      const rate = rates[code];
      if (!rate) {
        missingCurrencies.add(code);
        return 0;
      }
      return valueCny / rate;
    };

    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const variantBySku = new Map(variants.map((variant) => [variant.skuId.trim().toLowerCase(), variant]));
    const mappingByShopSku = new Map(skuMappings.map((mapping) => [`${mapping.tiktokShopId}\u0000${mapping.sellerSku.trim().toLowerCase()}`, mapping.variantId]));
    const profitMappingByShopSku = new Map(profitSkuMappings.map((mapping) => [
      `${mapping.shopId}\u0000${mapping.sellerSku.trim().toLowerCase()}`,
      mapping.components,
    ]));

    const purchaseTotals = new Map<string, { amount: number; qty: number }>();
    for (const item of purchaseItems) {
      if (!item.variantId || item.qty <= 0) continue;
      const current = purchaseTotals.get(item.variantId) || { amount: 0, qty: 0 };
      current.amount += number(item.totalAmount) || number(item.unitPrice) * item.qty;
      current.qty += item.qty;
      purchaseTotals.set(item.variantId, current);
    }
    const purchaseUnitCost = new Map<string, number>();
    for (const variant of variants) {
      const purchased = purchaseTotals.get(variant.id);
      const cost = purchased && purchased.qty > 0 ? purchased.amount / purchased.qty : number(variant.costPrice);
      if (cost > 0) purchaseUnitCost.set(variant.id, cost);
    }

    // Use the same source and formula as "鐗╂祦璐圭敤鍒嗘憡": each container and
    // cost type is allocated by product volume, then reduced to a per-unit
    // cost. The stored logistics quote is USD; original amounts are retained
    // alongside the CNY value for auditability.
    type LogisticsAllocationGroup = {
      totalCostCny: number;
      totalCostOriginalByCurrency: Record<string, number>;
      items: Map<string, { variantId: string | null; sku: string; qty: number; length: number; width: number; height: number }>;
    };
    type LogisticsCostTotal = {
      costCny: number;
      qty: number;
      originalByCurrency: Record<string, number>;
    };
    type LogisticsUnitCost = {
      cny: number;
      originalByCurrency: Record<string, number>;
    };

    const logisticsGroups = new Map<string, LogisticsAllocationGroup>();
    for (const cost of logisticsCosts) {
      const batch = cost.outboundBatch;
      const containerId = cost.containerId || batch?.containerId || batch?.container?.id;
      if (!batch || !containerId) continue;
      const key = `${containerId}\u0000${cost.costType}`;
      const group: LogisticsAllocationGroup = logisticsGroups.get(key) || {
        totalCostCny: 0,
        totalCostOriginalByCurrency: {},
        items: new Map<string, { variantId: string | null; sku: string; qty: number; length: number; width: number; height: number }>(),
      };
      group.totalCostCny += toCny(cost.amount, cost.currency);
      const currency = String(cost.currency || "CNY").trim().toUpperCase();
      group.totalCostOriginalByCurrency[currency] = (group.totalCostOriginalByCurrency[currency] || 0) + number(cost.amount);
      for (const item of batch.outboundBatchItems) {
        if (item.qty <= 0) continue;
        const sku = String(item.sku || "").trim();
        const itemKey = sku || item.variantId || "unknown";
        const current = group.items.get(itemKey) || {
          variantId: item.variantId || null,
          sku,
          qty: 0,
          length: number(item.variant?.lengthCm),
          width: number(item.variant?.widthCm),
          height: number(item.variant?.heightCm),
        };
        current.qty += item.qty;
        group.items.set(itemKey, current);
      }
      logisticsGroups.set(key, group);
    }

    const logisticsTotals = new Map<string, LogisticsCostTotal>();
    const logisticsSkuTotals = new Map<string, LogisticsCostTotal>();
    const addLogisticsTotal = (target: Map<string, LogisticsCostTotal>, key: string, qty: number, allocatedCny: number, originalByCurrency: Record<string, number>) => {
      if (!key || qty <= 0) return;
      const current = target.get(key) || { costCny: 0, qty: 0, originalByCurrency: {} };
      current.costCny += allocatedCny;
      current.qty += qty;
      for (const [currency, amount] of Object.entries(originalByCurrency)) {
        current.originalByCurrency[currency] = (current.originalByCurrency[currency] || 0) + amount;
      }
      target.set(key, current);
    };
    for (const group of logisticsGroups.values()) {
      const usable = [...group.items.values()].filter((item) => item.qty > 0);
      const volumes = usable.map((item) => (item.length * item.width * item.height) / 1_000_000 * item.qty);
      const totalVolume = volumes.reduce((sum, value) => sum + value, 0);
      usable.forEach((item, index) => {
        const share = totalVolume > 0 ? volumes[index] / totalVolume : 0;
        const allocatedCny = group.totalCostCny * share;
        const allocatedOriginalByCurrency = Object.fromEntries(
          Object.entries(group.totalCostOriginalByCurrency).map(([currency, amount]) => [currency, amount * share]),
        );
        addLogisticsTotal(logisticsTotals, item.variantId || "", item.qty, allocatedCny, allocatedOriginalByCurrency);
        addLogisticsTotal(logisticsSkuTotals, item.sku.toLowerCase(), item.qty, allocatedCny, allocatedOriginalByCurrency);
      });
    }
    const toLogisticsUnitCosts = (totals: Map<string, LogisticsCostTotal>) => new Map<string, LogisticsUnitCost>(
      [...totals]
        .filter(([, value]) => value.qty > 0)
        .map(([key, value]) => [key, {
          cny: value.costCny / value.qty,
          originalByCurrency: Object.fromEntries(
            Object.entries(value.originalByCurrency).map(([currency, amount]) => [currency, amount / value.qty]),
          ),
        }]),
    );
    const logisticsUnitByVariant = toLogisticsUnitCosts(logisticsTotals);
    const logisticsUnitBySku = toLogisticsUnitCosts(logisticsSkuTotals);

    const financialByOrder = new Map(orderFinancials.map((row) => [row.orderId, row]));
    const sampleCostByOrder = new Map(sampleCostRows.map((row) => [row.orderId, row]));
    const influencerBySampleOrder = new Map(influencers.flatMap((influencer) => (
      influencer.sampleOrderNumber ? [[influencer.sampleOrderNumber, influencer] as const] : []
    )));
    // Warehouse selection belongs to the order. A shop may switch fulfillment
    // providers, so never use shopId as the primary warehouse key.
    const resolveWarehouse = createWarehouseResolver(warehouseMappings);
    const activeShopRule = (shopId: string, costType: string, date: string) => shopCostRules.find((rule) => (
      rule.shopId === shopId
      && rule.costType === costType
      && rule.effectiveFrom.toISOString().slice(0, 10) <= date
      && (!rule.effectiveTo || rule.effectiveTo.toISOString().slice(0, 10) >= date)
    ));
    const activeWarehouseRule = (warehouseId: string, shopId: string, date: string) => {
      const candidates = warehouseRules.filter((rule) => (
        rule.warehouseId === warehouseId
        && (!rule.shopId || rule.shopId === shopId)
        && rule.effectiveFrom.toISOString().slice(0, 10) <= date
        && (!rule.effectiveTo || rule.effectiveTo.toISOString().slice(0, 10) >= date)
      ));
      return candidates.find((rule) => rule.shopId === shopId) || candidates[0] || null;
    };
    const platformRuleCost = (
      rule: (typeof shopCostRules)[number],
      orderAmount: number,
      gmvCny: number,
      totalQty: number,
      orderLines: Array<{ unitAmount: number; quantity: number }>,
    ) => calculateEstimatedProfitFees({
      orderAmount,
      gmvCny,
      totalQty,
      orderLines,
      fulfillmentRatePercent: number(rule.ratePercent),
      fixedPerOrder: number(rule.fixedPerOrder),
      fixedPerUnit: number(rule.fixedPerUnit),
      currency: rule.currency,
      tiers: rule.platformFeeTiers.map((tier) => ({
        minOrderAmount: tier.minOrderAmount == null ? null : number(tier.minOrderAmount),
        maxOrderAmount: tier.maxOrderAmount == null ? null : number(tier.maxOrderAmount),
        minInclusive: tier.minInclusive,
        maxInclusive: tier.maxInclusive,
        platformRatePercent: number(tier.platformRatePercent),
        perUnitFee: number(tier.perUnitFee),
        currency: tier.currency,
      })),
      convertToCny: toCny,
    });

    const resolveOrderLines = (order: (typeof orders)[number]) => {
      const lineItems = parseLineItems(order.rawData);
      const parsedLines = lineItems.map((item) => {
        const sellerSku = String(item?.seller_sku || "鏈煡 SKU").trim();
        const skuKey = sellerSku.toLowerCase();
        const qty = Math.max(1, Math.round(number(item?.quantity) || 1));
        const profitComponents = profitMappingByShopSku.get(`${order.shopId}\u0000${skuKey}`) || [];
        const mappedVariantId = mappingByShopSku.get(`${order.shopId}\u0000${skuKey}`);
        const directVariant = variantBySku.get(skuKey);
        const resolvedComponents = profitComponents.length > 0
          ? profitComponents.flatMap((component) => {
              const resolvedVariant = variantById.get(component.variantId);
              return resolvedVariant ? [{ variant: resolvedVariant, quantity: Math.max(1, component.quantity) }] : [];
            })
          : mappedVariantId && variantById.has(mappedVariantId)
            ? [{ variant: variantById.get(mappedVariantId)!, quantity: 1 }]
            : directVariant
              ? [{ variant: directVariant, quantity: 1 }]
              : [];
        const variant = resolvedComponents[0]?.variant;
        const mappingSource: "profit" | "inventory" | "direct" | "unmapped" = profitComponents.length > 0
          ? "profit"
          : mappedVariantId
            ? "inventory"
            : directVariant
              ? "direct"
              : "unmapped";
        const mappingStatus: "mapped" | "direct" | "unmapped" = mappingSource === "profit" || mappingSource === "inventory"
          ? "mapped"
          : mappingSource;
        const lineValue = Math.max(0, number(item?.sale_price) * qty);
        const unitSalePrice = Math.max(0, number(item?.sale_price));
        const productUnitCost = resolvedComponents.reduce((sum, component) => (
          sum + (purchaseUnitCost.get(component.variant.id) || 0) * component.quantity
        ), 0);
        const logisticsUnits = resolvedComponents.map((component) => (
          logisticsUnitByVariant.get(component.variant.id)
          || logisticsUnitBySku.get(component.variant.skuId.trim().toLowerCase())
          || null
        ));
        const directLogisticsUnit = resolvedComponents.length === 0 ? logisticsUnitBySku.get(skuKey) || null : null;
        const logisticsUnitDetail = directLogisticsUnit || logisticsUnits.reduce<LogisticsUnitCost>((total, unit, index) => {
          if (!unit) return total;
          const quantity = resolvedComponents[index].quantity;
          total.cny += unit.cny * quantity;
          for (const [currency, amount] of Object.entries(unit.originalByCurrency)) {
            total.originalByCurrency[currency] = (total.originalByCurrency[currency] || 0) + amount * quantity;
          }
          return total;
        }, { cny: 0, originalByCurrency: {} as Record<string, number> });
        const logisticsUnitCost = logisticsUnitDetail.cny;
        const logisticsOriginalByCurrency = logisticsUnitDetail.originalByCurrency;
        const productCostCovered = resolvedComponents.length > 0 && resolvedComponents.every((component) => (
          (purchaseUnitCost.get(component.variant.id) || 0) > 0
        ));
        const logisticsCostCovered = resolvedComponents.length > 0
          ? logisticsUnits.every(Boolean)
          : Boolean(directLogisticsUnit);
        const costComponents = resolvedComponents.map((component) => ({
          variantId: component.variant.id,
          skuId: component.variant.skuId,
          quantity: component.quantity,
        }));
        const internalSku = costComponents.length > 0
          ? costComponents.map((component) => `${component.quantity > 1 ? `${component.quantity}x` : ""}${component.skuId}`).join(" + ")
          : null;
        const physical = resolvedComponents.reduce((total, component) => {
          const dimensions = [
            number(component.variant.lengthCm),
            number(component.variant.widthCm),
            number(component.variant.heightCm),
          ].sort((left, right) => right - left);
          const componentQty = Math.max(1, component.quantity);
          return {
            actualWeightKg: total.actualWeightKg + number(component.variant.weightKg) * componentQty,
            volumeCm3: total.volumeCm3 + dimensions[0] * dimensions[1] * dimensions[2] * componentQty,
            maxLengthCm: Math.max(total.maxLengthCm, dimensions[0]),
            maxWidthCm: Math.max(total.maxWidthCm, dimensions[1]),
            maxHeightCm: Math.max(total.maxHeightCm, dimensions[2]),
            covered: total.covered
              && number(component.variant.weightKg) > 0
              && dimensions.every((dimension) => dimension > 0),
          };
        }, {
          actualWeightKg: 0,
          volumeCm3: 0,
          maxLengthCm: 0,
          maxWidthCm: 0,
          maxHeightCm: 0,
          covered: resolvedComponents.length > 0,
        });
        return {
          sellerSku, skuKey, qty, unitSalePrice, variant, internalSku, mappingStatus, mappingSource, costComponents,
          lineValue, productUnitCost, logisticsUnitCost, logisticsOriginalByCurrency, productCostCovered, logisticsCostCovered,
          ...physical,
          productName: String(item?.product_name || variant?.product.name || sellerSku),
        };
      });
      return parsedLines.length > 0 ? parsedLines : [{
        sellerSku: "鏈煡 SKU", skuKey: "鏈煡 sku", qty: Math.max(number((order.rawData as any)?.item_count), 1), variant: undefined,
        internalSku: null, mappingStatus: "unmapped" as const, mappingSource: "unmapped" as const, costComponents: [],
        lineValue: 0, unitSalePrice: 0, productUnitCost: 0, logisticsUnitCost: 0, productCostCovered: false, logisticsCostCovered: false,
        actualWeightKg: 0, volumeCm3: 0, maxLengthCm: 0, maxWidthCm: 0, maxHeightCm: 0, covered: false,
        logisticsOriginalByCurrency: {},
        productName: "Unknown product",
      }];
    };
    const fulfillmentForOrder = (order: (typeof orders)[number], lines: ReturnType<typeof resolveOrderLines>, date: string) => {
      const resolution = resolveWarehouse(order.rawData, order.shopId);
      const tiktokWarehouseId = resolution.tiktokWarehouseId;
      const mapping = resolution.mapping;
      const rule = mapping ? activeWarehouseRule(mapping.warehouseId, order.shopId, date) : null;
      const sellerUnits = lines.reduce((sum, line) => sum + line.qty, 0);
      const internalUnits = lines.reduce((sum, line) => (
        sum + line.qty * Math.max(1, line.costComponents.reduce((componentSum, component) => componentSum + component.quantity, 0))
      ), 0);
      const billedUnits = rule?.billingUnit === "INTERNAL_COMPONENT" ? internalUnits : sellerUnits;
      const physical = lines.reduce((total, line) => ({
        actualWeightKg: total.actualWeightKg + line.actualWeightKg * line.qty,
        volumeCm3: total.volumeCm3 + line.volumeCm3 * line.qty,
        maxLengthCm: Math.max(total.maxLengthCm, line.maxLengthCm),
        maxWidthCm: Math.max(total.maxWidthCm, line.maxWidthCm),
        maxHeightCm: Math.max(total.maxHeightCm, line.maxHeightCm),
        covered: total.covered && line.covered,
      }), {
        actualWeightKg: 0,
        volumeCm3: 0,
        maxLengthCm: 0,
        maxWidthCm: 0,
        maxHeightCm: 0,
        covered: lines.length > 0,
      });
      const pricingMode = rule?.pricingMode === "WEIGHT_TIER" || rule?.pricingMode === "PACKAGE_TIER"
        ? rule.pricingMode
        : "FLAT_UNIT";
      const volumetricDivisor = Math.max(1, rule?.volumetricDivisor || 6000);
      const volumetricWeightKg = physical.volumeCm3 / volumetricDivisor;
      // Panlian's standard tiers are based on actual weight. Only package-tier
      // quotes should use the greater of actual and volumetric weight.
      const chargeableWeightKg = pricingMode === "PACKAGE_TIER"
        ? Math.max(physical.actualWeightKg, volumetricWeightKg)
        : physical.actualWeightKg;
      const compactHeightCm = physical.maxLengthCm > 0 && physical.maxWidthCm > 0
        ? Math.max(physical.maxHeightCm, physical.volumeCm3 / (physical.maxLengthCm * physical.maxWidthCm))
        : 0;
      const packageDimensions = [physical.maxLengthCm, physical.maxWidthCm, compactHeightCm]
        .sort((left, right) => right - left);
      const feeResult = rule
        ? calculateWarehouseFulfillmentFee({
            pricingMode,
            billedUnits,
            chargeableWeightKg,
            packageLengthCm: packageDimensions[0],
            packageWidthCm: packageDimensions[1],
            packageHeightCm: packageDimensions[2],
            baseOrderFee: number(rule.baseOrderFee),
            firstUnitFee: number(rule.firstUnitFee),
            additionalUnitFee: number(rule.additionalUnitFee),
            overweightThresholdKg: rule.overweightThresholdKg == null ? null : number(rule.overweightThresholdKg),
            overweightFeePerKg: number(rule.overweightFeePerKg),
            feeTiers: rule.feeTiers.map((tier) => ({
              minWeightKg: tier.minWeightKg == null ? null : number(tier.minWeightKg),
              maxWeightKg: tier.maxWeightKg == null ? null : number(tier.maxWeightKg),
              minInclusive: tier.minInclusive,
              maxInclusive: tier.maxInclusive,
              maxLengthCm: tier.maxLengthCm == null ? null : number(tier.maxLengthCm),
              maxWidthCm: tier.maxWidthCm == null ? null : number(tier.maxWidthCm),
              maxHeightCm: tier.maxHeightCm == null ? null : number(tier.maxHeightCm),
              baseFee: number(tier.baseFee),
            })),
          })
        : { fee: 0, covered: false };
      const requiresPhysicalData = pricingMode !== "FLAT_UNIT";
      return {
        costCny: rule ? toCny(feeResult.fee, rule.currency) : 0,
        costOriginal: rule ? feeResult.fee : 0,
        currency: rule?.currency || null,
        covered: Boolean(mapping && rule && feeResult.covered && (!requiresPhysicalData || physical.covered)),
        warehouseId: mapping?.warehouseId || null,
        warehouseName: rule?.warehouse.name || (tiktokWarehouseId ? `Warehouse ${tiktokWarehouseId}` : "Unknown warehouse"),
        chargeableWeightKg,
        tiktokWarehouseId,
        mappingStatus: resolution.status,
      };
    };

    const statementRates = new Map<string, { revenue: number; cost: number }>();
    for (const statement of statements) {
      const current = statementRates.get(statement.shopId) || { revenue: 0, cost: 0 };
      current.revenue += Math.abs(number(statement.revenueAmount));
      current.cost += Math.max(0, -number(statement.feeAmount)) + Math.max(0, -number(statement.shippingCost)) + Math.max(0, -number(statement.adjustmentAmount));
      statementRates.set(statement.shopId, current);
    }
    const globalStatement = [...statementRates.values()].reduce((total, value) => ({ revenue: total.revenue + value.revenue, cost: total.cost + value.cost }), { revenue: 0, cost: 0 });
    const globalPlatformRate = globalStatement.revenue > 0 ? clamp(globalStatement.cost / globalStatement.revenue, 0, 0.6) : 0;
    const platformRateByShop = new Map([...statementRates].map(([shopId, value]) => [shopId, value.revenue > 0 ? clamp(value.cost / value.revenue, 0, 0.6) : globalPlatformRate]));

    const validOrderIds = orders
      .filter((order) => !["CANCELLED", "UNPAID"].includes(order.status || "") && !(order.rawData as any)?.is_sample_order)
      .map((order) => order.orderId);
    const settlementRows: Array<{ relatedOrderId: string | null; totalSettlementAmount: string; currency: string }> = [];
    for (const ids of chunks(validOrderIds, 4000)) {
      const rows = await prisma.storeOrderSettlement.findMany({
        where: { relatedOrderId: { in: ids } },
        select: { relatedOrderId: true, totalSettlementAmount: true, currency: true },
      });
      settlementRows.push(...rows);
    }
    const settlementByOrder = new Map<string, number>();
    for (const settlement of settlementRows) {
      if (!settlement.relatedOrderId) continue;
      settlementByOrder.set(
        settlement.relatedOrderId,
        (settlementByOrder.get(settlement.relatedOrderId) || 0) + toCny(settlement.totalSettlementAmount, settlement.currency),
      );
    }

    const periods = new Map<string, MutableMetric>();
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      const period = periodFor(date, groupBy);
      if (!periods.has(period.id)) periods.set(period.id, emptyMetric(period.id, period.label, period.startDate, period.endDate));
    }
    const storesMap = new Map<string, MutableMetric & { shopId: string; storeId: string | null; currency: string }>();
    let warehouseMappingMappedOrders = 0;
    let warehouseMappingMissingIdOrders = 0;
    const warehouseMappingUnmappedIds = new Set<string>();
    let influencerTeamCommissionCny = 0;
    const orderDetails: ProfitOrderDetailRow[] = [];
    const skusMap = new Map<string, MutableMetric & {
      sellerSku: string;
      internalSku: string | null;
      productName: string;
      shopId: string;
      storeName: string;
      mappingStatus: "mapped" | "direct" | "unmapped";
      mappingSource: "profit" | "inventory" | "direct" | "unmapped";
      costComponents: Array<{ variantId: string; skuId: string; quantity: number }>;
    }>();

    const ensureStore = (shopId: string) => {
      const shop = shopById.get(shopId);
      const store = shopStore.get(shopId);
      if (!storesMap.has(shopId)) {
        storesMap.set(shopId, {
          ...emptyMetric(shopId, store?.name || shop?.shopName || shopId, startDate, endDate),
          shopId,
          storeId: store?.id || null,
          currency: store?.currency || (shop?.region === "US" ? "USD" : "BRL"),
        });
      }
      return storesMap.get(shopId)!;
    };

    for (const order of orders) {
      if (!order.createTime) continue;
      const shop = shopById.get(order.shopId);
      const businessDate = dateInTimeZone(order.createTime, timeZoneForRegion(shop?.region));
      const periodInfo = periodFor(businessDate, groupBy);
      const period = periods.get(periodInfo.id)!;
      const storeMetric = ensureStore(order.shopId);
      const timeZone = timeZoneForRegion(shop?.region);
      const orderCurrency = order.currency || (order.rawData as any)?.payment?.currency || (shop?.region === "US" ? "USD" : "BRL");
      const fallbackLines = resolveOrderLines(order);
      const totalLineValue = fallbackLines.reduce((sum, line) => sum + line.lineValue, 0);
      const totalQty = fallbackLines.reduce((sum, line) => sum + line.qty, 0);
      const productAmount = productAmountOriginal(order, fallbackLines);
      const isCancelled = order.status === "CANCELLED";
      const exclusionReason = isCancelled
        ? "Cancelled order"
        : order.status === "UNPAID"
          ? "Unpaid order"
          : (order.rawData as any)?.is_sample_order
            ? "鍏嶈垂鏍峰搧璁㈠崟锛屼笉璁″叆搴楅摵鍒╂鼎"
            : null;

      if (isCancelled) {
        addMetric(period, { cancelledOrders: 1 });
        addMetric(storeMetric, { cancelledOrders: 1 });
      }
      if (exclusionReason) {
        if (includeOrders) {
          const fulfillment = fulfillmentForOrder(order, fallbackLines, businessDate);
          orderDetails.push({
            orderId: order.orderId,
            businessDate,
            createTime: order.createTime.toISOString(),
            timeZone,
            shopId: order.shopId,
            storeName: storeMetric.label,
            status: order.status || order.orderStatus || "UNKNOWN",
            includedInProfit: false,
            exclusionReason,
            currency: orderCurrency,
            orderAmountOriginal: round(productAmount),
            units: totalQty,
            lines: fallbackLines.map((line) => ({
              sellerSku: line.sellerSku,
              internalSku: line.internalSku,
              productName: line.productName,
              quantity: line.qty,
            })),
            tiktokWarehouseId: fulfillment.tiktokWarehouseId,
            warehouseId: fulfillment.warehouseId,
            warehouseName: fulfillment.warehouseName,
            gmvCny: 0,
            platformFeeCny: 0,
            fulfillmentFeeCny: 0,
            productCostCny: 0,
            logisticsCostCny: 0,
            warehouseFulfillmentCostCny: 0,
            netAdCostCny: 0,
            taxCostCny: 0,
            contributionProfitCny: 0,
            margin: 0,
            originalAmounts: emptyOriginalAmounts(),
            coverage: {
              productCost: false,
              logisticsCost: false,
              settlement: false,
              warehouse: false,
              tax: false,
            },
          });
        }
        continue;
      }

      // GMV is the product subtotal and excludes buyer-paid shipping.
      const gmvCny = toCny(productAmount, orderCurrency);
      const financial = financialByOrder.get(order.orderId);
      const settledCny = settlementByOrder.get(order.orderId);
      const hasExactSettlement = financial?.source === "SETTLED" || settledCny != null;
      const platformRule = activeShopRule(order.shopId, "PLATFORM_FULFILLMENT", businessDate);
      const estimatedFeeBreakdown = platformRule
        ? platformRuleCost(
            platformRule,
            productAmount,
            gmvCny,
            totalQty,
            fallbackLines.map((line) => ({ unitAmount: line.unitSalePrice, quantity: line.qty })),
          )
        : null;
      let feeBreakdown: ProfitFeeBreakdown;
      if (financial) {
        const financialReference = {
          platformFeeCny: toCny(
            -(number(financial.feeTaxAmount) + number(financial.adjustmentAmount)),
            financial.currency,
          ),
          fulfillmentFeeCny: toCny(-number(financial.shippingCostAmount), financial.currency),
        };
        feeBreakdown = allocateActualFeeTotal(
          clamp(financialReference.platformFeeCny + financialReference.fulfillmentFeeCny, -gmvCny, gmvCny * 2),
          financialReference,
        );
      } else if (settledCny != null) {
        const settledTotal = clamp(gmvCny - settledCny, -gmvCny, gmvCny * 2);
        feeBreakdown = allocateActualFeeTotal(
          settledTotal,
          estimatedFeeBreakdown || { platformFeeCny: settledTotal, fulfillmentFeeCny: 0 },
        );
      } else if (estimatedFeeBreakdown) {
        feeBreakdown = estimatedFeeBreakdown;
      } else {
        const fallbackTotal = gmvCny * (platformRateByShop.get(order.shopId) ?? globalPlatformRate);
        feeBreakdown = { platformFeeCny: fallbackTotal, fulfillmentFeeCny: 0, totalCny: fallbackTotal };
      }
      const { platformFeeCny, fulfillmentFeeCny, totalCny: platformCostCny } = feeBreakdown;
      const feeCurrency = financial?.currency || platformRule?.currency || orderCurrency;
      const fulfillment = fulfillmentForOrder(order, fallbackLines, businessDate);
      if (fulfillment.mappingStatus === "mapped") warehouseMappingMappedOrders += 1;
      else if (fulfillment.mappingStatus === "missing_id") warehouseMappingMissingIdOrders += 1;
      else if (fulfillment.tiktokWarehouseId) warehouseMappingUnmappedIds.add(fulfillment.tiktokWarehouseId);
      const taxRule = activeShopRule(order.shopId, "TAX", businessDate);
      const influencerRule = activeShopRule(order.shopId, "INFLUENCER_COMMISSION", businessDate);
      const taxCostCny = taxRule ? gmvCny * number(taxRule.ratePercent) / 100 : 0;
      const taxCostOriginal = taxRule ? productAmount * number(taxRule.ratePercent) / 100 : 0;
      const influencerCommissionCny = influencerRule ? gmvCny * number(influencerRule.ratePercent) / 100 : 0;
      influencerTeamCommissionCny += influencerCommissionCny;
      let orderProductCost = 0;
      let orderLogisticsCost = 0;
      const orderLogisticsOriginalByCurrency: Record<string, number> = {};
      let productCoveredUnits = 0;
      let logisticsCoveredUnits = 0;

      for (const line of fallbackLines) {
        const allocation = totalLineValue > 0 ? line.lineValue / totalLineValue : line.qty / Math.max(totalQty, 1);
        const lineGmv = gmvCny * allocation;
        const linePlatformCost = platformCostCny * allocation;
        const linePlatformFee = platformFeeCny * allocation;
        const lineFulfillmentFee = fulfillmentFeeCny * allocation;
        const lineProductCost = line.productUnitCost * line.qty;
        const lineLogisticsCost = line.logisticsUnitCost * line.qty;
        const lineWarehouseCost = fulfillment.costCny * allocation;
        const lineTaxCost = taxCostCny * allocation;
        for (const [currency, amount] of Object.entries(line.logisticsOriginalByCurrency)) {
          orderLogisticsOriginalByCurrency[currency] = (orderLogisticsOriginalByCurrency[currency] || 0) + amount * line.qty;
        }
        const lineOriginalAmounts = originalAmounts([
          ["gmv", orderCurrency, productAmount * allocation],
          ["platformFee", feeCurrency, fromCny(linePlatformFee, feeCurrency)],
          ["fulfillmentFee", feeCurrency, fromCny(lineFulfillmentFee, feeCurrency)],
          ...Object.entries(line.logisticsOriginalByCurrency).map(([currency, amount]) => (
            ["logisticsCost", currency, amount * line.qty] as [ProfitOriginalMetric, string, number]
          )),
          ["warehouseFulfillment", fulfillment.currency, fulfillment.costOriginal * allocation],
          ["taxCost", orderCurrency, taxCostOriginal * allocation],
        ]);
        orderProductCost += lineProductCost;
        orderLogisticsCost += lineLogisticsCost;
        if (line.productCostCovered) productCoveredUnits += line.qty;
        if (line.logisticsCostCovered) logisticsCoveredUnits += line.qty;

        const skuMapKey = `${order.shopId}\u0000${line.skuKey}`;
        if (!skusMap.has(skuMapKey)) {
          skusMap.set(skuMapKey, {
            ...emptyMetric(skuMapKey, line.sellerSku, startDate, endDate),
            sellerSku: line.sellerSku,
            internalSku: line.internalSku,
            productName: line.productName,
            shopId: order.shopId,
            storeName: storeMetric.label,
            mappingStatus: line.mappingStatus,
            mappingSource: line.mappingSource,
            costComponents: line.costComponents,
          });
        }
        addMetric(skusMap.get(skuMapKey)!, {
          orderCount: 1,
          units: line.qty,
          gmvCny: lineGmv,
          platformCostCny: linePlatformCost,
          platformFeeCny: linePlatformFee,
          fulfillmentFeeCny: lineFulfillmentFee,
          productCostCny: lineProductCost,
          logisticsCostCny: lineLogisticsCost,
          warehouseFulfillmentCostCny: lineWarehouseCost,
          taxCostCny: lineTaxCost,
          originalAmounts: lineOriginalAmounts,
          productCoveredUnits: line.productCostCovered ? line.qty : 0,
          logisticsCoveredUnits: line.logisticsCostCovered ? line.qty : 0,
          exactSettlementOrders: hasExactSettlement ? 1 : 0,
          warehouseCoveredOrders: fulfillment.covered ? 1 : 0,
          taxCoveredOrders: taxRule ? 1 : 0,
        });
      }

      const orderOriginalAmounts = originalAmounts([
        ["gmv", orderCurrency, productAmount],
        ["platformFee", feeCurrency, fromCny(platformFeeCny, feeCurrency)],
        ["fulfillmentFee", feeCurrency, fromCny(fulfillmentFeeCny, feeCurrency)],
        ...Object.entries(orderLogisticsOriginalByCurrency).map(([currency, amount]) => (
          ["logisticsCost", currency, amount] as [ProfitOriginalMetric, string, number]
        )),
        ["warehouseFulfillment", fulfillment.currency, fulfillment.costOriginal],
        ["taxCost", orderCurrency, taxCostOriginal],
      ]);
      const orderValues: Partial<MutableMetric> = {
        orderCount: 1,
        units: totalQty,
        gmvCny,
        platformCostCny,
        platformFeeCny,
        fulfillmentFeeCny,
        productCostCny: orderProductCost,
        logisticsCostCny: orderLogisticsCost,
        warehouseFulfillmentCostCny: fulfillment.costCny,
        taxCostCny,
        originalAmounts: orderOriginalAmounts,
        productCoveredUnits,
        logisticsCoveredUnits,
        exactSettlementOrders: hasExactSettlement ? 1 : 0,
        warehouseCoveredOrders: fulfillment.covered ? 1 : 0,
        taxCoveredOrders: taxRule ? 1 : 0,
      };
      addMetric(period, orderValues);
      addMetric(storeMetric, orderValues);
      if (includeOrders) {
        orderDetails.push({
          orderId: order.orderId,
          businessDate,
          createTime: order.createTime.toISOString(),
          timeZone,
          shopId: order.shopId,
          storeName: storeMetric.label,
          status: order.status || order.orderStatus || "UNKNOWN",
          includedInProfit: true,
          exclusionReason: null,
          currency: orderCurrency,
          orderAmountOriginal: round(productAmount),
          units: totalQty,
          lines: fallbackLines.map((line) => ({
            sellerSku: line.sellerSku,
            internalSku: line.internalSku,
            productName: line.productName,
            quantity: line.qty,
          })),
          tiktokWarehouseId: fulfillment.tiktokWarehouseId,
          warehouseId: fulfillment.warehouseId,
          warehouseName: fulfillment.warehouseName,
          gmvCny,
          platformFeeCny,
          fulfillmentFeeCny,
          productCostCny: orderProductCost,
          logisticsCostCny: orderLogisticsCost,
          warehouseFulfillmentCostCny: fulfillment.costCny,
          netAdCostCny: 0,
          taxCostCny,
          contributionProfitCny: 0,
          margin: 0,
          originalAmounts: orderOriginalAmounts,
          coverage: {
            productCost: totalQty > 0 && productCoveredUnits >= totalQty,
            logisticsCost: totalQty > 0 && logisticsCoveredUnits >= totalQty,
            settlement: hasExactSettlement,
            warehouse: fulfillment.covered,
            tax: Boolean(taxRule),
          },
        });
      }
    }

    const sampleRows: ProfitSampleRow[] = [];
    let sampleUnits = 0;
    let linkedSampleOrders = 0;
    let sampleProductCostCny = 0;
    let sampleLogisticsCostCny = 0;
    let sampleWarehouseCostCny = 0;
    let sampleShippingCostCny = 0;
    let sampleOtherCostCny = 0;
    for (const order of orders) {
      if (!order.createTime || !(order.rawData as any)?.is_sample_order) continue;
      if (["CANCELLED", "UNPAID"].includes(order.status || "")) continue;
      const shop = shopById.get(order.shopId);
      const businessDate = dateInTimeZone(order.createTime, timeZoneForRegion(shop?.region));
      const period = periods.get(periodFor(businessDate, groupBy).id);
      if (!period) continue;
      const storeMetric = ensureStore(order.shopId);
      const lines = resolveOrderLines(order);
      const fulfillment = fulfillmentForOrder(order, lines, businessDate);
      const attribution = sampleCostByOrder.get(order.orderId);
      const legacyInfluencer = influencerBySampleOrder.get(order.orderId);
      const financial = financialByOrder.get(order.orderId);
      const units = lines.reduce((sum, line) => sum + line.qty, 0);
      const productCost = lines.reduce((sum, line) => sum + line.productUnitCost * line.qty, 0);
      const logisticsCost = lines.reduce((sum, line) => sum + line.logisticsUnitCost * line.qty, 0);
      const platformShippingCost = financial
        ? Math.max(0, toCny(-number(financial.shippingCostAmount), financial.currency))
        : 0;
      const manualShippingCost = attribution
        ? toCny(attribution.manualShippingCost, attribution.currency)
        : 0;
      const shippingCost = platformShippingCost + manualShippingCost;
      const otherCost = attribution ? toCny(attribution.otherCost, attribution.currency) : 0;
      const totalCost = productCost + logisticsCost + fulfillment.costCny + shippingCost + otherCost;
      const influencerId = attribution?.influencer?.id || legacyInfluencer?.id || null;
      const influencerName = attribution?.influencer?.accountName || legacyInfluencer?.accountName || null;
      if (influencerId) linkedSampleOrders += 1;
      sampleUnits += units;
      sampleProductCostCny += productCost;
      sampleLogisticsCostCny += logisticsCost;
      sampleWarehouseCostCny += fulfillment.costCny;
      sampleShippingCostCny += shippingCost;
      sampleOtherCostCny += otherCost;
      sampleRows.push({
        orderId: order.orderId,
        date: businessDate,
        shopId: order.shopId,
        storeName: storeMetric.label,
        warehouseId: fulfillment.warehouseId,
        warehouseName: fulfillment.warehouseName,
        sellerSkus: lines.map((line) => `${line.sellerSku} x${line.qty}`).join(" + "),
        units,
        influencerId,
        influencerName,
        teamName: attribution?.teamName || null,
        productCostCny: round(productCost),
        logisticsCostCny: round(logisticsCost),
        warehouseFulfillmentCostCny: round(fulfillment.costCny),
        shippingCostCny: round(shippingCost),
        otherCostCny: round(otherCost),
        manualShippingCost: number(attribution?.manualShippingCost),
        manualOtherCost: number(attribution?.otherCost),
        manualCurrency: attribution?.currency || "BRL",
        notes: attribution?.notes || null,
        totalCostCny: round(totalCost),
        productCostCovered: lines.every((line) => line.productCostCovered),
        logisticsCostCovered: lines.every((line) => line.logisticsCostCovered),
        warehouseCostCovered: fulfillment.covered,
      });
    }

    let totalAdCny = 0;
    let linkedAdCny = 0;
    for (const ad of adConsumptions) {
      if (selectedShopId && (!ad.storeId || !selectedStoreIds.has(ad.storeId))) continue;
      const businessDate = ad.date.toISOString().slice(0, 10);
      if (businessDate < startDate || businessDate > endDate) continue;
      const spendOriginal = Math.max(0, number(ad.amount) - number(ad.giftConsumption));
      const rebateOriginal = Math.max(0, number(ad.estimatedRebate));
      const netAdCostOriginal = Math.max(0, spendOriginal - rebateOriginal);
      const spendCny = Math.max(0, toCny(spendOriginal, ad.currency));
      const rebateCny = Math.max(0, toCny(rebateOriginal, ad.currency));
      const netAdCostCny = Math.max(0, spendCny - rebateCny);
      const adOriginalAmounts = originalAmounts([
        ["adSpend", ad.currency, spendOriginal],
        ["rebate", ad.currency, rebateOriginal],
        ["netAdCost", ad.currency, netAdCostOriginal],
      ]);
      totalAdCny += spendCny;
      const periodInfo = periodFor(businessDate, groupBy);
      const period = periods.get(periodInfo.id);
      if (period) addMetric(period, { adSpendCny: spendCny, rebateCny, netAdCostCny, originalAmounts: adOriginalAmounts });

      const linkedShopId = ad.storeId ? shopByStoreId.get(ad.storeId) : undefined;
      if (linkedShopId && (!selectedShopId || linkedShopId === selectedShopId)) {
        linkedAdCny += spendCny;
        addMetric(ensureStore(linkedShopId), { adSpendCny: spendCny, rebateCny, netAdCostCny, originalAmounts: adOriginalAmounts });
      }

      if (includeOrders) {
        const eligibleOrders = orderDetails.filter((row) => (
          row.includedInProfit
          && row.businessDate === businessDate
          && (!linkedShopId || row.shopId === linkedShopId)
        ));
        eligibleOrders.forEach((row) => {
          // Advertising is an order-level cost: a five-unit order receives the
          // same single order share as a one-unit order.
          const share = 1 / Math.max(eligibleOrders.length, 1);
          row.netAdCostCny += netAdCostCny * share;
          for (const metric of ["adSpend", "rebate", "netAdCost"] as const) {
            for (const [currency, value] of Object.entries(adOriginalAmounts[metric])) {
              row.originalAmounts[metric][currency] = (row.originalAmounts[metric][currency] || 0) + value * share;
            }
          }
        });
      }
    }

    for (const store of storesMap.values()) {
      const storeSkus = [...skusMap.values()].filter((sku) => sku.shopId === store.shopId);
      const revenue = storeSkus.reduce((sum, sku) => sum + sku.gmvCny, 0);
      for (const sku of storeSkus) {
        const share = revenue > 0 ? sku.gmvCny / revenue : 0;
        addMetric(sku, {
          adSpendCny: store.adSpendCny * share,
          rebateCny: store.rebateCny * share,
          netAdCostCny: store.netAdCostCny * share,
          originalAmounts: scaleOriginalAmounts(store.originalAmounts, ["adSpend", "rebate", "netAdCost"], share),
        });
      }
    }

    const summaryMutable = emptyMetric("summary", "Summary", startDate, endDate);
    for (const period of periods.values()) addMetric(summaryMutable, period);
    const finalizedPeriods = [...periods.values()].map(finalizeMetric).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const finalizedStores: ProfitStoreRow[] = [...storesMap.values()].map((store) => ({
      ...finalizeMetric(store),
      shopId: store.shopId,
      storeId: store.storeId,
      currency: store.currency,
    })).sort((a, b) => b.gmvCny - a.gmvCny);
    const finalizedSkus: ProfitSkuRow[] = [...skusMap.values()].map((sku) => ({
      ...finalizeMetric(sku),
      sellerSku: sku.sellerSku,
      internalSku: sku.internalSku,
      productName: sku.productName,
      shopId: sku.shopId,
      storeName: sku.storeName,
      mappingStatus: sku.mappingStatus,
      mappingSource: sku.mappingSource,
      costComponents: sku.costComponents,
    })).sort((a, b) => b.gmvCny - a.gmvCny);

    const summary = finalizeMetric(summaryMutable);
    if (includeOrders) {
      const moneyMetrics: ProfitOrderDetailMoneyMetric[] = [
        "gmvCny",
        "platformFeeCny",
        "fulfillmentFeeCny",
        "productCostCny",
        "logisticsCostCny",
        "warehouseFulfillmentCostCny",
        "netAdCostCny",
        "taxCostCny",
      ];
      for (const metric of moneyMetrics) {
        balanceOrderDetailRounding(orderDetails, metric, summary[metric]);
      }
      for (const order of orderDetails) {
        if (!order.includedInProfit) continue;
        order.contributionProfitCny = order.gmvCny
          - order.platformFeeCny
          - order.fulfillmentFeeCny
          - order.productCostCny
          - order.logisticsCostCny
          - order.warehouseFulfillmentCostCny
          - order.netAdCostCny
          - order.taxCostCny;
      }
      balanceOrderDetailRounding(orderDetails, "contributionProfitCny", summary.contributionProfitCny);
    }
    const finalizedOrders = includeOrders
      ? orderDetails.map((order) => {
          const contributionProfitCny = order.contributionProfitCny;
          return {
            ...order,
            orderAmountOriginal: round(order.orderAmountOriginal),
            gmvCny: round(order.gmvCny),
            platformFeeCny: round(order.platformFeeCny),
            fulfillmentFeeCny: round(order.fulfillmentFeeCny),
            productCostCny: round(order.productCostCny),
            logisticsCostCny: round(order.logisticsCostCny),
            warehouseFulfillmentCostCny: round(order.warehouseFulfillmentCostCny),
            netAdCostCny: round(order.netAdCostCny),
            taxCostCny: round(order.taxCostCny),
            contributionProfitCny: round(contributionProfitCny),
            margin: order.gmvCny > 0 ? round(contributionProfitCny / order.gmvCny * 100, 2) : 0,
            originalAmounts: roundedOriginalAmounts(order.originalAmounts),
          } satisfies ProfitOrderDetailRow;
        }).sort((left, right) => right.createTime.localeCompare(left.createTime))
      : undefined;

    const totalSkuCount = finalizedSkus.length;
    const mappedSkuCount = finalizedSkus.filter((sku) => sku.mappingStatus !== "unmapped").length;
    const missingCostSkuCount = finalizedSkus.filter((sku) => sku.productCoverage < 100).length;
    const missingLogisticsSkuCount = finalizedSkus.filter((sku) => sku.logisticsCoverage < 100).length;
    const adStoreCoverage = totalAdCny > 0 ? round((linkedAdCny / totalAdCny) * 100, 2) : 100;
    const platformActualCoverage = summaryMutable.orderCount > 0
      ? round((summaryMutable.exactSettlementOrders / summaryMutable.orderCount) * 100, 2)
      : 100;
    const warehouseCoverage = summaryMutable.orderCount > 0
      ? round((summaryMutable.warehouseCoveredOrders / summaryMutable.orderCount) * 100, 2)
      : 100;
    const warehouseMappingCoverage = summaryMutable.orderCount > 0
      ? round((warehouseMappingMappedOrders / summaryMutable.orderCount) * 100, 2)
      : 100;
    const taxRuleCoverage = summaryMutable.orderCount > 0
      ? round((summaryMutable.taxCoveredOrders / summaryMutable.orderCount) * 100, 2)
      : 100;
    const score = round(
      (summary.productCoverage * 0.3)
      + (summary.logisticsCoverage * 0.15)
      + (platformActualCoverage * 0.2)
      + (warehouseMappingCoverage * 0.05)
      + (warehouseCoverage * 0.1)
      + (taxRuleCoverage * 0.1)
      + (adStoreCoverage * 0.1),
      2,
    );
    const warnings: string[] = [];
    if (summary.productCoverage < 95) warnings.push("Some SKU product costs are missing");
    if (summary.logisticsCoverage < 95) warnings.push("閮ㄥ垎 SKU 鏆傛棤鐗╂祦鍒嗘憡鎴愭湰");
    if (platformActualCoverage < 80) warnings.push("Platform actual fees are incomplete");
    if (warehouseMappingMissingIdOrders > 0) warnings.push(`${warehouseMappingMissingIdOrders} orders have no warehouse_id`);
    if (warehouseMappingUnmappedIds.size > 0) warnings.push(`Unmapped warehouse IDs: ${[...warehouseMappingUnmappedIds].join(", ")}`);
    if (warehouseCoverage < 100) warnings.push("閮ㄥ垎閿€鍞鍗曠己灏戝搴斾粨搴撲唬鍙戣垂瑙勫垯");
    if (taxRuleCoverage < 100) warnings.push("Some stores are missing tax rules");
    if (adStoreCoverage < 95) warnings.push("Some ad spend is not linked to a store");
    if (missingCurrencies.size > 0) warnings.push(`Missing exchange rates: ${[...missingCurrencies].join(", ")}`);

    const response: ProfitReportResponse = {
      filters: { startDate, endDate, groupBy, shopId: selectedShopId, currency: "CNY" },
      summary,
      periods: finalizedPeriods,
      stores: finalizedStores,
      skus: finalizedSkus,
      orders: finalizedOrders,
      variants: variants.map((variant) => ({
        id: variant.id,
        skuId: variant.skuId,
        productName: variant.product.name,
        unitCostCny: round(purchaseUnitCost.get(variant.id) || 0),
      })).sort((a, b) => a.skuId.localeCompare(b.skuId)),
      shops: allShops.map((shop) => ({
        id: shop.shopId,
        name: shopStore.get(shop.shopId)?.name || shop.shopName,
        region: shop.region,
        currency: shopStore.get(shop.shopId)?.currency || (shop.region === "US" ? "USD" : "BRL"),
      })),
      coverage: {
        score,
        productCost: summary.productCoverage,
        logisticsCost: summary.logisticsCoverage,
        orderSettlement: summary.settlementCoverage,
        adStore: adStoreCoverage,
        mappedSkuCount,
        totalSkuCount,
        missingCostSkuCount,
        missingLogisticsSkuCount,
        exactSettlementOrders: summaryMutable.exactSettlementOrders,
        validOrders: summaryMutable.orderCount,
        platformActual: platformActualCoverage,
        warehouseMapping: warehouseMappingCoverage,
        warehouseMappingMappedOrders,
        warehouseMappingMissingIdOrders,
        warehouseMappingUnmappedIds: [...warehouseMappingUnmappedIds],
        warehouseFulfillment: warehouseCoverage,
        taxRule: taxRuleCoverage,
      },
      influencerMarketing: {
        sampleOrders: sampleRows.length,
        sampleUnits,
        linkedSampleOrders,
        sampleProductCostCny: round(sampleProductCostCny),
        sampleLogisticsCostCny: round(sampleLogisticsCostCny),
        sampleWarehouseCostCny: round(sampleWarehouseCostCny),
        sampleShippingCostCny: round(sampleShippingCostCny),
        sampleOtherCostCny: round(sampleOtherCostCny),
        totalSampleCostCny: round(sampleProductCostCny + sampleLogisticsCostCny + sampleWarehouseCostCny + sampleShippingCostCny + sampleOtherCostCny),
        teamCommissionCny: round(influencerTeamCommissionCny),
        totalCostCny: round(influencerTeamCommissionCny + sampleProductCostCny + sampleLogisticsCostCny + sampleWarehouseCostCny + sampleShippingCostCny + sampleOtherCostCny),
        samples: sampleRows.sort((a, b) => b.date.localeCompare(a.date)),
      },
      rates: Object.fromEntries(Object.entries(rates).filter(([, value]) => value > 0)),
      warnings,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Profit Report]", error);
    return NextResponse.json({ error: error?.message || "Profit report calculation failed" }, { status: 500 });
  }
}
