import assert from "node:assert/strict";
import test from "node:test";
import {
  isShopeeWebhookVerificationPayload,
  matchShopeeWebhookSignature,
  parseShopeeWebhookPayload,
  shopeeWebhookUrlCandidates,
  shopeeWebhookEventKey,
  signShopeeWebhook,
  verifyShopeeWebhookSignature,
} from "./shopee-webhook";

test("recognizes Shopee callback verification without treating other code-zero payloads as valid", () => {
  assert.equal(isShopeeWebhookVerificationPayload({
    code: 0,
    data: { verify_info: "This is a Verification message.Please respond in the certain format." },
  }), true);
  assert.equal(isShopeeWebhookVerificationPayload({ code: 0, data: {} }), false);
  assert.equal(isShopeeWebhookVerificationPayload({ code: 3, data: { verify_info: "test" } }), false);
});

test("verifies Shopee webhook HMAC against the exact raw body", () => {
  const callbackUrl = "https://www.baxi8.com/api/shopee/webhook";
  const rawBody = '{"code":3,"shop_id":1842551792,"data":{"ordersn":"260830ABC"}}';
  const authorization = signShopeeWebhook("partner-secret", callbackUrl, rawBody);
  assert.equal(verifyShopeeWebhookSignature({ partnerKey: "partner-secret", callbackUrl, rawBody, authorization }), true);
  assert.equal(verifyShopeeWebhookSignature({ partnerKey: "partner-secret", callbackUrl, rawBody: `${rawBody}\n`, authorization }), false);
  assert.equal(verifyShopeeWebhookSignature({ partnerKey: "wrong-secret", callbackUrl, rawBody, authorization }), false);
});

test("supports Shopee URL signing variants without bypassing HMAC validation", () => {
  const configuredUrl = "https://www.baxi8.com/api/shopee/webhook";
  const rawBody = '{"code":3,"shop_id":1842551792}';
  const candidates = shopeeWebhookUrlCandidates(configuredUrl);
  assert.ok(candidates.includes(configuredUrl));
  assert.ok(candidates.includes("http://www.baxi8.com/api/shopee/webhook"));
  assert.ok(candidates.includes("https://baxi8.com/api/shopee/webhook"));
  assert.ok(candidates.includes("https://www.baxi8.com/api/shopee/webhook/"));

  const signedUrl = "http://baxi8.com/api/shopee/webhook/";
  const authorization = signShopeeWebhook("partner-secret", signedUrl, rawBody);
  assert.equal(matchShopeeWebhookSignature({
    partnerKey: "partner-secret",
    configuredUrl,
    rawBody,
    authorization,
  }), signedUrl);
  assert.equal(matchShopeeWebhookSignature({
    partnerKey: "wrong-secret",
    configuredUrl,
    rawBody,
    authorization,
  }), null);
});

test("parses order and logistics event field variants", () => {
  const parsed = parseShopeeWebhookPayload({
    code: 4,
    shop_id: 1842551792,
    timestamp: 1_788_000_000,
    msg_id: "message-1",
    data: { order_sn: "260830ABC", order_status: "SHIPPED" },
  });
  assert.equal(parsed.code, 4);
  assert.equal(parsed.shopId, "1842551792");
  assert.equal(parsed.orderSn, "260830ABC");
  assert.equal(parsed.status, "SHIPPED");
  assert.equal(parsed.messageId, "message-1");
  assert.equal(parsed.eventTimestamp?.toISOString(), new Date(1_788_000_000 * 1000).toISOString());
});

test("creates an app-scoped stable idempotency key", () => {
  const body = '{"code":3}';
  assert.equal(shopeeWebhookEventKey("app-1", body), shopeeWebhookEventKey("app-1", body));
  assert.notEqual(shopeeWebhookEventKey("app-1", body), shopeeWebhookEventKey("app-2", body));
});
