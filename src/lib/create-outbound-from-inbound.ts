/**
 * 根据待入库单（及仓库信息）创建出库单
 * - 若该 PendingInbound 已有关联出库单（pendingInboundId），则返回已有，不重复创建
 * - 出库单目的地默认留空，状态为「待出库」，供物流同事后续填写
 */

import { prisma } from "@/lib/prisma";

function generateOutboundNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OB-${date}-${r}`;
}

export type CreateOutboundFromInboundParams = {
  pendingInboundId: string;
  variantId: string;
  sku: string;
  qty: number;
  warehouseId: string;
  warehouseName: string;
};

/**
 * 为已入库的待入库单创建一条出库单（若已存在则返回已有）
 */
export async function createOutboundOrderFromPendingInbound(
  params: CreateOutboundFromInboundParams
): Promise<{ id: string; outboundNumber: string; createdAt: Date }> {
  const { pendingInboundId, variantId, sku, qty, warehouseId, warehouseName } = params;

  const existing = await prisma.outboundOrder.findFirst({
    where: { pendingInboundId },
    select: { id: true, outboundNumber: true, createdAt: true },
  });
  if (existing) {
    return existing;
  }

  let outboundNumber = generateOutboundNumber();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.outboundOrder.findUnique({
      where: { outboundNumber },
      select: { id: true },
    });
    if (!clash) break;
    outboundNumber = generateOutboundNumber();
  }

  const order = await prisma.outboundOrder.create({
    data: {
      outboundNumber,
      variantId,
      sku,
      qty,
      shippedQty: 0,
      warehouseId,
      warehouseName,
      destination: null,
      status: "待出库",
      reason: "入库完成后自动创建",
      pendingInboundId,
    },
    select: { id: true, outboundNumber: true, createdAt: true },
  });

  return order;
}
