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

export function roundProfitFee(value: number, digits = 2): number {
  const factor = 10 ** digits;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor;
}

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

/** TikTok's sale_price includes platform discounts; use seller discount fields when present. */
export function tiktokSellerDiscountedTierLines(
  lines: Array<{ unitSalePrice: number; qty: number; lineValue: number }>,
  rawItems: unknown[],
  platformProductDiscount: number,
) {
  const totalLineValue = lines.reduce((sum, line) => sum + Math.max(0, line.lineValue), 0);
  const totalQty = lines.reduce((sum, line) => sum + Math.max(1, line.qty), 0);
  return lines.map((line, index) => {
    const raw = rawItems[index] && typeof rawItems[index] === "object"
      ? rawItems[index] as Record<string, unknown> : null;
    const original = raw?.original_price == null ? NaN : Number(raw.original_price);
    const sellerDiscount = raw?.seller_discount == null ? NaN : Number(raw.seller_discount);
    const directSellerPrice = Number.isFinite(original) && Number.isFinite(sellerDiscount)
      && original >= sellerDiscount && sellerDiscount >= 0
      ? original - sellerDiscount : null;
    const quantity = Math.max(1, line.qty);
    const lineShare = totalLineValue > 0
      ? Math.max(0, line.lineValue) / totalLineValue
      : quantity / Math.max(1, totalQty);
    return {
      unitAmount: Math.max(0, directSellerPrice
        ?? line.unitSalePrice + Math.max(0, platformProductDiscount) * lineShare / quantity),
      quantity,
    };
  });
}

export function calculateEstimatedProfitFees(input: EstimateInput): ProfitFeeBreakdown {
  // A tiered rule with no separate fulfillment rate is one commission:
  // percentage plus its per-item charge. Keep legacy dated rules with an
  // explicit fulfillment rate reproducible for historical periods.
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
  let platformFeeCny = 0;
  let perItemServiceFeeCny = 0;
  for (const line of pricedLines) {
    const tier = findProfitPlatformFeeTier(line.unitAmount, input.tiers);
    if (!tier) return { platformFeeCny: 0, fulfillmentFeeCny: 0, totalCny: 0 };
    // Compute commission from each seller-discounted unit price. Allocating
    // order GMV by line share can shift mixed-price orders across fee tiers.
    platformFeeCny += input.convertToCny(
      line.unitAmount * line.quantity * tier.platformRatePercent / 100,
      tier.currency,
    );
    perItemServiceFeeCny += input.convertToCny(tier.perUnitFee * line.quantity, tier.currency);
  }
  const singleTierCommission = input.fulfillmentRatePercent === 0;
  if (singleTierCommission) platformFeeCny += perItemServiceFeeCny;
  const fulfillmentFeeCny = sfpFeeCny + fixedOrderAndUnitFeeCny
    + (singleTierCommission ? 0 : perItemServiceFeeCny);
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
