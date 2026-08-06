export type ProfitPlatformFeeTierInput = {
  minOrderAmount: number | null;
  maxOrderAmount: number | null;
  minInclusive: boolean;
  maxInclusive: boolean;
  platformRatePercent: number;
  perUnitFee: number;
  currency: string;
};

export type ProfitFeeBreakdown = {
  platformFeeCny: number;
  fulfillmentFeeCny: number;
  totalCny: number;
};

type EstimateInput = {
  orderAmount: number;
  gmvCny: number;
  totalQty: number;
  fulfillmentRatePercent: number;
  fixedPerOrder: number;
  fixedPerUnit: number;
  currency: string;
  tiers: ProfitPlatformFeeTierInput[];
  convertToCny: (amount: number, currency: string) => number;
};

export function findProfitPlatformFeeTier(
  orderAmount: number,
  tiers: ProfitPlatformFeeTierInput[],
) {
  return tiers.find((tier) => {
    const aboveMin = tier.minOrderAmount == null
      || (tier.minInclusive ? orderAmount >= tier.minOrderAmount : orderAmount > tier.minOrderAmount);
    const belowMax = tier.maxOrderAmount == null
      || (tier.maxInclusive ? orderAmount <= tier.maxOrderAmount : orderAmount < tier.maxOrderAmount);
    return aboveMin && belowMax;
  });
}

export function calculateEstimatedProfitFees(input: EstimateInput): ProfitFeeBreakdown {
  const fulfillmentFeeCny = input.gmvCny * input.fulfillmentRatePercent / 100;
  const fixedRuleFeeCny = input.convertToCny(
    input.fixedPerOrder + input.fixedPerUnit * input.totalQty,
    input.currency,
  );

  if (input.tiers.length === 0) {
    return {
      platformFeeCny: fixedRuleFeeCny,
      fulfillmentFeeCny,
      totalCny: fixedRuleFeeCny + fulfillmentFeeCny,
    };
  }

  const tier = findProfitPlatformFeeTier(input.orderAmount, input.tiers);
  if (!tier) return { platformFeeCny: 0, fulfillmentFeeCny: 0, totalCny: 0 };

  const platformFeeCny = (input.gmvCny * tier.platformRatePercent / 100)
    + input.convertToCny(tier.perUnitFee * input.totalQty, tier.currency)
    + fixedRuleFeeCny;
  return {
    platformFeeCny,
    fulfillmentFeeCny,
    totalCny: platformFeeCny + fulfillmentFeeCny,
  };
}

export function allocateActualFeeTotal(
  totalCny: number,
  reference: Pick<ProfitFeeBreakdown, "platformFeeCny" | "fulfillmentFeeCny">,
): ProfitFeeBreakdown {
  const referenceTotal = reference.platformFeeCny + reference.fulfillmentFeeCny;
  if (Math.abs(referenceTotal) < 0.000001) {
    return { platformFeeCny: totalCny, fulfillmentFeeCny: 0, totalCny };
  }
  const scale = totalCny / referenceTotal;
  return {
    platformFeeCny: reference.platformFeeCny * scale,
    fulfillmentFeeCny: reference.fulfillmentFeeCny * scale,
    totalCny,
  };
}
