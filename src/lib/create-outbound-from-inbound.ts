/**
 * 根据待入库单（及仓库信息）创建出库单
 * - 若该 PendingInbound 已有关联出库单（pendingInboundId），则返回已有，不重复创建
 * - 出库单目的地默认留空，状态为「待出库」，供物流同事后续填写
 * - 支持多SKU（从 PendingInbound.items 获取）
 */

import { prisma } from "@/lib/prisma";

function generateOutboundNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OB-${date}-${r}`;
}

export type CreateOutboundFromInboundParams = {
  pendingInboundId: string;
  variantId?: string;
  sku?: string;
  qty?: number;
  warehouseId: string;
  warehouseName: string;
};

/**
 * 为已入库的待入库单创建一条出库单（若已存在则返回已有）
 */
export async function createOutboundOrderFromPendingInbound(
  params: CreateOutboundFromInboundParams
): Promise<{ id: string; outboundNumber: string; createdAt: Date }> {
  const { pendingInboundId, warehouseId, warehouseName } = params;

  // 检查是否已存在出库单
  const existing = await prisma.outboundOrder.findFirst({
    where: { pendingInboundId },
    select: { id: true, outboundNumber: true, createdAt: true },
  });
  if (existing) {
    return existing;
  }

  // 获取待入库单的items明细
  const pending = await prisma.pendingInbound.findUnique({
    where: { id: pendingInboundId },
    include: { items: true }
  });

  if (!pending) {
    throw new Error("待入库单不存在");
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

  // 判断是多SKU还是单SKU
  const hasItems = pending.items && pending.items.length > 0;
  
  if (hasItems) {
    // 多SKU模式：只基于“实际已入库数量”创建出库明细，避免把计划数量误带入出库单
    const shippedItems = pending.items
      .filter((item) => Number(item.receivedQty) > 0)
      .map((item) => ({
        variantId: item.variantId || null,
        sku: item.sku,
        skuName: item.skuName || null,
        spec: item.spec || null,
        qty: Number(item.receivedQty) || 0,
        shippedQty: 0,
        unitPrice: item.unitPrice ? Number(item.unitPrice) : null,
      }));

    const totalQty = shippedItems.reduce((sum, item) => sum + item.qty, 0);
    if (totalQty <= 0) {
      throw new Error("待入库单尚无实际入库数量，无法自动创建出库单");
    }
    const firstItem = shippedItems[0];
    
    const order = await prisma.outboundOrder.create({
      data: {
        outboundNumber,
        // 单SKU字段用第一个item（兼容）
        variantId: firstItem?.variantId || null,
        sku: firstItem?.sku || null,
        qty: totalQty,
        shippedQty: 0,
        warehouseId,
        warehouseName,
        destination: null,
        status: "待出库",
        reason: "入库完成后自动创建",
        pendingInboundId,
        items: {
          create: shippedItems
        }
      },
      select: { id: true, outboundNumber: true, createdAt: true },
    });

    return order;
  } else {
    // 单SKU模式（兼容旧版本）
    const { variantId, sku, qty } = params;
    
    const order = await prisma.outboundOrder.create({
      data: {
        outboundNumber,
        variantId: variantId || null,
        sku: sku || null,
        qty: qty || 0,
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
}
