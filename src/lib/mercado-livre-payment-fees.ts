import type { MercadoPagoPayment } from "@/lib/mercado-livre-api";

export type MercadoLivrePaymentFeeBreakdown = {
  financingFee: number;
  processingFee: number;
  saleCommission: number;
  sellerShipping: number;
  hasPaymentDetails: boolean;
  hasChargesDetails: boolean;
  hasFinancingFee: boolean;
  hasProcessingFee: boolean;
  hasSaleCommission: boolean;
  hasSellerShipping: boolean;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function chargeCode(charge: unknown): string {
  const value = record(charge);
  const metadata = record(value.metadata);
  return text(value.code || value.name || metadata.reason || value.type);
}

function chargeNetAmount(charge: unknown): number {
  const value = record(charge);
  const amounts = record(value.amounts);
  const original = number(amounts.original || value.amount || value.value);
  const refunded = number(amounts.refunded || value.refunded_amount);
  return Math.max(0, original - refunded);
}

function addCodeTotal(
  charges: unknown[],
  codes: Set<string>,
  acceptedCodes: Set<string>,
) {
  let total = 0;
  for (const charge of charges) {
    const code = chargeCode(charge);
    if (!acceptedCodes.has(code)) continue;
    codes.add(code);
    total += chargeNetAmount(charge);
  }
  return total;
}

/**
 * Mercado Pago exposes the order deductions in payment.charges_details.
 * Financing transfer is intentionally excluded: it is a settlement movement,
 * not an additional fee, and including it together with mp_financing_fee
 * would double-count the financing charge.
 */
export function mercadoLivrePaymentFeeBreakdown(
  payments: MercadoPagoPayment[],
): MercadoLivrePaymentFeeBreakdown {
  const charges = payments.flatMap((payment) => Array.isArray(payment.charges_details) ? payment.charges_details : []);
  const codes = new Set<string>();
  const hasChargesDetails = payments.some((payment) => Array.isArray(payment.charges_details));
  const saleCommission = addCodeTotal(charges, codes, new Set(["ml_sale_fee"]));
  const processingFee = addCodeTotal(charges, codes, new Set(["mp_processing_fee"]));

  // mp_financing_fee is the canonical total. Some older payment records only
  // expose mp_financing_1x_fee or financing_fee, so use those as fallbacks.
  const canonicalFinancing = addCodeTotal(charges, codes, new Set(["mp_financing_fee"]));
  let financingFee = canonicalFinancing;
  let hasFinancingFee = codes.has("mp_financing_fee");
  if (!hasFinancingFee) {
    financingFee = addCodeTotal(charges, codes, new Set(["mp_financing_1x_fee", "financing_fee"]));
    hasFinancingFee = codes.has("mp_financing_1x_fee") || codes.has("financing_fee");
  }
  const sellerShipping = addCodeTotal(charges, codes, new Set(["shp_cross_docking"]));

  return {
    financingFee: roundMoney(financingFee),
    processingFee: roundMoney(processingFee),
    saleCommission: roundMoney(saleCommission),
    sellerShipping: roundMoney(sellerShipping),
    hasPaymentDetails: payments.length > 0,
    hasChargesDetails,
    hasFinancingFee,
    hasProcessingFee: codes.has("mp_processing_fee"),
    hasSaleCommission: codes.has("ml_sale_fee"),
    hasSellerShipping: codes.has("shp_cross_docking"),
  };
}

export function emptyMercadoLivrePaymentFeeBreakdown(): MercadoLivrePaymentFeeBreakdown {
  return {
    financingFee: 0,
    processingFee: 0,
    saleCommission: 0,
    sellerShipping: 0,
    hasPaymentDetails: false,
    hasChargesDetails: false,
    hasFinancingFee: false,
    hasProcessingFee: false,
    hasSaleCommission: false,
    hasSellerShipping: false,
  };
}
