import assert from "node:assert/strict";
import test from "node:test";
import { calculateShopeeTailShippingCost } from "./shopee-shipping";

test("does not subtract the Shopee rebate twice from the final net shipping fee", () => {
  assert.deepEqual(calculateShopeeTailShippingCost({
    finalShippingFee: 0,
    actualShippingFee: 12.04,
    shopeeShippingRebate: 12.04,
    reverseShippingFee: 0,
  }), { amount: 0, source: "FINAL_NET_FEE" });
});

test("uses a nonzero final shipping fee without subtracting the rebate again", () => {
  assert.deepEqual(calculateShopeeTailShippingCost({
    finalShippingFee: 3.5,
    actualShippingFee: 12,
    shopeeShippingRebate: 8.5,
  }), { amount: 3.5, source: "FINAL_NET_FEE" });
});

test("reconstructs the estimated net fee only when the final fee is unavailable", () => {
  assert.deepEqual(calculateShopeeTailShippingCost({
    actualShippingFee: 12,
    shopeeShippingRebate: 8.5,
  }), { amount: 3.5, source: "ESTIMATED_NET_FEE" });
});

test("adds reverse shipping to the platform net shipping cost", () => {
  assert.deepEqual(calculateShopeeTailShippingCost({
    finalShippingFee: 0,
    actualShippingFee: 12.04,
    shopeeShippingRebate: 12.04,
    reverseShippingFee: 4.25,
  }), { amount: 4.25, source: "FINAL_NET_FEE" });
});
