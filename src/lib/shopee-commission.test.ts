import assert from "node:assert/strict";
import test from "node:test";
import { calculateShopeeCommission, isShopeePixPayment, shopeeCommissionTier } from "./shopee-commission";

test("uses the requested Shopee commission boundaries", () => {
  assert.deepEqual(shopeeCommissionTier(79.99), { rate: 0.2, fixedFee: 4, pixSubsidyRate: 0 });
  assert.deepEqual(shopeeCommissionTier(80), { rate: 0.14, fixedFee: 16, pixSubsidyRate: 0.05 });
  assert.deepEqual(shopeeCommissionTier(100), { rate: 0.14, fixedFee: 20, pixSubsidyRate: 0.05 });
  assert.deepEqual(shopeeCommissionTier(200), { rate: 0.14, fixedFee: 26, pixSubsidyRate: 0.05 });
  assert.deepEqual(shopeeCommissionTier(500), { rate: 0.14, fixedFee: 26, pixSubsidyRate: 0.08 });
});

test("charges the fixed commission for every sold unit", () => {
  assert.deepEqual(calculateShopeeCommission([{ unitPrice: 65.8, quantity: 2 }], "Credit Card"), {
    grossCommission: 34.32,
    pixSubsidy: 0,
    netCommission: 34.32,
    isPix: false,
  });
});

test("adds mixed SKU tiers and deducts the Pix subsidy", () => {
  assert.deepEqual(calculateShopeeCommission([
    { unitPrice: 65.8, quantity: 1 },
    { unitPrice: 118.9, quantity: 2 },
    { unitPrice: 500, quantity: 1 },
  ], "Google Pay Pix"), {
    grossCommission: 186.45,
    pixSubsidy: 51.89,
    netCommission: 134.56,
    isPix: true,
  });
});

test("recognizes only payment methods containing Pix", () => {
  assert.equal(isShopeePixPayment("Pix"), true);
  assert.equal(isShopeePixPayment("Google Pay Pix"), true);
  assert.equal(isShopeePixPayment("Credit Card"), false);
});
