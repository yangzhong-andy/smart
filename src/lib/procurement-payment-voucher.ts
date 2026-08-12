export type VoucherValue = string | string[] | null | undefined;

export function hasVoucher(value: VoucherValue): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && item.trim().length > 0);
  }
  return typeof value === "string" && value.trim().length > 0;
}

export function isProcurementPayment(input: {
  category?: unknown;
  summary?: unknown;
}): boolean {
  const category = String(input.category || "").trim();
  const summary = String(input.summary || "").trim();
  return category.startsWith("采购") || summary.startsWith("采购");
}

export function isProcurementTailPayment(input: {
  category?: unknown;
  summary?: unknown;
}): boolean {
  const category = String(input.category || "").trim();
  const summary = String(input.summary || "").trim();
  return category === "采购/采购尾款" || summary.includes("采购尾款");
}

export function serializeVoucher(value: VoucherValue): string | null {
  if (!hasVoucher(value)) return null;
  if (Array.isArray(value)) {
    return JSON.stringify(value.filter((item) => item.trim().length > 0));
  }
  return value!.trim();
}
