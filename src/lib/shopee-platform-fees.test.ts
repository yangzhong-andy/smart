import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateShopeeFinalAffiliateCommission,
  calculateShopeeOfficialPlatformFees,
} from "./shopee-platform-fees";

test("uses official Commission Fee and Service Fee as Shopee platform costs", () => {
  assert.deepEqual(calculateShopeeOfficialPlatformFees({
    commissionFee: 28.54,
    netCommissionFee: -23.59,
    serviceFee: 44.76,
    netServiceFee: "-37.82",
  }), {
    commissionFee: 23.59,
    serviceFee: 37.82,
    affiliateCommission: 0,
    total: 61.41,
  });
});

test("includes the official AMS affiliate commission in total platform costs", () => {
  assert.deepEqual(calculateShopeeOfficialPlatformFees({
    netCommissionFee: -23.59,
    netServiceFee: -37.82,
    amsCommissionFee: -6.58,
  }), {
    commissionFee: 23.59,
    serviceFee: 37.82,
    affiliateCommission: 6.58,
    total: 67.99,
  });
});

test("falls back to gross fees only when Shopee omits the net fields", () => {
  assert.deepEqual(calculateShopeeOfficialPlatformFees({
    commissionFee: 11.84,
    serviceFee: null,
  }), {
    commissionFee: 11.84,
    serviceFee: 0,
    affiliateCommission: 0,
    total: 11.84,
  });
});

test("only recognizes AMS affiliate commission after final settlement", () => {
  assert.equal(calculateShopeeFinalAffiliateCommission(-6.58, "ACTUAL"), 6.58);
  assert.equal(calculateShopeeFinalAffiliateCommission(-6.58, "ESTIMATED"), 0);
  assert.equal(calculateShopeeFinalAffiliateCommission(-6.58, "MISSING"), 0);
});
