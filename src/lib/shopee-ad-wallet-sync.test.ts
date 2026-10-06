import assert from "node:assert/strict";
import test from "node:test";
import { advertisingSpendDateRange, advertisingWalletAdjustment } from "./shopee-ad-wallet-sync";

test("calculates append-only advertising wallet adjustments", () => {
  assert.equal(advertisingWalletAdjustment(100, 100), 0);
  assert.equal(advertisingWalletAdjustment(101.23, 100), 1.23);
  assert.equal(advertisingWalletAdjustment(98.77, 100), -1.23);
});

test("uses a stable rolling completed-day range for Shopee ad spend", () => {
  assert.deepEqual(advertisingSpendDateRange(7, new Date("2026-09-17T04:00:00.000Z")), {
    startDate: "2026-09-10",
    endDate: "2026-09-16",
  });
  assert.deepEqual(advertisingSpendDateRange(2, new Date("2026-09-17T02:00:00.000Z")), {
    startDate: "2026-09-14",
    endDate: "2026-09-15",
  });
  assert.deepEqual(advertisingSpendDateRange(730, new Date("2026-09-17T04:00:00.000Z")), {
    startDate: "2026-03-21",
    endDate: "2026-09-16",
  });
});
