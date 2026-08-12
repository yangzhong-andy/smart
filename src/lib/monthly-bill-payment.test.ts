import assert from "node:assert/strict";
import test from "node:test";
import { getMonthlyBillPaymentAmount, getMonthlyBillSettledAmount } from "./reconciliation-store";

test("supplier and logistics bills pay their net amount", () => {
  assert.equal(
    getMonthlyBillPaymentAmount({ billType: "工厂订单", totalAmount: 1000, netAmount: 700 }),
    700
  );
  assert.equal(
    getMonthlyBillPaymentAmount({ billType: "物流", totalAmount: 500, netAmount: 125 }),
    125
  );
});

test("advertising bills keep their existing gross payment behavior", () => {
  assert.equal(
    getMonthlyBillPaymentAmount({ billType: "广告", totalAmount: 1000, netAmount: 900 }),
    1000
  );
});

test("factory bill settled amount includes paid deposit deductions", () => {
  assert.equal(
    getMonthlyBillSettledAmount({
      billType: "工厂订单",
      status: "Paid",
      totalAmount: 143420.8,
      offsetAmount: 143420.8,
      actualPaidAmount: 123420.8,
      depositDeductionAmount: 20000,
    }),
    143420.8
  );
});
