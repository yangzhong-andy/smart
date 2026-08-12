export type TikTokAffiliateCommissionBreakdown = {
  organic: number;
  ads: number;
  total: number;
};

function amount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cost(value: unknown): number {
  const result = -amount(value);
  return Object.is(result, -0) ? 0 : result;
}

/**
 * TikTok records costs as negative values in a settlement transaction.
 * Keep any positive reversals negative here so refunds reduce the cost.
 */
export function tiktokAffiliateCommissionCost(
  rawData: unknown,
): TikTokAffiliateCommissionBreakdown {
  const fee = rawData && typeof rawData === "object"
    ? (rawData as { fee_tax_breakdown?: { fee?: Record<string, unknown> } }).fee_tax_breakdown?.fee
    : undefined;
  const organic = cost(fee?.affiliate_commission_amount);
  const ads = cost(fee?.affiliate_ads_commission_amount);

  return {
    organic,
    ads,
    total: organic + ads || 0,
  };
}
