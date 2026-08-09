import type { ProfitComponentAmount } from "@/lib/profit-schemes";

export type ProfitGroupBy = "day" | "week" | "month";

export type ProfitOriginalMetric =
  | "gmv"
  | "platformFee"
  | "fulfillmentFee"
  | "logisticsCost"
  | "warehouseFulfillment"
  | "adSpend"
  | "rebate"
  | "netAdCost"
  | "taxCost";

export type ProfitOriginalAmounts = Record<ProfitOriginalMetric, Record<string, number>>;

export type ProfitMetricRow = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  orderCount: number;
  cancelledOrders: number;
  units: number;
  gmvCny: number;
  platformCostCny: number;
  platformFeeCny: number;
  fulfillmentFeeCny: number;
  productCostCny: number;
  logisticsCostCny: number;
  warehouseFulfillmentCostCny: number;
  adSpendCny: number;
  rebateCny: number;
  netAdCostCny: number;
  taxCostCny: number;
  originalAmounts: ProfitOriginalAmounts;
  grossProfitCny: number;
  contributionProfitCny: number;
  margin: number;
  roas: number;
  productCoverage: number;
  logisticsCoverage: number;
  settlementCoverage: number;
  components: ProfitComponentAmount[];
};

export type ProfitStoreRow = ProfitMetricRow & {
  shopId: string;
  storeId: string | null;
  currency: string;
};

export type ProfitSkuRow = ProfitMetricRow & {
  sellerSku: string;
  internalSku: string | null;
  productName: string;
  shopId: string;
  storeName: string;
  mappingStatus: "mapped" | "direct" | "unmapped";
  mappingSource: "profit" | "inventory" | "direct" | "unmapped";
  costComponents: Array<{
    variantId: string;
    skuId: string;
    quantity: number;
  }>;
};

export type ProfitSampleRow = {
  orderId: string;
  date: string;
  shopId: string;
  storeName: string;
  warehouseId: string | null;
  warehouseName: string;
  sellerSkus: string;
  units: number;
  influencerId: string | null;
  influencerName: string | null;
  teamName: string | null;
  productCostCny: number;
  logisticsCostCny: number;
  warehouseFulfillmentCostCny: number;
  shippingCostCny: number;
  otherCostCny: number;
  manualShippingCost: number;
  manualOtherCost: number;
  manualCurrency: string;
  notes: string | null;
  totalCostCny: number;
  productCostCovered: boolean;
  logisticsCostCovered: boolean;
  warehouseCostCovered: boolean;
};

export type ProfitOrderDetailLine = {
  sellerSku: string;
  internalSku: string | null;
  productName: string;
  quantity: number;
  /** TikTok frontend selling price, kept in the order currency. */
  unitPriceOriginal: number | null;
  lineAmountOriginal: number | null;
};

export type ProfitOrderDetailRow = {
  orderId: string;
  businessDate: string;
  createTime: string;
  timeZone: string;
  shopId: string;
  storeName: string;
  status: string;
  includedInProfit: boolean;
  exclusionReason: string | null;
  currency: string;
  orderAmountOriginal: number;
  units: number;
  lines: ProfitOrderDetailLine[];
  tiktokWarehouseId?: string | null;
  warehouseId: string | null;
  warehouseName: string;
  gmvCny: number;
  platformFeeCny: number;
  fulfillmentFeeCny: number;
  productCostCny: number;
  logisticsCostCny: number;
  warehouseFulfillmentCostCny: number;
  netAdCostCny: number;
  taxCostCny: number;
  contributionProfitCny: number;
  margin: number;
  originalAmounts: ProfitOriginalAmounts;
  components: ProfitComponentAmount[];
  coverage: {
    productCost: boolean;
    logisticsCost: boolean;
    settlement: boolean;
    warehouse: boolean;
    tax: boolean;
  };
};

export type ProfitReportResponse = {
  filters: {
    startDate: string;
    endDate: string;
    groupBy: ProfitGroupBy;
    shopId: string | null;
    currency: "CNY";
  };
  summary: ProfitMetricRow;
  periods: ProfitMetricRow[];
  stores: ProfitStoreRow[];
  skus: ProfitSkuRow[];
  orders?: ProfitOrderDetailRow[];
  variants: Array<{
    id: string;
    skuId: string;
    productName: string;
    unitCostCny: number;
  }>;
  shops: Array<{ id: string; name: string; region: string; currency: string }>;
  coverage: {
    score: number;
    productCost: number;
    logisticsCost: number;
    orderSettlement: number;
    adStore: number;
    mappedSkuCount: number;
    totalSkuCount: number;
    missingCostSkuCount: number;
    missingLogisticsSkuCount: number;
      exactSettlementOrders: number;
      validOrders: number;
      platformActual: number;
      warehouseMapping: number;
      warehouseMappingMappedOrders: number;
      warehouseMappingMissingIdOrders: number;
      warehouseMappingUnmappedIds: string[];
      warehouseFulfillment: number;
      taxRule: number;
      profitScheme: number;
      profitSchemeMatchedOrders: number;
      profitSchemeMissingStores: string[];
    };
  influencerMarketing: {
    sampleOrders: number;
    sampleUnits: number;
    linkedSampleOrders: number;
    sampleProductCostCny: number;
    sampleLogisticsCostCny: number;
    sampleWarehouseCostCny: number;
    sampleShippingCostCny: number;
    sampleOtherCostCny: number;
    totalSampleCostCny: number;
    teamCommissionCny: number;
    totalCostCny: number;
    samples: ProfitSampleRow[];
  };
  rates: Record<string, number>;
  warnings: string[];
  generatedAt: string;
};
