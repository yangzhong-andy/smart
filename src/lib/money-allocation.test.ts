import assert from "node:assert/strict";
import test from "node:test";
import { allocateMoneyByWeight } from "./money-allocation";

test("allocates money by weight without losing cents", () => {
  const result = allocateMoneyByWeight(100, [1, 1, 1]);
  assert.deepEqual(result, [33.34, 33.33, 33.33]);
  assert.equal(result.reduce((sum, value) => sum + value, 0), 100);
});

test("falls back to equal allocation when all weights are zero", () => {
  assert.deepEqual(allocateMoneyByWeight(0.05, [0, 0]), [0.03, 0.02]);
});

test("keeps excluded zero-weight rows at zero", () => {
  assert.deepEqual(allocateMoneyByWeight(12.34, [8, 0, 2]), [9.87, 0, 2.47]);
});

test("supports negative adjustments", () => {
  const result = allocateMoneyByWeight(-1, [1, 3]);
  assert.deepEqual(result, [-0.25, -0.75]);
});
