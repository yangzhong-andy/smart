import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { getFinanceRates } from "@/lib/exchange";
import { calculateWarehouseFulfillmentFee } from "@/lib/warehouse-fulfillment-fees";
import { addBusinessDays, businessDateUtcRange, orderBusinessDate, relativeBusinessDate } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import { calculateFirstMileUnitCosts } from "@/lib/first-mile-logistics";
import { allocateShopeeAdExpenseByOrderCount, getShopeeDailyAdPerformance } from "@/lib/shopee-ads";
import { calculateShopeeMerchandiseSubtotal } from "@/lib/shopee-gmv";
import {
  calculateShopeeFinalAffiliateCommission,
  calculateShopeeOfficialPlatformFees,
} from "@/lib/shopee-platform-fees";
import { shopeeSettlementStage } from "@/lib/shopee-settlements";
import { calculateShopeeTailShippingCost } from "@/lib/shopee-shipping";
import { warehouseBillingUnits } from "@/lib/order-actual-units";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function dateParam(value: string | null, fallback: string) {
  return value && DATE_RE.test(value) ? value : fallback;
}

function rateToCny(currency: string | null | undefined, rates: Record<string, unknown>) {
  const code = String(currency || "BRL").trim().toUpperCase();
  if (code === "CNY" || code === "RMB") return 1;
  const rate = number(rates[code]);
  return rate > 0 ? rate : 0;
}

type GroupBy = "day" | "week" | "month";
type CurrencyAmounts = Record<string, number>;
type AggregateOriginalAmounts = {
  gmv: CurrencyAmounts;
  platformFees: CurrencyAmounts;
  commissionFee: CurrencyAmounts;
  serviceFee: CurrencyAmounts;
  affiliateCommission: CurrencyAmounts;
  tax: CurrencyAmounts;
  advertising: CurrencyAmounts;
  shipping: CurrencyAmounts;
  refund: CurrencyAmounts;
  productCost: CurrencyAmounts;
  firstMileLogistics: CurrencyAmounts;
  warehouse: CurrencyAmounts;
};

const ORIGINAL_AMOUNT_KEYS: Array<keyof AggregateOriginalAmounts> = [
  "gmv",
  "platformFees",
  "commissionFee",
  "serviceFee",
  "affiliateCommission",
  "tax",
  "advertising",
  "shipping",
  "refund",
  "productCost",
  "firstMileLogistics",
  "warehouse",
];

function emptyOriginalAmounts(): AggregateOriginalAmounts {
  return {
    gmv: {},
    platformFees: {},
    commissionFee: {},
    serviceFee: {},
    affiliateCommission: {},
    tax: {},
    advertising: {},
    shipping: {},
    refund: {},
    productCost: {},
    firstMileLogistics: {},
    warehouse: {},
  };
}

function addCurrencyAmount(target: CurrencyAmounts, currency: string | null | undefined, amount: number) {
  if (!Number.isFinite(amount) || Math.abs(amount) <= 0.000001) return;
  const code = String(currency || "CNY").trim().toUpperCase() || "CNY";
  target[code] = (target[code] || 0) + amount;
}

function addCurrencyAmounts(target: CurrencyAmounts, source: CurrencyAmounts | null | undefined) {
  for (const [currency, amount] of Object.entries(source || {})) addCurrencyAmount(target, currency, amount);
}

function roundedCurrencyAmounts(source: CurrencyAmounts) {
  return Object.fromEntries(
    Object.entries(source)
      .map(([currency, amount]) => [currency, round(amount)] as const)
      .filter(([, amount]) => Math.abs(amount) > 0.000001),
  );
}

