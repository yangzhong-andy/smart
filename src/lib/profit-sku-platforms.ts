export const PROFIT_SKU_PLATFORMS = ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"] as const;

export type ProfitSkuPlatform = typeof PROFIT_SKU_PLATFORMS[number];

export const PROFIT_SKU_PLATFORM_LABELS: Record<ProfitSkuPlatform, string> = {
  TIKTOK: "TikTok Shop",
  SHOPEE: "Shopee",
  MERCADO_LIVRE: "Mercado Livre",
};

export function normalizeProfitSkuPlatform(value: unknown): ProfitSkuPlatform | null {
  const platform = String(value || "").trim().toUpperCase();
  return PROFIT_SKU_PLATFORMS.includes(platform as ProfitSkuPlatform)
    ? platform as ProfitSkuPlatform
    : null;
}
