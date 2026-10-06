import assert from "node:assert/strict";
import test from "node:test";
import { calculateDeliveryOrderTailDueDate } from "./delivery-orders-store";

test("calculates a historical delivery tail due date from the pickup date", () => {
  assert.equal(calculateDeliveryOrderTailDueDate("2026-05-20", 30), "2026-06-19");
});

test("keeps the pickup date when the contract has no credit days", () => {
  assert.equal(calculateDeliveryOrderTailDueDate("2026-08-31", 0), "2026-08-31");
});

test("handles month and leap-year boundaries without local timezone rollover", () => {
  assert.equal(calculateDeliveryOrderTailDueDate("2028-02-28", 2), "2028-03-01");
});
