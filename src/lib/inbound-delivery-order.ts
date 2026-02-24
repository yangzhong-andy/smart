/**
 * 拿货单入库：统一事务逻辑，供 API 复用
 * 1. 增加 Stock 库存  2. 拿货单状态改为已入库  3. 更新 PendingInbound 已入库数量与状态
 */

import { prisma } from "@/lib/prisma";
import { DeliveryOrderStatus } from "@prisma/client";
import { StockLogReason } from "@prisma/client";
import { InventoryMovementType } from "@prisma/client";

export async function executeDeliveryOrderInbound(
  deliveryOrderId: string,
  warehouseId: string,
  receivedQty: number
): Promise<{ success: true } | { success: false; error: string }> {
  if (receivedQty == null || receivedQty < 0) {
    return { success: false, error: "实收数量需 ≥ 0" };
  }

  const order = await prisma.deliveryOrder.findUnique({
    where: { id: deliveryOrderId },
    include: {
      contract: {
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      pendingInbound: true,
    },
  });

  if (!order) {
    return { success: false, error: "拿货单不存在" };
  }
  if (order.status === DeliveryOrderStatus.RECEIVED) {
    return { success: false, error: "该拿货单已入库，无需重复操作" };
  }
  if (order.status === DeliveryOrderStatus.CANCELLED) {
    return { success: false, error: "该拿货单已取消，无法入库" };
  }

  const contract = order.contract;
  let variantId: string | null = null;
  if (contract.items?.length) {
    variantId = contract.items[0].variantId ?? null;
  }
  if (!variantId && contract.skuId) {
    const byId = await prisma.productVariant.findUnique({
      where: { id: contract.skuId },
    });
    if (byId) variantId = byId.id;
  }
  if (!variantId && contract.sku) {
    const bySku = await prisma.productVariant.findUnique({
      where: { skuId: contract.sku },
    });
    if (bySku) variantId = bySku.id;
  }
  if (!variantId) {
    return {
      success: false,
      error: "无法解析该合同对应的 SKU（variantId），请确认合同已关联产品",
    };
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
  });
  if (!warehouse) {
    return { success: false, error: "所选仓库不存在" };
  }

  await prisma.$transaction(async (tx) => {
    const now = new Date();

    const existing = await tx.stock.findUnique({
      where: {
        variantId_warehouseId: { variantId, warehouseId },
      },
    });

    let qtyBefore: number;
    let qtyAfter: number;
    if (existing) {
      qtyBefore = existing.qty;
      qtyAfter = qtyBefore + receivedQty;
      await tx.stock.update({
        where: { id: existing.id },
        data: {
          qty: qtyAfter,
          availableQty: existing.availableQty + receivedQty,
          updatedAt: now,
        },
      });
    } else {
      qtyBefore = 0;
      qtyAfter = receivedQty;
      await tx.stock.create({
        data: {
          variantId,
          warehouseId,
          qty: receivedQty,
          reservedQty: 0,
          availableQty: receivedQty,
        },
      });
    }

    await tx.stockLog.create({
      data: {
        variantId,
        warehouseId,
        reason: StockLogReason.PURCHASE_INBOUND,
        movementType: InventoryMovementType.DOMESTIC_INBOUND,
        qty: receivedQty,
        qtyBefore,
        qtyAfter,
        operationDate: now,
        relatedOrderId: deliveryOrderId,
        relatedOrderType: "DeliveryOrder",
        relatedOrderNumber: order.deliveryNumber,
        notes: `拿货单入库：${order.deliveryNumber}，实收 ${receivedQty}`,
      },
    });

    await tx.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: { status: DeliveryOrderStatus.RECEIVED, updatedAt: now },
    });

    if (order.pendingInbound) {
      const newReceivedQty = order.pendingInbound.receivedQty + receivedQty;
      const newStatus =
        newReceivedQty >= order.pendingInbound.qty ? "已入库" : "部分入库";
      await tx.pendingInbound.update({
        where: { id: order.pendingInbound.id },
        data: {
          receivedQty: newReceivedQty,
          status: newStatus,
          updatedAt: now,
        },
      });
    }

    await tx.inventoryLog.create({
      data: {
        type: "IN",
        status: "INBOUNDED",
        variantId,
        qty: receivedQty,
        warehouseId,
        deliveryOrderId,
        relatedOrderNo: order.deliveryNumber,
        notes: `拿货单入库：${order.deliveryNumber}，实收 ${receivedQty}`,
      },
    });
  });

  return { success: true };
}
