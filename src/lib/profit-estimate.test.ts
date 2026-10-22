import assert from "node:assert/strict";
import test from "node:test";
import { calculateProfitEstimate, estimatedWarehouseFeeBrl, shopeeCnpjLocalFeeTier } from "./profit-estimate";

const base = {
  platform: "TIKTOK" as const, quantity: 1, salePriceBrl: 100, exchangeRate: 1.35,
  purchaseCostCny: 30, firstLegCny: 5, adCostCny: 10, warehouseFeeBrl: 3.5,
  platformFeePercent: 0, fulfillmentFeeBrl: 0, lastMileFeeBrl: 0, affiliateFeeBrl: 0, taxPercent: 0,
  returnRatePercent: 0, remittanceFeePercent: 1, isCommissionFree: true,
};

test("TikTok BR uses one price-tier commission without extra SFP or exemption switch", () => {
  const high = calculateProfitEstimate(base);
  const low = calculateProfitEstimate({ ...base, discountSalePriceBrl: 49, quantity: 2 });
  assert.equal(high.platformFeeBrl, 6);
  assert.equal(high.fulfillmentFeeBrl, 6);
  assert.equal(high.settlementBrl, 88);
  assert.equal(low.platformFeeBrl, 9.8);
  assert.equal(low.fulfillmentFeeBrl, 8);
  assert.equal(low.settlementBrl, 80.2);
  assert.equal(calculateProfitEstimate({ ...base, isCommissionFree: false, platformFeePercent: 99 }).platformFeeBrl, 6);
});

test("TikTok commission breakdown preserves the same total and settlement", () => {
  const high = calculateProfitEstimate({ ...base, salePriceBrl: 70 });
  assert.equal(high.tiktokCommissionRatePercent, 6);
  assert.equal(high.tiktokPercentageFeeBrl, 4.2);
  assert.equal(high.tiktokFixedFeeBrl, 6);
  assert.equal(high.platformFeeBrl, high.tiktokPercentageFeeBrl);
  assert.equal(high.fulfillmentFeeBrl, high.tiktokFixedFeeBrl);
  assert.equal(high.platformFeeBrl + high.fulfillmentFeeBrl, high.tiktokCommissionBrl);
  assert.equal(high.settlementBrl, 59.8);

  const low = calculateProfitEstimate({ ...base, salePriceBrl: 49, quantity: 2 });
  assert.equal(low.tiktokCommissionRatePercent, 10);
  assert.equal(low.tiktokPercentageFeeBrl, 9.8);
  assert.equal(low.tiktokFixedFeeBrl, 8);
  assert.equal(low.platformFeeBrl + low.fulfillmentFeeBrl, 17.8);
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

test("Shopee CNPJ local commission tiers split percentage and fixed per-item charge", () => {
  const cases = [
    { price: 79.99, percent: 20, fixed: 4.5 },
    { price: 80, percent: 14, fixed: 16 },
    { price: 99.99, percent: 14, fixed: 16 },
    { price: 100, percent: 14, fixed: 20 },
    { price: 199.99, percent: 14, fixed: 20 },
    { price: 200, percent: 14, fixed: 26 },
  ];
  for (const { price, percent, fixed } of cases) {
    assert.deepEqual(shopeeCnpjLocalFeeTier(price), { ratePercent: percent, fixedFeePerItemBrl: fixed });
    const result = calculateProfitEstimate({ ...base, platform: "SHOPEE", shopeeFeeMode: "CNPJ_LOCAL",
      salePriceBrl: price, quantity: 2, platformFeePercent: 99 });
    assert.equal(result.platformFeeBrl, price * 2 * percent / 100);
    assert.equal(result.fulfillmentFeeBrl, fixed * 2);
    assert.equal(result.settlementBrl, result.gmvBrl - result.platformFeeBrl - result.fulfillmentFeeBrl);
  }
});

test("Shopee CNPJ tier uses discount price; manual and other platforms stay unchanged", () => {
  const discounted = calculateProfitEstimate({ ...base, platform: "SHOPEE", shopeeFeeMode: "CNPJ_LOCAL",
    salePriceBrl: 100, discountSalePriceBrl: 79.99, quantity: 1 });
  assert.equal(discounted.shopeeCommissionRatePercent, 20);
  assert.equal(discounted.shopeeFixedFeePerItemBrl, 4.5);
  const manual = calculateProfitEstimate({ ...base, platform: "SHOPEE", shopeeFeeMode: "MANUAL",
    platformFeePercent: 12, fulfillmentFeeBrl: 3 });
  assert.equal(manual.platformFeeBrl, 12);
  assert.equal(manual.fulfillmentFeeBrl, 3);
  const mercado = calculateProfitEstimate({ ...base, platform: "MERCADO_LIVRE", shopeeFeeMode: "CNPJ_LOCAL",
    platformFeePercent: 12 });
  assert.equal(mercado.platformFeeBrl, 12);
  assert.equal(mercado.fulfillmentFeeBrl, 0);
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

test("return rate deducts expected settlement loss from profit without changing pre-return settlement", () => {
  const withoutReturns = calculateProfitEstimate({ ...base, platform: "SHOPEE", shopeeFeeMode: "CNPJ_LOCAL",
    salePriceBrl: 100, quantity: 2, exchangeRate: 1.3 });
  const withReturns = calculateProfitEstimate({ ...base, platform: "SHOPEE", shopeeFeeMode: "CNPJ_LOCAL",
    salePriceBrl: 100, quantity: 2, exchangeRate: 1.3, returnRatePercent: 5 });
  assert.equal(withReturns.settlementBrl, withoutReturns.settlementBrl);
  assert.equal(withReturns.returnLossCny, withoutReturns.settlementBrl * 1.3 * 0.05);
  assert.equal(withReturns.netProfitCny, withoutReturns.netProfitCny - withReturns.returnLossCny);
  assert.equal(withReturns.breakEvenAdCostCny, withoutReturns.breakEvenAdCostCny - withReturns.returnLossCny);
});
