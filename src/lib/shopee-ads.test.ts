import assert from "node:assert/strict";
import test from "node:test";
import { allocateShopeeAdExpenseByOrderCount, normalizeShopeeAdsDate, shopeeAdsApiDate, shopeeAdsDateChunks } from "./shopee-ads";

test("converts Shopee ad dates in both directions", () => {
  assert.equal(shopeeAdsApiDate("2026-08-31"), "31-08-2026");
  assert.equal(normalizeShopeeAdsDate("31-08-2026"), "2026-08-31");
  assert.equal(normalizeShopeeAdsDate("2026-08-31"), "2026-08-31");
});

test("splits long ad ranges into at most 30 inclusive days", () => {
  assert.deepEqual(shopeeAdsDateChunks("2026-01-01", "2026-02-05"), [
    { startDate: "2026-01-01", endDate: "2026-01-30" },
    { startDate: "2026-01-31", endDate: "2026-02-05" },
  ]);
});

test("allocates advertising spend evenly by eligible order count", () => {
  assert.deepEqual(allocateShopeeAdExpenseByOrderCount(100, 10), Array(10).fill(10));
  assert.deepEqual(allocateShopeeAdExpenseByOrderCount(100, 3), [33.34, 33.33, 33.33]);
  assert.equal(allocateShopeeAdExpenseByOrderCount(100, 3).reduce((sum, value) => sum + value, 0), 100);
});
