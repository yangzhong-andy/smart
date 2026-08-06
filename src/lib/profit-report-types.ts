export type ProfitGroupBy = "day" | "week" | "month";

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
  productCostCny: number;
  logisticsCostCny: number;
  adSpendCny: number;
  rebateCny: number;
  netAdCostCny: number;
  grossProfitCny: number;
  contributionProfitCny: number;
  margin: number;
  roas: number;
  productCoverage: number;
  logisticsCoverage: number;
  settlementCoverage: number;
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
  };
  rates: Record<string, number>;
  warnings: string[];
  generatedAt: string;
};
