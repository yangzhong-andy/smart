import assert from "node:assert/strict";
import test from "node:test";
import {
  businessDateUtcRange,
  orderBusinessDate,
  relativeBusinessDate,
} from "./order-business-time";

test("Brazil orders use the destination country's local date", () => {
  assert.equal(orderBusinessDate(new Date("2026-08-31T02:30:00.000Z"), "BR"), "2026-08-30");
  assert.equal(orderBusinessDate(new Date("2026-08-31T03:00:00.000Z"), "BR"), "2026-08-31");
});

test("Japan and Korea orders use positive-offset local dates", () => {
  assert.equal(orderBusinessDate(new Date("2026-08-30T16:00:00.000Z"), "JP"), "2026-08-31");
  assert.equal(orderBusinessDate(new Date("2026-08-30T15:00:00.000Z"), "KR"), "2026-08-31");
});

test("Denver date boundaries follow daylight saving time", () => {
  const summer = businessDateUtcRange("2026-08-31", "2026-08-31", "US");
  assert.equal(summer.gte?.toISOString(), "2026-08-31T06:00:00.000Z");
  assert.equal(summer.lt?.toISOString(), "2026-09-01T06:00:00.000Z");

  const winter = businessDateUtcRange("2026-01-15", "2026-01-15", "US");
  assert.equal(winter.gte?.toISOString(), "2026-01-15T07:00:00.000Z");
  assert.equal(winter.lt?.toISOString(), "2026-01-16T07:00:00.000Z");
});

test("relative dates are calculated after converting now to the destination country", () => {
  const now = new Date("2026-08-31T01:00:00.000Z");
  assert.equal(relativeBusinessDate("BR", 0, now), "2026-08-30");
  assert.equal(relativeBusinessDate("BR", -1, now), "2026-08-29");
  assert.equal(relativeBusinessDate("JP", 0, now), "2026-08-31");
});
