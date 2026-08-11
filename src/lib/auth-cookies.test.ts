import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthCookieNames, resolveAuthCookieNamespace } from "./auth-cookies";

test("uses the configured cookie namespace after sanitizing it", () => {
  assert.equal(resolveAuthCookieNamespace(" Smart Baxi ", "http://example.test:3003"), "smart-baxi");
});

test("derives different namespaces for applications on different ports", () => {
  const baxi = resolveAuthCookieNamespace(undefined, "http://82.158.91.76:3001");
  const sdfy = resolveAuthCookieNamespace(undefined, "http://82.158.91.76:3003");
  assert.notEqual(baxi, sdfy);
});

test("namespaces every authentication cookie", () => {
  const names = buildAuthCookieNames("smart-sdfy");
  assert.equal(names.sessionToken, "smart-sdfy.session-token");
  assert.equal(names.customToken, "smart-sdfy.token");
  assert.equal(new Set(Object.values(names)).size, Object.keys(names).length);
  assert.ok(Object.values(names).every((name) => name.startsWith("smart-sdfy.")));
});
