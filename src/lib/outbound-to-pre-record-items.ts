import { Prisma } from "@prisma/client";

/** 与出库批次详情 API 一致的出库单 include，用于拉 SKU + 尺寸重量 */
export const OUTBOUND_ORDER_DETAIL_FOR_PRE: Prisma.OutboundOrderInclude = {
  items: {
    orderBy: { id: "asc" },
    include: {
      variant: {
        select: {
          skuId: true,
          weightKg: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          color: true,
          size: true,
          product: { select: { name: true } },
        },
      },
    },
  },
  variant: {
    select: {
      skuId: true,
      weightKg: true,
      lengthCm: true,
      widthCm: true,
      heightCm: true,
      product: { select: { name: true } },
    },
  },
};

export type PreRecordItemFromBatch = {
  variantId: string | null;
  sku: string;
  skuName: string | null;
  spec: string | null;
  qty: number;
  unitVolumeCBM: number;
  unitWeightKG: number;
  totalVolumeCBM: number;
  totalWeightKG: number;
};

function pieceVolumeM3FromCm(
  l: Prisma.Decimal | null | undefined,
  w: Prisma.Decimal | null | undefined,
  h: Prisma.Decimal | null | undefined
): number {
  if (l == null || w == null || h == null) return 0;
  return (Number(l.toString()) * Number(w.toString()) * Number(h.toString())) / 1_000_000;
}

/**
 * 根据出库单明细 + 本批次件数，生成柜子预录单行（体积 m³、重量 kg）
 */
export function buildPreRecordItemsFromOutboundOrder(
  order: Prisma.OutboundOrderGetPayload<{ include: typeof OUTBOUND_ORDER_DETAIL_FOR_PRE }>,
  batchQty: number
): PreRecordItemFromBatch[] {
  if (order.items.length > 0) {
    return order.items.map((item) => {
      // Prisma 类型在不同环境可能未包含关联字段（运行时是有的），这里做一次防御转换
      const v = (item as any).variant as any;
      const unitW = v?.weightKg != null ? Number(v.weightKg) : 0;
      const unitVol = pieceVolumeM3FromCm(v?.lengthCm, v?.widthCm, v?.heightCm);
      return {
        variantId: item.variantId,
        sku: item.sku,
        skuName: item.skuName ?? v?.product?.name ?? null,
        spec: item.spec ?? null,
        qty: item.qty,
        unitVolumeCBM: unitVol,
        unitWeightKG: unitW,
        totalVolumeCBM: unitVol * item.qty,
        totalWeightKG: unitW * item.qty,
      };
    });
  }

  const v = (order as any).variant as any;
  const unitW = v?.weightKg != null ? Number(v.weightKg) : 0;
  const unitVol = pieceVolumeM3FromCm(v?.lengthCm, v?.widthCm, v?.heightCm);
  const q = batchQty;
  return [
    {
      variantId: order.variantId,
      sku: order.sku ?? v?.skuId ?? "",
      skuName: v?.product?.name ?? null,
      spec: null,
      qty: q,
      unitVolumeCBM: unitVol,
      unitWeightKG: unitW,
      totalVolumeCBM: unitVol * q,
      totalWeightKG: unitW * q,
    },
  ];
}
