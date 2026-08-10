export type UsTikTokFinancialInput = {
  source?: string | null;
  revenueAmount?: unknown;
  referralFeeAmount?: unknown;
  smartPromotionFeeAmount?: unknown;
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
  return {
    gmvOriginal: useFinancialGmv ? revenueAmount : fallbackGmvOriginal,
    platformFeeOriginal: -number(financial.referralFeeAmount),
    smartPromotionFeeOriginal: -number(financial.smartPromotionFeeAmount),
    lastMileLogisticsOriginal: -number(financial.shippingCostAmount),
  };
}
