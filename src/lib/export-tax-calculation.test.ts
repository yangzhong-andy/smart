import assert from "node:assert/strict";
import test from "node:test";
import { calculateExportTaxLine, resolveExportTaxAvailableQty, roundExportTaxMoney } from "./export-tax-calculation";

test("rounds financial amounts to two decimal places", () => {
  assert.equal(roundExportTaxMoney(10.005), 10.01);
  assert.equal(roundExportTaxMoney(12.344), 12.34);
});

test("calculates declaration, invoice and estimated refund by SKU quantity", () => {
  assert.deepEqual(calculateExportTaxLine({
    qty: 8,
    purchaseUnitPrice: 12.345,
    declarationUnitPrice: 15.678,
    invoiceUnitPrice: 16.2,
    needsInvoice: true,
    needsTaxRefund: true,
    refundRate: 13,
  }), {
    purchaseAmount: 98.76,
    declarationAmount: 125.42,
    invoiceAmount: 129.6,
    estimatedRefundAmount: 16.85,
  });
});

test("does not create invoice or refund amounts when the purposes are disabled", () => {
  const result = calculateExportTaxLine({
    qty: 5,
    purchaseUnitPrice: 10,
    declarationUnitPrice: 11,
    invoiceUnitPrice: 12,
    needsInvoice: false,
    needsTaxRefund: false,
    refundRate: 13,
  });
  assert.equal(result.invoiceAmount, 0);
  assert.equal(result.estimatedRefundAmount, 0);
});

test("limits combined processing to the smaller independent remaining quantity", () => {
  assert.equal(resolveExportTaxAvailableQty({ needsInvoice: true, needsTaxRefund: true, invoiceAvailableQty: 20, refundAvailableQty: 12 }), 12);
  assert.equal(resolveExportTaxAvailableQty({ needsInvoice: true, needsTaxRefund: false, invoiceAvailableQty: 20, refundAvailableQty: 12 }), 20);
  assert.equal(resolveExportTaxAvailableQty({ needsInvoice: false, needsTaxRefund: true, invoiceAvailableQty: 20, refundAvailableQty: 12 }), 12);
});
