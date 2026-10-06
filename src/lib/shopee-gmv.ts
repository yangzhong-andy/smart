export type ShopeeGmvSource =
  | "OFFICIAL_MERCHANDISE_SUBTOTAL"
  | "ORDER_TOTAL_LESS_SHIPPING"
  | "ITEM_DISCOUNTED_SUBTOTAL"
  | "ORDER_TOTAL_FALLBACK"
  | "MISSING";

type ShopeeGmvItem = {
  quantity?: unknown;
  discountedPrice?: unknown;
  originalPrice?: unknown;
};

type ShopeeGmvInput = {
  settlement?: { rawData?: unknown } | null;
  order: {
    totalAmount?: unknown;
    actualShippingFee?: unknown;
    estimatedShippingFee?: unknown;
    items?: ShopeeGmvItem[];
  };
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function result(value: number, source: ShopeeGmvSource) {
  return { amount: money(Math.max(0, value)), source };
}

export function calculateShopeeMerchandiseSubtotal(input: ShopeeGmvInput): {
  amount: number;
  source: ShopeeGmvSource;
} {
  const rawData = record(input.settlement?.rawData);
  const buyerPayment = record(rawData?.buyer_payment_info);
  const orderIncome = record(rawData?.order_income);
  const productPrice = amount(buyerPayment?.merchant_subtotal);
  const shopeeVoucher = amount(buyerPayment?.shopee_voucher);
  if (productPrice !== null) {
    return result(productPrice - Math.abs(shopeeVoucher ?? 0), "OFFICIAL_MERCHANDISE_SUBTOTAL");
  }

  const incomeProductPrice = amount(orderIncome?.order_selling_price);
  const incomeShopeeVoucher = amount(orderIncome?.voucher_from_shopee);
  if (incomeProductPrice !== null) {
    return result(
      incomeProductPrice - Math.abs(incomeShopeeVoucher ?? 0),
      "OFFICIAL_MERCHANDISE_SUBTOTAL",
    );
  }

  const explicitSubtotal = amount(buyerPayment?.merchandise_subtotal);
  if (explicitSubtotal !== null) {
    return result(explicitSubtotal, "OFFICIAL_MERCHANDISE_SUBTOTAL");
  }

  const orderTotal = amount(input.order.totalAmount);
  const shippingFee = amount(input.order.actualShippingFee ?? input.order.estimatedShippingFee);
  if (orderTotal !== null && shippingFee !== null) {
    return result(orderTotal - shippingFee, "ORDER_TOTAL_LESS_SHIPPING");
  }

  const items = input.order.items || [];
  const itemSubtotal = items.reduce((sum, item) => {
    const unitPrice = amount(item.discountedPrice ?? item.originalPrice);
    const quantity = amount(item.quantity);
    return sum + (unitPrice === null || quantity === null ? 0 : unitPrice * Math.max(0, quantity));
  }, 0);
  if (itemSubtotal > 0) return result(itemSubtotal, "ITEM_DISCOUNTED_SUBTOTAL");
  if (orderTotal !== null) return result(orderTotal, "ORDER_TOTAL_FALLBACK");
  return result(0, "MISSING");
}
