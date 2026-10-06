import assert from "node:assert/strict";
import test from "node:test";
import { cashFlowPlatformLabel } from "./cash-flow-platform";

test("platform enums and display names select the same cash-flow option", () => {
  for (const [key, label] of [["SHOPEE", "Shopee"], ["MERCADO_LIVRE", "Mercado Livre"], ["TIKTOK", "TikTok"]]) {
    assert.equal(cashFlowPlatformLabel(key), label);
    assert.equal(cashFlowPlatformLabel(label), label);
  }
  assert.equal(cashFlowPlatformLabel(null), "");
  assert.equal(cashFlowPlatformLabel("custom"), "custom");
});
