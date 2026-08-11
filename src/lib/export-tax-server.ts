import type { Prisma } from "@prisma/client";

export function money(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export function decimalValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dateValue(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function textValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function voucherValue(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function voucherArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

export function serializeExportTaxCase(row: any, options?: { includeVouchers?: boolean }) {
  const includeVouchers = options?.includeVouchers !== false;
  return {
    id: row.id,
    caseNumber: row.caseNumber,
    deliveryOrderId: row.deliveryOrderId,
    deliveryNumber: row.deliveryNumber,
    contractId: row.contractId,
    contractNumber: row.contractNumber,
    supplierId: row.supplierId ?? undefined,
    supplierName: row.supplierName,
    exporterId: row.exporterId ?? undefined,
    exporterName: row.exporterName ?? undefined,
    destinationCountry: row.destinationCountry ?? undefined,
    status: row.status,
    declarationCurrency: row.declarationCurrency,
    declarationAmount: Number(row.declarationAmount),
    customsDeclarationNumber: row.customsDeclarationNumber ?? undefined,
    declarationDate: row.declarationDate?.toISOString(),
    declarationVouchers: includeVouchers ? voucherArray(row.declarationVouchers) : [],
    invoiceStatus: row.invoiceStatus,
    invoiceCurrency: row.invoiceCurrency,
    invoiceAmount: Number(row.invoiceAmount),
    invoiceNumber: row.invoiceNumber ?? undefined,
    invoiceDate: row.invoiceDate?.toISOString(),
    invoiceReceivedDate: row.invoiceReceivedDate?.toISOString(),
    invoiceVouchers: includeVouchers ? voucherArray(row.invoiceVouchers) : [],
    taxPointStatus: row.taxPointStatus,
    taxPointRate: row.taxPointRate == null ? undefined : Number(row.taxPointRate),
    taxPointAmount: Number(row.taxPointAmount),
    taxPointPaidAmount: Number(row.taxPointPaidAmount),
    taxPointPaidDate: row.taxPointPaidDate?.toISOString(),
    taxPointVouchers: includeVouchers ? voucherArray(row.taxPointVouchers) : [],
    refundStatus: row.refundStatus,
    refundCurrency: row.refundCurrency,
    refundRate: row.refundRate == null ? undefined : Number(row.refundRate),
    refundClaimAmount: Number(row.refundClaimAmount),
    refundReceivedAmount: Number(row.refundReceivedAmount),
    refundApplicationDate: row.refundApplicationDate?.toISOString(),
    refundReceivedDate: row.refundReceivedDate?.toISOString(),
    refundVouchers: includeVouchers ? voucherArray(row.refundVouchers) : [],
    notes: row.notes ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: (row.items || []).map((item: any) => ({
      id: item.id,
      contractItemId: item.contractItemId,
      sku: item.sku,
      skuName: item.skuName ?? undefined,
      spec: item.spec ?? undefined,
      qty: item.qty,
      needsInvoice: item.needsInvoice,
      needsTaxRefund: item.needsTaxRefund,
      purchaseUnitPrice: Number(item.purchaseUnitPrice),
      purchaseAmount: Number(item.purchaseAmount),
      declarationUnitPrice: Number(item.declarationUnitPrice),
      declarationAmount: Number(item.declarationAmount),
      invoiceUnitPrice: item.invoiceUnitPrice == null ? undefined : Number(item.invoiceUnitPrice),
      invoiceAmount: Number(item.invoiceAmount),
      taxRate: item.taxRate == null ? undefined : Number(item.taxRate),
      refundRate: item.refundRate == null ? undefined : Number(item.refundRate),
      estimatedRefundAmount: Number(item.estimatedRefundAmount),
      hsCode: item.hsCode ?? undefined,
      customsName: item.customsName ?? undefined,
    })),
  };
}
