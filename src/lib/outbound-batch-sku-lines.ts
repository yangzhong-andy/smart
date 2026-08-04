import type { ProductVariant } from "@prisma/client";

/** 由长宽高(cm)算单件体积 CBM */
export function unitCbmFromVariant(v: Pick<ProductVariant, "lengthCm" | "widthCm" | "heightCm"> | null) {
  if (!v) return 0;
  const l = Number(v.lengthCm ?? 0);
  const w = Number(v.widthCm ?? 0);
  const h = Number(v.heightCm ?? 0);
  if (!l || !w || !h) return 0;
  return (l * w * h) / 1_000_000;
}

export function unitKgFromVariant(v: Pick<ProductVariant, "weightKg"> | null) {
  if (!v) return 0;
  return Number(v.weightKg ?? 0) || 0;
}

export type BatchSkuLine = {
  id?: string;
  variantId?: string | null;
  sku: string;
  skuName?: string | null;
  spec?: string | null;
  qty: number;
  unitVolumeCBM: number;
  unitWeightKG: number;
  lineVolumeCBM: number;
  lineWeightKG: number;
};

export function linesFromBatchItems(
  items: Array<{
    id: string;
    variantId: string | null;
    sku: string;
    skuName: string | null;
    spec: string | null;
    qty: number;
    variant: Pick<ProductVariant, "lengthCm" | "widthCm" | "heightCm" | "weightKg"> | null;
  }>
): BatchSkuLine[] {
  return items.map((row) => {
    const unitV = unitCbmFromVariant(row.variant);
    const unitW = unitKgFromVariant(row.variant);
    const q = row.qty || 0;
    return {
      id: row.id,
      variantId: row.variantId,
      sku: row.sku,
      skuName: row.skuName,
      spec: row.spec,
      qty: q,
      unitVolumeCBM: unitV,
      unitWeightKG: unitW,
      lineVolumeCBM: unitV * q,
      lineWeightKG: unitW * q,
    };
  });
}
