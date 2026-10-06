import assert from "node:assert/strict";
import test from "node:test";
import { resolveStoreReportPeriod, shanghaiToday, type StoreReportPeriodInput } from "./store-report-period";
const empty: StoreReportPeriodInput = { quick: "", year: "", month: "", startDate: "", endDate: "" };
test("Shanghai today crosses UTC day without relying on browser timezone", () => {
  assert.equal(shanghaiToday(new Date("2026-09-18T17:00:00Z")), "2026-09-19");
});
test("weeks start on Monday and previous week handles year boundary", () => {
  assert.deepEqual(resolveStoreReportPeriod({ ...empty, quick: "thisWeek" }, new Date("2026-01-04T04:00Z")), { startDate: "2025-12-29", endDate: "2026-01-04" });
  assert.deepEqual(resolveStoreReportPeriod({ ...empty, quick: "lastWeek" }, new Date("2026-01-04T04:00Z")), { startDate: "2025-12-22", endDate: "2025-12-28" });
});
test("month and quarter calendar filters preserve leap days and full selected years", () => {
  assert.deepEqual(resolveStoreReportPeriod({ ...empty, month: "2024-02" }), { startDate: "2024-02-01", endDate: "2024-02-29" });
  assert.deepEqual(resolveStoreReportPeriod({ ...empty, quick: "lastMonth" }, new Date("2026-01-31T04:00Z")), { startDate: "2025-12-01", endDate: "2025-12-31" });
  assert.deepEqual(resolveStoreReportPeriod({ ...empty, quick: "thisQuarter" }, new Date("2026-09-18T04:00Z")), { startDate: "2026-07-01", endDate: "2026-09-18" });
  assert.deepEqual(resolveStoreReportPeriod({ ...empty, year: "2025" }), { startDate: "2025-01-01", endDate: "2025-12-31" });
});
test("cleared filters request all dates; open-ended dates remain open", () => {
  assert.deepEqual(resolveStoreReportPeriod(empty), { startDate: "", endDate: "" });
  assert.deepEqual(resolveStoreReportPeriod({ ...empty, startDate: "2026-01-01" }), { startDate: "2026-01-01", endDate: "" });
});
