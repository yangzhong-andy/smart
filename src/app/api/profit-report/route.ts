import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchExchangeRates, getRateToCNY } from "@/lib/exchange";
import type {
  ProfitGroupBy,
  ProfitMetricRow,
  ProfitReportResponse,
  ProfitSkuRow,
  ProfitStoreRow,
} from "@/lib/profit-report-types";

export const dynamic = "force-dynamic";

type MutableMetric = Omit<ProfitMetricRow, "grossProfitCny" | "contributionProfitCny" | "margin" | "roas" | "productCoverage" | "logisticsCoverage" | "settlementCoverage"> & {
  productCoveredUnits: number;
  logisticsCoveredUnits: number;
  exactSettlementOrders: number;
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
    productCostCny: 0,
    logisticsCostCny: 0,
    adSpendCny: 0,
    rebateCny: 0,
    netAdCostCny: 0,
    productCoveredUnits: 0,
    logisticsCoveredUnits: 0,
    exactSettlementOrders: 0,
  };
}

function finalizeMetric(metric: MutableMetric): ProfitMetricRow {
  const grossProfitCny = metric.gmvCny - metric.platformCostCny - metric.productCostCny - metric.logisticsCostCny;
  const contributionProfitCny = grossProfitCny - metric.netAdCostCny;
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
    productCostCny: round(metric.productCostCny),
    logisticsCostCny: round(metric.logisticsCostCny),
    adSpendCny: round(metric.adSpendCny),
    rebateCny: round(metric.rebateCny),
    netAdCostCny: round(metric.netAdCostCny),
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
    "orderCount", "cancelledOrders", "units", "gmvCny", "platformCostCny", "productCostCny",
    "logisticsCostCny", "adSpendCny", "rebateCny", "netAdCostCny", "productCoveredUnits",
    "logisticsCoveredUnits", "exactSettlementOrders",
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

    const [ordersRaw, stores, variants, skuMappings, purchaseItems, logisticsCosts, adConsumptions, statements, accounts] = await Promise.all([
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
    const skusMap = new Map<string, MutableMetric & { sellerSku: string; internalSku: string | null; productName: string; shopId: string; storeName: string; mappingStatus: "mapped" | "direct" | "unmapped" }>();

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
      const settledCny = settlementByOrder.get(order.orderId);
      const hasExactSettlement = settledCny != null;
      const platformCostCny = hasExactSettlement
        ? clamp(gmvCny - settledCny, -gmvCny, gmvCny * 2)
        : gmvCny * (platformRateByShop.get(order.shopId) ?? globalPlatformRate);
      const lineItems = parseLineItems(order.rawData);
      const parsedLines = lineItems.map((item) => {
        const sellerSku = String(item?.seller_sku || "未知 SKU").trim();
        const skuKey = sellerSku.toLowerCase();
        const qty = Math.max(1, Math.round(number(item?.quantity) || 1));
        const mappedVariantId = mappingByShopSku.get(`${order.shopId}\u0000${skuKey}`);
        const directVariant = variantBySku.get(skuKey);
        const variant = mappedVariantId ? variantById.get(mappedVariantId) : directVariant;
        const mappingStatus: "mapped" | "direct" | "unmapped" = mappedVariantId ? "mapped" : directVariant ? "direct" : "unmapped";
        const lineValue = Math.max(0, number(item?.sale_price) * qty);
        const productUnitCost = variant ? purchaseUnitCost.get(variant.id) || 0 : 0;
        const logisticsUnitCost = variant
          ? logisticsUnitByVariant.get(variant.id) || logisticsUnitBySku.get(skuKey) || 0
          : logisticsUnitBySku.get(skuKey) || 0;
        return { sellerSku, skuKey, qty, variant, mappingStatus, lineValue, productUnitCost, logisticsUnitCost, productName: String(item?.product_name || variant?.product.name || sellerSku) };
      });
      const fallbackLines = parsedLines.length > 0 ? parsedLines : [{
        sellerSku: "未知 SKU", skuKey: "未知 sku", qty: Math.max(order.rawData && (order.rawData as any).item_count || 1, 1), variant: undefined,
        mappingStatus: "unmapped" as const, lineValue: 0, productUnitCost: 0, logisticsUnitCost: 0, productName: "未识别商品",
      }];
      const totalLineValue = fallbackLines.reduce((sum, line) => sum + line.lineValue, 0);
      const totalQty = fallbackLines.reduce((sum, line) => sum + line.qty, 0);
      let orderProductCost = 0;
      let orderLogisticsCost = 0;
      let productCoveredUnits = 0;
      let logisticsCoveredUnits = 0;

      for (const line of fallbackLines) {
        const allocation = totalLineValue > 0 ? line.lineValue / totalLineValue : line.qty / Math.max(totalQty, 1);
        const lineGmv = gmvCny * allocation;
        const linePlatformCost = platformCostCny * allocation;
        const lineProductCost = line.productUnitCost * line.qty;
        const lineLogisticsCost = line.logisticsUnitCost * line.qty;
        orderProductCost += lineProductCost;
        orderLogisticsCost += lineLogisticsCost;
        if (line.productUnitCost > 0) productCoveredUnits += line.qty;
        if (line.logisticsUnitCost > 0) logisticsCoveredUnits += line.qty;

        const skuMapKey = `${order.shopId}\u0000${line.skuKey}`;
        if (!skusMap.has(skuMapKey)) {
          skusMap.set(skuMapKey, {
            ...emptyMetric(skuMapKey, line.sellerSku, startDate, endDate),
            sellerSku: line.sellerSku,
            internalSku: line.variant?.skuId || null,
            productName: line.productName,
            shopId: order.shopId,
            storeName: storeMetric.label,
            mappingStatus: line.mappingStatus,
          });
        }
        addMetric(skusMap.get(skuMapKey)!, {
          orderCount: 1,
          units: line.qty,
          gmvCny: lineGmv,
          platformCostCny: linePlatformCost,
          productCostCny: lineProductCost,
          logisticsCostCny: lineLogisticsCost,
          productCoveredUnits: line.productUnitCost > 0 ? line.qty : 0,
          logisticsCoveredUnits: line.logisticsUnitCost > 0 ? line.qty : 0,
          exactSettlementOrders: hasExactSettlement ? 1 : 0,
        });
      }

      const orderValues: Partial<MutableMetric> = {
        orderCount: 1,
        units: totalQty,
        gmvCny,
        platformCostCny,
        productCostCny: orderProductCost,
        logisticsCostCny: orderLogisticsCost,
        productCoveredUnits,
        logisticsCoveredUnits,
        exactSettlementOrders: hasExactSettlement ? 1 : 0,
      };
      addMetric(period, orderValues);
      addMetric(storeMetric, orderValues);
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
    })).sort((a, b) => b.gmvCny - a.gmvCny);
    const summary = finalizeMetric(summaryMutable);

    const totalSkuCount = finalizedSkus.length;
    const mappedSkuCount = finalizedSkus.filter((sku) => sku.mappingStatus !== "unmapped").length;
    const missingCostSkuCount = finalizedSkus.filter((sku) => sku.productCoverage < 100).length;
    const missingLogisticsSkuCount = finalizedSkus.filter((sku) => sku.logisticsCoverage < 100).length;
    const adStoreCoverage = totalAdCny > 0 ? round((linkedAdCny / totalAdCny) * 100, 1) : 100;
    const score = round((summary.productCoverage * 0.4) + (summary.logisticsCoverage * 0.25) + (summary.settlementCoverage * 0.2) + (adStoreCoverage * 0.15), 1);
    const warnings: string[] = [];
    if (summary.productCoverage < 95) warnings.push("部分订单 SKU 未关联采购成本，利润暂为预估值");
    if (summary.logisticsCoverage < 95) warnings.push("部分 SKU 暂无物流分摊成本");
    if (summary.settlementCoverage < 80) warnings.push("未逐单结算的订单使用店铺历史平台费率估算");
    if (adStoreCoverage < 95) warnings.push("部分广告消耗未关联到已授权店铺");
    if (missingCurrencies.size > 0) warnings.push(`缺少汇率：${[...missingCurrencies].join("、")}`);

    const response: ProfitReportResponse = {
      filters: { startDate, endDate, groupBy, shopId: selectedShopId, currency: "CNY" },
      summary,
      periods: finalizedPeriods,
      stores: finalizedStores,
      skus: finalizedSkus,
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
