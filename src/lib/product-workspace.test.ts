import test from "node:test";
import assert from "node:assert/strict";
import { filterProductWorkspace, incompleteSku, productMatchesGroup, skuMatchesKeyword } from "./product-workspace";
import type { SpuListItem } from "./products-store";
const sku = (sku_id: string, currency = "CNY", cost_price: number | null = 10) => ({ sku_id, currency, cost_price, size: "Set+6", color: "白色", weight_kg: 1, length: 10, width: 20, height: 30 });
const items: SpuListItem[] = [
  { productId: "one", name: "刷具", category: "清洁", status: "ACTIVE", variantCount: 1, createdAt: "2026-01-01", suppliers: [{ id: "factory1", name: "工厂甲" }], skuIndex: [sku("Brush6")] },
  { productId: "two", name: "另一个", status: "INACTIVE", variantCount: 1, createdAt: "2026-02-01", suppliers: [{ id: "factory2", name: "工厂乙" }], skuIndex: [sku("Other", "USD", 1)] },
];
const defaults = { keyword: "", status: "all", category: "all", supplier: "all", sortBy: "name" as const, sortOrder: "asc" as const };
test("search matches unexpanded SKU, spec, supplier and product", () => {
  assert.deepEqual(filterProductWorkspace(items, { ...defaults, keyword: "brush6" }).map(s => s.productId), ["one"]);
  assert.equal(filterProductWorkspace(items, { ...defaults, keyword: "Set+6" }).length, 2);
  assert.deepEqual(filterProductWorkspace(items, { ...defaults, keyword: "工厂乙" }).map(s => s.productId), ["two"]);
  assert.equal(productMatchesGroup(items[0], "清洁"), true);
  assert.equal(skuMatchesKeyword(sku("Brush6"), "白色"), true);
});
test("factory/status and explicit empty supplier result filter are respected", () => {
  assert.equal(filterProductWorkspace(items, { ...defaults, supplier: "factory2", status: "ACTIVE" }).length, 0);
  assert.equal(filterProductWorkspace(items, { ...defaults, supplierProductIds: new Set() }).length, 0);
  assert.equal(filterProductWorkspace(items, { ...defaults, supplier: "factory1" })[0].productId, "one");
});
test("created/name directions work without depending on loaded detail cache", () => {
  assert.equal(filterProductWorkspace(items, { ...defaults, sortBy: "created", sortOrder: "desc" })[0].productId, "two");
  const a = filterProductWorkspace(items, defaults).map(s => s.productId);
  assert.deepEqual(filterProductWorkspace(items, { ...defaults, sortOrder: "desc" }).map(s => s.productId), [...a].reverse());
});
test("cost sorting groups currencies instead of comparing dollars to yuan", () => {
  assert.deepEqual(filterProductWorkspace(items, { ...defaults, sortBy: "cost" }).map(s => s.productId), ["one", "two"]);
  const sameCurrency = [...items, { ...items[0], productId: "cheap", skuIndex: [sku("cheap", "CNY", 5)] }];
  assert.deepEqual(filterProductWorkspace(sameCurrency, { ...defaults, sortBy: "cost" }).map(s => s.productId), ["cheap", "one", "two"]);
});
test("missing fields count as incomplete; explicit zero cost is valid", () => {
  assert.equal(incompleteSku(sku("zero", "CNY", 0)), false);
  assert.equal(incompleteSku(sku("missing", "CNY", null)), true);
  assert.equal(incompleteSku({ ...sku("x"), weight_kg: 0 }), true);
});
