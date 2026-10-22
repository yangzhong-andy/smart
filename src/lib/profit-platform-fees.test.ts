import assert from "node:assert/strict";
import test from "node:test";
import { calculateEstimatedProfitFees, roundProfitFee, tiktokSellerDiscountedTierLines } from "./profit-platform-fees";

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
  closeTo(result.fulfillmentFeeCny, 28.242);
  assert.equal(roundProfitFee(result.totalCny), 38.48);
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

test("low-value units split 10% commission, 6% SFP, and BRL 4 per-unit fulfillment", () => {
  const result = calculate(48, 2, [{ unitAmount: 24, quantity: 2 }]);
  assert.equal(result.platformFeeCny, 4.8);
  closeTo(result.fulfillmentFeeCny, 10.88);
  closeTo(result.totalCny, 15.68);
});

test("BRL 50 belongs to the high-value tier", () => {
  const result = calculate(50, 1, [{ unitAmount: 50, quantity: 1 }]);
  assert.equal(result.platformFeeCny, 3);
  assert.equal(result.fulfillmentFeeCny, 9);
  assert.equal(result.totalCny, 12);
});

test("high-value screenshot at BRL 51.90 includes separate 6% SFP", () => {
  const result = calculate(51.9, 1, [{ unitAmount: 51.9, quantity: 1 }]);
  assert.equal(roundProfitFee(result.platformFeeCny), 3.11);
  assert.equal(result.fulfillmentFeeCny, 9.114);
  assert.equal(roundProfitFee(roundProfitFee(result.platformFeeCny) + roundProfitFee(result.fulfillmentFeeCny)), 12.22);
});

test("low-value screenshot at BRL 46.60 matches 10% commission, 6% SFP, and BRL 4 per item", () => {
  const result = calculate(46.6, 1, [{ unitAmount: 46.6, quantity: 1 }]);
  assert.equal(roundProfitFee(result.platformFeeCny), 4.66);
  assert.equal(roundProfitFee(result.fulfillmentFeeCny), 6.80);
  assert.equal(roundProfitFee(result.totalCny), 11.46);
  assert.equal(roundProfitFee(46.6 - result.totalCny), 35.14);
});

test("a dated rule with an explicit extra fulfillment rate keeps that historical amount separate", () => {
  const result = calculateEstimatedProfitFees({
    orderAmount: 50, gmvCny: 50, totalQty: 1,
    orderLines: [{ unitAmount: 50, quantity: 1 }],
    fulfillmentRatePercent: 2, fixedPerOrder: 0, fixedPerUnit: 0,
    currency: "BRL", tiers, convertToCny: (amount) => amount,
  });
  assert.equal(result.platformFeeCny, 3);
  assert.equal(result.fulfillmentFeeCny, 7);
  assert.equal(result.totalCny, 10);
});

test("commission uses the seller-price line instead of allocating unrelated order GMV", () => {
  const result = calculateEstimatedProfitFees({
    orderAmount: 45,
    gmvCny: 65,
    totalQty: 1,
    orderLines: [{ unitAmount: 45, quantity: 1 }],
    fulfillmentRatePercent: 0,
    fixedPerOrder: 0,
    fixedPerUnit: 0,
    currency: "BRL",
    tiers,
    convertToCny: (amount) => amount,
  });
  assert.equal(result.platformFeeCny, 4.5);
  assert.equal(result.fulfillmentFeeCny, 4);
  assert.equal(result.totalCny, 8.5);
});

test("TikTok seller-discounted price restores platform subsidy before choosing the tier", () => {
  const lines = tiktokSellerDiscountedTierLines(
    [{ unitSalePrice: 44.5, qty: 1, lineValue: 44.5 }],
    [{ original_price: "148", seller_discount: "97.89" }],
    5.61,
  );
  assert.equal(roundProfitFee(lines[0].unitAmount), 50.11);
  const result = calculate(50.11, 1, lines);
  assert.equal(roundProfitFee(result.platformFeeCny), 3.01);
  assert.equal(roundProfitFee(result.fulfillmentFeeCny), 9.01);
  assert.equal(roundProfitFee(result.totalCny), 12.01);
});

test("mixed TikTok items use their own seller discounts, not an order-level subsidy allocation", () => {
  const lines = tiktokSellerDiscountedTierLines([
    { unitSalePrice: 45.3, qty: 1, lineValue: 45.3 },
    { unitSalePrice: 88.57, qty: 1, lineValue: 88.57 },
  ], [
    { original_price: "148", seller_discount: "94.89" },
    { original_price: "296", seller_discount: "194.2" },
  ], 21.04);
  assert.equal(roundProfitFee(lines[0].unitAmount), 53.11);
  assert.equal(roundProfitFee(lines[1].unitAmount), 101.8);
  const result = calculate(154.91, 2, lines);
  assert.equal(roundProfitFee(result.platformFeeCny), 9.29);
  assert.equal(roundProfitFee(result.fulfillmentFeeCny), 21.29);
  assert.equal(roundProfitFee(result.totalCny), 30.59);
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
  closeTo(result.platformFeeCny, 8.32);
  closeTo(result.fulfillmentFeeCny, 23.392);
  closeTo(result.totalCny, 31.712);
});
