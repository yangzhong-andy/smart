import { prisma } from "@/lib/prisma";
import { fetchExchangeRates, getRateToCNY } from "@/lib/exchange";
import { calculateFirstMileUnitCosts } from "@/lib/first-mile-logistics";
import { orderBusinessDate, orderTimeZone, relativeBusinessDate } from "@/lib/order-business-time";
import { warehouseBillingUnits } from "@/lib/order-actual-units";
import {
  buildProfitComponentAmounts,
  contributionProfitFromComponents,
  defaultProfitComponents,
  normalizeCountryCode,
  type ProfitComponentAmount,
} from "@/lib/profit-schemes";
import type {
  ProfitGroupBy,
  ProfitMetricRow,
  ProfitOrderDetailLine,
  ProfitOrderDetailRow,
  ProfitOriginalAmounts,
  ProfitOriginalMetric,
  ProfitReportResponse,
  ProfitSkuRow,
  ProfitStorePeriodRow,
  ProfitStoreRow,
} from "@/lib/profit-report-types";
import { calculateWarehouseFulfillmentFee } from "@/lib/warehouse-fulfillment-fees";
import {
  emptyMercadoLivrePaymentFeeBreakdown,
  mercadoLivrePaymentFeeBreakdown,
  type MercadoLivrePaymentFeeBreakdown,
} from "@/lib/mercado-livre-payment-fees";
import { getMercadoPagoPayment, type MercadoPagoPayment } from "@/lib/mercado-livre-api";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";

type MercadoLivreReportInput = {
  startDate?: string | null;
  endDate?: string | null;
  groupBy?: ProfitGroupBy | null;
  shopId?: string | null;
  countryCode?: string | null;
  includeOrders?: boolean;
};

type MutableMetric = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  orderCount: number;
  cancelledOrders: number;
  units: number;
  internalUnits: number;
  gmvCny: number;
  platformCostCny: number;
  platformFeeCny: number;
  fulfillmentFeeCny: number;
  mercadoLivreFinancingFeeCny: number;
  mercadoLivreProcessingFeeCny: number;
  mercadoLivreSaleCommissionCny: number;
  mercadoLivreSellerShippingFeeCny: number;
  smartPromotionFeeCny: number;
  affiliateCommissionCny: number;
  productCostCny: number;
  logisticsCostCny: number;
  lastMileLogisticsCostCny: number;
  warehouseFulfillmentCostCny: number;
  adSpendCny: number;
  rebateCny: number;
  netAdCostCny: number;
  taxCostCny: number;
  originalAmounts: ProfitOriginalAmounts;
  productCoveredUnits: number;
  logisticsCoveredUnits: number;
  exactSettlementOrders: number;
  warehouseCoveredOrders: number;
  taxCoveredOrders: number;
  componentOriginalAmounts: Record<string, Record<string, number>>;
  sourceStatus: Record<string, ProfitComponentAmount["sourceStatus"]>;
};

const PAYMENT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const paymentDetailCache = new Map<string, { payment: MercadoPagoPayment; expiresAt: number }>();

const ORIGINAL_METRICS: ProfitOriginalMetric[] = [
  "gmv", "platformFee", "fulfillmentFee", "smartPromotionFee", "affiliateCommission", "logisticsCost",
  "lastMileLogisticsCost", "warehouseFulfillment", "adSpend", "rebate", "netAdCost", "taxCost",
];

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  const epsilon = value >= 0 ? 1e-9 : -1e-9;
  return Math.trunc((value + epsilon) * factor) / factor;
}

function emptyOriginalAmounts(): ProfitOriginalAmounts {
  return Object.fromEntries(ORIGINAL_METRICS.map((metric) => [metric, {}])) as ProfitOriginalAmounts;
}

function originalAmounts(entries: Array<[ProfitOriginalMetric, string | null | undefined, number]>): ProfitOriginalAmounts {
  const result = emptyOriginalAmounts();
  for (const [metric, currency, value] of entries) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.000001) continue;
    const code = String(currency || "CNY").trim().toUpperCase();
    result[metric][code] = (result[metric][code] || 0) + value;
  }
  return result;
}

function originalAmount(currency: string | null | undefined, value: number): Record<string, number> {
  if (!Number.isFinite(value) || Math.abs(value) < 0.000001) return {};
  return { [String(currency || "CNY").trim().toUpperCase()]: value };
}

