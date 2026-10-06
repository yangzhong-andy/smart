import assert from "node:assert/strict";
import test from "node:test";
import { isTikTokStockOutboundStatus } from "./tiktok-stock-deduct";

test("recognizes every TikTok state that proves warehouse outbound", () => {
  for (const status of ["AWAITING_COLLECTION", "IN_TRANSIT", "DELIVERED", "COMPLETED"]) {
    assert.equal(isTikTokStockOutboundStatus(status), true);
  }
});

test("does not deduct stock for orders that have not shipped or were cancelled", () => {
  for (const status of ["UNPAID", "ON_HOLD", "CANCELLED", null, undefined]) {
    assert.equal(isTikTokStockOutboundStatus(status), false);
  }
});
