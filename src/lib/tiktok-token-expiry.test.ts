import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTikTokTokenLifetime } from "./tiktok-token-expiry";

const NOW_MS = Date.UTC(2026, 7, 12, 0, 0, 0);
const NOW_SECONDS = NOW_MS / 1000;

test("converts a TikTok Unix expiry timestamp to remaining seconds", () => {
  assert.equal(normalizeTikTokTokenLifetime(NOW_SECONDS + 7 * 86400, NOW_MS), 7 * 86400);
});

test("keeps a duration-based token lifetime unchanged", () => {
  assert.equal(normalizeTikTokTokenLifetime(7 * 86400, NOW_MS), 7 * 86400);
});

test("marks an already expired Unix timestamp as immediately expired", () => {
  assert.equal(normalizeTikTokTokenLifetime(NOW_SECONDS - 60, NOW_MS), 0);
});

test("rejects a missing or invalid expiry value", () => {
  assert.throws(() => normalizeTikTokTokenLifetime(undefined, NOW_MS), /invalid token expiry/);
  assert.throws(() => normalizeTikTokTokenLifetime(-1, NOW_MS), /invalid token expiry/);
});
