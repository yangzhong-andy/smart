import assert from "node:assert/strict";
import test from "node:test";
import { calculateAdvertisingBillDueDate } from "./monthly-bill-due-date";

test("advertising bill is due after two complete calendar months", () => {
  assert.equal(
    calculateAdvertisingBillDueDate("2026-06")?.toISOString().slice(0, 10),
    "2026-09-01",
  );
  assert.equal(
    calculateAdvertisingBillDueDate("2026-07")?.toISOString().slice(0, 10),
    "2026-10-01",
  );
});

test("advertising due date rolls over the year boundary", () => {
  assert.equal(
    calculateAdvertisingBillDueDate("2026-11")?.toISOString().slice(0, 10),
    "2027-02-01",
  );
});

test("invalid billing months do not produce a due date", () => {
  assert.equal(calculateAdvertisingBillDueDate("2026-13"), null);
  assert.equal(calculateAdvertisingBillDueDate("June 2026"), null);
});

