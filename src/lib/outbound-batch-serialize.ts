import {
  linesFromBatchItems,
  type BatchSkuLine,
  unitCbmFromVariant,
  unitKgFromVariant,
} from "@/lib/outbound-batch-sku-lines";

function sumLines(lines: BatchSkuLine[]) {
  return lines.reduce(
    (acc, l) => ({
      totalCbm: acc.totalCbm + l.lineVolumeCBM,
      totalKg: acc.totalKg + l.lineWeightKG,
    }),
    { totalCbm: 0, totalKg: 0 }
  );
}

/**
 * 将出库批次转为 API 中的 skuLines（优先批次明细；无则按出库单参考 + estimated）
 * 参数使用 any：Prisma findMany/findUnique 带 include 的推断类型与手写结构常不一致，避免构建报错。
 */
export function buildOutboundBatchSkuPayload(batch: any): {
  skuLines: BatchSkuLine[];
  skuLinesEstimated: boolean;
  skuLinesNote?: string;
  totalVolumeCBM: number;
  totalWeightKG: number;
} {
  const batchItems = batch.outboundBatchItems ?? [];
  if (batchItems.length > 0) {
    // 优先使用批次明细的 qty 分摊；如果某些 batchItem 的 variant 关联丢失/尺寸为空，
    // 则尝试从 outboundOrder.items 中按 variantId/sku 补齐尺寸再计算，避免整条批次体积/重量变 0。
    const orderItems = batch?.outboundOrder?.items ?? [];
    const variantByVariantId = new Map<string, any>();
    const variantBySku = new Map<string, any>();
    for (const it of orderItems as any[]) {
      if (it?.variantId) variantByVariantId.set(String(it.variantId), it.variant ?? null);
      if (it?.sku) variantBySku.set(String(it.sku), it.variant ?? null);
    }

    const skuLines: BatchSkuLine[] = (batchItems as any[]).map((row) => {
      const qty = Number(row?.qty ?? 0) || 0;

      const variant =
        row?.variant ??
        (row?.variantId ? variantByVariantId.get(String(row.variantId)) : null) ??
        (row?.sku ? variantBySku.get(String(row.sku)) : null) ??
        null;

      const unitV = unitCbmFromVariant(variant);
      const unitW = unitKgFromVariant(variant);

      return {
        id: row?.id,
        variantId: row?.variantId ?? null,
        sku: row?.sku ?? "",
        skuName: row?.skuName ?? null,
        spec: row?.spec ?? null,
        qty,
        unitVolumeCBM: unitV,
        unitWeightKG: unitW,
        lineVolumeCBM: unitV * qty,
        lineWeightKG: unitW * qty,
      };
    });

    const { totalCbm, totalKg } = sumLines(skuLines);
    return {
      skuLines,
      skuLinesEstimated: false,
      totalVolumeCBM: totalCbm,
      totalWeightKG: totalKg,
    };
  }

  const order = batch.outboundOrder;
  if (order?.items?.length) {
    const skuLines = linesFromBatchItems(
      order.items.map((it: any) => ({
        id: it.id,
        variantId: it.variantId,
        sku: it.sku,
        skuName: it.skuName,
        spec: it.spec,
        qty: it.qty,
        variant: it.variant,
      }))
    );
    const { totalCbm, totalKg } = sumLines(skuLines);
    return {
      skuLines,
      skuLinesEstimated: true,
      skuLinesNote:
        "此批次创建时未记录 SKU 分摊，以下为出库单全部 SKU 参考；体积重量按整单数量估算，请以实物为准。",
      totalVolumeCBM: totalCbm,
      totalWeightKG: totalKg,
    };
  }

  if (order?.sku) {
    const v = order.variant ?? null;
    const unitV = unitCbmFromVariant(v);
    const unitW = unitKgFromVariant(v);
    const q = batch.qty;
    const skuLines: BatchSkuLine[] = [
      {
        variantId: order.variantId,
        sku: order.sku,
        skuName: null,
        spec: null,
        qty: q,
        unitVolumeCBM: unitV,
        unitWeightKG: unitW,
        lineVolumeCBM: unitV * q,
        lineWeightKG: unitW * q,
      },
    ];
    return {
      skuLines,
      skuLinesEstimated: false,
      totalVolumeCBM: unitV * q,
      totalWeightKG: unitW * q,
    };
  }

  return {
    skuLines: [],
    skuLinesEstimated: false,
    totalVolumeCBM: 0,
    totalWeightKG: 0,
  };
}

export { unitCbmFromVariant, unitKgFromVariant };
