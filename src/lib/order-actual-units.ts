type QuantityLine = { quantity?: unknown; seller_sku?: unknown; sellerSku?: unknown; sku?: unknown; item_sku?: unknown; model_sku?: unknown; itemSku?: unknown; modelSku?: unknown };

function positiveQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? Math.max(1, Math.trunc(quantity)) : 1;
}

export function sumActualUnits(lines: unknown, fallbackLineCount = 0) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return Math.max(0, Math.trunc(Number(fallbackLineCount) || 0));
  }

  return lines.reduce((total, line) => {
    if (!line || typeof line !== "object") return total;
    return total + positiveQuantity((line as QuantityLine).quantity);
  }, 0);
}

function sellerSku(line: QuantityLine) {
  return String(line.model_sku || line.modelSku || line.item_sku || line.itemSku || line.seller_sku || line.sellerSku || line.sku || "")
    .trim()
    .toLowerCase();
}

/** Count Shopee sales units and expand mapped bundle SKUs into physical units. */
export function shopeeOrderUnitCounts(
  lines: unknown,
  physicalFactorForSku: (sellerSku: string) => number = () => 1,
) {
  if (!Array.isArray(lines) || lines.length === 0) return { salesUnits: 0, physicalUnits: 0 };
  return lines.reduce((totals, line) => {
    if (!line || typeof line !== "object") return totals;
    const item = line as QuantityLine;
    const quantity = positiveQuantity(item.quantity);
    const factor = Math.max(1, Math.trunc(Number(physicalFactorForSku(sellerSku(item))) || 1));
    totals.salesUnits += quantity;
    totals.physicalUnits += quantity * factor;
    return totals;
  }, { salesUnits: 0, physicalUnits: 0 });
}

export function warehouseBillingUnits(
  salesUnits: number,
  physicalUnits: number,
  billingUnit: string | null | undefined,
) {
  const normalizedSalesUnits = Math.max(0, Math.trunc(Number(salesUnits) || 0));
  const normalizedPhysicalUnits = Math.max(normalizedSalesUnits, Math.trunc(Number(physicalUnits) || 0));
  return billingUnit === "INTERNAL_COMPONENT" || normalizedPhysicalUnits > normalizedSalesUnits
    ? normalizedPhysicalUnits
    : normalizedSalesUnits;
}

export function tiktokActualUnits(rawData: unknown, fallbackLineCount = 0) {
  return tiktokOrderUnitCounts(rawData, fallbackLineCount).salesUnits;
}

export function tiktokOrderUnitCounts(
  rawData: unknown,
  fallbackLineCount = 0,
  physicalFactorForSku: (sellerSku: string) => number = () => 1,
) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    const fallback = sumActualUnits(null, fallbackLineCount);
    return { salesUnits: fallback, physicalUnits: fallback };
  }

  const lines = (rawData as { line_items?: unknown }).line_items;
  if (!Array.isArray(lines) || lines.length === 0) {
    const fallback = sumActualUnits(null, fallbackLineCount);
    return { salesUnits: fallback, physicalUnits: fallback };
  }

  return lines.reduce((totals, line) => {
    if (!line || typeof line !== "object") return totals;
    const item = line as QuantityLine;
    const quantity = positiveQuantity(item.quantity);
    const sellerSku = String(item.seller_sku || item.sellerSku || item.sku || "").trim().toLowerCase();
    const factor = Math.max(1, Math.trunc(Number(physicalFactorForSku(sellerSku)) || 1));
    totals.salesUnits += quantity;
    totals.physicalUnits += quantity * factor;
    return totals;
  }, { salesUnits: 0, physicalUnits: 0 });
}

export function isTikTokSalesOrder(status: string | null | undefined, rawData: unknown) {
  if (status === "CANCELLED" || status === "UNPAID") return false;
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return true;
  return !(rawData as { is_sample_order?: unknown }).is_sample_order;
}

export function isShopeeSalesOrder(status: string | null | undefined) {
  const normalizedStatus = String(status || "UNKNOWN").trim().toUpperCase();
  return !normalizedStatus.includes("CANCEL") && !["UNPAID", "INCOMPLETE"].includes(normalizedStatus);
}
