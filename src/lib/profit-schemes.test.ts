import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProfitComponentAmounts,
  contributionProfitFromComponents,
  defaultProfitComponents,
  normalizeCountryCode,
  validateProfitComponents,
} from "./profit-schemes";

test("normalizes supported country labels", () => {
  assert.equal(normalizeCountryCode("巴西"), "BR");
  assert.equal(normalizeCountryCode("美国"), "US");
});

test("provides Brazil TikTok labels without changing source keys", () => {
  const components = defaultProfitComponents("BR", "TIKTOK");
  assert.match(components.find((item) => item.code === "GMV")?.label || "", /TikTok商品补贴/);
  assert.equal(components.find((item) => item.code === "GMV")?.sourceKey, "gmvCny");
  const affiliate = components.find((item) => item.code === "AFFILIATE_COMMISSION");
  assert.equal(affiliate?.sourceKey, "affiliateCommissionCny");
  assert.equal(affiliate?.includeInProfit, true);
});

test("provides the independent US TikTok profit fields", () => {
  const components = defaultProfitComponents("US", "TIKTOK");
  assert.deepEqual(components.map((item) => item.code), [
    "GMV",
    "PLATFORM_FEE",
    "SMART_PROMOTION_FEE",
    "AFFILIATE_COMMISSION",
    "PRODUCT_COST",
    "FIRST_MILE_LOGISTICS",
    "LAST_MILE_LOGISTICS",
    "WAREHOUSE_FULFILLMENT",
    "AD_COST",
  ]);
  assert.equal(components.find((item) => item.code === "SMART_PROMOTION_FEE")?.sourceKey, "smartPromotionFeeCny");
  assert.equal(components.find((item) => item.code === "AFFILIATE_COMMISSION")?.sourceKey, "affiliateCommissionCny");
  assert.equal(components.find((item) => item.code === "LAST_MILE_LOGISTICS")?.sourceKey, "lastMileLogisticsCostCny");
  assert.equal(components.some((item) => item.code === "TAX_COST"), false);
});

test("keeps Mercado Livre four platform fees separate while deducting their total", () => {
  const definitions = defaultProfitComponents("BR", "MERCADO_LIVRE");
  const amounts = buildProfitComponentAmounts({
    gmvCny: 100,
    mercadoLivreFinancingFeeCny: 4,
    mercadoLivreProcessingFeeCny: 3,
    mercadoLivreSaleCommissionCny: 12,
    mercadoLivreSellerShippingFeeCny: 21,
    componentOriginalAmounts: {
      ML_FINANCING_FEE: { BRL: 4.57 },
      ML_PROCESSING_FEE: { BRL: 3.51 },
      ML_SALE_COMMISSION: { BRL: 12.98 },
      ML_SELLER_SHIPPING: { BRL: 21.65 },
    },
  }, definitions);
  assert.deepEqual(amounts.filter((item) => item.category === "PLATFORM").map((item) => item.code), [
    "ML_FINANCING_FEE",
    "ML_PROCESSING_FEE",
    "ML_SALE_COMMISSION",
    "ML_SELLER_SHIPPING",
  ]);
  assert.equal(contributionProfitFromComponents(amounts), 60);
  assert.deepEqual(amounts.find((item) => item.code === "ML_PROCESSING_FEE")?.originalAmounts, { BRL: 3.51 });
});

test("requires a GMV revenue component", () => {
  const result = validateProfitComponents([{ ...defaultProfitComponents("BR", "TIKTOK")[1] }]);
  assert.match(result.error || "", /GMV/);
});

test("builds dynamic amounts and contribution profit from source fields", () => {
  const definitions = defaultProfitComponents("BR", "TIKTOK");
  const amounts = buildProfitComponentAmounts({
    gmvCny: 100,
    platformFeeCny: 10,
    fulfillmentFeeCny: 6,
    productCostCny: 20,
    logisticsCostCny: 5,
    warehouseFulfillmentCostCny: 2,
    netAdCostCny: 8,
    taxCostCny: 4,
    affiliateCommissionCny: 17,
  }, definitions);
  assert.equal(contributionProfitFromComponents(amounts), 28);
});

test("calculates US TikTok contribution profit from settlement fields", () => {
  const definitions = defaultProfitComponents("US", "TIKTOK");
  const amounts = buildProfitComponentAmounts({
    gmvCny: 100,
    platformFeeCny: 6,
    smartPromotionFeeCny: 3.5,
    productCostCny: 20,
    logisticsCostCny: 5,
    lastMileLogisticsCostCny: 12,
    warehouseFulfillmentCostCny: 2,
    netAdCostCny: 8,
    taxCostCny: 99,
  }, definitions);
  assert.equal(contributionProfitFromComponents(amounts), 43.5);
});

test("mixed-country TikTok totals retain country-specific costs", () => {
  const definitions = defaultProfitComponents("MIXED", "TIKTOK");
  const amounts = buildProfitComponentAmounts({
    gmvCny: 200,
    platformFeeCny: 12,
    fulfillmentFeeCny: 6,
    smartPromotionFeeCny: 4,
    productCostCny: 30,
    logisticsCostCny: 10,
    lastMileLogisticsCostCny: 8,
    warehouseFulfillmentCostCny: 5,
    netAdCostCny: 20,
    taxCostCny: 3,
  }, definitions);
  assert.equal(contributionProfitFromComponents(amounts), 102);
});
