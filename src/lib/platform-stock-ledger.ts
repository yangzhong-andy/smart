export const STOCK_PLATFORMS = [
  { platform: "TIKTOK", label: "TikTok Shop" },
  { platform: "SHOPEE", label: "Shopee" },
  { platform: "AMAZON", label: "Amazon" },
  { platform: "MERCADO_LIVRE", label: "Mercado Livre" },
] as const;

export type PlatformStockLogKind = "sales" | "sample" | "return";

export function classifyPlatformStockLog(relatedOrderType: string | null | undefined) {
  const type = String(relatedOrderType || "").trim().toUpperCase();
  if (type === "PROFIT_SALES_ORDER_REBUILD") {
    return { platform: "TIKTOK", kind: "sales" as const, aggregateHistory: true };
  }
  if (type === "PROFIT_SAMPLE_ORDER_REBUILD") {
    return { platform: "TIKTOK", kind: "sample" as const, aggregateHistory: true };
  }
  for (const { platform } of STOCK_PLATFORMS) {
    if (type === `${platform}_ORDER`) {
      return { platform, kind: "sales" as const, aggregateHistory: false };
    }
    if (type === `${platform}_ORDER_CANCELLED`) {
      return { platform, kind: "return" as const, aggregateHistory: false };
    }
  }
  return null;
}
