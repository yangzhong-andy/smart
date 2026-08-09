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
  }, definitions);
  assert.equal(contributionProfitFromComponents(amounts), 45);
});
