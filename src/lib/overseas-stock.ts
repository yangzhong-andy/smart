import { WarehouseType } from "@prisma/client";
import { prisma } from "./prisma";

/** 各变体在海外仓（Warehouse.type=OVERSEAS）的 Stock 数量合计 */
export async function sumOverseasQtyByVariantIds(
  variantIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (variantIds.length === 0) return map;

  const rows = await prisma.stock.findMany({
    where: {
      variantId: { in: variantIds },
      warehouse: { type: WarehouseType.OVERSEAS },
    },
    select: { variantId: true, qty: true },
  });

  for (const r of rows) {
    map.set(r.variantId, (map.get(r.variantId) ?? 0) + r.qty);
  }
  return map;
}
