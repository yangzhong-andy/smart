import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchExchangeRates, getRateToCNY } from "@/lib/exchange";
import {
  allocateActualFeeTotal,
  calculateEstimatedProfitFees,
  type ProfitFeeBreakdown,
} from "@/lib/profit-platform-fees";
import type {
  ProfitGroupBy,
  ProfitMetricRow,
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
  influencerCoveredOrders: number;
};

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_GROUPS = new Set<ProfitGroupBy>(["day", "week", "month"]);

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
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
    influencerCommissionCny: 0,
    sampleMarketingCostCny: 0,
    productCoveredUnits: 0,
    logisticsCoveredUnits: 0,
    exactSettlementOrders: 0,
    warehouseCoveredOrders: 0,
    taxCoveredOrders: 0,
    influencerCoveredOrders: 0,
  };
}

function finalizeMetric(metric: MutableMetric): ProfitMetricRow {
  const grossProfitCny = metric.gmvCny - metric.platformCostCny - metric.productCostCny
    - metric.logisticsCostCny - metric.warehouseFulfillmentCostCny;
  const contributionProfitCny = grossProfitCny - metric.netAdCostCny - metric.taxCostCny
    - metric.influencerCommissionCny - metric.sampleMarketingCostCny;
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
    influencerCommissionCny: round(metric.influencerCommissionCny),
    sampleMarketingCostCny: round(metric.sampleMarketingCostCny),
    grossProfitCny: round(grossProfitCny),
    contributionProfitCny: round(contributionProfitCny),
    margin: metric.gmvCny > 0 ? round((contributionProfitCny / metric.gmvCny) * 100, 1) : 0,
    roas: metric.netAdCostCny > 0 ? round(metric.gmvCny / metric.netAdCostCny, 2) : 0,
    productCoverage: metric.units > 0 ? round((metric.productCoveredUnits / metric.units) * 100, 1) : 100,
    logisticsCoverage: metric.units > 0 ? round((metric.logisticsCoveredUnits / metric.units) * 100, 1) : 100,
    settlementCoverage: metric.orderCount > 0 ? round((metric.exactSettlementOrders / metric.orderCount) * 100, 1) : 100,
  };
}

function addMetric(target: MutableMetric, values: Partial<MutableMetric>) {
  const numericKeys: Array<keyof MutableMetric> = [
    "orderCount", "cancelledOrders", "units", "gmvCny", "platformCostCny", "platformFeeCny",
    "fulfillmentFeeCny", "productCostCny",
    "logisticsCostCny", "warehouseFulfillmentCostCny", "adSpendCny", "rebateCny", "netAdCostCny",
    "taxCostCny", "influencerCommissionCny", "sampleMarketingCostCny", "productCoveredUnits",
    "logisticsCoveredUnits", "exactSettlementOrders", "warehouseCoveredOrders", "taxCoveredOrders",
    "influencerCoveredOrders",
  ];
  for (const key of numericKeys) {
    if (values[key] != null) (target[key] as number) += number(values[key]);
  }
}

