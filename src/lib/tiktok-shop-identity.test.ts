import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTikTokCountryIdentity,
  expectedCurrencyForRegion,
  normalizeTikTokRegion,
} from "./tiktok-shop-identity";

test("normalizes TikTok region values without guessing missing countries", () => {
  assert.equal(normalizeTikTokRegion("US"), "US");
  assert.equal(normalizeTikTokRegion("BRA"), "BR");
  assert.equal(normalizeTikTokRegion(""), null);
  assert.equal(normalizeTikTokRegion("unknown"), null);
});

test("maps supported store regions to their operating currency", () => {
  assert.equal(expectedCurrencyForRegion("BR"), "BRL");
  assert.equal(expectedCurrencyForRegion("US"), "USD");
});

test("marks missing and conflicting identities for review", () => {
  assert.equal(evaluateTikTokCountryIdentity({ region: null, regionSource: "PENDING" }).status, "PENDING");
  assert.equal(evaluateTikTokCountryIdentity({
    region: "US",
    regionSource: "TIKTOK",
    observedCurrencies: ["BRL"],
  }).status, "CONFLICT");
  assert.equal(evaluateTikTokCountryIdentity({
    region: "BR",
    regionSource: "LEGACY",
    observedCurrencies: ["BRL"],
  }).status, "REVIEW");
});

test("verifies an authorization region that agrees with order currency", () => {
  const identity = evaluateTikTokCountryIdentity({
    region: "US",
    regionSource: "TIKTOK",
    observedCurrencies: ["USD", "USD"],
  });
  assert.equal(identity.status, "VERIFIED");
  assert.equal(identity.countryName, "美国");
  assert.equal(identity.expectedCurrency, "USD");
});
