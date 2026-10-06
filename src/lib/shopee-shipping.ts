export type ShopeeTailShippingSource = "FINAL_NET_FEE" | "ESTIMATED_NET_FEE" | "MISSING";

type ShopeeTailShippingInput = {
  finalShippingFee?: unknown;
  actualShippingFee?: unknown;
  shopeeShippingRebate?: unknown;
  reverseShippingFee?: unknown;
};

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Shopee's final_shipping_fee is already net of the platform shipping rebate.
 * Subtract the rebate only when final_shipping_fee is unavailable and the
 * estimated net fee must be reconstructed from actual_shipping_fee.
 */
export function calculateShopeeTailShippingCost(input: ShopeeTailShippingInput): {
  amount: number;
  source: ShopeeTailShippingSource;
} {
  const finalShippingFee = amount(input.finalShippingFee);
  const reverseShippingFee = Math.max(0, amount(input.reverseShippingFee) ?? 0);
  if (finalShippingFee !== null) {
    return {
      amount: money(Math.max(0, finalShippingFee) + reverseShippingFee),
      source: "FINAL_NET_FEE",
    };
  }

  const actualShippingFee = amount(input.actualShippingFee);
  if (actualShippingFee !== null) {
    const rebate = Math.max(0, amount(input.shopeeShippingRebate) ?? 0);
    return {
      amount: money(Math.max(0, actualShippingFee - rebate) + reverseShippingFee),
      source: "ESTIMATED_NET_FEE",
    };
  }

  return {
    amount: money(reverseShippingFee),
    source: reverseShippingFee > 0 ? "ESTIMATED_NET_FEE" : "MISSING",
  };
}
