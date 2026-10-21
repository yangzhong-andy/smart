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
  // Prefer Shopee's final merchandise subtotal when the official detail
  // provides it. It already includes the checkout discounts.
  const explicitSubtotal = amount(
    buyerPayment?.merchandise_subtotal
      ?? orderIncome?.merchandise_subtotal,
  );
  if (explicitSubtotal !== null) {
    return result(explicitSubtotal, "OFFICIAL_MERCHANDISE_SUBTOTAL");
  }

  const productPrice = amount(buyerPayment?.merchant_subtotal);
  // Brazil buyer-payment fields: PIX discount plus seller/Shopee vouchers.
  // seller_discount is the list-price reduction already reflected in
  // merchant_subtotal and must not be deducted a second time.
  const pixDiscount = amount(buyerPayment?.discount_pix);
  const sellerVoucher = amount(buyerPayment?.seller_voucher);
  const shopeeVoucher = amount(buyerPayment?.shopee_voucher);
  if (productPrice !== null) {
    return result(
      productPrice
        - Math.abs(pixDiscount ?? 0)
        - Math.abs(sellerVoucher ?? 0)
        - Math.abs(shopeeVoucher ?? 0),
      "OFFICIAL_MERCHANDISE_SUBTOTAL",
    );
  }

  const incomeProductPrice = amount(orderIncome?.order_selling_price);
  const incomePixDiscount = amount(orderIncome?.pix_discount);
  const incomeSellerVoucher = amount(orderIncome?.voucher_from_seller);
  const incomeShopeeVoucher = amount(orderIncome?.voucher_from_shopee);
  if (incomeProductPrice !== null) {
    return result(
      incomeProductPrice
        - Math.abs(incomePixDiscount ?? 0)
        - Math.abs(incomeSellerVoucher ?? 0)
        - Math.abs(incomeShopeeVoucher ?? 0),
      "OFFICIAL_MERCHANDISE_SUBTOTAL",
    );
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
