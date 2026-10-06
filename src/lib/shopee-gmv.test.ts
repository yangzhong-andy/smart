import assert from "node:assert/strict";
import test from "node:test";
import { calculateShopeeMerchandiseSubtotal } from "./shopee-gmv";

test("uses the official Merchandise Subtotal from buyer payment information", () => {
  const gmv = calculateShopeeMerchandiseSubtotal({
    settlement: {
      rawData: {
        buyer_payment_info: {
          buyer_total_amount: 74.54,
          merchant_subtotal: 65.8,
          shopee_voucher: -3.3,
          shipping_fee: 12.04,
        },
      },
    },
    order: { totalAmount: 74.54, actualShippingFee: 12.04 },
  });

  assert.deepEqual(gmv, {
    amount: 62.5,
    source: "OFFICIAL_MERCHANDISE_SUBTOTAL",
  });
});

test("calculates GMV as Product Price less the Shopee Voucher", () => {
  const gmv = calculateShopeeMerchandiseSubtotal({
    settlement: {
      rawData: {
        buyer_payment_info: {
          buyer_total_amount: 74.54,
          merchant_subtotal: 65.8,
          shopee_voucher: -3.3,
          shipping_fee: 12.04,
        },
      },
    },
    order: {},
  });

  assert.equal(gmv.amount, 62.5);
});

test("uses the order income Product Price and Shopee Voucher fields when needed", () => {
  const gmv = calculateShopeeMerchandiseSubtotal({
    settlement: {
      rawData: {
        order_income: {
          order_selling_price: 65.8,
          voucher_from_shopee: 3.3,
        },
      },
    },
    order: {},
  });

  assert.deepEqual(gmv, {
    amount: 62.5,
    source: "OFFICIAL_MERCHANDISE_SUBTOTAL",
  });
});

test("does not derive official GMV from buyer payment and shipping", () => {
  const gmv = calculateShopeeMerchandiseSubtotal({
    settlement: {
      rawData: {
        buyer_payment_info: {
          buyer_total_amount: 74.54,
          shipping_fee: 12.04,
        },
      },
    },
    order: {
      totalAmount: 80,
      items: [{ discountedPrice: 65.8, quantity: 1 }],
    },
  });

  assert.deepEqual(gmv, {
    amount: 65.8,
    source: "ITEM_DISCOUNTED_SUBTOTAL",
  });
});

test("estimates merchandise subtotal from order total less buyer shipping", () => {
  const gmv = calculateShopeeMerchandiseSubtotal({
    order: { totalAmount: 74.54, actualShippingFee: 12.04 },
  });

  assert.deepEqual(gmv, {
    amount: 62.5,
    source: "ORDER_TOTAL_LESS_SHIPPING",
  });
});

test("falls back to the discounted item subtotal when order shipping is unavailable", () => {
  const gmv = calculateShopeeMerchandiseSubtotal({
    order: {
      totalAmount: 80,
      items: [
        { discountedPrice: 12.5, originalPrice: 15, quantity: 2 },
        { originalPrice: 7, quantity: 1 },
      ],
    },
  });

  assert.deepEqual(gmv, {
    amount: 32,
    source: "ITEM_DISCOUNTED_SUBTOTAL",
  });
});
