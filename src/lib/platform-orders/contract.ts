export const COMMERCE_PLATFORMS = [
  "TIKTOK",
  "SHOPEE",
  "AMAZON",
  "MERCADO_LIVRE",
] as const;

export type CommercePlatform = (typeof COMMERCE_PLATFORMS)[number];

export type PlatformOrderIdentity = {
  platform: CommercePlatform;
  externalShopId: string;
  externalOrderId: string;
};

export type PlatformStoreIdentity = {
  platform: CommercePlatform;
  storeId: string;
  externalShopId: string;
  countryCode: string;
};

export type PlatformOrderSearchInput = {
  query: string;
  externalShopId?: string;
  countryCode?: string;
  limit: number;
};

export type PlatformOrderSearchResult = {
  platform: CommercePlatform;
  orderId: string;
  shopId: string;
  shopName: string;
  storeId: string | null;
  countryCode: string;
  businessDate: string | null;
  createTime: string | null;
  status: string;
  currency: string | null;
};

export type PlatformOrderAdapter = {
  platform: CommercePlatform;
  storageModel: string;
  searchOrders(input: PlatformOrderSearchInput): Promise<PlatformOrderSearchResult[]>;
};

export type PlatformOrderCapability = {
  platform: CommercePlatform;
  label: string;
  orderStatus: "ACTIVE" | "NOT_CONNECTED";
  storageModel: string | null;
};

const PLATFORM_ALIASES: Record<string, CommercePlatform> = {
  TIKTOK: "TIKTOK",
  TIKTOKSHOP: "TIKTOK",
  TIKTOK_SHOP: "TIKTOK",
  SHOPEE: "SHOPEE",
  AMAZON: "AMAZON",
  MERCADOLIVRE: "MERCADO_LIVRE",
  MERCADO_LIVRE: "MERCADO_LIVRE",
  MERCADOLIBRE: "MERCADO_LIVRE",
  MERCADO_LIBRE: "MERCADO_LIVRE",
};

export const PLATFORM_ORDER_CAPABILITIES: Record<CommercePlatform, PlatformOrderCapability> = {
  TIKTOK: {
    platform: "TIKTOK",
    label: "TikTok Shop",
    orderStatus: "ACTIVE",
    storageModel: "TikTokOrder",
  },
  SHOPEE: {
    platform: "SHOPEE",
    label: "Shopee",
    orderStatus: "ACTIVE",
    storageModel: "ShopeeOrder",
  },
  AMAZON: {
    platform: "AMAZON",
    label: "Amazon",
    orderStatus: "NOT_CONNECTED",
    storageModel: null,
  },
  MERCADO_LIVRE: {
    platform: "MERCADO_LIVRE",
    label: "Mercado Livre",
    orderStatus: "ACTIVE",
    storageModel: "MercadoLivreOrder",
  },
};

export function normalizeCommercePlatform(value: unknown): CommercePlatform | null {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return PLATFORM_ALIASES[normalized] || null;
}

export function normalizeOrderCountryCode(value: unknown): string | null {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function requiredIdentityPart(value: unknown, label: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

export function createPlatformOrderIdentity(input: {
  platform: unknown;
  externalShopId: unknown;
  externalOrderId: unknown;
}): PlatformOrderIdentity {
  const platform = normalizeCommercePlatform(input.platform);
  if (!platform) throw new Error("订单平台无效");
  return {
    platform,
    externalShopId: requiredIdentityPart(input.externalShopId, "平台店铺ID"),
    externalOrderId: requiredIdentityPart(input.externalOrderId, "平台订单号"),
  };
}

// JSON tuple encoding is collision-free even when a platform identifier contains a separator.
export function platformOrderIdentityKey(identity: PlatformOrderIdentity): string {
  return JSON.stringify([
    identity.platform,
    identity.externalShopId,
    identity.externalOrderId,
  ]);
}

export function platformProfitRuleKey(identity: PlatformStoreIdentity, businessDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new Error("利润规则生效日期无效");
  const countryCode = normalizeOrderCountryCode(identity.countryCode);
  if (!countryCode) throw new Error("店铺国家代码无效");
  return JSON.stringify([
    identity.platform,
    countryCode,
    requiredIdentityPart(identity.storeId, "系统店铺ID"),
    requiredIdentityPart(identity.externalShopId, "平台店铺ID"),
    businessDate,
  ]);
}
