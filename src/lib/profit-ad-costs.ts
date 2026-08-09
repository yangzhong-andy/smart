export type ProfitAdCost = {
  actualSpend: number;
  giftConsumption: number;
  estimatedRebate: number;
  profitCost: number;
};

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateProfitAdCost(
  amount: number,
  giftConsumption: number,
  estimatedRebate: number,
): ProfitAdCost {
  const actualSpend = nonNegative(amount);

  return {
    actualSpend,
    giftConsumption: nonNegative(giftConsumption),
    estimatedRebate: nonNegative(estimatedRebate),
    // Profit uses the platform's full consumption. Gifts and estimated rebates
    // remain informational and do not reduce the advertising cost.
    profitCost: actualSpend,
  };
}
