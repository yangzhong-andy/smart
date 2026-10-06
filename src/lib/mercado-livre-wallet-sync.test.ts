import assert from "node:assert/strict";
import test from "node:test";
import { aggregateMercadoOrderReleaseRows, isMercadoInvoiceCollection, parseMercadoPagoReleaseCsv, requiresMercadoOrderReleaseReview, summarizeMercadoWalletBusinessEvents, verifiedMercadoInvoiceCategory } from "./mercado-livre-wallet-sync";

test("parses quoted Mercado Pago release report rows", () => {
  const csv = [
    "DATE,SOURCE_ID,EXTERNAL_REFERENCE,RECORD_TYPE,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT",
    '2026-09-15T07:44:50.000-03:00,179097754068,"order, reference",release,0,50000',
  ].join("\r\n");
  const result = parseMercadoPagoReleaseCsv(csv);
  assert.deepEqual(result.headers, ["DATE", "SOURCE_ID", "EXTERNAL_REFERENCE", "RECORD_TYPE", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT"]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].EXTERNAL_REFERENCE, "order, reference");
  assert.equal(result.rows[0].NET_DEBIT_AMOUNT, "50000");
});

test("keeps duplicate report rows for multiset reconciliation", () => {
  const csv = [
    "DATE,SOURCE_ID,RECORD_TYPE,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT",
    "2026-09-07T18:27:23.000-03:00,177803427964,release,0,67.61",
    "2026-09-07T18:27:23.000-03:00,177803427964,release,0,67.61",
  ].join("\n");
  const result = parseMercadoPagoReleaseCsv(csv);
  assert.equal(result.rows.length, 2);
});

test("nets a grouped Mercado Pago withdrawal into one business event", () => {
  const result = summarizeMercadoWalletBusinessEvents([
    { credit: 50_000, debit: 100_000 },
    { credit: 1_505.93, debit: 0 },
  ]);
  assert.deepEqual(result, { businessEventCount: 2, inflow: 1_505.93, outflow: 50_000 });
});

test("groups Mercado order release and technical reversal by source id", () => {
  const rows = [
    { id: "1", transactionKey: "a", sourceId: "payment-1", netCreditAmount: "84.90", netDebitAmount: "0", externalOrderId: "order-1", orderMp: null, occurredAt: new Date("2026-09-17T10:00:00Z"), cashFlowId: null },
    { id: "2", transactionKey: "b", sourceId: "payment-1", netCreditAmount: "0", netDebitAmount: "10.00", externalOrderId: "order-1", orderMp: null, occurredAt: new Date("2026-09-17T11:00:00Z"), cashFlowId: null },
  ] as any;
  const result = aggregateMercadoOrderReleaseRows(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].eventKey, "payment-1");
  assert.equal(result[0].netAmount, 74.9);
  assert.equal(result[0].latest.id, "2");
});

test("does not add the same order release from overlapping reports twice", () => {
  const occurredAt = new Date("2026-10-01T20:48:02Z");
  const rows = [
    { id: "report-a", reportId: "a", transactionKey: "a", sourceId: "payment-1", netCreditAmount: "47.91", netDebitAmount: "0", externalOrderId: "order-1", orderMp: null, occurredAt, cashFlowId: "old-flow" },
    { id: "report-b", reportId: "b", transactionKey: "b", sourceId: "payment-1", netCreditAmount: "47.91", netDebitAmount: "0", externalOrderId: "order-1", orderMp: null, occurredAt, cashFlowId: null },
  ] as any;
  const [event] = aggregateMercadoOrderReleaseRows(rows);
  assert.equal(event.netAmount, 47.91);
  assert.equal(event.duplicateRows, 1);
  assert.equal(event.linked?.cashFlowId, "old-flow");
  assert.equal(requiresMercadoOrderReleaseReview(event, "95.82"), true);
  assert.equal(requiresMercadoOrderReleaseReview(event, "47.91"), false);
});

test("dedupes overlapping report rows when timestamps differ by a few seconds", () => {
  const rows = [
    { id: "a", reportId: "report-a", transactionKey: "a", sourceId: "payment-time-shift", netCreditAmount: "47.91", netDebitAmount: "0", externalOrderId: "order-1", orderMp: null, occurredAt: new Date("2026-10-01T20:48:02Z"), cashFlowId: null },
    { id: "b", reportId: "report-b", transactionKey: "b", sourceId: "payment-time-shift", netCreditAmount: "47.91", netDebitAmount: "0", externalOrderId: null, orderMp: null, occurredAt: new Date("2026-10-01T20:48:05Z"), cashFlowId: null },
  ] as any;
  const [event] = aggregateMercadoOrderReleaseRows(rows);
  assert.equal(event.netAmount, 47.91);
  assert.equal(event.duplicateRows, 1);
});

test("keeps real repeated rows within one report and dedupes only the overlap", () => {
  const base = { sourceId: "payment-2", netCreditAmount: "84.90", netDebitAmount: "0", externalOrderId: null, orderMp: null, occurredAt: new Date("2026-09-17T10:00:00Z"), cashFlowId: null };
  const rows = [
    { ...base, id: "a1", reportId: "a", transactionKey: "a1" },
    { ...base, id: "a2", reportId: "a", transactionKey: "a2" },
    { ...base, id: "b1", reportId: "b", transactionKey: "b1" },
  ] as any;
  const [event] = aggregateMercadoOrderReleaseRows(rows);
  assert.equal(event.netAmount, 169.8);
  assert.equal(event.duplicateRows, 1);
});

test("dedupes technical reversals across reports without losing their net debit", () => {
  const rows = ["a", "b"].flatMap((reportId) => [
    { id: `${reportId}-credit`, reportId, transactionKey: `${reportId}-credit`, sourceId: "payment-3", netCreditAmount: "47.91", netDebitAmount: "0", externalOrderId: null, orderMp: null, occurredAt: new Date("2026-09-21T10:00:00Z"), cashFlowId: null },
    { id: `${reportId}-debit`, reportId, transactionKey: `${reportId}-debit`, sourceId: "payment-3", netCreditAmount: "0", netDebitAmount: "62.66", externalOrderId: null, orderMp: null, occurredAt: new Date("2026-09-22T10:00:00Z"), cashFlowId: null },
  ]) as any;
  const [event] = aggregateMercadoOrderReleaseRows(rows);
  assert.equal(event.netAmount, -14.75);
  assert.equal(event.duplicateRows, 2);
  assert.equal(requiresMercadoOrderReleaseReview(event, "-29.50"), true);
});

test("flags releases without an official source or report identity for review", () => {
  const base = { id: "1", transactionKey: "row-1", netCreditAmount: "20.00", netDebitAmount: "0", externalOrderId: "order-1", orderMp: null, occurredAt: new Date("2026-09-17T10:00:00Z"), cashFlowId: null };
  assert.equal(aggregateMercadoOrderReleaseRows([{ ...base, sourceId: null, reportId: "report-1" }] as any)[0].missingIdentity, true);
  assert.equal(aggregateMercadoOrderReleaseRows([{ ...base, sourceId: "payment-1", reportId: null }] as any)[0].missingIdentity, true);
  assert.equal(aggregateMercadoOrderReleaseRows([{ ...base, sourceId: "payment-1", reportId: "report-1" }] as any)[0].missingIdentity, false);
});

test("recognizes only account-owned invoice collections, not transfers or order releases", () => {
  const row = {
    sourceId: "000fpss5vb", externalReference: "MELIPAYMENTS-COLLECTIONATTEMPT-3438348964-20260907T012021154",
    paymentMethodType: "account_money", netCreditAmount: "0", netDebitAmount: "1428.04",
    externalOrderId: null, orderMp: null, packId: null, payoutBankAccount: null,
  };
  assert.equal(isMercadoInvoiceCollection(row, "3438348964"), true);
  assert.equal(isMercadoInvoiceCollection(row, "someone-else"), false);
  assert.equal(isMercadoInvoiceCollection({ ...row, netDebitAmount: "0" }, "3438348964"), false);
  assert.equal(isMercadoInvoiceCollection({ ...row, payoutBankAccount: "123" }, "3438348964"), false);
  assert.equal(isMercadoInvoiceCollection({ ...row, externalOrderId: "123" }, "3438348964"), false);
  assert.equal(isMercadoInvoiceCollection({ ...row, externalReference: null }, "3438348964"), false);
});

test("only the audited September invoice is classified as advertising", () => {
  assert.equal(verifiedMercadoInvoiceCategory("3438348964", "000fpss5vb", 1428.04).reviewed, true);
  assert.equal(verifiedMercadoInvoiceCategory("3438348964", "000fpss5vb", 1428.03).reviewed, false);
  assert.equal(verifiedMercadoInvoiceCategory("3438348964", "new-bill", 1428.04).category, "平台资金/待核对账单");
});
