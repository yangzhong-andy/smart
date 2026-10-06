import assert from "node:assert/strict";
import test from "node:test";
import { isShopeeTokenRefreshDue, SHOPEE_TOKEN_REFRESH_LEAD_MS } from "./shopee-token-service";

test("refreshes a Shopee token when it expires within the lead window", () => {
  const now = new Date("2026-08-30T00:00:00.000Z");
  assert.equal(
    isShopeeTokenRefreshDue(new Date(now.getTime() + SHOPEE_TOKEN_REFRESH_LEAD_MS - 1), now),
    true,
  );
});

test("skips a Shopee token that remains valid beyond the lead window", () => {
  const now = new Date("2026-08-30T00:00:00.000Z");
  assert.equal(
    isShopeeTokenRefreshDue(new Date(now.getTime() + SHOPEE_TOKEN_REFRESH_LEAD_MS + 1), now),
    false,
  );
});

test("refreshes when the token expiry is unknown", () => {
  assert.equal(isShopeeTokenRefreshDue(null), true);
});
