import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { hashKwai, kwaiAuthorizeUrl, kwaiExchange, kwaiRead, kwaiRefresh, kwaiSign, openKwai, parseKwaiJson, parseKwaiToken, sealKwai, kwaiId } from "./kwai-api";
import { kwaiPage, normalizeKwaiOrder, normalizeKwaiProduct, normalizeKwaiSkus } from "./kwai-records";

const token = { merchantId: "123", shopName: "测试店铺", accessToken: "test-access", refreshToken: "test-refresh", expiresIn: 604800, refreshTokenExpiresIn: 31536000, scopes: "user_info,merchant_item,merchant_order" };
test("Kwai authorization uses status and protocol-free registered redirect", () => {
  const url = new URL(kwaiAuthorizeUrl("test-app", "state"));
  assert.equal(url.origin, "https://shop.kwai.com");
  assert.equal(url.searchParams.get("status"), "state");
  assert.equal(url.searchParams.get("state"), null);
  assert.equal(url.searchParams.get("redirect_uri"), "www.baxi8.com/api/kwai/oauth/callback");
});
test("Kwai signature excludes access tokens and uses decoded sorted values", () => {
  const params = { version: "1.0", sign: "ignored", accessToken: "test-access", ts: "123", appKey: "a+b 测试" };
  for (const path of ["/rest/open/api/product/listItem", "/rest/open/api/trade/queryOrderList"]) {
    const expected = createHash("sha256").update(`api-shop.kwai.com${path}appKey=a+b 测试ts=123version=1.0signSecret=secret`).digest("hex");
    assert.equal(kwaiSign(path, params, "secret"), expected);
    assert.equal(kwaiSign(path, { ...params, accessToken: "rotated-token" }, "secret"), expected);
  }
});
test("Kwai encrypted credentials are randomized, authenticated and reject malformed ciphers", (t) => {
  const previous = process.env.KWAI_ENCRYPTION_KEY;
  process.env.KWAI_ENCRYPTION_KEY = "test-only-encryption-key-32-characters";
  t.after(() => { if (previous === undefined) delete process.env.KWAI_ENCRYPTION_KEY; else process.env.KWAI_ENCRYPTION_KEY = previous; });
  const cipher = sealKwai(token);
  assert.notEqual(cipher, sealKwai(token));
  assert.ok(!cipher.includes(token.accessToken));
  assert.deepEqual(openKwai(cipher), token);
  assert.throws(() => openKwai(cipher + ".extra"));
  const parts = cipher.split("."); parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  assert.throws(() => openKwai(parts.join(".")));
  process.env.KWAI_ENCRYPTION_KEY = "another-test-only-key-32-characters";
  assert.throws(() => openKwai(cipher));
});
test("Kwai JSON preserves long identifiers and escaped string literals", () => {
  const data = parseKwaiJson('{"id":9223372036854775807,"text":"id: 9223372036854775807 \\" x","amount":105,"list":[9007199254740993]}');
  assert.equal(data.id, "9223372036854775807");
  assert.deepEqual(data.list, ["9007199254740993"]);
  assert.equal(data.amount, 105);
  assert.equal(data.text, 'id: 9223372036854775807 " x');
  assert.throws(() => kwaiId(9007199254740993));
  assert.throws(() => kwaiId("1,2"));
});
test("Kwai token responses enforce durations and refresh merchant identity", () => {
  assert.deepEqual(parseKwaiToken(token), token);
  assert.throws(() => parseKwaiToken({ ...token, expiresIn: undefined }));
  assert.throws(() => parseKwaiToken({ ...token, expiresIn: -1 }));
  assert.throws(() => parseKwaiToken({ ...token, refreshToken: "" }));
  assert.throws(() => parseKwaiToken({ ...token, merchantId: "456" }, token));
});
test("Kwai order snapshots strip personal data and preserve minor units / missing values", () => {
  const order = normalizeKwaiOrder({ orderId: "9223372036854775807", country: "BRA", currency: "BRL", totalAmount: 105, shippingFee: 0, receiverAddressInfo: { cpf: "private" }, orderItemView: [{ itemId: 1, skuId: 2, skuNumber: "ABC", skuQuantity: 3, skuPrice: 35 }] });
  assert.equal(order.totalAmountCents, 105);
  assert.equal(order.shippingFeeCents, 0);
  assert.equal(order.paidAt, null);
  assert.equal(order.items[0].sellerSku, "ABC");
  assert.ok(!JSON.stringify(order).includes("private"));
  assert.throws(() => normalizeKwaiOrder({ ...order, country: "USA", currency: "USD" }));
  for (const stock of ["", false, -1, 1.5, "invalid"]) assert.throws(() => normalizeKwaiProduct({ itemId: 1, stock }));
  assert.equal(normalizeKwaiProduct({ itemId: 1 }).stock, null);
});
test("Kwai SKU membership and page validation reject cross-product / invalid values", () => {
  assert.throws(() => normalizeKwaiSkus({ itemId: 1, saleCountry: "BRA", skus: [{ itemId: 2, skuId: 3 }] }, "1"));
  assert.equal(normalizeKwaiSkus({ itemId: 1, saleCountry: "BRA", skus: [{ itemId: 1, skuId: 3, stock: 0 }] }, "1")[0].stock, 0);
  for (const page of [0, -1, 10001, 1.5, "bad"]) assert.throws(() => kwaiPage(page));
  assert.equal(kwaiPage(null), 1);
});
test("Kwai transport verifies exact OAuth parameters and refresh rotation", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: URL, options: RequestInit) => {
    const url = new URL(input); calls++;
    assert.equal(url.origin, "https://api-shop.kwai.com");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    if (calls === 1) { assert.equal(url.searchParams.get("code"), "test-code"); assert.equal(url.searchParams.get("grant_type"), "authorization_code"); }
    else { assert.equal(url.searchParams.get("refresh_token"), "test-refresh"); assert.equal(url.searchParams.get("grant_type"), "refresh_token"); }
    return new Response(JSON.stringify({ result: 200, data: { ...token, refreshToken: "rotated" } }));
  });
  assert.equal((await kwaiExchange("app", "secret", "test-code")).refreshToken, "rotated");
  assert.equal((await kwaiRefresh("app", "secret", token)).refreshToken, "rotated");
});
test("Kwai read allowlist blocks writes and hides upstream secret-bearing errors", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(JSON.stringify({ result: 403, message: "SECRET-ECHO" })); });
  await assert.rejects(kwaiRead("app", "secret", token, "/rest/open/api/trade/merchant/cancelOrder"), /仅允许查询/);
  assert.equal(calls, 0);
  await assert.rejects(kwaiRead("app", "secret", token, "/rest/open/api/product/listItem", "{}"), (error: Error) => error.message.includes("403") && !error.message.includes("SECRET-ECHO"));
  assert.equal(hashKwai("x").length, 64);
});

test("Kwai API explains invalid signatures without leaking upstream messages", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ result: 443, message: "SECRET-ECHO" })));
  await assert.rejects(kwaiRead("app", "secret", token, "/rest/open/api/trade/queryOrderList", "{}"), (error: Error) =>
    error.message.includes("签名无效") && !error.message.includes("SECRET-ECHO"));
});
