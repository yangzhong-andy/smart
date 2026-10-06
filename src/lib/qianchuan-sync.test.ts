import assert from "node:assert/strict";
import test from "node:test";
import { qianchuanConsumptionDedupKey } from "./qianchuan-sync";

test("builds a stable daily ad-consumption deduplication key", () => {
  assert.equal(
    qianchuanConsumptionDedupKey("connection-1", "2026-09-08"),
    "qianchuan:connection-1:2026-09-08",
  );
});
