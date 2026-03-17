import { prisma } from "@/lib/prisma";

/**
 * 同步 ProductVariant 的库存字段
 * 从采购合同的 finishedQty 和待入库单的 receivedQty 计算并更新 atFactory, atDomestic, inTransit
 */
export async function syncProductVariantInventory(variantId?: string) {
  // 如果指定了 variantId，只同步该 SKU
  const whereClause = variantId ? { id: variantId } : {};

  // 1. 获取所有采购合同的 finishedQty（工厂完工）
  const contracts = await prisma.purchaseContractItem.findMany({
    where: variantId ? { variantId } : {},
    select: {
      variantId: true,
      finishedQty: true,
    },
  });

  // 2. 获取所有已入库的待入库单的 receivedQty（国内入库）
  const pendingInbound = await prisma.pendingInbound.findMany({
    where: {
      status: "已入库",
      ...(variantId ? { variantId } : {}),
    },
    select: {
      variantId: true,
      receivedQty: true,
    },
  });

  // 3. 汇总每个 variant 的库存
  const stockMap: Record<string, { atFactory: number; atDomestic: number }> = {};

  for (const item of contracts) {
    if (!item.variantId) continue;
    if (!stockMap[item.variantId]) {
      stockMap[item.variantId] = { atFactory: 0, atDomestic: 0 };
    }
    stockMap[item.variantId].atFactory += item.finishedQty || 0;
  }

  for (const item of pendingInbound) {
    if (!item.variantId) continue;
    if (!stockMap[item.variantId]) {
      stockMap[item.variantId] = { atFactory: 0, atDomestic: 0 };
    }
    stockMap[item.variantId].atDomestic += item.receivedQty || 0;
  }

  // 4. 更新 ProductVariant
  const updates = Object.entries(stockMap).map(([vid, stock]) =>
    prisma.productVariant.update({
      where: { id: vid },
      data: {
        atFactory: stock.atFactory,
        atDomestic: stock.atDomestic,
        inTransit: 0,
        stockQuantity: stock.atFactory + stock.atDomestic + 0,
      },
    })
  );

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  return stockMap;
}
