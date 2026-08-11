import assert from "node:assert/strict";
import test from "node:test";
import { calculateEstimatedProfitFees, roundProfitFee } from "./profit-platform-fees";

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

test("rounds platform and fulfillment fees to two decimals", () => {
  assert.equal(roundProfitFee(28.242), 28.24);
  assert.equal(roundProfitFee(28.245), 28.25);
  assert.equal(roundProfitFee(-28.245), -28.25);
});

test("order 585345496811538276 uses the fixed Brazil fee formula", () => {
  const result = calculate(170.7, 3, [{ unitAmount: 56.9, quantity: 3 }]);
  assert.equal(roundProfitFee(result.platformFeeCny), 10.24);
  assert.equal(roundProfitFee(result.fulfillmentFeeCny), 28.24);
});

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

function closeTo(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be close to ${expected}`);
}

test("low-value units use platform 10%, fulfillment 6%, and BRL 4 per unit", () => {
  const result = calculate(48, 2, [{ unitAmount: 24, quantity: 2 }]);
  assert.equal(result.platformFeeCny, 4.8);
  closeTo(result.fulfillmentFeeCny, 10.88);
  assert.equal(result.totalCny, 15.68);
});

test("BRL 50 belongs to the high-value tier", () => {
  const result = calculate(50, 1, [{ unitAmount: 50, quantity: 1 }]);
  assert.equal(result.platformFeeCny, 3);
  assert.equal(result.fulfillmentFeeCny, 9);
  assert.equal(result.totalCny, 12);
});

test("a high order total still uses the low tier when each unit is below BRL 50", () => {
  const result = calculate(80, 2, [{ unitAmount: 40, quantity: 2 }]);
  assert.equal(result.platformFeeCny, 8);
  assert.equal(result.fulfillmentFeeCny, 12.8);
  assert.equal(result.totalCny, 20.8);
});

test("mixed-price orders apply the tier to each line and multiply fixed fees by quantity", () => {
  const result = calculate(123.2, 3, [
    { unitAmount: 23.2, quantity: 1 },
    { unitAmount: 50, quantity: 2 },
  ]);
  assert.equal(result.platformFeeCny, 8.32);
  assert.equal(result.fulfillmentFeeCny, 23.392);
  assert.equal(result.totalCny, 31.712);
});
