import assert from "node:assert/strict";
import test from "node:test";
import { calculateWarehouseFulfillmentFee } from "./warehouse-fulfillment-fees";

const weightTiers = [
  [0, 1, 2.5],
  [1, 3, 3.5],
  [3, 5, 6],
  [5, 10, 8],
  [10, 20, 14],
  [20, 30, 20],
  [30, 40, 30],
  [40, 50, 33],
  [50, 60, 40],
  [60, 70, 47],
].map(([minWeightKg, maxWeightKg, baseFee]) => ({
  minWeightKg,
  maxWeightKg,
  minInclusive: false,
  maxInclusive: true,
  maxLengthCm: null,
  maxWidthCm: null,
  maxHeightCm: null,
  baseFee,
}));

function calculate(chargeableWeightKg: number, billedUnits = 1) {
  return calculateWarehouseFulfillmentFee({
    pricingMode: "WEIGHT_TIER",
    billedUnits,
    chargeableWeightKg,
    packageLengthCm: 1,
    packageWidthCm: 1,
    packageHeightCm: 1,
    baseOrderFee: 1,
    firstUnitFee: 0,
    additionalUnitFee: 0.5,
    multiSkuFee: 0,
    distinctSkuCount: 1,
    overweightThresholdKg: 70,
    overweightFeePerKg: 0.1,
    feeTiers: weightTiers,
  });
}

test("uses the quoted fee at each inclusive upper boundary", () => {
  assert.equal(calculate(1).fee, 3.5);
  assert.equal(calculate(3).fee, 4.5);
  assert.equal(calculate(5).fee, 7);
  assert.equal(calculate(70).fee, 48);
});

test("adds BRL 1 packaging once and BRL 0.5 for each physical unit after the first", () => {
  assert.equal(calculate(0.8, 3).fee, 4.5);
});

test("adds BRL 0.1 per kg above 70kg", () => {
  assert.equal(calculate(75).fee, 48.5);
});

test("package tiers enforce both weight and sorted dimensions", () => {
  const result = calculateWarehouseFulfillmentFee({
    pricingMode: "PACKAGE_TIER",
    billedUnits: 1,
    chargeableWeightKg: 0.4,
    packageLengthCm: 16,
    packageWidthCm: 8,
    packageHeightCm: 2,
    baseOrderFee: 0,
    firstUnitFee: 0,
    additionalUnitFee: 0,
    overweightThresholdKg: null,
    overweightFeePerKg: 0,
    feeTiers: [
      { minWeightKg: 0, maxWeightKg: 0.5, minInclusive: false, maxInclusive: true, maxLengthCm: 15, maxWidthCm: 10, maxHeightCm: 3, baseFee: 2.5 },
      { minWeightKg: 0, maxWeightKg: 1, minInclusive: false, maxInclusive: true, maxLengthCm: 30, maxWidthCm: 25, maxHeightCm: 3, baseFee: 3 },
    ],
  });
  assert.equal(result.fee, 3);
  assert.equal(result.covered, true);
});

test("promotes a light package to the next tier when its dimensions exceed the lower tier", () => {
  const result = calculateWarehouseFulfillmentFee({
    pricingMode: "PACKAGE_TIER",
    billedUnits: 1,
    chargeableWeightKg: 0.47,
    packageLengthCm: 30,
    packageWidthCm: 15.5,
    packageHeightCm: 3,
    baseOrderFee: 0,
    firstUnitFee: 0,
    additionalUnitFee: 0,
    overweightThresholdKg: null,
    overweightFeePerKg: 0,
    feeTiers: [
      { minWeightKg: 0, maxWeightKg: 0.5, minInclusive: false, maxInclusive: true, maxLengthCm: 15, maxWidthCm: 10, maxHeightCm: 3, baseFee: 2.5 },
      { minWeightKg: 0.5, maxWeightKg: 1, minInclusive: false, maxInclusive: true, maxLengthCm: 30, maxWidthCm: 25, maxHeightCm: 3, baseFee: 3 },
    ],
  });
  assert.equal(result.fee, 3);
  assert.equal(result.covered, true);
});

