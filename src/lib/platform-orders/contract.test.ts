import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlatformOrderIdentity,
  normalizeCommercePlatform,
  normalizeOrderCountryCode,
  platformOrderIdentityKey,
  platformProfitRuleKey,
} from "./contract";

test("normalizes supported commerce platform aliases", () => {
  assert.equal(normalizeCommercePlatform("TikTok Shop"), "TIKTOK");
  assert.equal(normalizeCommercePlatform("mercado-livre"), "MERCADO_LIVRE");
  assert.equal(normalizeCommercePlatform("Shopee"), "SHOPEE");
  assert.equal(normalizeCommercePlatform("unknown"), null);
});

test("builds an unambiguous platform order identity", () => {
  const first = createPlatformOrderIdentity({
    platform: "TIKTOK",
    externalShopId: "shop:a",
    externalOrderId: "order:1",
  });
  const second = createPlatformOrderIdentity({
    platform: "TIKTOK",
    externalShopId: "shop",
    externalOrderId: "a:order:1",
  });
  assert.notEqual(platformOrderIdentityKey(first), platformOrderIdentityKey(second));
});

test("requires ISO country codes for profit rule identity", () => {
  assert.equal(normalizeOrderCountryCode(" br "), "BR");
  assert.equal(normalizeOrderCountryCode("Brazil"), null);
  assert.equal(
    platformProfitRuleKey({
      platform: "TIKTOK",
      storeId: "store-1",
      externalShopId: "shop-1",
      countryCode: "BR",
    }, "2026-08-27"),
    '["TIKTOK","BR","store-1","shop-1","2026-08-27"]',
  );
});
