import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { getShopeeApiHost, getShopeeAuthUrl, getShopeeOrderDetails, signShopeeRequest } from "./shopee-open-api";

test("builds the Brazil seller sandbox authorization URL", () => {
  const url = new URL(getShopeeAuthUrl("sandbox", "1242388", "https://www.baxi8.com/api/shopee/oauth/callback", "state-123"));
  assert.equal(url.origin + url.pathname, "https://open.sandbox.test-stable.shopee.com.br/auth");
  assert.equal(url.searchParams.get("partner_id"), "1242388");
  assert.equal(url.searchParams.get("auth_type"), "seller");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), "https://www.baxi8.com/api/shopee/oauth/callback");
  assert.equal(url.searchParams.get("state"), "state-123");
});

test("signs public and shop-level v2 requests with the required base string", () => {
  const publicExpected = createHmac("sha256", "secret").update("1242388/api/v2/auth/token/get1787800000").digest("hex");
  assert.equal(signShopeeRequest("1242388", "secret", "/api/v2/auth/token/get", 1787800000), publicExpected);

  const shopExpected = createHmac("sha256", "secret").update("1242388/api/v2/shop/get_shop_info1787800000token-1shop-1").digest("hex");
  assert.equal(signShopeeRequest("1242388", "secret", "/api/v2/shop/get_shop_info", 1787800000, "token-1", "shop-1"), shopExpected);
});

test("uses the Brazil regional API host for live requests", () => {
  assert.equal(getShopeeApiHost("live"), "https://openplatform.shopee.com.br");
  assert.equal(getShopeeApiHost("sandbox"), "https://partner.test-stable.shopeemobile.com");
});

test("requests the official Shopee order amount fields", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ response: { order_list: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await getShopeeOrderDetails({
      environment: "live",
      partnerId: "1242388",
      partnerKey: "secret",
      accessToken: "token",
      shopId: "1842551792",
      orderSns: ["260830P3U0NCC5"],
    });
    const fields = new URL(requestedUrl).searchParams.get("response_optional_fields")?.split(",") || [];
    assert.ok(fields.includes("total_amount"));
    assert.ok(fields.includes("payment_method"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});
