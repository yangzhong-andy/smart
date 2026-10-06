import assert from "node:assert/strict";
import test from "node:test";

import { aggregateInventoryAssetLots } from "./inventory-asset-core";

test("aggregates one SKU across physical asset locations without mixing currencies", () => {
  const result = aggregateInventoryAssetLots([
    { variantId: "v1", skuId: "SKU-1", productName: "产品", bucket: "FACTORY", quantity: 10, unitCost: 5, currency: "CNY", sourceId: "c1", sourceLabel: "合同1" },
    { variantId: "v1", skuId: "SKU-1", productName: "产品", bucket: "SEA_TRANSIT", quantity: 4, unitCost: 5, currency: "CNY", sourceId: "b1", sourceLabel: "批次1" },
    { variantId: "v1", skuId: "SKU-1", productName: "产品", bucket: "OVERSEAS", quantity: 3, unitCost: 2, currency: "BRL", sourceId: "w1", sourceLabel: "巴西仓" },
  ]);

  assert.equal(result.totals.quantity, 17);
  assert.deepEqual(result.totals.values, { BRL: 6, CNY: 70 });
  assert.equal(result.rows[0].buckets.SEA_TRANSIT.quantity, 4);
});

test("flags quantity without cost instead of silently valuing it at zero", () => {
  const result = aggregateInventoryAssetLots([
    { variantId: "v1", skuId: "SKU-1", productName: "产品", bucket: "DOMESTIC", quantity: 8, unitCost: null, currency: "CNY", sourceId: "d1", sourceLabel: "国内待发" },
  ]);

  assert.equal(result.totals.missingCostQuantity, 8);
  assert.deepEqual(result.totals.values, {});
});

test("ignores zero and negative physical quantities", () => {
  const result = aggregateInventoryAssetLots([
    { variantId: "v1", skuId: "SKU-1", productName: "产品", bucket: "DOMESTIC", quantity: -2, unitCost: 5, currency: "CNY", sourceId: "d1", sourceLabel: "异常余额" },
  ]);

  assert.equal(result.totals.quantity, 0);
  assert.equal(result.rows.length, 0);
});
