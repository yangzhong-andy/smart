import assert from "node:assert/strict";
import test from "node:test";
import { usTikTokProfitInput } from "./profit-us-tiktok";

test("maps the settled US TikTok statement fields without double deducting shipping", () => {
  const result = usTikTokProfitInput({
    source: "SETTLED",
    revenueAmount: "23.76",
    referralFeeAmount: "-1.43",
    smartPromotionFeeAmount: "-0.83",
    shippingCostAmount: "-5.97",
  }, 99);
  assert.deepEqual(result, {
    gmvOriginal: 23.76,
    platformFeeOriginal: 1.43,
    smartPromotionFeeOriginal: 0.83,
    lastMileLogisticsOriginal: 5.97,
  });
  const contributionBeforeInternalCosts = result.gmvOriginal
    - result.platformFeeOriginal
    - result.smartPromotionFeeOriginal
    - result.lastMileLogisticsOriginal;
  assert.ok(Math.abs(contributionBeforeInternalCosts - 15.53) < 0.000001);
});

test("keeps settlement credits as negative costs", () => {
  const result = usTikTokProfitInput({
    source: "SETTLED",
    revenueAmount: "25.66",
    referralFeeAmount: "-1.90",
    smartPromotionFeeAmount: "-1.11",
    shippingCostAmount: "2.05",
  }, 0);
  assert.equal(result.lastMileLogisticsOriginal, -2.05);
});

test("uses the order GMV when a financial estimate has no revenue yet", () => {
  assert.equal(usTikTokProfitInput({ source: "ESTIMATED", revenueAmount: 0 }, 18.5).gmvOriginal, 18.5);
});