test("keeps F003-sized parcels in Panlian's first tier while F002 still promotes", () => {
  const feeTiers = [
    { minWeightKg: 0, maxWeightKg: 0.5, minInclusive: false, maxInclusive: true, maxLengthCm: 20, maxWidthCm: 20, maxHeightCm: 10, baseFee: 2.5 },
    { minWeightKg: 0.5, maxWeightKg: 1, minInclusive: false, maxInclusive: true, maxLengthCm: null, maxWidthCm: null, maxHeightCm: null, baseFee: 3 },
  ];
  const input = {
    pricingMode: "WEIGHT_TIER" as const,
    billedUnits: 1,
    baseOrderFee: 0,
    firstUnitFee: 0,
    additionalUnitFee: 0.5,
    overweightThresholdKg: null,
    overweightFeePerKg: 0,
    feeTiers,
  };

  assert.equal(calculateWarehouseFulfillmentFee({ ...input, chargeableWeightKg: 0.05, packageLengthCm: 17, packageWidthCm: 14, packageHeightCm: 6 }).fee, 2.5);
  assert.equal(calculateWarehouseFulfillmentFee({ ...input, chargeableWeightKg: 0.47, packageLengthCm: 30, packageWidthCm: 15.5, packageHeightCm: 11.5 }).fee, 3);
});

test("adds the fixed multi-SKU fee once without affecting one-SKU orders", () => {
  const input = {
    pricingMode: "WEIGHT_TIER" as const,
    billedUnits: 5,
    chargeableWeightKg: 1.51,
    packageLengthCm: 30,
    packageWidthCm: 17,
    packageHeightCm: 12,
    baseOrderFee: 0,
    firstUnitFee: 0,
    additionalUnitFee: 0.5,
    multiSkuFee: 1,
    overweightThresholdKg: null,
    overweightFeePerKg: 0,
    feeTiers: [
      { minWeightKg: 1, maxWeightKg: 2, minInclusive: false, maxInclusive: true, maxLengthCm: null, maxWidthCm: null, maxHeightCm: null, baseFee: 3.5 },
    ],
  };
  assert.equal(calculateWarehouseFulfillmentFee({ ...input, distinctSkuCount: 2 }).fee, 6.5);
  assert.equal(calculateWarehouseFulfillmentFee({ ...input, distinctSkuCount: 1 }).fee, 5.5);
});

test("adds provider packaging tiers and oversize handling without changing operation tiers", () => {
  const result = calculateWarehouseFulfillmentFee({
    pricingMode: "WEIGHT_TIER",
    billedUnits: 2,
    chargeableWeightKg: 4,
    packageLengthCm: 61,
    packageWidthCm: 20,
    packageHeightCm: 10,
    baseOrderFee: 0,
    firstUnitFee: 0,
    additionalUnitFee: 0,
    multiSkuFee: 0,
    distinctSkuCount: 1,
    overweightThresholdKg: null,
    overweightFeePerKg: 0,
    feeTiers: [{ minWeightKg: 3, maxWeightKg: 5, minInclusive: false, maxInclusive: true, maxLengthCm: null, maxWidthCm: null, maxHeightCm: null, baseFee: 6 }],
    packagingFeeTiers: [{ minWeightKg: 3, maxWeightKg: 10, minInclusive: false, maxInclusive: true, baseFee: 10 }],
    oversizeThresholdCm: 60,
    oversizeFee: 26,
  });
  assert.equal(result.operationalFee, 6);
  assert.equal(result.packagingFee, 10);
  assert.equal(result.oversizeFee, 26);
  assert.equal(result.fee, 42);
});

test("does not charge packaging for a single physical unit", () => {
  const result = calculateWarehouseFulfillmentFee({
    pricingMode: "WEIGHT_TIER",
    billedUnits: 1,
    chargeableWeightKg: 2,
    packageLengthCm: 30,
    packageWidthCm: 15,
    packageHeightCm: 10,
    baseOrderFee: 0,
    firstUnitFee: 0,
    additionalUnitFee: 0,
    multiSkuFee: 0,
    distinctSkuCount: 1,
    overweightThresholdKg: null,
    overweightFeePerKg: 0,
    feeTiers: [{ minWeightKg: 1, maxWeightKg: 3, minInclusive: false, maxInclusive: true, maxLengthCm: null, maxWidthCm: null, maxHeightCm: null, baseFee: 3.5 }],
    packagingFeeTiers: [{ minWeightKg: 0, maxWeightKg: 3, minInclusive: false, maxInclusive: true, baseFee: 1 }],
  });
  assert.equal(result.operationalFee, 3.5);
  assert.equal(result.packagingFee, 0);
  assert.equal(result.fee, 3.5);
});
