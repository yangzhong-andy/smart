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
    const skuLines = linesFromBatchItems(batchItems);
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
      order.items.map((it) => ({
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