function parseLineItems(rawData: unknown): any[] {
  if (!rawData || typeof rawData !== "object") return [];
  const value = (rawData as any).line_items;
  return Array.isArray(value) ? value : [];
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
    const startDate = searchParams.get("startDate") || addDays(today, -29);
    const endDate = searchParams.get("endDate") || today;
    const requestedGroup = searchParams.get("groupBy") as ProfitGroupBy | null;
    const groupBy: ProfitGroupBy = requestedGroup && VALID_GROUPS.has(requestedGroup) ? requestedGroup : "day";
    const selectedShopId = searchParams.get("shopId") || null;

    if (!VALID_DATE.test(startDate) || !VALID_DATE.test(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
    }
    const rangeDays = Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1;
    if (rangeDays > 366) return NextResponse.json({ error: "单次查询最多支持 366 天" }, { status: 400 });

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
        select: { orderId: true, shopId: true, status: true, totalAmount: true, currency: true, createTime: true, rawData: true },
        orderBy: { createTime: "asc" },
      }),
      prisma.store.findMany({ select: { id: true, name: true, currency: true, accountId: true } }),
      prisma.productVariant.findMany({
        select: { id: true, skuId: true, costPrice: true, lengthCm: true, widthCm: true, heightCm: true, product: { select: { name: true } } },
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
        include: { warehouse: { select: { name: true } } },
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

    const logisticsByBatch = new Map<string, { items: any[]; costCny: number }>();
    for (const cost of logisticsCosts) {
      const batch = cost.outboundBatch;
      if (!batch) continue;
      const current = logisticsByBatch.get(batch.id) || { items: batch.outboundBatchItems, costCny: 0 };
      current.costCny += toCny(cost.amount, cost.currency);
      logisticsByBatch.set(batch.id, current);
    }
    const logisticsTotals = new Map<string, { cost: number; qty: number }>();
    const logisticsSkuTotals = new Map<string, { cost: number; qty: number }>();
    for (const batch of logisticsByBatch.values()) {
      const usable = batch.items.filter((item) => item.qty > 0);
      if (usable.length === 0) continue;
      const completeDimensions = usable.every((item) => number(item.variant?.lengthCm) > 0 && number(item.variant?.widthCm) > 0 && number(item.variant?.heightCm) > 0);
      const bases = usable.map((item) => completeDimensions
        ? number(item.variant?.lengthCm) * number(item.variant?.widthCm) * number(item.variant?.heightCm) * item.qty
        : item.qty);
      const totalBasis = bases.reduce((sum, value) => sum + value, 0);
      usable.forEach((item, index) => {
        const allocated = totalBasis > 0 ? batch.costCny * (bases[index] / totalBasis) : 0;
        if (item.variantId) {
          const current = logisticsTotals.get(item.variantId) || { cost: 0, qty: 0 };
          current.cost += allocated;
          current.qty += item.qty;
          logisticsTotals.set(item.variantId, current);
        }
        const skuKey = String(item.sku || "").trim().toLowerCase();
        if (skuKey) {
          const current = logisticsSkuTotals.get(skuKey) || { cost: 0, qty: 0 };
          current.cost += allocated;
          current.qty += item.qty;
          logisticsSkuTotals.set(skuKey, current);
        }
      });
    }
    const logisticsUnitByVariant = new Map([...logisticsTotals].filter(([, value]) => value.qty > 0).map(([key, value]) => [key, value.cost / value.qty]));
    const logisticsUnitBySku = new Map([...logisticsSkuTotals].filter(([, value]) => value.qty > 0).map(([key, value]) => [key, value.cost / value.qty]));

    const financialByOrder = new Map(orderFinancials.map((row) => [row.orderId, row]));
    const sampleCostByOrder = new Map(sampleCostRows.map((row) => [row.orderId, row]));
    const influencerBySampleOrder = new Map(influencers.flatMap((influencer) => (
      influencer.sampleOrderNumber ? [[influencer.sampleOrderNumber, influencer] as const] : []
    )));
    const warehouseMappingFor = (shopId: string, tiktokWarehouseId: string) => (
      warehouseMappings.find((mapping) => mapping.tiktokWarehouseId === tiktokWarehouseId && mapping.tiktokShopId === shopId)
      || warehouseMappings.find((mapping) => mapping.tiktokWarehouseId === tiktokWarehouseId && !mapping.tiktokShopId)
      || null
    );
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
    ) => calculateEstimatedProfitFees({
      orderAmount,
      gmvCny,
      totalQty,
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
        const sellerSku = String(item?.seller_sku || "未知 SKU").trim();
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
        const productUnitCost = resolvedComponents.reduce((sum, component) => (
          sum + (purchaseUnitCost.get(component.variant.id) || 0) * component.quantity
        ), 0);
        const logisticsUnitCost = resolvedComponents.length > 0
          ? resolvedComponents.reduce((sum, component) => (
              sum + (
                logisticsUnitByVariant.get(component.variant.id)
                || logisticsUnitBySku.get(component.variant.skuId.trim().toLowerCase())
                || 0
              ) * component.quantity
            ), 0)
          : logisticsUnitBySku.get(skuKey) || 0;
        const productCostCovered = resolvedComponents.length > 0 && resolvedComponents.every((component) => (
          (purchaseUnitCost.get(component.variant.id) || 0) > 0
        ));
        const logisticsCostCovered = resolvedComponents.length > 0 && resolvedComponents.every((component) => (
          (logisticsUnitByVariant.get(component.variant.id)
            || logisticsUnitBySku.get(component.variant.skuId.trim().toLowerCase())
            || 0) > 0
        ));
        const costComponents = resolvedComponents.map((component) => ({
          variantId: component.variant.id,
          skuId: component.variant.skuId,
          quantity: component.quantity,
        }));
        const internalSku = costComponents.length > 0
          ? costComponents.map((component) => `${component.quantity > 1 ? `${component.quantity}x` : ""}${component.skuId}`).join(" + ")
          : null;
        return {
          sellerSku, skuKey, qty, variant, internalSku, mappingStatus, mappingSource, costComponents,
          lineValue, productUnitCost, logisticsUnitCost, productCostCovered, logisticsCostCovered,
          productName: String(item?.product_name || variant?.product.name || sellerSku),
        };
      });
      return parsedLines.length > 0 ? parsedLines : [{
        sellerSku: "未知 SKU", skuKey: "未知 sku", qty: Math.max(number((order.rawData as any)?.item_count), 1), variant: undefined,
        internalSku: null, mappingStatus: "unmapped" as const, mappingSource: "unmapped" as const, costComponents: [],
        lineValue: 0, productUnitCost: 0, logisticsUnitCost: 0, productCostCovered: false, logisticsCostCovered: false,
        productName: "未识别商品",
      }];
    };
    const fulfillmentForOrder = (order: (typeof orders)[number], lines: ReturnType<typeof resolveOrderLines>, date: string) => {
      const tiktokWarehouseId = String((order.rawData as any)?.warehouse_id || "").trim();
      const mapping = tiktokWarehouseId ? warehouseMappingFor(order.shopId, tiktokWarehouseId) : null;
      const rule = mapping ? activeWarehouseRule(mapping.warehouseId, order.shopId, date) : null;
      const sellerUnits = lines.reduce((sum, line) => sum + line.qty, 0);
      const internalUnits = lines.reduce((sum, line) => (
        sum + line.qty * Math.max(1, line.costComponents.reduce((componentSum, component) => componentSum + component.quantity, 0))
      ), 0);
      const billedUnits = rule?.billingUnit === "INTERNAL_COMPONENT" ? internalUnits : sellerUnits;
      const fee = rule && billedUnits > 0
        ? number(rule.baseOrderFee) + number(rule.firstUnitFee) + Math.max(0, billedUnits - 1) * number(rule.additionalUnitFee)
        : 0;
      return {
        costCny: rule ? toCny(fee, rule.currency) : 0,
        covered: Boolean(mapping && rule),
        warehouseId: mapping?.warehouseId || null,
        warehouseName: rule?.warehouse.name || (tiktokWarehouseId ? `仓库 ${tiktokWarehouseId}` : "未识别仓库"),
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

      if (order.status === "CANCELLED") {
        addMetric(period, { cancelledOrders: 1 });
        addMetric(storeMetric, { cancelledOrders: 1 });
        continue;
      }
      if (order.status === "UNPAID" || (order.rawData as any)?.is_sample_order) continue;

      const orderCurrency = order.currency || (order.rawData as any)?.payment?.currency || (shop?.region === "US" ? "USD" : "BRL");
      const gmvCny = toCny(order.totalAmount, orderCurrency);
      const fallbackLines = resolveOrderLines(order);
      const totalLineValue = fallbackLines.reduce((sum, line) => sum + line.lineValue, 0);
      const totalQty = fallbackLines.reduce((sum, line) => sum + line.qty, 0);
      const financial = financialByOrder.get(order.orderId);
      const settledCny = settlementByOrder.get(order.orderId);
      const hasExactSettlement = financial?.source === "SETTLED" || settledCny != null;
      const platformRule = activeShopRule(order.shopId, "PLATFORM_FULFILLMENT", businessDate);
      const estimatedFeeBreakdown = platformRule
        ? platformRuleCost(platformRule, number(order.totalAmount), gmvCny, totalQty)
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
      const fulfillment = fulfillmentForOrder(order, fallbackLines, businessDate);
      const taxRule = activeShopRule(order.shopId, "TAX", businessDate);
      const influencerRule = activeShopRule(order.shopId, "INFLUENCER_COMMISSION", businessDate);
      const taxCostCny = taxRule ? gmvCny * number(taxRule.ratePercent) / 100 : 0;
      const influencerCommissionCny = influencerRule ? gmvCny * number(influencerRule.ratePercent) / 100 : 0;
      let orderProductCost = 0;
      let orderLogisticsCost = 0;
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
        const lineInfluencerCommission = influencerCommissionCny * allocation;
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
          influencerCommissionCny: lineInfluencerCommission,
          productCoveredUnits: line.productCostCovered ? line.qty : 0,
          logisticsCoveredUnits: line.logisticsCostCovered ? line.qty : 0,
          exactSettlementOrders: hasExactSettlement ? 1 : 0,
          warehouseCoveredOrders: fulfillment.covered ? 1 : 0,
          taxCoveredOrders: taxRule ? 1 : 0,
          influencerCoveredOrders: influencerRule ? 1 : 0,
        });
      }

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
        influencerCommissionCny,
        productCoveredUnits,
        logisticsCoveredUnits,
        exactSettlementOrders: hasExactSettlement ? 1 : 0,
        warehouseCoveredOrders: fulfillment.covered ? 1 : 0,
        taxCoveredOrders: taxRule ? 1 : 0,
        influencerCoveredOrders: influencerRule ? 1 : 0,
      };
      addMetric(period, orderValues);
      addMetric(storeMetric, orderValues);
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
      addMetric(period, { sampleMarketingCostCny: totalCost });
      addMetric(storeMetric, { sampleMarketingCostCny: totalCost });
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
      const spendCny = Math.max(0, toCny(number(ad.amount) - number(ad.giftConsumption), ad.currency));
      const rebateCny = Math.max(0, toCny(ad.estimatedRebate, ad.currency));
      const netAdCostCny = Math.max(0, spendCny - rebateCny);
      totalAdCny += spendCny;
      const periodInfo = periodFor(businessDate, groupBy);
      const period = periods.get(periodInfo.id);
      if (period) addMetric(period, { adSpendCny: spendCny, rebateCny, netAdCostCny });

      const linkedShopId = ad.storeId ? shopByStoreId.get(ad.storeId) : undefined;
      if (linkedShopId && (!selectedShopId || linkedShopId === selectedShopId)) {
        linkedAdCny += spendCny;
        addMetric(ensureStore(linkedShopId), { adSpendCny: spendCny, rebateCny, netAdCostCny });
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
        });
      }
    }

    const summaryMutable = emptyMetric("summary", "汇总", startDate, endDate);
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

    const totalSkuCount = finalizedSkus.length;
    const mappedSkuCount = finalizedSkus.filter((sku) => sku.mappingStatus !== "unmapped").length;
    const missingCostSkuCount = finalizedSkus.filter((sku) => sku.productCoverage < 100).length;
    const missingLogisticsSkuCount = finalizedSkus.filter((sku) => sku.logisticsCoverage < 100).length;
    const adStoreCoverage = totalAdCny > 0 ? round((linkedAdCny / totalAdCny) * 100, 1) : 100;
    const platformActualCoverage = summaryMutable.orderCount > 0
      ? round((summaryMutable.exactSettlementOrders / summaryMutable.orderCount) * 100, 1)
      : 100;
    const warehouseCoverage = summaryMutable.orderCount > 0
      ? round((summaryMutable.warehouseCoveredOrders / summaryMutable.orderCount) * 100, 1)
      : 100;
    const taxRuleCoverage = summaryMutable.orderCount > 0
      ? round((summaryMutable.taxCoveredOrders / summaryMutable.orderCount) * 100, 1)
      : 100;
    const influencerRuleCoverage = summaryMutable.orderCount > 0
      ? round((summaryMutable.influencerCoveredOrders / summaryMutable.orderCount) * 100, 1)
      : 100;
    const score = round(
      (summary.productCoverage * 0.25)
      + (summary.logisticsCoverage * 0.15)
      + (platformActualCoverage * 0.2)
      + (warehouseCoverage * 0.15)
      + (taxRuleCoverage * 0.1)
      + (influencerRuleCoverage * 0.05)
      + (adStoreCoverage * 0.1),
      1,
    );
    const warnings: string[] = [];
    if (summary.productCoverage < 95) warnings.push("部分订单 SKU 未关联采购成本，利润暂为预估值");
    if (summary.logisticsCoverage < 95) warnings.push("部分 SKU 暂无物流分摊成本");
    if (platformActualCoverage < 80) warnings.push("部分订单尚无逐单结算，当前使用预估平台及履约费");
    if (warehouseCoverage < 100) warnings.push("部分销售订单缺少对应仓库代发费规则");
    if (taxRuleCoverage < 100) warnings.push("部分销售订单缺少店铺税率规则");
    if (influencerRuleCoverage < 100) warnings.push("部分销售订单缺少达人团队佣金规则");
    if (sampleRows.some((row) => !row.productCostCovered || !row.logisticsCostCovered)) warnings.push("部分免费样品订单缺少 SKU 成本映射");
    if (sampleRows.some((row) => !row.warehouseCostCovered)) warnings.push("部分免费样品订单缺少仓库代发费规则");
    if (sampleRows.length > linkedSampleOrders) warnings.push("部分免费样品订单尚未关联达人");
    if (adStoreCoverage < 95) warnings.push("部分广告消耗未关联到已授权店铺");
    if (missingCurrencies.size > 0) warnings.push(`缺少汇率：${[...missingCurrencies].join("、")}`);

    const response: ProfitReportResponse = {
      filters: { startDate, endDate, groupBy, shopId: selectedShopId, currency: "CNY" },
      summary,
      periods: finalizedPeriods,
      stores: finalizedStores,
      skus: finalizedSkus,
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
        warehouseFulfillment: warehouseCoverage,
        taxRule: taxRuleCoverage,
        influencerCommissionRule: influencerRuleCoverage,
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
        teamCommissionCny: summary.influencerCommissionCny,
        totalCostCny: round(summary.influencerCommissionCny + sampleProductCostCny + sampleLogisticsCostCny + sampleWarehouseCostCny + sampleShippingCostCny + sampleOtherCostCny),
        samples: sampleRows.sort((a, b) => b.date.localeCompare(a.date)),
      },
      rates: Object.fromEntries(Object.entries(rates).filter(([, value]) => value > 0)),
      warnings,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Profit Report]", error);
    return NextResponse.json({ error: error?.message || "利润报表计算失败" }, { status: 500 });
  }
}
