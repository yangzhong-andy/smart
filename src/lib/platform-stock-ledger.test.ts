import assert from "node:assert/strict";
import test from "node:test";
import { classifyPlatformStockLog } from "./platform-stock-ledger";

test("classifies legacy TikTok rebuild stock movements", () => {
  assert.deepEqual(classifyPlatformStockLog("PROFIT_SALES_ORDER_REBUILD"), {
    platform: "TIKTOK",
    kind: "sales",
    aggregateHistory: true,
  });
  assert.deepEqual(classifyPlatformStockLog("PROFIT_SAMPLE_ORDER_REBUILD"), {
    platform: "TIKTOK",
    kind: "sample",
    aggregateHistory: true,
  });
});

test("classifies platform sales and cancellation stock movements", () => {
  assert.equal(classifyPlatformStockLog("SHOPEE_ORDER")?.kind, "sales");
  assert.equal(classifyPlatformStockLog("SHOPEE_ORDER_CANCELLED")?.kind, "return");
  assert.equal(classifyPlatformStockLog("MANUAL_ADJUSTMENT"), null);
});
