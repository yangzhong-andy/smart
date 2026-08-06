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

function calculate(orderAmount: number, totalQty: number, orderLines?: Array<{ unitAmount: number; quantity: number }>) {
  return calculateEstimatedProfitFees({
    orderAmount,
    gmvCny: orderAmount,
    totalQty,
    orderLines,
    fulfillmentRatePercent: 6,
    fixedPerOrder: 0,
    fixedPerUnit: 0,
    currency: "BRL",
    tiers,
    convertToCny: (amount) => amount,
  });
}

test("low-value units use platform 10%, fulfillment 6%, and BRL 4 per unit", () => {
  const result = calculate(48, 2, [{ unitAmount: 24, quantity: 2 }]);
  assert.equal(result.platformFeeCny, 12.8);
  assert.equal(result.fulfillmentFeeCny, 2.88);
  assert.equal(result.totalCny, 15.68);
});

test("BRL 50 belongs to the high-value tier", () => {
  const result = calculate(50, 1, [{ unitAmount: 50, quantity: 1 }]);
  assert.equal(result.platformFeeCny, 9);
  assert.equal(result.fulfillmentFeeCny, 3);
  assert.equal(result.totalCny, 12);
});

test("a high order total still uses the low tier when each unit is below BRL 50", () => {
  const result = calculate(80, 2, [{ unitAmount: 40, quantity: 2 }]);
  assert.equal(result.platformFeeCny, 16);
  assert.equal(result.fulfillmentFeeCny, 4.8);
  assert.equal(result.totalCny, 20.8);
});

test("mixed-price orders apply the tier to each line and multiply fixed fees by quantity", () => {
  const result = calculate(123.2, 3, [
    { unitAmount: 23.2, quantity: 1 },
    { unitAmount: 50, quantity: 2 },
  ]);
  assert.equal(result.platformFeeCny, 24.32);
  assert.equal(result.fulfillmentFeeCny, 7.392);
  assert.equal(result.totalCny, 31.712);
});
