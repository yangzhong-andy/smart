const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK: "TikTok",
  SHOPEE: "Shopee",
  MERCADO_LIVRE: "Mercado Livre",
  AMAZON: "Amazon",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  OTHER: "其他",
};

export function cashFlowPlatformLabel(value: string | null | undefined): string {
  const platform = value?.trim() || "";
  return PLATFORM_LABELS[platform.toUpperCase().replace(/\s+/g, "_")] || platform;
}
