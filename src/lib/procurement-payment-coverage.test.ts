import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProcurementPaymentCoverage,
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
