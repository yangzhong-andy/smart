import { WarehouseType, type Prisma } from "@prisma/client";

/**
 * 海外仓 Stock 增加后，同步产品变体：
 * - 从「海运中」inTransit 扣减同等数量（货到入仓，不再在途）
 * - stockQuantity = 工厂 + 国内 + 海运 + 海外仓(Stock 合计)，与库存查询四分仓一致
 */
export async function sumOverseasStockQtyTx(
  tx: Prisma.TransactionClient,
  variantId: string
): Promise<number> {
  const agg = await tx.stock.aggregate({
    where: {
      variantId,
      warehouse: { type: WarehouseType.OVERSEAS },
    },
    _sum: { qty: true },
  });
  return Number(agg._sum.qty ?? 0);
}

export async function patchVariantAfterOverseasReceipt(
  tx: Prisma.TransactionClient,
  variantId: string,
  qtyReceived: number
): Promise<void> {
  if (qtyReceived <= 0) return;

  const v = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: { atFactory: true, atDomestic: true, inTransit: true },
  });
  if (!v) return;

  const newInTransit = Math.max(0, (v.inTransit ?? 0) - qtyReceived);
  const overseas = await sumOverseasStockQtyTx(tx, variantId);
  const stockQuantity =
    (v.atFactory ?? 0) + (v.atDomestic ?? 0) + newInTransit + overseas;

  await tx.productVariant.update({
    where: { id: variantId },
    data: {
      inTransit: newInTransit,
      stockQuantity,
    },
  });
}
