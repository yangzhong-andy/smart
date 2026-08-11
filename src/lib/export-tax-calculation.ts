export function roundExportTaxMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveExportTaxAvailableQty(input: {
  needsInvoice: boolean;
  needsTaxRefund: boolean;
  invoiceAvailableQty: number;
  refundAvailableQty: number;
}): number {
  if (input.needsInvoice && input.needsTaxRefund) {
    return Math.min(input.invoiceAvailableQty, input.refundAvailableQty);
  }
  if (input.needsInvoice) return input.invoiceAvailableQty;
  if (input.needsTaxRefund) return input.refundAvailableQty;
  return 0;
}

export function calculateExportTaxLine(input: {
  qty: number;
  purchaseUnitPrice: number;
  declarationUnitPrice: number;
  invoiceUnitPrice: number | null;
  needsInvoice: boolean;
  needsTaxRefund: boolean;
  refundRate: number | null;
}) {
  const purchaseAmount = roundExportTaxMoney(input.qty * input.purchaseUnitPrice);
  const declarationAmount = roundExportTaxMoney(input.qty * input.declarationUnitPrice);
  const invoiceAmount = input.needsInvoice && input.invoiceUnitPrice != null
    ? roundExportTaxMoney(input.qty * input.invoiceUnitPrice)
    : 0;
  const estimatedRefundAmount = input.needsTaxRefund && input.refundRate != null
    ? roundExportTaxMoney(invoiceAmount * input.refundRate / 100)
    : 0;

  return { purchaseAmount, declarationAmount, invoiceAmount, estimatedRefundAmount };
}
