function absoluteAmount(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

/**
 * TikTok's platform_discount also includes payment_platform_discount.
 * Only the remaining TikTok Shop product discount is added back to GMV.
 */
export function tiktokShopProductDiscountOriginal(rawData: unknown): number {
  const payment = rawData && typeof rawData === "object" ? (rawData as any).payment : null;
  const platformDiscount = absoluteAmount(payment?.platform_discount);
  if (platformDiscount == null) return 0;

  const paymentPlatformDiscount = absoluteAmount(payment?.payment_platform_discount) || 0;
  return Math.max(0, platformDiscount - paymentPlatformDiscount);
}
