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
  orderLines?: Array<{
    unitAmount: number;
    quantity: number;
  }>;
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
  // TikTok's settlement groups SFP and per-item charges under service fees.
  // Keep those charges in the fulfillment column; the platform column is
  // reserved for the percentage commission only.
  const sfpFeeCny = input.gmvCny * input.fulfillmentRatePercent / 100;
  const fixedOrderAndUnitFeeCny = input.convertToCny(
    input.fixedPerOrder + input.fixedPerUnit * input.totalQty,
    input.currency,
  );

  if (input.tiers.length === 0) {
    return {
      platformFeeCny: 0,
      fulfillmentFeeCny: sfpFeeCny + fixedOrderAndUnitFeeCny,
      totalCny: sfpFeeCny + fixedOrderAndUnitFeeCny,
    };
  }

  const fallbackUnitAmount = input.totalQty > 0 ? input.orderAmount / input.totalQty : input.orderAmount;
  const orderLines = (input.orderLines || [])
    .map((line) => ({
      unitAmount: line.unitAmount > 0 ? line.unitAmount : fallbackUnitAmount,
      quantity: Math.max(0, line.quantity),
    }))
    .filter((line) => line.quantity > 0);
  const pricedLines = orderLines.length > 0
    ? orderLines
    : [{ unitAmount: fallbackUnitAmount, quantity: Math.max(0, input.totalQty) }];
  const totalLineAmount = pricedLines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
  let platformFeeCny = 0;
  let perItemServiceFeeCny = 0;
  for (const line of pricedLines) {
    const tier = findProfitPlatformFeeTier(line.unitAmount, input.tiers);
    if (!tier) return { platformFeeCny: 0, fulfillmentFeeCny: 0, totalCny: 0 };
    const lineShare = totalLineAmount > 0
      ? (line.unitAmount * line.quantity) / totalLineAmount
      : line.quantity / Math.max(input.totalQty, 1);
    platformFeeCny += input.gmvCny * lineShare * tier.platformRatePercent / 100;
    perItemServiceFeeCny += input.convertToCny(tier.perUnitFee * line.quantity, tier.currency);
  }
  const fulfillmentFeeCny = sfpFeeCny + fixedOrderAndUnitFeeCny + perItemServiceFeeCny;
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
