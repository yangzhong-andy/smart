import assert from "node:assert/strict";
import test from "node:test";
import { calculateProfitEstimate, estimatedWarehouseFeeBrl } from "./profit-estimate";

const base = {
  platform: "TIKTOK" as const, quantity: 1, salePriceBrl: 100, exchangeRate: 1.35,
  purchaseCostCny: 30, firstLegCny: 5, adCostCny: 10, warehouseFeeBrl: 3.5,
  platformFeePercent: 0, fulfillmentFeeBrl: 0, lastMileFeeBrl: 0, affiliateFeeBrl: 0, taxPercent: 0,
  invoiceFeePercent: 6, remittanceFeePercent: 1, isCommissionFree: true,
};

test("TikTok BR preserves the exemption-dependent planning fees", () => {
  const free = calculateProfitEstimate(base);
  const paid = calculateProfitEstimate({ ...base, isCommissionFree: false });
  assert.equal(free.platformFeeBrl, 6);
  assert.equal(free.settlementBrl, 94);
  assert.equal(paid.platformFeeBrl, 16);
  assert.equal(paid.settlementBrl, 84);
  assert.ok(paid.netProfitCny < free.netProfitCny);
});

test("Shopee and Mercado Livre use explicit estimated fees and last mile", () => {
  for (const platform of ["SHOPEE", "MERCADO_LIVRE"] as const) {
    const result = calculateProfitEstimate({ ...base, platform, platformFeePercent: 12,
      fulfillmentFeeBrl: 3, lastMileFeeBrl: 5, taxPercent: 2 });
    assert.equal(result.gmvBrl, 100);
    assert.equal(result.platformFeeBrl, 12);
    assert.equal(result.settlementBrl, 80);
    assert.equal(result.lastMileFeeBrl, 5);
    assert.equal(result.taxCostCny, 2.7);
  }
});

test("ad ROI and break-even ROI are distinct and zero ad spend is safe", () => {
  const result = calculateProfitEstimate({ ...base, adCostCny: 0, targetRoi: 3 });
  assert.equal(result.adRoi, 0);
  assert.ok(result.breakEvenRoi > 0);
  assert.equal(result.targetAdBudgetCny, 45);
  assert.equal(result.expectedProfitCny, result.contributionBeforeAdsCny - 45);
  assert.equal(estimatedWarehouseFeeBrl(2, 3), 7.3);
});

test("affiliate commission is a profit cost outside estimated settlement", () => {
  const withoutAffiliate = calculateProfitEstimate(base);
  const withAffiliate = calculateProfitEstimate({ ...base, affiliateFeeBrl: 5 });
  assert.equal(withAffiliate.settlementBrl, withoutAffiliate.settlementBrl);
  assert.equal(withAffiliate.affiliateFeeCny, 6.75);
  assert.equal(withAffiliate.netProfitCny, withoutAffiliate.netProfitCny - 6.75);
});