function roundedOriginalAmounts(values: ProfitOriginalAmounts): ProfitOriginalAmounts {
  const result = emptyOriginalAmounts();
  for (const metric of ORIGINAL_METRICS) {
    for (const [currency, value] of Object.entries(values[metric] || {})) result[metric][currency] = round(value);
  }
  return result;
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

function periodFor(date: string, groupBy: ProfitGroupBy) {
  if (groupBy === "month") {
    const startDate = `${date.slice(0, 7)}-01`;
    return { id: date.slice(0, 7), label: `${date.slice(0, 4)}年${date.slice(5, 7)}月`, startDate, endDate: monthEnd(startDate) };
  }
  if (groupBy === "week") {
    const parsed = new Date(`${date}T00:00:00Z`);
    const day = parsed.getUTCDay() || 7;
    const startDate = addDays(date, 1 - day);
    const endDate = addDays(startDate, 6);
    return { id: startDate, label: `${startDate.slice(5)} - ${endDate.slice(5)}`, startDate, endDate };
  }
  return { id: date, label: `${date.slice(5, 7)}月${date.slice(8, 10)}日`, startDate: date, endDate: date };
}

function emptyMetric(id: string, label: string, startDate: string, endDate: string): MutableMetric {
  return {
    id, label, startDate, endDate, orderCount: 0, cancelledOrders: 0, units: 0, internalUnits: 0,
    gmvCny: 0, platformCostCny: 0, platformFeeCny: 0, fulfillmentFeeCny: 0,
    mercadoLivreFinancingFeeCny: 0, mercadoLivreProcessingFeeCny: 0,
    mercadoLivreSaleCommissionCny: 0, mercadoLivreSellerShippingFeeCny: 0, smartPromotionFeeCny: 0,
    affiliateCommissionCny: 0, productCostCny: 0, logisticsCostCny: 0, lastMileLogisticsCostCny: 0,
    warehouseFulfillmentCostCny: 0, adSpendCny: 0, rebateCny: 0, netAdCostCny: 0, taxCostCny: 0,
    originalAmounts: emptyOriginalAmounts(), componentOriginalAmounts: {}, productCoveredUnits: 0, logisticsCoveredUnits: 0,
    exactSettlementOrders: 0, warehouseCoveredOrders: 0, taxCoveredOrders: 0, sourceStatus: {},
  };
}

function addMetric(target: MutableMetric, values: Partial<MutableMetric>) {
  const keys: Array<keyof MutableMetric> = [
    "orderCount", "cancelledOrders", "units", "internalUnits", "gmvCny", "platformCostCny", "platformFeeCny",
    "fulfillmentFeeCny", "mercadoLivreFinancingFeeCny", "mercadoLivreProcessingFeeCny",
    "mercadoLivreSaleCommissionCny", "mercadoLivreSellerShippingFeeCny", "smartPromotionFeeCny",
    "affiliateCommissionCny", "productCostCny", "logisticsCostCny",
    "lastMileLogisticsCostCny", "warehouseFulfillmentCostCny", "adSpendCny", "rebateCny", "netAdCostCny", "taxCostCny",
    "productCoveredUnits", "logisticsCoveredUnits", "exactSettlementOrders", "warehouseCoveredOrders", "taxCoveredOrders",
  ];
  for (const key of keys) if (values[key] != null) (target[key] as number) += numberValue(values[key]);
  if (values.originalAmounts) {
    for (const metric of ORIGINAL_METRICS) {
      for (const [currency, value] of Object.entries(values.originalAmounts[metric] || {})) {
        target.originalAmounts[metric][currency] = (target.originalAmounts[metric][currency] || 0) + numberValue(value);
      }
    }
  }
  if (values.componentOriginalAmounts) {
    for (const [code, amounts] of Object.entries(values.componentOriginalAmounts)) {
      const targetAmounts = target.componentOriginalAmounts[code] || {};
      for (const [currency, value] of Object.entries(amounts || {})) {
        targetAmounts[currency] = (targetAmounts[currency] || 0) + numberValue(value);
      }
      target.componentOriginalAmounts[code] = targetAmounts;
    }
  }
  for (const [code, status] of Object.entries(values.sourceStatus || {})) {
    const current = target.sourceStatus[code];
    target.sourceStatus[code] = !current || current === status ? status : "MIXED";
  }
}

function finalizeMetric(metric: MutableMetric, definitions: ReturnType<typeof defaultProfitComponents>): ProfitMetricRow {
  const grossProfitCny = metric.gmvCny - metric.platformCostCny - metric.productCostCny - metric.logisticsCostCny
    - metric.lastMileLogisticsCostCny - metric.warehouseFulfillmentCostCny;
  const base = {
    id: metric.id, label: metric.label, startDate: metric.startDate, endDate: metric.endDate,
    orderCount: metric.orderCount, cancelledOrders: metric.cancelledOrders, units: metric.units, internalUnits: metric.internalUnits,
    gmvCny: round(metric.gmvCny), platformCostCny: round(metric.platformCostCny), platformFeeCny: round(metric.platformFeeCny),
    fulfillmentFeeCny: round(metric.fulfillmentFeeCny),
    mercadoLivreFinancingFeeCny: round(metric.mercadoLivreFinancingFeeCny),
    mercadoLivreProcessingFeeCny: round(metric.mercadoLivreProcessingFeeCny),
    mercadoLivreSaleCommissionCny: round(metric.mercadoLivreSaleCommissionCny),
    mercadoLivreSellerShippingFeeCny: round(metric.mercadoLivreSellerShippingFeeCny),
    smartPromotionFeeCny: round(metric.smartPromotionFeeCny),
    affiliateCommissionCny: round(metric.affiliateCommissionCny), productCostCny: round(metric.productCostCny),
    logisticsCostCny: round(metric.logisticsCostCny), lastMileLogisticsCostCny: round(metric.lastMileLogisticsCostCny),
    warehouseFulfillmentCostCny: round(metric.warehouseFulfillmentCostCny), adSpendCny: round(metric.adSpendCny), rebateCny: round(metric.rebateCny),
    netAdCostCny: round(metric.netAdCostCny), taxCostCny: round(metric.taxCostCny), originalAmounts: roundedOriginalAmounts(metric.originalAmounts),
    grossProfitCny: round(grossProfitCny), contributionProfitCny: 0, margin: 0,
    roas: metric.netAdCostCny > 0 ? round(metric.gmvCny / metric.netAdCostCny, 2) : 0,
    productCoverage: metric.units > 0 ? round(metric.productCoveredUnits / metric.units * 100) : 100,
    logisticsCoverage: metric.units > 0 ? round(metric.logisticsCoveredUnits / metric.units * 100) : 0,
    settlementCoverage: metric.orderCount > 0 ? round(metric.exactSettlementOrders / metric.orderCount * 100) : 0,
  };
  const components = buildProfitComponentAmounts({ ...base, componentOriginalAmounts: metric.componentOriginalAmounts, sourceStatus: metric.sourceStatus }, definitions);
  const contributionProfitCny = contributionProfitFromComponents(components);
  return {
    ...base,
    contributionProfitCny: round(contributionProfitCny),
    margin: base.gmvCny > 0 ? round(contributionProfitCny / base.gmvCny * 100) : 0,
    components,
  };
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function skuKey(value: unknown): string {
  return text(value).toLowerCase();
}

function normalizeDimensions(values: unknown[]): number[] {
  return values.map(numberValue).filter((value) => value > 0).sort((left, right) => right - left);
}

function addCurrencyAmounts(target: Record<string, number>, source: Record<string, number> | null | undefined) {
  for (const [currency, amount] of Object.entries(source || {})) {
    if (!Number.isFinite(amount) || Math.abs(amount) < 0.000001) continue;
    target[currency] = (target[currency] || 0) + amount;
  }
}

function rawItemValue(raw: any, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw?.[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function imageForItem(raw: any): string | null {
  return text(raw?.thumbnail || raw?.picture_url || raw?.item?.thumbnail || raw?.item?.picture_url) || null;
}

function paymentIdsFromRawData(rawData: unknown): string[] {
  const raw = rawData && typeof rawData === "object" && !Array.isArray(rawData)
    ? rawData as Record<string, unknown>
    : {};
  const payments = Array.isArray(raw.payments) ? raw.payments : [];
  return Array.from(new Set(payments
    .map((payment) => payment && typeof payment === "object" ? text((payment as Record<string, unknown>).id) : "")
    .filter(Boolean)));
}

function paymentErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error || "未知错误")).replace(/\s+/g, " ").trim().slice(0, 300);
}

function isUnauthorizedPaymentError(error: unknown): boolean {
  return typeof error === "object" && error !== null && Number((error as { status?: unknown }).status) === 401;
}

async function loadMercadoLivrePaymentFees(
  accounts: Array<{ id: string }>,
  orders: Array<{ accountId: string; externalOrderId: string; rawData: unknown }>,
) {
  const feesByOrder = new Map<string, MercadoLivrePaymentFeeBreakdown>();
  const warnings: string[] = [];
  const ordersByAccount = new Map<string, Array<{ order: typeof orders[number]; paymentIds: string[] }>>();
  for (const order of orders) {
    const paymentIds = paymentIdsFromRawData(order.rawData);
    if (!paymentIds.length) continue;
    const rows = ordersByAccount.get(order.accountId) || [];
    rows.push({ order, paymentIds });
    ordersByAccount.set(order.accountId, rows);
  }

  for (const account of accounts) {
    const rows = ordersByAccount.get(account.id);
    if (!rows?.length) continue;
    const paymentIds = Array.from(new Set(rows.flatMap((row) => row.paymentIds)));
    const loaded = new Map<string, MercadoPagoPayment>();
    const missingPaymentIds: string[] = [];
    for (const id of paymentIds) {
      const cached = paymentDetailCache.get(id);
      if (cached && cached.expiresAt > Date.now()) loaded.set(id, cached.payment);
      else {
        if (cached) paymentDetailCache.delete(id);
        missingPaymentIds.push(id);
      }
    }
    let complete = true;
    try {
      if (missingPaymentIds.length > 0) {
        const fetched = await withFreshMercadoLivreToken(account.id, async (token) => {
          const payments = new Map<string, MercadoPagoPayment>();
          let cursor = 0;
          const worker = async () => {
            while (cursor < missingPaymentIds.length) {
              const id = missingPaymentIds[cursor++];
              try {
                payments.set(id, await getMercadoPagoPayment(token, id));
              } catch (error) {
                if (isUnauthorizedPaymentError(error)) throw error;
                warnings.push(`支付 ${id} 读取失败：${paymentErrorMessage(error)}`);
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(8, missingPaymentIds.length) }, () => worker()));
          return payments;
        });
        for (const [id, payment] of fetched) {
          loaded.set(id, payment);
          paymentDetailCache.set(id, { payment, expiresAt: Date.now() + PAYMENT_DETAIL_CACHE_TTL_MS });
        }
      }
    } catch (error) {
      complete = false;
      warnings.push(`店铺 ${account.id} 支付费用读取失败：${paymentErrorMessage(error)}`);
    }
    for (const row of rows) {
      const payments = row.paymentIds.flatMap((id) => {
        const payment = loaded.get(id);
        return payment ? [payment] : [];
      });
      const breakdown = mercadoLivrePaymentFeeBreakdown(payments);
      // Keep known charges for the deduction, but mark coverage incomplete
      // when one of an order's multiple payment records could not be read.
      if (!complete || payments.length !== row.paymentIds.length) breakdown.hasChargesDetails = false;
      feesByOrder.set(`${row.order.accountId}\u0000${row.order.externalOrderId}`, breakdown);
    }
  }
  return { feesByOrder, warnings };
}

export function isMercadoLivreProfitOrder(status: string | null | undefined): boolean {
  return ![
    "CANCELLED",
    "CANCELED",
    "UNPAID",
    "INVALID",
    "PAYMENT_REQUIRED",
    "PAYMENT_IN_PROCESS",
  ].includes(text(status).toUpperCase());
}

export function mercadoLivreSaleFeeTotal(lines: Array<{ saleFee: number | null }>): number {
  return lines.reduce((sum, line) => sum + (line.saleFee == null ? 0 : line.saleFee), 0);
}

function activeTaxRule(rules: Array<{ shopId: string; ratePercent: unknown; effectiveFrom: Date; effectiveTo: Date | null }>, shopId: string, date: string) {
  return rules.find((rule) => rule.shopId === shopId && rule.effectiveFrom.toISOString().slice(0, 10) <= date
    && (!rule.effectiveTo || rule.effectiveTo.toISOString().slice(0, 10) >= date));
}

export async function buildMercadoLivreProfitReport(input: MercadoLivreReportInput = {}): Promise<ProfitReportResponse> {
  const requestedCountryCode = input.countryCode && input.countryCode !== "all" ? normalizeCountryCode(input.countryCode) : null;
  const today = relativeBusinessDate(requestedCountryCode || "BR", 0);
  const startDate = input.startDate || addDays(today, -89);
  const endDate = input.endDate || today;
  const groupBy: ProfitGroupBy = input.groupBy === "week" || input.groupBy === "month" ? input.groupBy : "day";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error("Invalid date range");
  }

  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(requestedCountryCode ? { country: requestedCountryCode } : {}), ...(input.shopId ? { userId: input.shopId } : {}) },
    select: { id: true, userId: true, nickname: true, country: true, currency: true, storeId: true },
    orderBy: { nickname: "asc" },
  });
  const accountIds = accounts.map((account) => account.id);
  const shops = accounts.map((account) => ({ id: account.userId, name: account.nickname || account.userId, region: normalizeCountryCode(account.country), currency: account.currency || "BRL" }));
  const shopById = new Map(accounts.map((account) => [account.userId, account]));
  const resolvedCountryCode = requestedCountryCode || ([...new Set(shops.map((shop) => shop.region))].length === 1 ? shops[0]?.region || "BR" : "MIXED");
  const queryStart = new Date(`${addDays(startDate, -2)}T00:00:00Z`);
  const queryEnd = new Date(`${addDays(endDate, 3)}T00:00:00Z`);

  const [ordersRaw, variants, mappings, purchaseItems, adRows, taxRules, logisticsCosts, warehouseSwitchRules, warehouseRules] = await Promise.all([
    accountIds.length ? prisma.mercadoLivreOrder.findMany({
      where: { accountId: { in: accountIds }, dateCreated: { gte: queryStart, lt: queryEnd } },
      select: { externalOrderId: true, accountId: true, status: true, currency: true, totalAmount: true, dateCreated: true, rawData: true, items: true },
      orderBy: { dateCreated: "asc" },
    }) : Promise.resolve([]),
    prisma.productVariant.findMany({
      select: {
        id: true,
        skuId: true,
        costPrice: true,
        weightKg: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        product: { select: { name: true } },
      },
    }),
    accountIds.length ? prisma.profitSkuMapping.findMany({ where: { platform: "MERCADO_LIVRE", shopId: { in: accounts.map((account) => account.userId) }, enabled: true }, select: { shopId: true, sellerSku: true, components: { select: { variantId: true, quantity: true } } } }) : Promise.resolve([]),
    prisma.purchaseContractItem.findMany({ where: { variantId: { not: null } }, select: { variantId: true, unitPrice: true, qty: true, totalAmount: true } }),
    accountIds.length ? prisma.mercadoLivreAdvertisingDaily.findMany({ where: { advertisingAccount: { accountId: { in: accountIds } }, date: { gte: new Date(`${startDate}T00:00:00Z`), lte: new Date(`${endDate}T00:00:00Z`) } }, select: { date: true, cost: true, advertisingAccount: { select: { accountId: true } } } }) : Promise.resolve([]),
    accountIds.length ? prisma.profitShopCostRule.findMany({ where: { platform: "MERCADO_LIVRE", costType: "TAX", enabled: true, shopId: { in: accounts.map((account) => account.userId) } }, select: { shopId: true, ratePercent: true, effectiveFrom: true, effectiveTo: true }, orderBy: { effectiveFrom: "desc" } }) : Promise.resolve([]),
    prisma.logisticsCost.findMany({
      select: {
        amount: true,
        currency: true,
        costType: true,
        containerId: true,
        outboundBatch: {
          select: {
            containerId: true,
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
    accountIds.length ? prisma.profitWarehouseSwitchRule.findMany({
      where: { platform: "MERCADO_LIVRE", shopId: { in: accounts.map((account) => account.userId) } },
      select: { shopId: true, region: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true },
      orderBy: { effectiveFrom: "desc" },
    }) : Promise.resolve([]),
    prisma.warehouseFulfillmentRule.findMany({
      where: { enabled: true },
      include: {
        warehouse: { select: { name: true } },
        feeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
        packagingFeeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
      },
      orderBy: { effectiveFrom: "desc" },
    }),
  ]);

  const externalRates = await fetchExchangeRates().catch(() => null);
  const rates: Record<string, number> = { CNY: 1, RMB: 1 };
  // Logistics bills may be recorded in USD while Mercado Livre sales are in
  // BRL. Keep every supported finance currency available for the same
  // first-mile allocation path used by the Shopee/TikTok reports.
  for (const currency of ["USD", "JPY", "BRL"] as const) {
    rates[currency] = round(externalRates ? getRateToCNY(currency, externalRates.rates) : 0, 4);
  }
  const missingCurrencies = new Set<string>();
  const toCny = (value: unknown, currency: string | null | undefined) => {
    const code = String(currency || "BRL").toUpperCase();
    const rate = rates[code];
    if (!rate) { missingCurrencies.add(code); return 0; }
    return numberValue(value) * rate;
  };
  const firstMileCosts = calculateFirstMileUnitCosts(logisticsCosts, toCny);

  const purchaseTotals = new Map<string, { amount: number; qty: number }>();
  for (const item of purchaseItems) {
    if (!item.variantId || item.qty <= 0) continue;
    const current = purchaseTotals.get(item.variantId) || { amount: 0, qty: 0 };
    current.amount += numberValue(item.totalAmount) || numberValue(item.unitPrice) * item.qty;
    current.qty += item.qty;
    purchaseTotals.set(item.variantId, current);
  }
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const variantBySku = new Map(variants.map((variant) => [variant.skuId.trim().toLowerCase(), variant]));
  const unitCostByVariant = new Map<string, number>();
  for (const variant of variants) {
    const purchased = purchaseTotals.get(variant.id);
    const cost = purchased && purchased.qty > 0 ? purchased.amount / purchased.qty : numberValue(variant.costPrice);
    if (cost > 0) unitCostByVariant.set(variant.id, cost);
  }
  const mappingBySku = new Map(mappings.map((mapping) => [`${mapping.shopId}\u0000${mapping.sellerSku.trim().toLowerCase()}`, mapping.components]));
  const adByAccountDate = new Map<string, { cost: number; hasRow: boolean }>();
  for (const row of adRows) {
    const date = row.date.toISOString().slice(0, 10);
    const key = `${row.advertisingAccount.accountId}\u0000${date}`;
    const current = adByAccountDate.get(key) || { cost: 0, hasRow: false };
    current.cost += numberValue(row.cost);
    current.hasRow = true;
    adByAccountDate.set(key, current);
  }

  const warehouseRulesById = new Map<string, typeof warehouseRules>();
  for (const rule of warehouseRules) {
    const rows = warehouseRulesById.get(rule.warehouseId) || [];
    rows.push(rule);
    warehouseRulesById.set(rule.warehouseId, rows);
  }
  const activeWarehouseRule = (warehouseId: string, shopId: string, date: Date) => {
    const timestamp = date.getTime();
    const candidates = (warehouseRulesById.get(warehouseId) || []).filter((rule) => (
      (!rule.shopId || rule.shopId === shopId)
      && rule.effectiveFrom.getTime() <= timestamp
      && (!rule.effectiveTo || rule.effectiveTo.getTime() >= timestamp)
    ));
    return candidates.find((rule) => rule.shopId === shopId) || candidates[0] || null;
  };
  const resolveWarehouse = (shopId: string, region: string, date: Date, orderId: string) => {
    const normalizedRegion = normalizeCountryCode(region);
    const timestamp = date.getTime();
    const switchRule = warehouseSwitchRules.find((rule) => {
      if (rule.shopId !== shopId || normalizeCountryCode(rule.region) !== normalizedRegion) return false;
      const difference = timestamp - rule.effectiveFrom.getTime();
      if (difference !== 0) return difference > 0;
      return !rule.effectiveOrderId || orderId.localeCompare(rule.effectiveOrderId) >= 0;
    });
    if (switchRule) {
      return {
        warehouseId: switchRule.warehouseId,
        rule: activeWarehouseRule(switchRule.warehouseId, shopId, date),
        mappingStatus: "MAPPED" as const,
      };
    }
    const directRule = warehouseRules.find((rule) => (
      rule.shopId === shopId
      && rule.effectiveFrom.getTime() <= timestamp
      && (!rule.effectiveTo || rule.effectiveTo.getTime() >= timestamp)
    ));
    return directRule
      ? { warehouseId: directRule.warehouseId, rule: directRule, mappingStatus: "MAPPED" as const }
      : { warehouseId: null, rule: null, mappingStatus: "MISSING" as const };
  };

  const orders = ordersRaw.filter((order) => {
    if (!order.dateCreated) return false;
    const account = accounts.find((item) => item.id === order.accountId);
    if (!account) return false;
    const date = orderBusinessDate(order.dateCreated, account.country);
    return date >= startDate && date <= endDate;
  });
  const paymentFeeResult = await loadMercadoLivrePaymentFees(accounts, orders);
  const paymentFeesByOrder = paymentFeeResult.feesByOrder;
  const warnings: string[] = [...paymentFeeResult.warnings];
  const validOrdersByAdKey = new Map<string, number>();
  for (const order of orders) {
    const account = accounts.find((item) => item.id === order.accountId);
    if (!account || !isMercadoLivreProfitOrder(order.status)) continue;
    const key = `${account.id}\u0000${orderBusinessDate(order.dateCreated!, account.country)}`;
    validOrdersByAdKey.set(key, (validOrdersByAdKey.get(key) || 0) + 1);
  }

  const definitions = defaultProfitComponents(resolvedCountryCode, "MERCADO_LIVRE").map((item) => {
    if (item.code === "PLATFORM_FEE") return { ...item, label: "Mercado Livre平台佣金" };
    if (item.code === "FULFILLMENT_FEE") return { ...item, label: "Mercado Livre履约/支付费用" };
    if (item.code === "LOGISTICS_COST") return { ...item, label: "头程物流费用" };
    if (item.code === "WAREHOUSE_FULFILLMENT") return { ...item, label: "海外仓代发费用" };
    return item;
  });
  const periods = new Map<string, MutableMetric>();
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const period = periodFor(date, groupBy);
    if (!periods.has(period.id)) periods.set(period.id, emptyMetric(period.id, period.label, period.startDate, period.endDate));
  }
  const storesMap = new Map<string, MutableMetric & { shopId: string; storeId: string | null; countryCode: string; currency: string }>();
  const storePeriodsMap = new Map<string, MutableMetric & { date: string; shopId: string; storeId: string | null; countryCode: string; currency: string }>();
  const skusMap = new Map<string, MutableMetric & { sellerSku: string; internalSku: string | null; productName: string; shopId: string; storeName: string; mappingStatus: "mapped" | "direct" | "unmapped"; mappingSource: "profit" | "direct" | "unmapped"; costComponents: Array<{ variantId: string; skuId: string; quantity: number }> }>();
  const orderDetails: ProfitOrderDetailRow[] = [];
  let platformCoveredOrders = 0;
  let adCoveredOrders = 0;
  let warehouseMappedOrders = 0;
  let warehouseCoveredOrders = 0;
  let taxCoveredOrders = 0;

  const ensureStore = (shopId: string) => {
    const account = shopById.get(shopId)!;
    if (!storesMap.has(shopId)) storesMap.set(shopId, { ...emptyMetric(shopId, account.nickname || shopId, startDate, endDate), shopId, storeId: account.storeId, countryCode: normalizeCountryCode(account.country), currency: account.currency || "BRL" });
    return storesMap.get(shopId)!;
  };
  const ensureStorePeriod = (shopId: string, date: string) => {
    const account = shopById.get(shopId)!;
    const period = periodFor(date, groupBy);
    const key = `${period.id}\u0000${shopId}`;
    if (!storePeriodsMap.has(key)) storePeriodsMap.set(key, { ...emptyMetric(key, account.nickname || shopId, period.startDate, period.endDate), date: period.id, shopId, storeId: account.storeId, countryCode: normalizeCountryCode(account.country), currency: account.currency || "BRL" });
    return storePeriodsMap.get(key)!;
  };

  for (const order of orders) {
    const account = accounts.find((item) => item.id === order.accountId)!;
    const shopId = account.userId;
    const storeMetric = ensureStore(shopId);
    const date = orderBusinessDate(order.dateCreated!, account.country);
    const period = periods.get(periodFor(date, groupBy).id)!;
    const storePeriod = ensureStorePeriod(shopId, date);
    const currency = order.currency || account.currency || "BRL";
    const rawItems = Array.isArray(order.items) ? order.items : [];
    const lines = rawItems.map((item: any) => {
      const raw = item.rawData || item;
      const sellerSku = text(item.sellerSku || rawItemValue(raw, "seller_sku", "sellerSku") || item.itemId) || item.itemId;
      const quantity = Math.max(0, Math.trunc(numberValue(item.quantity)));
      const unitPrice = numberValue(item.unitPrice) || numberValue(item.fullUnitPrice);
      const lineValue = unitPrice * quantity;
      const mapping = mappingBySku.get(`${shopId}\u0000${sellerSku.toLowerCase()}`);
      const directVariant = variantBySku.get(sellerSku.toLowerCase());
      const components = mapping || (directVariant ? [{ variantId: directVariant.id, quantity: 1 }] : []);
      const costComponents = components.map((component) => ({
        variantId: component.variantId,
        skuId: variantById.get(component.variantId)?.skuId || "",
        quantity: Math.max(1, Math.trunc(numberValue(component.quantity)) || 1),
      }));
      const unitCost = costComponents.reduce((sum, component) => sum + numberValue(unitCostByVariant.get(component.variantId)) * component.quantity, 0);
      const internalFactor = costComponents.length > 0
        ? costComponents.reduce((sum, component) => sum + component.quantity, 0)
        : 1;
      const componentFirstMile = costComponents.map((component) => {
        const variant = variantById.get(component.variantId);
        return firstMileCosts.byVariant.get(component.variantId)
          || firstMileCosts.bySku.get(skuKey(variant?.skuId))
          || null;
      });
      const directFirstMile = costComponents.length === 0 ? firstMileCosts.bySku.get(skuKey(sellerSku)) || null : null;
      const firstMileCovered = costComponents.length > 0 ? componentFirstMile.every(Boolean) : Boolean(directFirstMile);
      const firstMileOriginal: Record<string, number> = {};
      let firstMileCny = 0;
      if (directFirstMile) {
        firstMileCny = directFirstMile.cny * quantity;
        for (const [costCurrency, unitAmount] of Object.entries(directFirstMile.originalByCurrency)) {
          firstMileOriginal[costCurrency] = unitAmount * quantity;
        }
      } else {
        componentFirstMile.forEach((detail, index) => {
          const componentUnits = costComponents[index].quantity * quantity;
          firstMileCny += (detail?.cny || 0) * componentUnits;
          for (const [costCurrency, unitAmount] of Object.entries(detail?.originalByCurrency || {})) {
            firstMileOriginal[costCurrency] = (firstMileOriginal[costCurrency] || 0) + unitAmount * componentUnits;
          }
        });
      }
      const saleFee = item.saleFee == null ? null : numberValue(item.saleFee);
      return {
        item, raw, sellerSku, quantity, unitPrice, lineValue, mapping, directVariant, components, costComponents,
        unitCost, internalFactor, firstMileCny, firstMileOriginal, firstMileCovered, saleFee,
      };
    });
    const units = lines.reduce((sum, line) => sum + line.quantity, 0);
    const internalUnits = lines.reduce((sum, line) => sum + line.quantity * line.internalFactor, 0);
    const gmvOriginal = lines.reduce((sum, line) => sum + line.lineValue, 0) || numberValue(order.totalAmount);
    const gmvCny = toCny(gmvOriginal, currency);
    const paymentFees = paymentFeesByOrder.get(`${order.accountId}\u0000${order.externalOrderId}`);
    // Mercado Livre returns sale_fee as the total commission for an order line,
    // not a per-unit fee. Payment charges are preferred because they also carry
    // financing, processing and seller-shipping deductions; the persisted
    // sale_fee remains the historical fallback when payment details are absent.
    const itemSaleFeeOriginal = mercadoLivreSaleFeeTotal(lines);
    const saleCommissionOriginal = paymentFees?.hasSaleCommission ? paymentFees.saleCommission : itemSaleFeeOriginal;
    const financingFeeOriginal = paymentFees?.financingFee || 0;
    const processingFeeOriginal = paymentFees?.processingFee || 0;
    const sellerShippingFeeOriginal = paymentFees?.sellerShipping || 0;
    const fulfillmentFeeOriginal = financingFeeOriginal + processingFeeOriginal + sellerShippingFeeOriginal;
    const platformFeeOriginal = saleCommissionOriginal;
    const platformFeeCny = toCny(platformFeeOriginal, currency);
    const mercadoLivreFinancingFeeCny = toCny(financingFeeOriginal, currency);
    const mercadoLivreProcessingFeeCny = toCny(processingFeeOriginal, currency);
    const mercadoLivreSaleCommissionCny = toCny(saleCommissionOriginal, currency);
    const mercadoLivreSellerShippingFeeCny = toCny(sellerShippingFeeOriginal, currency);
    const fulfillmentFeeCny = mercadoLivreFinancingFeeCny + mercadoLivreProcessingFeeCny + mercadoLivreSellerShippingFeeCny;
    const platformCostCny = platformFeeCny + fulfillmentFeeCny;
    const hasPlatformFee = paymentFees?.hasSaleCommission === true
      || (lines.length > 0 && lines.every((line) => line.saleFee != null));
    const hasFulfillmentFee = paymentFees?.hasPaymentDetails === true && paymentFees.hasChargesDetails;
    const key = `${account.id}\u0000${date}`;
    const ad = adByAccountDate.get(key);
    const adShareOriginal = ad && ad.hasRow ? ad.cost / Math.max(validOrdersByAdKey.get(key) || 1, 1) : 0;
    const adCurrency = text(account.currency || "BRL").toUpperCase();
    const adCny = toCny(adShareOriginal, adCurrency);
    const taxRule = activeTaxRule(taxRules, shopId, date);
    const taxOriginal = taxRule ? gmvOriginal * numberValue(taxRule.ratePercent) / 100 : 0;
    const taxCny = toCny(taxOriginal, currency);
    const productCostCny = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
    const productCoveredUnits = lines.reduce((sum, line) => sum + (line.components.length > 0 && line.unitCost > 0 ? line.quantity : 0), 0);
    const firstMileCny = lines.reduce((sum, line) => sum + line.firstMileCny, 0);
    const firstMileOriginal: Record<string, number> = {};
    for (const line of lines) addCurrencyAmounts(firstMileOriginal, line.firstMileOriginal);
    const firstMileCoveredUnits = lines.reduce((sum, line) => sum + (line.firstMileCovered ? line.quantity : 0), 0);
    let physicalWeightKg = 0;
    let physicalVolumeCm3 = 0;
    let maxLengthCm = 0;
    let maxWidthCm = 0;
    let maxHeightCm = 0;
    let physicalCovered = lines.length > 0;
    for (const line of lines) {
      if (line.costComponents.length === 0) physicalCovered = false;
      for (const component of line.costComponents) {
        const variant = variantById.get(component.variantId);
        const dimensions = normalizeDimensions([variant?.lengthCm, variant?.widthCm, variant?.heightCm]);
        const componentUnits = component.quantity * line.quantity;
        if (!variant || numberValue(variant.weightKg) <= 0 || dimensions.length !== 3) physicalCovered = false;
        physicalWeightKg += numberValue(variant?.weightKg) * componentUnits;
        if (dimensions.length === 3) {
          physicalVolumeCm3 += dimensions[0] * dimensions[1] * dimensions[2] * componentUnits;
          maxLengthCm = Math.max(maxLengthCm, dimensions[0]);
          maxWidthCm = Math.max(maxWidthCm, dimensions[1]);
          maxHeightCm = Math.max(maxHeightCm, dimensions[2]);
        }
      }
    }
    const warehouse = resolveWarehouse(shopId, account.country, order.dateCreated!, order.externalOrderId);
    const billedUnits = warehouseBillingUnits(units, internalUnits, warehouse.rule?.billingUnit);
    const distinctSkuCount = new Set(lines.map((line) => skuKey(line.sellerSku)).filter(Boolean)).size;
    const packageDimensions = [maxLengthCm, maxWidthCm, maxHeightCm].sort((left, right) => right - left) as [number, number, number];
    const volumetricDivisor = Math.max(1, numberValue(warehouse.rule?.volumetricDivisor) || 6000);
    const volumetricWeightKg = physicalVolumeCm3 / volumetricDivisor;
    const chargeableWeightKg = warehouse.rule?.useVolumetricWeight
      ? Math.max(physicalWeightKg, volumetricWeightKg)
      : physicalWeightKg;
    const pricingMode = warehouse.rule?.pricingMode === "WEIGHT_TIER" || warehouse.rule?.pricingMode === "PACKAGE_TIER"
      ? warehouse.rule.pricingMode
      : "FLAT_UNIT";
    const warehouseFee = warehouse.rule
      ? calculateWarehouseFulfillmentFee({
          pricingMode,
          billedUnits,
          chargeableWeightKg,
          packageLengthCm: packageDimensions[0] || 0,
          packageWidthCm: packageDimensions[1] || 0,
          packageHeightCm: packageDimensions[2] || 0,
          baseOrderFee: numberValue(warehouse.rule.baseOrderFee),
          firstUnitFee: numberValue(warehouse.rule.firstUnitFee),
          additionalUnitFee: numberValue(warehouse.rule.additionalUnitFee),
          multiSkuFee: numberValue(warehouse.rule.multiSkuFee),
          distinctSkuCount,
          overweightThresholdKg: warehouse.rule.overweightThresholdKg == null ? null : numberValue(warehouse.rule.overweightThresholdKg),
          overweightFeePerKg: numberValue(warehouse.rule.overweightFeePerKg),
          feeTiers: warehouse.rule.feeTiers.map((tier) => ({
            minWeightKg: tier.minWeightKg == null ? null : numberValue(tier.minWeightKg),
            maxWeightKg: tier.maxWeightKg == null ? null : numberValue(tier.maxWeightKg),
            minInclusive: tier.minInclusive,
            maxInclusive: tier.maxInclusive,
            maxLengthCm: tier.maxLengthCm == null ? null : numberValue(tier.maxLengthCm),
            maxWidthCm: tier.maxWidthCm == null ? null : numberValue(tier.maxWidthCm),
            maxHeightCm: tier.maxHeightCm == null ? null : numberValue(tier.maxHeightCm),
            baseFee: numberValue(tier.baseFee),
          })),
          packagingFeeTiers: warehouse.rule.packagingFeeTiers.map((tier) => ({
            minWeightKg: tier.minWeightKg == null ? null : numberValue(tier.minWeightKg),
            maxWeightKg: tier.maxWeightKg == null ? null : numberValue(tier.maxWeightKg),
            minInclusive: tier.minInclusive,
            maxInclusive: tier.maxInclusive,
            baseFee: numberValue(tier.baseFee),
          })),
          oversizeThresholdCm: warehouse.rule.oversizeThresholdCm == null ? null : numberValue(warehouse.rule.oversizeThresholdCm),
          oversizeFee: numberValue(warehouse.rule.oversizeFee),
        })
      : { fee: 0, operationalFee: 0, packagingFee: 0, oversizeFee: 0, covered: false, tier: null };
    const warehouseCurrency = text(warehouse.rule?.currency || "BRL").toUpperCase();
    const warehouseRateAvailable = warehouseCurrency === "CNY" || warehouseCurrency === "RMB" || Boolean(rates[warehouseCurrency]);
    const warehouseCovered = Boolean(
      warehouse.rule
      && warehouseFee.covered
      && warehouseRateAvailable
      && (pricingMode === "FLAT_UNIT" || physicalCovered),
    );
    const warehouseCostOriginal = warehouseCovered ? numberValue(warehouseFee.fee) : 0;
    const warehouseCostCny = warehouseCovered ? toCny(warehouseCostOriginal, warehouseCurrency) : 0;
    const metricOriginalAmounts = originalAmounts([
      ["gmv", currency, gmvOriginal],
      ["platformFee", currency, platformFeeOriginal],
      ["fulfillmentFee", currency, fulfillmentFeeOriginal],
      ["adSpend", adCurrency, adShareOriginal],
      ["netAdCost", adCurrency, adShareOriginal],
      ["taxCost", currency, taxOriginal],
      ["warehouseFulfillment", warehouseCurrency, warehouseCostOriginal],
    ]);
    const feeComponentOriginalAmounts = {
      ML_FINANCING_FEE: originalAmount(currency, financingFeeOriginal),
      ML_PROCESSING_FEE: originalAmount(currency, processingFeeOriginal),
      ML_SALE_COMMISSION: originalAmount(currency, saleCommissionOriginal),
      ML_SELLER_SHIPPING: originalAmount(currency, sellerShippingFeeOriginal),
    };
    addCurrencyAmounts(metricOriginalAmounts.logisticsCost, firstMileOriginal);
    const metricSourceStatus: MutableMetric["sourceStatus"] = {
      GMV: "ACTUAL",
      PLATFORM_FEE: hasPlatformFee ? "ACTUAL" : "MISSING",
      FULFILLMENT_FEE: hasFulfillmentFee ? "ACTUAL" : "MISSING",
      ML_FINANCING_FEE: paymentFees?.hasFinancingFee ? "ACTUAL" : "MISSING",
      ML_PROCESSING_FEE: paymentFees?.hasProcessingFee ? "ACTUAL" : "MISSING",
      ML_SALE_COMMISSION: hasPlatformFee ? "ACTUAL" : "MISSING",
      ML_SELLER_SHIPPING: paymentFees?.hasSellerShipping ? "ACTUAL" : "MISSING",
      PRODUCT_COST: productCoveredUnits === units && units > 0 ? "ACTUAL" : "MISSING",
      LOGISTICS_COST: firstMileCoveredUnits === units && units > 0 ? "ACTUAL" : "MISSING",
      WAREHOUSE_FULFILLMENT: warehouseCovered ? "ACTUAL" : "MISSING",
      AD_COST: ad?.hasRow ? "ACTUAL" : "MISSING",
      TAX_COST: taxRule ? "ACTUAL" : "MISSING",
    };
    const included = isMercadoLivreProfitOrder(order.status);
    if (included) {
      if (hasPlatformFee && hasFulfillmentFee) platformCoveredOrders += 1;
      if (ad?.hasRow) adCoveredOrders += 1;
      if (warehouse.mappingStatus === "MAPPED") warehouseMappedOrders += 1;
      if (warehouseCovered) warehouseCoveredOrders += 1;
      if (taxRule) taxCoveredOrders += 1;
      const metricValues: Partial<MutableMetric> = {
        orderCount: 1, units, internalUnits, gmvCny, platformCostCny, platformFeeCny,
        fulfillmentFeeCny, mercadoLivreFinancingFeeCny, mercadoLivreProcessingFeeCny,
        mercadoLivreSaleCommissionCny, mercadoLivreSellerShippingFeeCny,
        productCostCny, logisticsCostCny: firstMileCny, warehouseFulfillmentCostCny: warehouseCostCny,
        adSpendCny: adCny, netAdCostCny: adCny, taxCostCny: taxCny, originalAmounts: metricOriginalAmounts,
        componentOriginalAmounts: feeComponentOriginalAmounts,
        productCoveredUnits, logisticsCoveredUnits: firstMileCoveredUnits, exactSettlementOrders: 0,
        warehouseCoveredOrders: warehouseCovered ? 1 : 0, taxCoveredOrders: taxRule ? 1 : 0,
        sourceStatus: metricSourceStatus,
      };
      addMetric(period, metricValues);
      addMetric(storeMetric, metricValues);
      addMetric(storePeriod, metricValues);
    } else {
      addMetric(period, { cancelledOrders: 1 });
      addMetric(storeMetric, { cancelledOrders: 1 });
      addMetric(storePeriod, { cancelledOrders: 1 });
    }

    for (const line of lines) {
      const currentSkuKey = `${shopId}\u0000${line.sellerSku.toLowerCase()}`;
      if (!skusMap.has(currentSkuKey)) skusMap.set(currentSkuKey, { ...emptyMetric(currentSkuKey, line.sellerSku, startDate, endDate), sellerSku: line.sellerSku, internalSku: line.costComponents.length === 1 ? line.costComponents[0].skuId : null, productName: text(line.item.title || line.raw?.title) || line.sellerSku, shopId, storeName: account.nickname || shopId, mappingStatus: line.mapping ? "mapped" : line.directVariant ? "direct" : "unmapped", mappingSource: line.mapping ? "profit" : line.directVariant ? "direct" : "unmapped", costComponents: line.costComponents });
      if (included) {
        const share = gmvOriginal > 0
          ? line.lineValue / gmvOriginal
          : units > 0 ? line.quantity / units : 0;
        const lineOriginalAmounts = originalAmounts([
          ["gmv", currency, gmvOriginal * share],
          ["platformFee", currency, platformFeeOriginal * share],
          ["fulfillmentFee", currency, fulfillmentFeeOriginal * share],
          ["adSpend", adCurrency, adShareOriginal * share],
          ["netAdCost", adCurrency, adShareOriginal * share],
          ["taxCost", currency, taxOriginal * share],
          ["warehouseFulfillment", warehouseCurrency, warehouseCostOriginal * share],
        ]);
        const lineFeeComponentOriginalAmounts = {
          ML_FINANCING_FEE: originalAmount(currency, financingFeeOriginal * share),
          ML_PROCESSING_FEE: originalAmount(currency, processingFeeOriginal * share),
          ML_SALE_COMMISSION: originalAmount(currency, saleCommissionOriginal * share),
          ML_SELLER_SHIPPING: originalAmount(currency, sellerShippingFeeOriginal * share),
        };
        addCurrencyAmounts(lineOriginalAmounts.logisticsCost, line.firstMileOriginal);
        addMetric(skusMap.get(currentSkuKey)!, {
          orderCount: 1,
          units: line.quantity,
          internalUnits: line.quantity * line.internalFactor,
          gmvCny: gmvCny * share,
          platformCostCny: platformCostCny * share,
          platformFeeCny: platformFeeCny * share,
          fulfillmentFeeCny: fulfillmentFeeCny * share,
          mercadoLivreFinancingFeeCny: mercadoLivreFinancingFeeCny * share,
          mercadoLivreProcessingFeeCny: mercadoLivreProcessingFeeCny * share,
          mercadoLivreSaleCommissionCny: mercadoLivreSaleCommissionCny * share,
          mercadoLivreSellerShippingFeeCny: mercadoLivreSellerShippingFeeCny * share,
          productCostCny: line.unitCost * line.quantity,
          logisticsCostCny: line.firstMileCny,
          warehouseFulfillmentCostCny: warehouseCostCny * share,
          adSpendCny: adCny * share,
          netAdCostCny: adCny * share,
          taxCostCny: taxCny * share,
          originalAmounts: lineOriginalAmounts,
          componentOriginalAmounts: lineFeeComponentOriginalAmounts,
          productCoveredUnits: line.unitCost > 0 && line.components.length > 0 ? line.quantity : 0,
          logisticsCoveredUnits: line.firstMileCovered ? line.quantity : 0,
          warehouseCoveredOrders: warehouseCovered ? 1 : 0,
          taxCoveredOrders: taxRule ? 1 : 0,
          sourceStatus: metricSourceStatus,
        });
      }
    }

    if (input.includeOrders) {
      const contributionBase = emptyMetric(order.externalOrderId, order.externalOrderId, date, date);
      addMetric(contributionBase, {
        gmvCny, platformCostCny, platformFeeCny, fulfillmentFeeCny,
        mercadoLivreFinancingFeeCny, mercadoLivreProcessingFeeCny,
        mercadoLivreSaleCommissionCny, mercadoLivreSellerShippingFeeCny,
        productCostCny, logisticsCostCny: firstMileCny, warehouseFulfillmentCostCny: warehouseCostCny,
        adSpendCny: adCny, netAdCostCny: adCny, taxCostCny: taxCny,
        originalAmounts: metricOriginalAmounts, componentOriginalAmounts: feeComponentOriginalAmounts, sourceStatus: metricSourceStatus,
      });
      const baseComponents = buildProfitComponentAmounts(contributionBase, definitions);
      const contribution = contributionProfitFromComponents(baseComponents);
      const detailLines: ProfitOrderDetailLine[] = lines.map((line) => ({ sellerSku: line.sellerSku, internalSku: line.costComponents.length === 1 ? line.costComponents[0].skuId : null, productName: text(line.item.title || line.raw?.title) || line.sellerSku, imageUrl: imageForItem(line.raw), quantity: line.quantity, unitPriceOriginal: line.unitPrice > 0 ? round(line.unitPrice) : null, lineAmountOriginal: line.lineValue > 0 ? round(line.lineValue) : null }));
      orderDetails.push({
        orderId: order.externalOrderId, businessDate: date, createTime: order.dateCreated!.toISOString(),
        timeZone: orderTimeZone(account.country), shopId, countryCode: normalizeCountryCode(account.country),
        storeName: account.nickname || shopId, status: order.status || "UNKNOWN", isSampleOrder: false,
        includedInProfit: included, exclusionReason: included ? null : "已取消或未付款订单，不计入店铺利润",
        currency, orderAmountOriginal: round(numberValue(order.totalAmount) || gmvOriginal), units, internalUnits,
        lines: detailLines, warehouseId: warehouse.warehouseId, warehouseName: warehouse.rule?.warehouse.name || "未匹配仓库",
        gmvCny: included ? round(gmvCny) : 0, platformFeeCny: included ? round(platformFeeCny) : 0,
        fulfillmentFeeCny: included ? round(fulfillmentFeeCny) : 0,
        mercadoLivreFinancingFeeCny: included ? round(mercadoLivreFinancingFeeCny) : 0,
        mercadoLivreProcessingFeeCny: included ? round(mercadoLivreProcessingFeeCny) : 0,
        mercadoLivreSaleCommissionCny: included ? round(mercadoLivreSaleCommissionCny) : 0,
        mercadoLivreSellerShippingFeeCny: included ? round(mercadoLivreSellerShippingFeeCny) : 0,
        smartPromotionFeeCny: 0, affiliateCommissionCny: 0,
        productCostCny: included ? round(productCostCny) : 0,
        logisticsCostCny: included ? round(firstMileCny) : 0, lastMileLogisticsCostCny: 0,
        warehouseFulfillmentCostCny: included ? round(warehouseCostCny) : 0,
        warehouseFeeBreakdown: {
          ruleId: warehouse.rule?.id || null, currency: warehouse.rule?.currency || null,
          total: round(warehouseCostOriginal), orderOutbound: round(numberValue(warehouseFee.operationalFee)),
          packaging: round(numberValue(warehouseFee.packagingFee)), oversize: round(numberValue(warehouseFee.oversizeFee)),
          chargeableWeightKg: round(chargeableWeightKg, 4), packageDimensions, billedUnits, distinctSkuCount,
          tier: warehouseFee.tier ? {
            minWeightKg: warehouseFee.tier.minWeightKg == null ? null : numberValue(warehouseFee.tier.minWeightKg),
            maxWeightKg: warehouseFee.tier.maxWeightKg == null ? null : numberValue(warehouseFee.tier.maxWeightKg),
            baseFee: numberValue(warehouseFee.tier.baseFee),
          } : null,
        },
        netAdCostCny: included ? round(adCny) : 0, taxCostCny: included ? round(taxCny) : 0,
        contributionProfitCny: included ? round(contribution) : 0,
        margin: included && gmvCny > 0 ? round(contribution / gmvCny * 100) : 0,
        originalAmounts: included ? metricOriginalAmounts : emptyOriginalAmounts(), components: included ? baseComponents : [],
        settlementInfo: { status: "UNSETTLED", amountOriginal: null, currency: null, statementIds: [], paymentIds: [], paidAt: null },
        coverage: { productCost: productCoveredUnits === units && units > 0, logisticsCost: firstMileCoveredUnits === units && units > 0, settlement: false, platformRule: hasPlatformFee && hasFulfillmentFee, affiliateCommission: false, warehouse: warehouseCovered, tax: Boolean(taxRule) },
      });
    }
  }

  const unallocatedAds: Array<{ accountId: string; date: string; cost: number; currency: string }> = [];
  for (const [key, ad] of adByAccountDate) {
    if (!ad.hasRow || Math.abs(ad.cost) < 0.000001 || validOrdersByAdKey.has(key)) continue;
    const [accountId, date] = key.split("\u0000");
    const account = accounts.find((item) => item.id === accountId);
    if (!account) continue;
    const currency = account.currency || "BRL";
    const costCny = toCny(ad.cost, currency);
    const period = periods.get(periodFor(date, groupBy).id);
    const store = ensureStore(account.userId);
    const storePeriod = ensureStorePeriod(account.userId, date);
    const adOnlyAmounts = originalAmounts([
      ["adSpend", currency, ad.cost],
      ["netAdCost", currency, ad.cost],
    ]);
    const adOnlyMetric: Partial<MutableMetric> = {
      adSpendCny: costCny,
      netAdCostCny: costCny,
      originalAmounts: adOnlyAmounts,
      sourceStatus: { AD_COST: "ACTUAL" },
    };
    if (period) addMetric(period, adOnlyMetric);
    addMetric(store, adOnlyMetric);
    addMetric(storePeriod, adOnlyMetric);
    unallocatedAds.push({ accountId, date, cost: ad.cost, currency });
  }

  const summaryMutable = emptyMetric("summary", "汇总", startDate, endDate);
  for (const metric of periods.values()) addMetric(summaryMutable, metric);
  const summary = finalizeMetric(summaryMutable, definitions);
  const periodRows = [...periods.values()].map((metric) => finalizeMetric(metric, definitions));
  const storesRows: ProfitStoreRow[] = [...storesMap.values()].map((metric) => ({ ...finalizeMetric(metric, definitions), shopId: metric.shopId, countryCode: metric.countryCode, storeId: metric.storeId, currency: metric.currency }));
  const storePeriods: ProfitStorePeriodRow[] = [...storePeriodsMap.values()].map((metric) => ({ ...finalizeMetric(metric, definitions), date: metric.date, shopId: metric.shopId, countryCode: metric.countryCode, storeId: metric.storeId, currency: metric.currency }));
  const skus: ProfitSkuRow[] = [...skusMap.values()].map((metric) => ({ ...finalizeMetric(metric, definitions), sellerSku: metric.sellerSku, internalSku: metric.internalSku, productName: metric.productName, shopId: metric.shopId, storeName: metric.storeName, mappingStatus: metric.mappingStatus, mappingSource: metric.mappingSource, costComponents: metric.costComponents }));
  const totalSkuCount = skus.length;
  const mappedSkuCount = skus.filter((sku) => sku.mappingStatus !== "unmapped" && sku.productCoverage >= 100).length;
  const validOrderCount = summary.orderCount;
  const logisticsCoverage = validOrderCount > 0 ? summary.logisticsCoverage : 100;
  const platformActual = validOrderCount > 0 ? round(platformCoveredOrders / validOrderCount * 100) : 0;
  const adCoverage = validOrderCount > 0 ? round(adCoveredOrders / validOrderCount * 100) : 0;
  const taxCoverage = validOrderCount > 0 ? round(taxCoveredOrders / validOrderCount * 100) : 0;
  const warehouseMappingCoverage = validOrderCount > 0 ? round(warehouseMappedOrders / validOrderCount * 100) : 100;
  const warehouseCoverage = validOrderCount > 0 ? round(warehouseCoveredOrders / validOrderCount * 100) : 100;
  const productCoverage = summary.productCoverage;
  const score = round(productCoverage * 0.3 + logisticsCoverage * 0.15 + platformActual * 0.2 + adCoverage * 0.1 + taxCoverage * 0.1 + warehouseCoverage * 0.15);
  if (orders.length === 0) warnings.push("当前筛选范围没有美客多订单");
  if (!rates.BRL) warnings.push("BRL 汇率暂不可用，CNY 金额无法换算");
  if (logisticsCoverage < 100 && validOrderCount > 0) warnings.push("部分美客多 SKU 缺少柜子或出库批次头程成本，相关订单尚未完整核算");
  if (validOrderCount > 0 && platformActual < 100) warnings.push("部分订单缺少完整的 Mercado Pago 费用明细，四项平台费用覆盖不完整");
  if (validOrderCount > 0 && adCoverage < 100) warnings.push("部分日期没有 Mercado Ads 数据，广告费用覆盖不完整");
  if (unallocatedAds.length > 0) warnings.push(`${unallocatedAds.length} 个店铺日有广告消耗但没有有效订单，费用已计入周期和店铺汇总，未分摊到订单`);
  if (validOrderCount > 0 && warehouseMappingCoverage < 100) warnings.push("部分美客多订单缺少店铺仓库绑定或切仓记录，海外仓代发费未计入");
  if (validOrderCount > 0 && warehouseCoverage < 100) warnings.push("部分美客多订单缺少仓库费用规则、SKU 重量尺寸或汇率，海外仓代发费尚未完整核算");
  if (validOrderCount > 0) warnings.push("美客多结算单尚未接入；当前四项平台费用来自订单支付 charges_details，结算单调整暂未计入");
  for (const currency of missingCurrencies) warnings.push(`${currency} 汇率缺失`);
  return {
    filters: { platform: "MERCADO_LIVRE", startDate, endDate, groupBy, shopId: input.shopId || null, countryCode: requestedCountryCode, resolvedCountryCode, currency: "CNY" },
    summary, periods: periodRows, stores: storesRows, storePeriods, skus, ...(input.includeOrders ? { orders: orderDetails } : {}),
    variants: variants.map((variant) => ({ id: variant.id, skuId: variant.skuId, productName: variant.product.name, unitCostCny: unitCostByVariant.get(variant.id) || 0 })),
    shops, countries: [...new Map(shops.map((shop) => [shop.region, { code: shop.region, name: shop.region === "BR" ? "巴西" : shop.region }])).values()],
    coverage: { score, productCost: productCoverage, logisticsCost: logisticsCoverage, orderSettlement: 0, adStore: adCoverage, mappedSkuCount, totalSkuCount, missingCostSkuCount: skus.filter((sku) => sku.productCoverage < 100).length, missingLogisticsSkuCount: skus.filter((sku) => sku.logisticsCoverage < 100).length, exactSettlementOrders: 0, validOrders: validOrderCount, platformActual, warehouseMapping: warehouseMappingCoverage, warehouseMappingMappedOrders: warehouseMappedOrders, warehouseMappingMissingIdOrders: validOrderCount - warehouseMappedOrders, warehouseMappingUnmappedIds: [], warehouseFulfillment: warehouseCoverage, taxRule: taxCoverage, profitScheme: 100, profitSchemeMatchedOrders: validOrderCount, profitSchemeMissingStores: [] },
    influencerMarketing: { sampleOrders: 0, sampleUnits: 0, linkedSampleOrders: 0, sampleProductCostCny: 0, sampleLogisticsCostCny: 0, sampleWarehouseCostCny: 0, sampleShippingCostCny: 0, sampleOtherCostCny: 0, totalSampleCostCny: 0, teamCommissionCny: 0, totalCostCny: 0, samples: [] },
    rates, warnings, generatedAt: new Date().toISOString(),
  };
}
