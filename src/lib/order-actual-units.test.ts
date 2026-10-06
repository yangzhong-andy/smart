import assert from "node:assert/strict";
import test from "node:test";
import { isShopeeSalesOrder, isTikTokSalesOrder, shopeeOrderUnitCounts, sumActualUnits, tiktokActualUnits, tiktokOrderUnitCounts, warehouseBillingUnits } from "./order-actual-units";

test("counts multiple units behind one TikTok SKU line", () => {
  assert.equal(tiktokActualUnits({ line_items: [{ quantity: 4 }] }), 4);
});

test("adds quantities across different TikTok SKU lines", () => {
  assert.equal(tiktokActualUnits({ line_items: [{ quantity: 2 }, { quantity: "3" }] }), 5);
});

test("adds Shopee item quantities", () => {
  assert.equal(sumActualUnits([{ quantity: 2 }, { quantity: 4 }]), 6);
});

test("expands Shopee bundle mappings into physical units", () => {
  const result = shopeeOrderUnitCounts([
    { model_sku: "BUNDLE-2", quantity: 3 },
    { item_sku: "SINGLE", quantity: 1 },
  ], (sku) => sku === "bundle-2" ? 2 : 1);
  assert.deepEqual(result, { salesUnits: 4, physicalUnits: 7 });
});

test("bills warehouse fulfillment by physical units for component rules and bundles", () => {
  assert.equal(warehouseBillingUnits(4, 7, "INTERNAL_COMPONENT"), 7);
  assert.equal(warehouseBillingUnits(4, 7, "SELLER_UNIT"), 7);
  assert.equal(warehouseBillingUnits(4, 4, "SELLER_UNIT"), 4);
});

test("uses one unit per legacy line when quantity is absent", () => {
  assert.equal(tiktokActualUnits({ line_items: [{}, { quantity: null }] }), 2);
  assert.equal(tiktokActualUnits({ line_items: [] }, 3), 3);
  assert.equal(tiktokActualUnits(null, 3), 3);
});

test("expands bundle mappings into physical units", () => {
  const result = tiktokOrderUnitCounts({
    line_items: [
      { seller_sku: "BUNDLE-2", quantity: 3 },
      { seller_sku: "SINGLE", quantity: 1 },
    ],
  }, 0, (sellerSku) => sellerSku === "bundle-2" ? 2 : 1);
  assert.deepEqual(result, { salesUnits: 4, physicalUnits: 7 });
});

test("matches profit-report order exclusions", () => {
  assert.equal(isTikTokSalesOrder("CANCELLED", {}), false);
  assert.equal(isTikTokSalesOrder("UNPAID", {}), false);
  assert.equal(isTikTokSalesOrder("AWAITING_COLLECTION", { is_sample_order: true }), false);
  assert.equal(isTikTokSalesOrder("AWAITING_COLLECTION", {}), true);
});

test("matches Shopee profit order exclusions", () => {
  assert.equal(isShopeeSalesOrder("CANCELLED"), false);
  assert.equal(isShopeeSalesOrder("CANCEL_REQUESTED"), false);
  assert.equal(isShopeeSalesOrder("UNPAID"), false);
  assert.equal(isShopeeSalesOrder("INCOMPLETE"), false);
  assert.equal(isShopeeSalesOrder("READY_TO_SHIP"), true);
});
