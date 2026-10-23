import assert from "node:assert/strict";
import test from "node:test";
import { monthlyBillPaymentState } from "./monthly-bill-payment-state";

test("approved bill with no flow can be paid once", () => {
  assert.equal(monthlyBillPaymentState("Approved", null, []), "new");
  assert.equal(monthlyBillPaymentState("Cashier_Approved", null, []), "new");
});

test("repeating a completed payment is idempotent only when the link matches", () => {
  assert.equal(monthlyBillPaymentState("Paid", "flow-1", ["flow-1"]), "already-paid");
  assert.equal(monthlyBillPaymentState("Paid", "flow-1", ["flow-1", "flow-2"]), "conflict");
  assert.equal(monthlyBillPaymentState("Paid", "flow-1", ["flow-2"]), "conflict");
  assert.equal(monthlyBillPaymentState("Paid", null, []), "conflict");
});

test("a partial earlier payment never produces a second flow", () => {
  assert.equal(monthlyBillPaymentState("Approved", null, ["orphan-flow"]), "conflict");
  assert.equal(monthlyBillPaymentState("Approved", "old-flow", []), "conflict");
  assert.equal(monthlyBillPaymentState("Draft", null, []), "conflict");
});
