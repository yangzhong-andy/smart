import assert from "node:assert/strict";
import test from "node:test";
import { tiktokShopProductDiscountOriginal } from "./profit-gmv";

test("excludes the payment platform discount from TikTok Shop product discount", () => {
  const discount = tiktokShopProductDiscountOriginal({
    payment: {
      platform_discount: "10.08",
      payment_platform_discount: "2.18",
    },
  });

  assert.equal(discount, 7.9);
});

test("keeps a platform product discount when there is no payment discount", () => {
  assert.equal(tiktokShopProductDiscountOriginal({
    payment: { platform_discount: "7.90" },
  }), 7.9);
});

test("does not treat a payment platform discount as product GMV", () => {
  assert.equal(tiktokShopProductDiscountOriginal({
    payment: { payment_platform_discount: "2.18" },
  }), 0);
});

test("never returns a negative product discount", () => {
  assert.equal(tiktokShopProductDiscountOriginal({
    payment: {
      platform_discount: "1.00",
      payment_platform_discount: "2.00",
    },
  }), 0);
});
