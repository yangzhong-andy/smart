import assert from "node:assert/strict";
import test from "node:test";
import {
  deliveryAlertAgeDays,
  deliveryAlertCutoff,
  isDeliveryOverdue,
} from "./order-delivery-alert";

const NOW = new Date("2026-08-10T12:00:00.000Z");

test("uses a strict eight-day delivery alert boundary", () => {
  assert.equal(deliveryAlertCutoff(NOW).toISOString(), "2026-08-02T12:00:00.000Z");
  assert.equal(isDeliveryOverdue("IN_TRANSIT", "2026-08-02T12:00:00.000Z", NOW), false);
  assert.equal(isDeliveryOverdue("IN_TRANSIT", "2026-08-02T11:59:59.999Z", NOW), true);
});

test("does not alert for delivered orders", () => {
  assert.equal(isDeliveryOverdue("DELIVERED", "2026-07-20T12:00:00.000Z", NOW), false);
});

test("does not alert when the order time is missing or invalid", () => {
  assert.equal(isDeliveryOverdue("IN_TRANSIT", null, NOW), false);
  assert.equal(isDeliveryOverdue("IN_TRANSIT", "invalid", NOW), false);
});

test("reports complete elapsed days without rounding up", () => {
  assert.equal(deliveryAlertAgeDays("2026-07-29T11:59:59.999Z", NOW), 12);
  assert.equal(deliveryAlertAgeDays("2026-07-29T12:00:00.001Z", NOW), 11);
});
