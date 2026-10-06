export type ProfitSkuPlatform = "TIKTOK" | "SHOPEE" | "MERCADO_LIVRE";

export type ProfitSkuImageSource = "order" | "platform_sku" | "platform_product";

export type PlatformProfitSkuCounts = {
  /** Unique orders at this level; SKU order counts are not additive. */
  orders: number;
  units: number;
  /** Components expanded by current profit SKU mappings, not warehouse dispatches. */
  actualUnits: number;
};

export type PlatformProfitSkuFinancials = {
  /** Profit-engine GMV converted to CNY. */
  gmvCny: number;
  /** Profit-engine contribution profit in CNY. */
  profitCny: number;
  margin: number;
  /** GMV kept in each platform order currency for display. */
  originalGmv: Record<string, number>;
};

export type PlatformProfitSkuRow = PlatformProfitSkuCounts & {
  id: string;
  sellerSku: string;
  platformSkuId: string | null;
  productName: string;
  imageUrl: string | null;
  /** Product-level fallbacks are not guaranteed to depict the exact specification. */
  imageSource: ProfitSkuImageSource | null;
  mappingStatus: "mapped" | "direct" | "unmapped";
  components: Array<{ internalSku: string; quantityPerUnit: number }>;
  /** Financial metrics are seller-SKU aggregates from the platform profit engine. */
  financial?: PlatformProfitSkuFinancials | null;
  /** The first of multiple platform specifications spans their shared seller-SKU financial cells. */
  financialRowSpan?: number;
};

export type PlatformProfitSkuShop = PlatformProfitSkuCounts & {
  shopId: string;
  shopName: string;
  region: string;
  date: string;
  financial?: PlatformProfitSkuFinancials;
  skus: PlatformProfitSkuRow[];
};

export type PlatformProfitSkusResponse = {
  filters: {
    platform: ProfitSkuPlatform;
    shopId: string | null;
    date: string | null;
    relativeDay: "today" | "yesterday" | null;
    dateBasis: "DESTINATION_COUNTRY";
  };
  summary: PlatformProfitSkuCounts & { financial?: PlatformProfitSkuFinancials };
  shops: PlatformProfitSkuShop[];
  warnings: string[];
  generatedAt: string;
};
