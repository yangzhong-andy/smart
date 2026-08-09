import assert from "node:assert/strict";
import test from "node:test";
import { dateRangesOverlap, dayBefore, selectActiveProfitScheme } from "./profit-scheme-resolution";

const schemes = [
  { id: "v1", storeId: "store-a", version: 1, status: "ARCHIVED", effectiveFrom: "2026-06-01", effectiveTo: "2026-07-14" },
  { id: "v2", storeId: "store-a", version: 2, status: "PUBLISHED", effectiveFrom: "2026-07-15", effectiveTo: null },
];

test("selects a scheme by store and business date", () => {
  assert.equal(selectActiveProfitScheme(schemes, "store-a", "2026-07-14").scheme?.id, "v1");
  assert.equal(selectActiveProfitScheme(schemes, "store-a", "2026-07-15").scheme?.id, "v2");
  assert.equal(selectActiveProfitScheme(schemes, "store-b", "2026-07-15").status, "missing_scheme");
});

test("reports overlapping published schemes instead of choosing silently", () => {
  const result = selectActiveProfitScheme([
    ...schemes,
    { id: "bad", storeId: "store-a", version: 3, status: "PUBLISHED", effectiveFrom: "2026-07-01", effectiveTo: null },
  ], "store-a", "2026-07-20");
  assert.equal(result.status, "overlapping_schemes");
});

test("validates date ranges and closes the previous version", () => {
  assert.equal(dateRangesOverlap(schemes[0], schemes[1]), false);
  assert.equal(dateRangesOverlap(schemes[0], { ...schemes[1], effectiveFrom: "2026-07-14" }), true);
  assert.equal(dayBefore("2026-07-15").toISOString().slice(0, 10), "2026-07-14");
});
