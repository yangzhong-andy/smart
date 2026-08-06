import assert from "node:assert/strict";
import test from "node:test";
import { calculateEstimatedProfitFees } from "./profit-platform-fees";

const tiers = [
  {
    minOrderAmount: null,
    maxOrderAmount: 50,
    minInclusive: true,
    maxInclusive: false,
    platformRatePercent: 10,
    perUnitFee: 4,
    currency: "BRL",
  },
  {
    minOrderAmount: 50,
    maxOrderAmount: null,
    minInclusive: true,
    maxInclusive: false,
    platformRatePercent: 6,
    perUnitFee: 6,
    currency: "BRL",
  },
];

function calculate(orderAmount: number, totalQty: number) {
  return calculateEstimatedProfitFees({
    orderAmount,
    gmvCny: orderAmount,
    totalQty,
    fulfillmentRatePercent: 6,
    fixedPerOrder: 0,
    fixedPerUnit: 0,
    currency: "BRL",
    tiers,
    convertToCny: (amount) => amount,
  });
}

test("low-value order uses platform 10%, fulfillment 6%, and BRL 4 per unit", () => {
  const result = calculate(48, 2);
  assert.equal(result.platformFeeCny, 12.8);
  assert.equal(result.fulfillmentFeeCny, 2.88);
  assert.equal(result.totalCny, 15.68);
});

test("BRL 50 belongs to the high-value tier", () => {
  const result = calculate(50, 1);
  assert.equal(result.platformFeeCny, 9);
  assert.equal(result.fulfillmentFeeCny, 3);
  assert.equal(result.totalCny, 12);
});

test("high-value multi-unit order multiplies the BRL 6 fee by quantity", () => {
  const result = calculate(80, 2);
  assert.equal(result.platformFeeCny, 16.8);
  assert.equal(result.fulfillmentFeeCny, 4.8);
  assert.equal(result.totalCny, 21.6);
});
