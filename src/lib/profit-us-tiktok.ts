export type UsTikTokFinancialInput = {
  source?: string | null;
  revenueAmount?: unknown;
  feeTaxAmount?: unknown;
  referralFeeAmount?: unknown;
  smartPromotionFeeAmount?: unknown;
  affiliateCommissionAmount?: unknown;
  shippingCostAmount?: unknown;
};

export type UsTikTokProfitInput = {
  gmvOriginal: number;
  platformFeeOriginal: number;
  smartPromotionFeeOriginal: number;
  lastMileLogisticsOriginal: number;
};

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function usTikTokProfitInput(
  financial: UsTikTokFinancialInput | null | undefined,
  fallbackGmvOriginal: number,
): UsTikTokProfitInput {
  if (!financial) {
    return {
      gmvOriginal: fallbackGmvOriginal,
      platformFeeOriginal: 0,
      smartPromotionFeeOriginal: 0,
      lastMileLogisticsOriginal: 0,
    };
  }

  const revenueAmount = number(financial.revenueAmount);
  const useFinancialGmv = financial.source === "SETTLED" || revenueAmount !== 0;
  // The official fee/tax total includes referral, smart promotion, affiliate,
  // and other platform service fees. Affiliate and smart promotion are shown
  // separately in the profit scheme; deduct only the remaining part here.
  // Fall back to referral when an older snapshot has no fee total.
  const platformFeeOriginal = financial.feeTaxAmount == null
    ? -number(financial.referralFeeAmount)
    : -(number(financial.feeTaxAmount)
      - number(financial.smartPromotionFeeAmount)
      - number(financial.affiliateCommissionAmount));
  return {
    gmvOriginal: useFinancialGmv ? revenueAmount : fallbackGmvOriginal,
    platformFeeOriginal: Math.round(platformFeeOriginal * 10_000) / 10_000,
    smartPromotionFeeOriginal: -number(financial.smartPromotionFeeAmount),
    lastMileLogisticsOriginal: -number(financial.shippingCostAmount),
  };
}
