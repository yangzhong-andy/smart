import assert from "node:assert/strict";
import test from "node:test";
import { resolveCashFlowExchangeRateToCny } from "./cash-flow-exchange-rate";

test("converts a CNY-based USD quote to USD/CNY", () => {
  const rate = resolveCashFlowExchangeRateToCny("USD", { USD: 0.148 }, 7);
  assert.ok(rate);
  assert.equal(rate.toFixed(4), "6.7568");
});

test("uses the account rate when the live currency quote is unavailable", () => {
  assert.equal(resolveCashFlowExchangeRateToCny("USD", null, 7), 7);
});

test("keeps CNY and RMB at one", () => {
  assert.equal(resolveCashFlowExchangeRateToCny("CNY", { CNY: 2 }, 9), 1);
  assert.equal(resolveCashFlowExchangeRateToCny("rmb", null, 9), 1);
});

test("returns null when a foreign currency has no usable rate", () => {
  assert.equal(resolveCashFlowExchangeRateToCny("USD", { USD: 0 }, 0), null);
});
