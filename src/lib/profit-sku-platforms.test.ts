import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProfitSkuPlatform,
  PROFIT_SKU_PLATFORMS,
} from "./profit-sku-platforms";

test("normalizes supported seller SKU platforms", () => {
  assert.equal(normalizeProfitSkuPlatform(" tiktok "), "TIKTOK");
  assert.equal(normalizeProfitSkuPlatform("shopee"), "SHOPEE");
  assert.equal(normalizeProfitSkuPlatform("mercado_livre"), "MERCADO_LIVRE");
  assert.deepEqual(PROFIT_SKU_PLATFORMS, ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"]);
});

test("rejects unsupported or missing seller SKU platforms", () => {
  assert.equal(normalizeProfitSkuPlatform("AMAZON"), null);
  assert.equal(normalizeProfitSkuPlatform(""), null);
  assert.equal(normalizeProfitSkuPlatform(null), null);
});