function periodStart(value: string, groupBy: GroupBy) {
  if (groupBy === "day") return value;
  if (groupBy === "month") return `${value.slice(0, 7)}-01`;
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function periodEnd(value: string, groupBy: GroupBy) {
  if (groupBy === "day") return value;
  if (groupBy === "week") return addBusinessDays(value, 6);
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

function sellerSku(item: { modelSku: string | null; itemSku: string | null }) {
  return String(item.modelSku || item.itemSku || "").trim();
}

function skuKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDimensions(values: unknown[]) {
  return values.map(number).filter((value) => value > 0).sort((left, right) => right - left);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;
  const shopId = params.get("shopId")?.trim() || undefined;
  const requestedCountry = params.get("countryCode")?.trim()
    ? normalizeCountryCode(params.get("countryCode"))
    : undefined;
  const groupBy = (["day", "week", "month"].includes(params.get("groupBy") || "") ? params.get("groupBy") : "day") as GroupBy;
  const allShops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active" },
    select: { id: true, shopId: true, shopName: true, region: true, currency: true },
    orderBy: { createdAt: "asc" },
  });
  const shops = allShops.filter((shop) => (
    (!shopId || shop.shopId === shopId)
    && (!requestedCountry || normalizeCountryCode(shop.region) === requestedCountry)
  ));
  const defaultCountry = normalizeCountryCode(shops[0]?.region || allShops[0]?.region);
  const today = relativeBusinessDate(defaultCountry);
  const startDate = dateParam(params.get("startDate"), addBusinessDays(today, -29));
  const endDate = dateParam(params.get("endDate"), today);
  if (startDate > endDate) return NextResponse.json({ error: "开始日期不能晚于结束日期" }, { status: 400 });
  const rangeDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1;
  if (rangeDays > 366) return NextResponse.json({ error: "日期范围不能超过 366 天" }, { status: 400 });

  const status = params.get("status")?.trim() || undefined;
  const keyword = params.get("keyword")?.trim() || undefined;
  const page = Math.max(1, Math.min(100_000, Math.trunc(number(params.get("page")) || 1)));
  const pageSize = Math.max(10, Math.min(100, Math.trunc(number(params.get("pageSize")) || 25)));
  const dateConditions: Prisma.ShopeeOrderWhereInput[] = shops.map((shop) => ({
    shopId: shop.shopId,
    createTime: businessDateUtcRange(startDate, endDate, normalizeCountryCode(shop.region)),
  }));
  const where: Prisma.ShopeeOrderWhereInput = {
    ...(shopId ? { shopId } : {}),
    ...(status ? { status } : {}),
    ...(keyword ? { OR: [
      { orderSn: { contains: keyword, mode: "insensitive" } },
      { buyerUsername: { contains: keyword, mode: "insensitive" } },
      { shopSetting: { is: { shopName: { contains: keyword, mode: "insensitive" } } } },
      { items: { some: { OR: [
        { itemSku: { contains: keyword, mode: "insensitive" } },
        { modelSku: { contains: keyword, mode: "insensitive" } },
        { itemName: { contains: keyword, mode: "insensitive" } },
        { modelName: { contains: keyword, mode: "insensitive" } },
      ] } } },
    ] } : {}),
    AND: [{ OR: dateConditions.length ? dateConditions : [{ shopId: "__NO_MATCHING_SHOP__" }] }],
  };

  const [orders, adAllocationOrders, rates, mappings, variants, logisticsCosts, warehouseSwitchRules, warehouseRules, taxRules, adResults] = await Promise.all([
    prisma.shopeeOrder.findMany({
      where,
      include: {
        items: { orderBy: [{ itemName: "asc" }, { modelName: "asc" }] },
        settlement: true,
        shopSetting: { select: { shopName: true, region: true, storeId: true } },
      },
      orderBy: [{ createTime: "desc" }, { orderSn: "desc" }],
    }),
    prisma.shopeeOrder.findMany({
      where: { AND: [{ OR: dateConditions.length ? dateConditions : [{ shopId: "__NO_MATCHING_SHOP__" }] }] },
      select: {
        orderSn: true,
        shopId: true,
        status: true,
        totalAmount: true,
        currency: true,
        createTime: true,
        settlement: { select: { orderSellingPrice: true, buyerTotalAmount: true, currency: true } },
        shopSetting: { select: { region: true } },
      },
    }),
    getFinanceRates(),
    prisma.profitSkuMapping.findMany({ where: { platform: "SHOPEE", enabled: true }, include: { components: { include: { variant: { select: { id: true, skuId: true, costPrice: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true } } } } } }),
    prisma.productVariant.findMany({ select: { id: true, skuId: true, costPrice: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true } }),
    prisma.logisticsCost.findMany({
      select: {
        amount: true,
        currency: true,
        costType: true,
        containerId: true,
        outboundBatchId: true,
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
    prisma.profitWarehouseSwitchRule.findMany({
      where: { platform: "SHOPEE", ...(shopId ? { shopId } : {}) },
      select: { shopId: true, region: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.warehouseFulfillmentRule.findMany({
      where: { enabled: true },
      include: {
        warehouse: { select: { name: true } },
        feeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
        packagingFeeTiers: { orderBy: [{ maxWeightKg: "asc" }, { baseFee: "asc" }] },
      },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.profitShopCostRule.findMany({
      where: { platform: "SHOPEE", costType: "TAX", enabled: true, shopId: { in: shops.map((shop) => shop.shopId) } },
      select: { shopId: true, ratePercent: true, effectiveFrom: true, effectiveTo: true },
      orderBy: [{ shopId: "asc" }, { effectiveFrom: "desc" }],
    }),
    Promise.all(shops.map(async (shop) => {
      try {
        // Shopee's advertising API rejects a range that ends on a future
        // business date. This can happen when the browser date is already
        // the next day in China while Brazil is still on the previous day.
        // Orders may still be queried through the requested end date, but ad
        // spend must stop at the shop's current destination-country date.
        const adEndDate = [endDate, relativeBusinessDate(normalizeCountryCode(shop.region))].sort()[0];
        if (startDate > adEndDate) {
          return { shop, rows: [], error: null as string | null };
        }
        return { shop, rows: await getShopeeDailyAdPerformance(shop.id, startDate, adEndDate), error: null as string | null };
      } catch (error) {
        return { shop, rows: [], error: error instanceof Error ? error.message : "Shopee 广告消耗获取失败" };
      }
    })),
  ]);

  const rateMap = (rates || {}) as Record<string, unknown>;
  const firstMileCosts = calculateFirstMileUnitCosts(logisticsCosts, (amount, currency) => (
    number(amount) * rateToCny(currency, rateMap)
  ));
  const adDataShopIds = new Set(adResults.filter((result) => !result.error).map((result) => result.shop.shopId));
  const adsByShopDate = new Map<string, { original: number; currency: string; cny: number }>();
  for (const result of adResults) {
    const currency = String(result.shop.currency || "BRL").trim().toUpperCase();
    const rate = rateToCny(currency, rateMap);
    for (const row of result.rows) {
      adsByShopDate.set(`${result.shop.shopId}\u0000${row.date}`, {
        original: row.expense,
        currency,
        cny: row.expense * rate,
      });
    }
  }
  const adOrdersByShopDate = new Map<string, typeof adAllocationOrders>();
  for (const order of adAllocationOrders) {
    const normalizedStatus = String(order.status || "UNKNOWN").toUpperCase();
    if (normalizedStatus.includes("CANCEL") || ["UNPAID", "INCOMPLETE"].includes(normalizedStatus) || !order.createTime) continue;
    const businessDate = orderBusinessDate(order.createTime, order.shopSetting.region);
    const key = `${order.shopId}\u0000${businessDate}`;
    const rows = adOrdersByShopDate.get(key) || [];
    rows.push(order);
    adOrdersByShopDate.set(key, rows);
  }
  const advertisingByOrder = new Map<string, { original: number; currency: string; cny: number }>();
  const unallocatedAds: Array<{ shopId: string; date: string; original: number; currency: string; cny: number }> = [];
  for (const [key, ad] of adsByShopDate) {
    const [currentShopId, date] = key.split("\u0000");
    const eligible = adOrdersByShopDate.get(key) || [];
    if (eligible.length === 0) {
      if (ad.original !== 0) unallocatedAds.push({ shopId: currentShopId, date, ...ad });
      continue;
    }
    // Advertising spend is an order-level cost: divide the shop/day total by
    // the number of eligible orders, regardless of each order's GMV.
    const originalAllocations = allocateShopeeAdExpenseByOrderCount(ad.original, eligible.length);
    const cnyAllocations = allocateShopeeAdExpenseByOrderCount(ad.cny, eligible.length);
    eligible.forEach((order, index) => {
      advertisingByOrder.set(`${order.shopId}\u0000${order.orderSn}`, {
        original: originalAllocations[index],
        currency: ad.currency,
        cny: cnyAllocations[index],
      });
    });
  }
  const mappingByKey = new Map(mappings.map((mapping) => [`${mapping.shopId}\u0000${skuKey(mapping.sellerSku)}`, mapping]));
  const variantBySku = new Map(variants.map((variant) => [skuKey(variant.skuId), variant]));
  const activeTaxRule = (currentShopId: string, businessDate: string | null) => {
    if (!businessDate) return null;
    return taxRules.find((rule) => (
      rule.shopId === currentShopId
      && rule.effectiveFrom.toISOString().slice(0, 10) <= businessDate
      && (!rule.effectiveTo || rule.effectiveTo.toISOString().slice(0, 10) >= businessDate)
    )) || null;
  };
  const warehouseRulesById = new Map<string, typeof warehouseRules>();
  for (const rule of warehouseRules) {
    const rows = warehouseRulesById.get(rule.warehouseId) || [];
    rows.push(rule);
    warehouseRulesById.set(rule.warehouseId, rows);
  }
  const activeWarehouseRule = (warehouseId: string, currentShopId: string, date: Date) => {
    const dateValue = date.getTime();
    const candidates = (warehouseRulesById.get(warehouseId) || []).filter((rule) => (
      (!rule.shopId || rule.shopId === currentShopId)
      && rule.effectiveFrom.getTime() <= dateValue
      && (!rule.effectiveTo || rule.effectiveTo.getTime() >= dateValue)
    ));
    return candidates.find((rule) => rule.shopId === currentShopId) || candidates[0] || null;
  };
  const resolveWarehouse = (order: (typeof orders)[number]) => {
    if (!order.createTime) return { warehouseId: null as string | null, rule: null as (typeof warehouseRules)[number] | null, status: "MISSING" as const };
    const region = String(order.shopSetting.region || "").toUpperCase();
    const timestamp = order.createTime.getTime();
    const switchRule = warehouseSwitchRules.find((rule) => (
      rule.shopId === order.shopId
      && String(rule.region || "").toUpperCase() === region
      && rule.effectiveFrom.getTime() <= timestamp
    ));
    if (switchRule) {
      return { warehouseId: switchRule.warehouseId, rule: activeWarehouseRule(switchRule.warehouseId, order.shopId, order.createTime), status: "MAPPED" as const };
    }
    const shopRules = warehouseRules.filter((rule) => (
      rule.shopId === order.shopId
      && rule.effectiveFrom.getTime() <= timestamp
      && (!rule.effectiveTo || rule.effectiveTo.getTime() >= timestamp)
    )).sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime());
    if (shopRules.length > 0) {
      return { warehouseId: shopRules[0].warehouseId, rule: shopRules[0], status: "MAPPED" as const };
    }
    return { warehouseId: null as string | null, rule: null as (typeof warehouseRules)[number] | null, status: "MISSING" as const };
  };
  const calculatedRows = orders.map((order) => {
    const settlement = order.settlement as unknown as Record<string, unknown> | null;
    const settlementStatus = shopeeSettlementStage(order, order.settlement);
    const currency = String((settlement?.currency as string | null) || order.currency || "BRL").toUpperCase();
    const exchangeRate = rateToCny(currency, rateMap);
    const gmv = calculateShopeeMerchandiseSubtotal({
      settlement: settlement ? { rawData: settlement.rawData } : null,
      order: {
        totalAmount: order.totalAmount,
        actualShippingFee: order.actualShippingFee,
        estimatedShippingFee: order.estimatedShippingFee,
        items: order.items,
      },
    });
    const gmvOriginal = gmv.amount;
    const businessDate = order.createTime ? orderBusinessDate(order.createTime, order.shopSetting.region) : null;
    const taxRule = activeTaxRule(order.shopId, businessDate);
    const taxRatePercent = taxRule ? number(taxRule.ratePercent) : 0;
    const officialPlatformFees = calculateShopeeOfficialPlatformFees({
      commissionFee: settlement?.commissionFee,
      netCommissionFee: settlement?.netCommissionFee,
      serviceFee: settlement?.serviceFee,
      netServiceFee: settlement?.netServiceFee,
      amsCommissionFee: settlement?.amsCommissionFee,
    });
    const commissionFeeOriginal = officialPlatformFees.commissionFee;
    const serviceFeeOriginal = officialPlatformFees.serviceFee;
    const affiliateCommissionOriginal = calculateShopeeFinalAffiliateCommission(
      settlement?.amsCommissionFee,
      settlementStatus,
    );
    const platformFeesOriginal = round(commissionFeeOriginal + serviceFeeOriginal + affiliateCommissionOriginal);
    const advertising = advertisingByOrder.get(`${order.shopId}\u0000${order.orderSn}`);
    const advertisingOriginal = advertising?.original || 0;
    const advertisingCurrency = advertising?.currency || currency;
    const advertisingSettlementFundingOriginal = Math.abs(number(settlement?.adsEscrowFee));
    const shippingOriginal = calculateShopeeTailShippingCost({
      finalShippingFee: settlement?.finalShippingFee,
      actualShippingFee: settlement?.actualShippingFee,
      shopeeShippingRebate: settlement?.shopeeShippingRebate,
      reverseShippingFee: settlement?.reverseShippingFee,
    }).amount;
    const refundOriginal = Math.abs(number(settlement?.sellerReturnRefund)) + Math.abs(number(settlement?.adjustableRefund));
    let productCostCny = 0;
    let firstMileLogisticsCny = 0;
    const firstMileOriginalAmounts: CurrencyAmounts = {};
    let units = 0;
    let internalUnits = 0;
    let mappedUnits = 0;
    let physicalWeightKg = 0;
    let physicalVolumeCm3 = 0;
    let maxLengthCm = 0;
    let maxWidthCm = 0;
    let maxHeightCm = 0;
    const lineRows = order.items.map((item) => {
      const quantity = Math.max(0, item.quantity || 0);
      units += quantity;
      const sku = sellerSku(item);
      const mapping = mappingByKey.get(`${order.shopId}\u0000${skuKey(sku)}`);
      const directVariant = variantBySku.get(skuKey(sku));
      const components = mapping?.components || (directVariant ? [{ variant: directVariant, quantity: 1 }] : []);
      const internalQuantity = quantity * (components.length > 0
        ? components.reduce((sum, component) => sum + Math.max(1, number(component.quantity)), 0)
        : 1);
      internalUnits += internalQuantity;
      let lineCost = 0;
      if (mapping || directVariant) {
        mappedUnits += quantity;
        lineCost = components.reduce((sum, component) => sum + number(component.variant.costPrice) * Math.max(1, component.quantity) * quantity, 0);
        productCostCny += lineCost;
      }
      const componentFirstMile = components.map((component) => (
        firstMileCosts.byVariant.get(component.variant.id)
        || firstMileCosts.bySku.get(skuKey(component.variant.skuId))
        || null
      ));
      const directFirstMile = components.length === 0 ? firstMileCosts.bySku.get(skuKey(sku)) || null : null;
      const firstMileCovered = components.length > 0 ? componentFirstMile.every(Boolean) : Boolean(directFirstMile);
      const lineFirstMile = directFirstMile
        ? directFirstMile.cny * quantity
        : componentFirstMile.reduce((sum, detail, index) => (
            sum + (detail?.cny || 0) * Math.max(1, number(components[index].quantity)) * quantity
          ), 0);
      const lineFirstMileOriginalAmounts: CurrencyAmounts = {};
      if (directFirstMile) {
        for (const [costCurrency, unitCost] of Object.entries(directFirstMile.originalByCurrency)) {
          addCurrencyAmount(lineFirstMileOriginalAmounts, costCurrency, unitCost * quantity);
        }
      } else {
        componentFirstMile.forEach((detail, index) => {
          const componentQuantity = Math.max(1, number(components[index].quantity)) * quantity;
          for (const [costCurrency, unitCost] of Object.entries(detail?.originalByCurrency || {})) {
            addCurrencyAmount(lineFirstMileOriginalAmounts, costCurrency, unitCost * componentQuantity);
          }
        });
      }
      firstMileLogisticsCny += lineFirstMile;
      addCurrencyAmounts(firstMileOriginalAmounts, lineFirstMileOriginalAmounts);
      for (const component of components) {
        const componentQuantity = Math.max(1, number(component.quantity)) * quantity;
        const dimensions = normalizeDimensions([component.variant.lengthCm, component.variant.widthCm, component.variant.heightCm]);
        physicalWeightKg += number(component.variant.weightKg) * componentQuantity;
        if (dimensions.length === 3) {
          physicalVolumeCm3 += dimensions[0] * dimensions[1] * dimensions[2] * componentQuantity;
          maxLengthCm = Math.max(maxLengthCm, dimensions[0]);
          maxWidthCm = Math.max(maxWidthCm, dimensions[1]);
          maxHeightCm = Math.max(maxHeightCm, dimensions[2]);
        }
      }
      return {
        itemId: item.itemId,
        modelId: item.modelId,
        sku,
        name: item.modelName || item.itemName || sku || "未命名商品",
        imageUrl: item.imageUrl,
        quantity,
        internalQuantity,
        lineValueOriginal: number(item.discountedPrice ?? item.originalPrice) * quantity,
        lineCostCny: round(lineCost),
        firstMileLogisticsCny: round(lineFirstMile),
        firstMileOriginalAmounts: roundedCurrencyAmounts(lineFirstMileOriginalAmounts),
        mapped: Boolean(mapping || directVariant),
        firstMileCovered,
      };
    });
    const gmvCny = gmvOriginal * exchangeRate;
    const taxCostOriginal = gmvOriginal * taxRatePercent / 100;
    const taxCostCny = gmvCny * taxRatePercent / 100;
    const commissionFeeCny = round(commissionFeeOriginal * exchangeRate);
    const serviceFeeCny = round(serviceFeeOriginal * exchangeRate);
    const affiliateCommissionCny = round(affiliateCommissionOriginal * exchangeRate);
    const platformFeesCny = round(commissionFeeCny + serviceFeeCny + affiliateCommissionCny);
    const advertisingCny = advertising?.cny || 0;
    const shippingCny = shippingOriginal * exchangeRate;
    const refundCny = refundOriginal * exchangeRate;
    const warehouse = resolveWarehouse(order);
    const sellerUnits = order.items.reduce((sum, item) => sum + Math.max(0, item.quantity || 0), 0);
    const billedUnits = warehouseBillingUnits(sellerUnits, internalUnits, warehouse.rule?.billingUnit);
    const distinctSkuCount = new Set(order.items.map((item) => skuKey(sellerSku(item))).filter(Boolean)).size;
    const packageDimensions = [maxLengthCm, maxWidthCm, maxHeightCm].sort((left, right) => right - left) as [number, number, number];
    const volumetricDivisor = Math.max(1, number(warehouse.rule?.volumetricDivisor) || 6000);
    const volumetricWeightKg = physicalVolumeCm3 / volumetricDivisor;
    const chargeableWeightKg = warehouse.rule?.useVolumetricWeight
      ? Math.max(physicalWeightKg, volumetricWeightKg)
      : physicalWeightKg;
    const pricingMode = warehouse.rule?.pricingMode === "WEIGHT_TIER" || warehouse.rule?.pricingMode === "PACKAGE_TIER"
      ? warehouse.rule.pricingMode
      : "FLAT_UNIT";
    const feeResult = warehouse.rule
      ? calculateWarehouseFulfillmentFee({
          pricingMode,
          billedUnits,
          chargeableWeightKg,
          packageLengthCm: packageDimensions[0] || 0,
          packageWidthCm: packageDimensions[1] || 0,
          packageHeightCm: packageDimensions[2] || 0,
          baseOrderFee: number(warehouse.rule.baseOrderFee),
          firstUnitFee: number(warehouse.rule.firstUnitFee),
          additionalUnitFee: number(warehouse.rule.additionalUnitFee),
          multiSkuFee: number(warehouse.rule.multiSkuFee),
          distinctSkuCount,
          overweightThresholdKg: warehouse.rule.overweightThresholdKg == null ? null : number(warehouse.rule.overweightThresholdKg),
          overweightFeePerKg: number(warehouse.rule.overweightFeePerKg),
          feeTiers: warehouse.rule.feeTiers.map((tier) => ({
            minWeightKg: tier.minWeightKg == null ? null : number(tier.minWeightKg),
            maxWeightKg: tier.maxWeightKg == null ? null : number(tier.maxWeightKg),
            minInclusive: tier.minInclusive,
            maxInclusive: tier.maxInclusive,
            maxLengthCm: tier.maxLengthCm == null ? null : number(tier.maxLengthCm),
            maxWidthCm: tier.maxWidthCm == null ? null : number(tier.maxWidthCm),
            maxHeightCm: tier.maxHeightCm == null ? null : number(tier.maxHeightCm),
            baseFee: number(tier.baseFee),
          })),
          packagingFeeTiers: warehouse.rule.packagingFeeTiers.map((tier) => ({
            minWeightKg: tier.minWeightKg == null ? null : number(tier.minWeightKg),
            maxWeightKg: tier.maxWeightKg == null ? null : number(tier.maxWeightKg),
            minInclusive: tier.minInclusive,
            maxInclusive: tier.maxInclusive,
            baseFee: number(tier.baseFee),
          })),
          oversizeThresholdCm: warehouse.rule.oversizeThresholdCm == null ? null : number(warehouse.rule.oversizeThresholdCm),
          oversizeFee: number(warehouse.rule.oversizeFee),
        })
      : { fee: 0, operationalFee: 0, packagingFee: 0, oversizeFee: 0, covered: false, tier: null };
    const physicalCovered = order.items.length === 0 || order.items.every((item) => {
      const mapping = mappingByKey.get(`${order.shopId}\u0000${skuKey(sellerSku(item))}`);
      const directVariant = variantBySku.get(skuKey(sellerSku(item)));
      const components = mapping?.components || (directVariant ? [{ variant: directVariant, quantity: 1 }] : []);
      return components.length > 0 && components.every((component) => number(component.variant.weightKg) > 0 && normalizeDimensions([component.variant.lengthCm, component.variant.widthCm, component.variant.heightCm]).length === 3);
    });
    const warehouseCurrency = String(warehouse.rule?.currency || "BRL").trim().toUpperCase();
    const warehouseRate = rateToCny(warehouseCurrency, rateMap);
    const warehouseCovered = Boolean(warehouse.rule && feeResult.covered && warehouseRate > 0 && (pricingMode === "FLAT_UNIT" || physicalCovered));
    const warehouseCostOriginal = warehouseCovered ? number(feeResult.fee) : 0;
    const warehouseCostCny = warehouseCovered ? warehouseCostOriginal * warehouseRate : 0;
    const warehouseStatus = warehouseCovered ? "CALCULATED" : "MISSING";
    const warehouseFeeBreakdown = {
      ruleId: warehouse.rule?.id || null,
      currency: warehouse.rule?.currency || null,
      total: round(warehouseCostOriginal),
      orderOutbound: round(number(feeResult.operationalFee)),
      packaging: round(number(feeResult.packagingFee)),
      oversize: round(number(feeResult.oversizeFee)),
      chargeableWeightKg: round(chargeableWeightKg, 4),
      volumetricWeightKg: round(volumetricWeightKg, 4),
      packageDimensions,
      billedUnits,
      distinctSkuCount,
      tier: feeResult.tier ? {
        minWeightKg: feeResult.tier.minWeightKg == null ? null : number(feeResult.tier.minWeightKg),
        maxWeightKg: feeResult.tier.maxWeightKg == null ? null : number(feeResult.tier.maxWeightKg),
        baseFee: number(feeResult.tier.baseFee),
      } : null,
    };
    const normalizedStatus = String(order.status || "UNKNOWN").toUpperCase();
    const includedInProfit = !normalizedStatus.includes("CANCEL") && !["UNPAID", "INCOMPLETE"].includes(normalizedStatus);
    const exclusionReason = normalizedStatus.includes("CANCEL")
      ? "已取消订单，不计入店铺利润"
      : ["UNPAID", "INCOMPLETE"].includes(normalizedStatus)
        ? "未付款订单，不计入店铺利润"
        : null;
    const calculatedCostsCny = platformFeesCny + advertisingCny + shippingCny + refundCny
      + productCostCny + firstMileLogisticsCny + warehouseCostCny + taxCostCny;
    const calculatedProfitCny = gmvCny - calculatedCostsCny;
    const costsCny = includedInProfit ? calculatedCostsCny : 0;
    const profitCny = includedInProfit ? calculatedProfitCny : 0;
    const productCostStatus = units === 0 || mappedUnits === units ? "ACTUAL" : "MISSING";
    const firstMileStatus = units === 0 || lineRows.every((line) => line.firstMileCovered) ? "ACTUAL" : "MISSING";
    const advertisingStatus = adDataShopIds.has(order.shopId) ? "ACTUAL" : "MISSING";
    const coverage = !includedInProfit
      ? "EXCLUDED"
      : settlementStatus === "ACTUAL" && productCostStatus === "ACTUAL" && firstMileStatus === "ACTUAL"
        && advertisingStatus === "ACTUAL" && exchangeRate > 0 && warehouseCovered && Boolean(taxRule)
        ? "COMPLETE"
        : "MISSING";
    const totalLineValue = lineRows.reduce((sum, line) => sum + line.lineValueOriginal, 0);
    const lines = lineRows.map((line) => {
      const share = totalLineValue > 0 ? line.lineValueOriginal / totalLineValue : line.quantity / Math.max(units, 1);
      return {
        ...line,
        gmvCny: round(includedInProfit ? gmvCny * share : 0),
        lineCostCny: includedInProfit ? line.lineCostCny : 0,
        firstMileLogisticsCny: includedInProfit ? line.firstMileLogisticsCny : 0,
        allocationShare: round(share, 8),
      };
    });
    return {
      orderId: order.orderSn,
      orderDbId: order.id,
      shopId: order.shopId,
      shopName: order.shopSetting.shopName || order.shopId,
      countryCode: order.shopSetting.region.toUpperCase(),
      storeId: order.shopSetting.storeId,
      status: normalizedStatus,
      includedInProfit,
      exclusionReason,
      createTime: order.createTime?.toISOString() || null,
      businessDate,
      currency,
      paymentMethod: order.paymentMethod,
      exchangeRate: round(exchangeRate, 8),
      units,
      internalUnits,
      gmvOriginal: round(gmvOriginal),
      gmvSource: gmv.source,
      gmvCny: round(includedInProfit ? gmvCny : 0),
      platformFeesOriginal: round(platformFeesOriginal),
      platformFeesCny: round(includedInProfit ? platformFeesCny : 0),
      commissionFeeOriginal: round(commissionFeeOriginal),
      commissionFeeCny: round(includedInProfit ? commissionFeeCny : 0),
      serviceFeeOriginal: round(serviceFeeOriginal),
      serviceFeeCny: round(includedInProfit ? serviceFeeCny : 0),
      affiliateCommissionOriginal: round(affiliateCommissionOriginal),
      affiliateCommissionCny: round(includedInProfit ? affiliateCommissionCny : 0),
      officialPlatformFeesOriginal: round(platformFeesOriginal),
      platformFeesSource: settlementStatus === "ACTUAL"
        ? "OFFICIAL_ESCROW_FINAL"
        : settlementStatus === "ESTIMATED"
          ? "OFFICIAL_ESCROW_ESTIMATED"
          : "PENDING_ORDER_INCOME",
      taxRatePercent: round(taxRatePercent, 6),
      taxCostOriginal: round(includedInProfit ? taxCostOriginal : 0),
      taxCostCny: round(includedInProfit ? taxCostCny : 0),
      taxStatus: taxRule ? "ACTUAL" : "MISSING",
      advertisingOriginal: round(advertisingOriginal),
      advertisingCurrency,
      advertisingCny: round(includedInProfit ? advertisingCny : 0),
      advertisingStatus,
      advertisingSettlementFundingOriginal: round(advertisingSettlementFundingOriginal),
      shippingOriginal: round(shippingOriginal),
      shippingCny: round(includedInProfit ? shippingCny : 0),
      refundOriginal: round(refundOriginal),
      refundCny: round(includedInProfit ? refundCny : 0),
      productCostCny: round(includedInProfit ? productCostCny : 0),
      firstMileLogisticsCny: round(includedInProfit ? firstMileLogisticsCny : 0),
      firstMileOriginalAmounts: includedInProfit ? roundedCurrencyAmounts(firstMileOriginalAmounts) : {},
      firstMileStatus,
      warehouseCostOriginal: round(includedInProfit ? warehouseCostOriginal : 0),
      warehouseCurrency,
      warehouseCostCny: round(includedInProfit ? warehouseCostCny : 0),
      warehouseStatus,
      warehouseId: warehouse.warehouseId,
      warehouseName: warehouse.rule?.warehouse.name || "未配置仓库规则",
      warehouseFeeBreakdown,
      costsCny: round(costsCny),
      profitCny: round(profitCny),
      margin: includedInProfit && gmvCny > 0 ? round((profitCny / gmvCny) * 100) : 0,
      settlementStatus,
      productCostStatus,
      coverage,
      lines,
    };
  });

  type Aggregate = {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    totalOrders: number;
    orders: number;
    cancelledOrders: number;
    unpaidOrders: number;
    units: number;
    internalUnits: number;
    gmvCny: number;
    platformFeesCny: number;
    commissionFeeCny: number;
    serviceFeeCny: number;
    affiliateCommissionCny: number;
    taxCostCny: number;
    advertisingCny: number;
    shippingCny: number;
    refundCny: number;
    productCostCny: number;
    firstMileLogisticsCny: number;
    warehouseCostCny: number;
    costsCny: number;
    profitCny: number;
    completeOrders: number;
    pendingAffiliateOrders: number;
    originalAmounts: AggregateOriginalAmounts;
  };
  const emptyAggregate = (id: string, label = id): Aggregate => ({
    id, label, startDate: id, endDate: id, totalOrders: 0, orders: 0, cancelledOrders: 0, unpaidOrders: 0, units: 0, internalUnits: 0, gmvCny: 0,
    platformFeesCny: 0, commissionFeeCny: 0, serviceFeeCny: 0, affiliateCommissionCny: 0, taxCostCny: 0, advertisingCny: 0, shippingCny: 0, refundCny: 0,
    productCostCny: 0, firstMileLogisticsCny: 0, warehouseCostCny: 0,
    costsCny: 0, profitCny: 0, completeOrders: 0, pendingAffiliateOrders: 0, originalAmounts: emptyOriginalAmounts(),
  });
  const addRow = (target: Aggregate, row: (typeof calculatedRows)[number]) => {
    target.totalOrders += 1;
    if (!row.includedInProfit) {
      if (row.status.includes("CANCEL")) target.cancelledOrders += 1;
      if (["UNPAID", "INCOMPLETE"].includes(row.status)) target.unpaidOrders += 1;
      return;
    }
    target.orders += 1;
    target.units += row.units;
    target.internalUnits += row.internalUnits;
    target.gmvCny += row.gmvCny;
    target.platformFeesCny += row.platformFeesCny;
    target.commissionFeeCny += row.commissionFeeCny;
    target.serviceFeeCny += row.serviceFeeCny;
    target.affiliateCommissionCny += row.affiliateCommissionCny;
    target.taxCostCny += row.taxCostCny;
    target.advertisingCny += row.advertisingCny;
    target.shippingCny += row.shippingCny;
    target.refundCny += row.refundCny;
    target.productCostCny += row.productCostCny;
    target.firstMileLogisticsCny += row.firstMileLogisticsCny;
    target.warehouseCostCny += row.warehouseCostCny;
    target.costsCny += row.costsCny;
    target.profitCny += row.profitCny;
    if (row.settlementStatus !== "ACTUAL") target.pendingAffiliateOrders += 1;
    addCurrencyAmount(target.originalAmounts.gmv, row.currency, row.gmvOriginal);
    addCurrencyAmount(target.originalAmounts.platformFees, row.currency, row.platformFeesOriginal);
    addCurrencyAmount(target.originalAmounts.commissionFee, row.currency, row.commissionFeeOriginal);
    addCurrencyAmount(target.originalAmounts.serviceFee, row.currency, row.serviceFeeOriginal);
    addCurrencyAmount(target.originalAmounts.affiliateCommission, row.currency, row.affiliateCommissionOriginal);
    addCurrencyAmount(target.originalAmounts.tax, row.currency, row.taxCostOriginal);
    addCurrencyAmount(target.originalAmounts.advertising, row.advertisingCurrency, row.advertisingOriginal);
    addCurrencyAmount(target.originalAmounts.shipping, row.currency, row.shippingOriginal);
    addCurrencyAmount(target.originalAmounts.refund, row.currency, row.refundOriginal);
    addCurrencyAmount(target.originalAmounts.productCost, "CNY", row.productCostCny);
    addCurrencyAmounts(target.originalAmounts.firstMileLogistics, row.firstMileOriginalAmounts);
    addCurrencyAmount(target.originalAmounts.warehouse, row.warehouseCurrency, row.warehouseCostOriginal);
    if (row.coverage === "COMPLETE") target.completeOrders += 1;
  };
  const finalizeAggregate = (value: Aggregate) => ({
    ...value,
    gmvCny: round(value.gmvCny),
    platformFeesCny: round(value.platformFeesCny),
    commissionFeeCny: round(value.commissionFeeCny),
    serviceFeeCny: round(value.serviceFeeCny),
    affiliateCommissionCny: round(value.affiliateCommissionCny),
    taxCostCny: round(value.taxCostCny),
    advertisingCny: round(value.advertisingCny),
    shippingCny: round(value.shippingCny),
    refundCny: round(value.refundCny),
    productCostCny: round(value.productCostCny),
    firstMileLogisticsCny: round(value.firstMileLogisticsCny),
    warehouseCostCny: round(value.warehouseCostCny),
    costsCny: round(value.costsCny),
    profitCny: round(value.profitCny),
    originalAmounts: Object.fromEntries(
      ORIGINAL_AMOUNT_KEYS.map((key) => [key, roundedCurrencyAmounts(value.originalAmounts[key])]),
    ) as AggregateOriginalAmounts,
    margin: value.gmvCny > 0 ? round(value.profitCny / value.gmvCny * 100) : 0,
    completeness: value.orders > 0 ? round(value.completeOrders / value.orders * 100) : 0,
  });

  const summaryMutable = emptyAggregate("summary", "汇总");
  const periodMap = new Map<string, Aggregate>();
  const storeMap = new Map<string, Aggregate & { shopId: string; shopName: string; countryCode: string }>();
  const storePeriodMap = new Map<string, Aggregate & { date: string; shopId: string; shopName: string; countryCode: string }>();
  const skuMap = new Map<string, {
    id: string; shopId: string; shopName: string; countryCode: string; sku: string; name: string;
    orders: Set<string>; units: number; gmvCny: number; originalGmv: CurrencyAmounts; productCostCny: number;
    firstMileLogisticsCny: number; otherCostsCny: number; costsCny: number; profitCny: number;
  }>();
  for (const row of calculatedRows) {
    addRow(summaryMutable, row);
    if (row.businessDate) {
      const key = periodStart(row.businessDate, groupBy);
      const period = periodMap.get(key) || emptyAggregate(key);
      addRow(period, row);
      period.endDate = periodEnd(key, groupBy);
      periodMap.set(key, period);
    }
    const store = storeMap.get(row.shopId) || {
      ...emptyAggregate(row.shopId, row.shopName),
      shopId: row.shopId,
      shopName: row.shopName,
      countryCode: row.countryCode,
    };
    addRow(store, row);
    storeMap.set(row.shopId, store);
    if (row.businessDate) {
      const date = periodStart(row.businessDate, groupBy);
      const key = `${date}\u0000${row.shopId}`;
      const storePeriod = storePeriodMap.get(key) || {
        ...emptyAggregate(key, row.shopName),
        date,
        shopId: row.shopId,
        shopName: row.shopName,
        countryCode: row.countryCode,
      };
      storePeriod.startDate = date;
      storePeriod.endDate = periodEnd(date, groupBy);
      addRow(storePeriod, row);
      storePeriodMap.set(key, storePeriod);
    }
    if (!row.includedInProfit) continue;
    for (const line of row.lines) {
      const key = `${row.shopId}\u0000${skuKey(line.sku) || line.itemId}`;
      const sku = skuMap.get(key) || {
        id: key, shopId: row.shopId, shopName: row.shopName, countryCode: row.countryCode,
        sku: line.sku || "未填写 SKU", name: line.name, orders: new Set<string>(), units: 0,
        gmvCny: 0, originalGmv: {}, productCostCny: 0, firstMileLogisticsCny: 0, otherCostsCny: 0, costsCny: 0, profitCny: 0,
      };
      const otherCosts = (row.platformFeesCny + row.taxCostCny + row.advertisingCny + row.shippingCny + row.refundCny + row.warehouseCostCny) * line.allocationShare;
      const lineCosts = line.lineCostCny + line.firstMileLogisticsCny + otherCosts;
      sku.orders.add(row.orderId);
      sku.units += line.quantity;
      sku.gmvCny += line.gmvCny;
      addCurrencyAmount(sku.originalGmv, row.currency, row.gmvOriginal * line.allocationShare);
      sku.productCostCny += line.lineCostCny;
      sku.firstMileLogisticsCny += line.firstMileLogisticsCny;
      sku.otherCostsCny += otherCosts;
      sku.costsCny += lineCosts;
      sku.profitCny += line.gmvCny - lineCosts;
      skuMap.set(key, sku);
    }
  }
  if (!status && !keyword) {
    for (const unallocated of unallocatedAds) {
      const costCny = round(unallocated.cny);
      summaryMutable.advertisingCny += costCny;
      summaryMutable.costsCny += costCny;
      summaryMutable.profitCny -= costCny;
      addCurrencyAmount(summaryMutable.originalAmounts.advertising, unallocated.currency, unallocated.original);

      const periodKey = periodStart(unallocated.date, groupBy);
      const period = periodMap.get(periodKey) || emptyAggregate(periodKey);
      period.advertisingCny += costCny;
      period.costsCny += costCny;
      period.profitCny -= costCny;
      addCurrencyAmount(period.originalAmounts.advertising, unallocated.currency, unallocated.original);
      period.endDate = periodEnd(periodKey, groupBy);
      periodMap.set(periodKey, period);

      const shop = allShops.find((candidate) => candidate.shopId === unallocated.shopId);
      const store = storeMap.get(unallocated.shopId) || {
        ...emptyAggregate(unallocated.shopId, shop?.shopName || unallocated.shopId),
        shopId: unallocated.shopId,
        shopName: shop?.shopName || unallocated.shopId,
        countryCode: normalizeCountryCode(shop?.region),
      };
      store.advertisingCny += costCny;
      store.costsCny += costCny;
      store.profitCny -= costCny;
      addCurrencyAmount(store.originalAmounts.advertising, unallocated.currency, unallocated.original);
      storeMap.set(unallocated.shopId, store);

      const storePeriodKey = `${periodKey}\u0000${unallocated.shopId}`;
      const storePeriod = storePeriodMap.get(storePeriodKey) || {
        ...emptyAggregate(storePeriodKey, shop?.shopName || unallocated.shopId),
        date: periodKey,
        shopId: unallocated.shopId,
        shopName: shop?.shopName || unallocated.shopId,
        countryCode: normalizeCountryCode(shop?.region),
      };
      storePeriod.startDate = periodKey;
      storePeriod.endDate = periodEnd(periodKey, groupBy);
      storePeriod.advertisingCny += costCny;
      storePeriod.costsCny += costCny;
      storePeriod.profitCny -= costCny;
      addCurrencyAmount(storePeriod.originalAmounts.advertising, unallocated.currency, unallocated.original);
      storePeriodMap.set(storePeriodKey, storePeriod);
    }
  }
  const summary = finalizeAggregate(summaryMutable);
  const periods = [...periodMap.values()].map(finalizeAggregate).sort((left, right) => left.startDate.localeCompare(right.startDate));
  const stores = [...storeMap.values()].map((row) => ({ ...finalizeAggregate(row), shopId: row.shopId, shopName: row.shopName, countryCode: row.countryCode })).sort((left, right) => right.gmvCny - left.gmvCny);
  const storePeriods = [...storePeriodMap.values()].map((row) => ({
    ...finalizeAggregate(row),
    date: row.date,
    shopId: row.shopId,
    shopName: row.shopName,
    countryCode: row.countryCode,
  })).sort((left, right) => left.date.localeCompare(right.date) || right.gmvCny - left.gmvCny);
  const skus = [...skuMap.values()].map((row) => ({
    ...row,
    orders: row.orders.size,
    gmvCny: round(row.gmvCny),
    originalAmounts: { gmv: roundedCurrencyAmounts(row.originalGmv) },
    productCostCny: round(row.productCostCny),
    firstMileLogisticsCny: round(row.firstMileLogisticsCny),
    otherCostsCny: round(row.otherCostsCny),
    costsCny: round(row.costsCny),
    profitCny: round(row.profitCny),
    margin: row.gmvCny > 0 ? round(row.profitCny / row.gmvCny * 100) : 0,
  })).sort((left, right) => right.gmvCny - left.gmvCny);
  const total = calculatedRows.length;
  const rows = calculatedRows.slice((page - 1) * pageSize, page * pageSize);
  const includedRows = calculatedRows.filter((row) => row.includedInProfit);
  const settlementOrders = includedRows.filter((row) => row.settlementStatus === "ACTUAL").length;
  const estimatedSettlementOrders = includedRows.filter((row) => row.settlementStatus === "ESTIMATED").length;
  const missingSettlementOrders = includedRows.filter((row) => row.settlementStatus === "MISSING").length;
  const productCoveredUnits = includedRows.reduce((sum, row) => sum + (row.productCostStatus === "ACTUAL" ? row.units : 0), 0);
  const firstMileCoveredUnits = includedRows.reduce((sum, row) => sum + (row.firstMileStatus === "ACTUAL" ? row.units : 0), 0);
  const warehouseCoveredOrders = includedRows.filter((row) => row.warehouseStatus === "CALCULATED").length;
  const advertisingCoveredOrders = includedRows.filter((row) => row.advertisingStatus === "ACTUAL").length;
  const taxCoveredOrders = includedRows.filter((row) => row.taxStatus === "ACTUAL").length;
  const coverage = {
    overall: summary.completeness,
    settlement: summary.orders > 0 ? round(settlementOrders / summary.orders * 100) : 0,
    productCost: summary.units > 0 ? round(productCoveredUnits / summary.units * 100) : 0,
    firstMile: summary.units > 0 ? round(firstMileCoveredUnits / summary.units * 100) : 0,
    advertising: summary.orders > 0 ? round(advertisingCoveredOrders / summary.orders * 100) : 0,
    tax: summary.orders > 0 ? round(taxCoveredOrders / summary.orders * 100) : 0,
    warehouse: summary.orders > 0 ? round(warehouseCoveredOrders / summary.orders * 100) : 0,
    settlementOrders,
    estimatedSettlementOrders,
    missingSettlementOrders,
    productCoveredUnits,
    firstMileCoveredUnits,
    advertisingCoveredOrders,
    taxCoveredOrders,
    warehouseCoveredOrders,
  };
  const countries = [...new Set(allShops.map((shop) => normalizeCountryCode(shop.region)).filter((value) => value !== "UNSET"))].sort();
  const warnings = [
    ...adResults.filter((result) => result.error).map((result) => `${result.shop.shopName || result.shop.shopId} 广告消耗获取失败：${result.error}`),
    ...(unallocatedAds.length > 0 ? [`${unallocatedAds.length} 个店铺日存在广告消耗但没有可分摊的有效订单，费用已计入日报和店铺汇总，未落到订单。`] : []),
    ...(productCoveredUnits < summary.units ? ["部分 Shopee SKU 尚未完成内部 SKU 映射，采购成本和后续仓库计费可能不完整。"] : []),
    ...(firstMileCoveredUnits < summary.units ? ["部分 Shopee SKU 缺少柜子/出库批次头程物流成本，相关订单尚未完整核算。"] : []),
    ...(warehouseCoveredOrders < summary.orders ? ["部分订单缺少 Shopee 仓库规则或 SKU 尺寸，仓库费用尚未完整核算。"] : []),
    ...(taxCoveredOrders < summary.orders ? ["部分订单缺少 Shopee 店铺主体税率规则，税务成本暂按 0 计算。"] : []),
    ...(estimatedSettlementOrders > 0 ? [`${estimatedSettlementOrders} 笔订单已取得 Shopee 官方预计收入，利润已提前核算，待订单完成后自动复核。`] : []),
    ...(summary.pendingAffiliateOrders > 0 ? [`${summary.pendingAffiliateOrders} 笔订单的联盟达人佣金尚待最终结算，当前预计利润未扣除这部分未知佣金。`] : []),
    ...(missingSettlementOrders > 0 ? [`${missingSettlementOrders} 笔订单尚未生成 Shopee 订单收入明细，平台佣金、服务费、达人佣金和尾程费暂为 0。`] : []),
    ...(rates?.BRL ? [] : ["未取得 BRL/CNY 汇率，金额暂不能可靠换算。"]),
  ];

  return NextResponse.json({
    platform: "SHOPEE",
    filters: { shopId: shopId || null, countryCode: requestedCountry || null, startDate, endDate, groupBy, status: status || null, keyword: keyword || null, currency: "CNY" },
    summary: { ...summary, partialOrders: summary.completeOrders, incompleteOrders: summary.orders - summary.completeOrders },
    periods,
    stores,
    storePeriods,
    skus,
    coverage,
    rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    shops: allShops,
    countries,
    generatedAt: new Date().toISOString(),
    advertising: {
      source: "SHOPEE_CPC_DAILY_PERFORMANCE",
      allocation: "SHOP_BUSINESS_DATE_ORDER_COUNT",
      unallocatedCny: round(unallocatedAds.reduce((sum, row) => sum + row.cny, 0)),
    },
    firstMile: { source: "OUTBOUND_BATCH_LOGISTICS_COST", allocation: "SKU_VOLUME_UNIT_COST" },
    tax: { source: "PROFIT_SHOP_COST_RULE", allocation: "ORDER_GMV_RATE", costType: "TAX" },
    warnings,
  });
}
