import assert from "node:assert/strict";
import test from "node:test";
import { calculateProfitAdCost } from "./profit-ad-costs";

test("profit uses full platform consumption without deducting gifts or rebates", () => {
  const result = calculateProfitAdCost(19626.04, 34.4, 1371.42);

  assert.deepEqual(result, {
    actualSpend: 19626.04,
    giftConsumption: 34.4,
    estimatedRebate: 1371.42,
    profitCost: 19626.04,
  });
});

test("invalid and negative amounts cannot create negative advertising costs", () => {
  assert.equal(calculateProfitAdCost(Number.NaN, -10, -5).profitCost, 0);
  assert.equal(calculateProfitAdCost(-100, 0, 0).actualSpend, 0);
});
