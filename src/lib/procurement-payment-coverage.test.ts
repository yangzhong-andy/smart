import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProcurementPaymentCoverage,
  calculateDeliveryOrderPaymentBreakdown,
  calculateProcurementActualPaidAmount,
  extractDeliveryNumbers,
  parseRelatedIds,
  procurementPaymentCoverageLabel,
} from "./procurement-payment-coverage";

test("parseRelatedIds accepts JSON, arrays, and legacy comma-separated values", () => {
  assert.deepEqual(parseRelatedIds('["order-1","order-2","order-1"]'), ["order-1", "order-2"]);
  assert.deepEqual(parseRelatedIds(["order-1", "", "order-2"]), ["order-1", "order-2"]);
  assert.deepEqual(parseRelatedIds("order-1, order-2"), ["order-1", "order-2"]);
});

test("extractDeliveryNumbers reads delivery numbers from monthly bill notes", () => {
  assert.deepEqual(
    extractDeliveryNumbers("DO-1775542892780（6672件）\nDO-1775542858881（4912件）"),
    ["DO-1775542892780", "DO-1775542858881"]
  );
});

test("actual paid amount matches paid tail requests by order id or delivery number", () => {
  const actualPaid = calculateProcurementActualPaidAmount(
    ["order-1"],
    ["DO-1775542892780"],
    [
      {
        id: "request-1",
        relatedId: "order-1",
        status: "Paid",
        summary: "采购尾款 - DO-1",
        amount: 42382.4,
        currency: "CNY",
      },
      {
        id: "request-2",
        relatedId: null,
        status: "Paid",
        summary: "采购尾款 - DO-1775542892780",
        amount: 81038.4,
        currency: "CNY",
      },
      {
        id: "request-3",
        relatedId: null,
        status: "Approved",
        summary: "采购尾款 - DO-1775542892780",
        amount: 100,
        currency: "CNY",
      },
    ],
    "CNY"
  );
  assert.equal(actualPaid, 123420.8);
});

test("active purchase tail requests block a supplier monthly bill", () => {
  const coverage = buildProcurementPaymentCoverage(["order-1", "order-2"], [
    {
      id: "request-1",
      relatedId: "order-1",
      status: "Approved",
      summary: "采购尾款 - PO-1",
      amount: 21436.8,
      currency: "CNY",
    },
    {
      id: "request-2",
      relatedId: "order-2",
      status: "Rejected",
      summary: "采购尾款 - PO-2",
    },
  ]);

  assert.equal(coverage?.blocked, true);
  assert.equal(coverage?.linkedOrderCount, 1);
  assert.equal(coverage?.approvedCount, 1);
  assert.equal(procurementPaymentCoverageLabel(coverage!), "已由拿货单发起，待财务付款");
});

test("unrelated and rejected requests do not block the bill", () => {
  assert.equal(
    buildProcurementPaymentCoverage(["order-1"], [
      {
        id: "request-1",
        relatedId: "order-1",
        status: "Rejected",
        summary: "采购尾款 - PO-1",
      },
      {
        id: "request-2",
        relatedId: "order-2",
        status: "Approved",
        summary: "采购尾款 - PO-2",
      },
    ]),
    undefined
  );
});

test("delivery order payment breakdown separates actual payment from deposit deduction", () => {
  const breakdown = calculateDeliveryOrderPaymentBreakdown(
    "order-1",
    "DO-1775542858881",
    62382.4,
    62382.4,
    [
      {
        id: "request-1",
        relatedId: null,
        status: "Paid",
        summary: "purchase tail - DO-1775542858881",
        amount: 42382.4,
        currency: "CNY",
      },
    ],
    20000,
    true
  );

  assert.deepEqual(breakdown, {
    actualPaidAmount: 42382.4,
    settlementCoverageAmount: 62382.4,
    depositDeductionAmount: 20000,
  });
});

test("delivery order payment breakdown does not invent a deduction above payable", () => {
  const breakdown = calculateDeliveryOrderPaymentBreakdown(
    "order-1",
    "DO-1",
    148749.96,
    143787.2,
    [
      {
        id: "request-1",
        relatedId: "order-1",
        status: "Paid",
        summary: "purchase tail - DO-1",
        amount: 143787.2,
        currency: "CNY",
      },
    ],
    20000,
    false
  );

  assert.equal(breakdown.actualPaidAmount, 143787.2);
  assert.equal(breakdown.depositDeductionAmount, 0);
  assert.equal(breakdown.settlementCoverageAmount, 143787.2);
});

test("delivery order payment breakdown falls back to stored actual payment", () => {
  assert.deepEqual(
    calculateDeliveryOrderPaymentBreakdown(
      "order-1",
      "DO-1",
      100,
      120,
      [],
      20,
      true
    ),
    {
      actualPaidAmount: 100,
      settlementCoverageAmount: 120,
      depositDeductionAmount: 20,
    }
  );
});
