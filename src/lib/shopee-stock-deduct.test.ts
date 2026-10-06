import assert from "node:assert/strict";
import test from "node:test";
import { shopeeStockAction } from "./shopee-stock-deduct";

test("deducts Shopee stock only after the order enters fulfillment", () => {
  assert.equal(shopeeStockAction("UNPAID"), "ignore");
  assert.equal(shopeeStockAction("PROCESSED"), "deduct");
  assert.equal(shopeeStockAction("SHIPPED"), "deduct");
  assert.equal(shopeeStockAction("TO_CONFIRM_RECEIVE"), "deduct");
  assert.equal(shopeeStockAction("COMPLETED"), "deduct");
});

test("restores a previously deducted Shopee order after cancellation", () => {
  assert.equal(shopeeStockAction("CANCELLED"), "restore");
  assert.equal(shopeeStockAction("INCOMPLETE"), "restore");
});
