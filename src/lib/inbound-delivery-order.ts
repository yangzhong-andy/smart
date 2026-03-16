/**
 * 拿货单入库：统一事务逻辑，供 API 复用
 * 1. 增加 Stock 库存  2. 拿货单状态改为已入库  3. 更新 PendingInbound 已入库数量与状态
 * 4. 当待入库单变为「已入库」时，自动创建一条出库单（目的地留空，待物流填写）
 */

import { prisma } from "@/lib/prisma";
import { createOutboundOrderFromPendingInbound } from "@/lib/create-outbound-from-inbound";
import { DeliveryOrderStatus, StockLogReason, InventoryMovementType } from "@prisma/client";

// 处理库存入库的辅助函数
async function processStockInbound(
  tx: any,
  variantId: string,
  warehouseId: string,
  receivedQty: number,
  deliveryOrderId: string,
  deliveryNumber: string
) {
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
      relatedOrderNumber: deliveryNumber,
      notes: `拿货单入库：${deliveryNumber}，实收 ${receivedQty}`,
    },
  });
}

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
  const itemQtys = order.itemQtys as Record<string, number> | null;
  
  // 获取所有有 variantId 的 items
  const itemsWithVariant = (contract.items || []).filter((item) => item.variantId);
  
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
  });
  if (!warehouse) {
    return { success: false, error: "所选仓库不存在" };
  }

  let outboundParams: { pendingInboundId: string; sku: string; qty: number; variantId?: string } | null = null;
  
  // 获取单个 SKU 入库时的 variantId（用于后续创建 pendingInbound）
  let singleSkuVariantId: string | null = null;
  
  await prisma.$transaction(async (tx) => {
    const now = new Date();

    // 如果有 itemQtys 且有带 variantId 的 items，遍历每个 SKU 入库
    if (itemQtys && Object.keys(itemQtys).length > 0 && itemsWithVariant.length > 0) {
      for (const item of itemsWithVariant) {
        const variantId = item.variantId!;
        const receivedQty = itemQtys[item.id] || 0;
        if (receivedQty <= 0) continue;
        await processStockInbound(tx, variantId, warehouseId, receivedQty, deliveryOrderId, order.deliveryNumber);
      }
      // 多 SKU 入库时不需要后续的 pendingInbound 创建逻辑
    } else {
      // 兼容旧逻辑：单个 SKU 入库
      if (contract.items?.length) {
        singleSkuVariantId = contract.items[0].variantId ?? null;
      }
      if (!singleSkuVariantId && contract.skuId) {
        const byId = await tx.productVariant.findUnique({
          where: { id: contract.skuId },
        });
        if (byId) singleSkuVariantId = byId.id;
      }
      if (!singleSkuVariantId && contract.sku) {
        const bySku = await tx.productVariant.findUnique({
          where: { skuId: contract.sku },
        });
        if (bySku) singleSkuVariantId = bySku.id;
      }
      if (!singleSkuVariantId) {
        throw new Error("无法解析该合同对应的 SKU（variantId），请确认合同已关联产品");
      }
      await processStockInbound(tx, singleSkuVariantId, warehouseId, receivedQty, deliveryOrderId, order.deliveryNumber);
    }

    // 更新拿货单状态
    await tx.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: { status: DeliveryOrderStatus.RECEIVED, updatedAt: now },
    });

    let pendingInboundIdForBatch: string;
    const batchNum = `IB-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (order.pendingInbound) {
      const newReceivedQty = order.pendingInbound.receivedQty + receivedQty;
      const newStatus =
        newReceivedQty >= order.pendingInbound.qty ? "已入库" : "部分入库";
      if (newStatus === "已入库") {
        outboundParams = {
          pendingInboundId: order.pendingInbound.id,
          sku: order.pendingInbound.sku,
          qty: order.pendingInbound.qty,
        };
      }
      await tx.pendingInbound.update({
        where: { id: order.pendingInbound.id },
        data: {
          receivedQty: newReceivedQty,
          status: newStatus,
          updatedAt: now,
        },
      });
      pendingInboundIdForBatch = order.pendingInbound.id;
    } else {
      // 拿货单无关联待入库单时（如直接从拿货单页入库），补建待入库单并建批次，保证「入库批次列表」有数据
      const skuDisplay = (contract.sku && contract.sku.trim()) ? contract.sku.trim() : (contract.skuId || order.deliveryNumber || "SKU");
      const newPending = await tx.pendingInbound.create({
        data: {
          inboundNumber: `IN-${order.deliveryNumber}-${Date.now()}`,
          deliveryOrderId: order.id,
          deliveryNumber: order.deliveryNumber,
          contractId: contract.id,
          contractNumber: contract.contractNumber ?? "",
          sku: skuDisplay,
          variantId: singleSkuVariantId!,
          qty: order.qty,
          receivedQty,
          status: "已入库",
          domesticTrackingNumber: order.domesticTrackingNumber ?? null,
          shippedDate: order.shippedDate ?? null,
          updatedAt: now,
        },
      });
      pendingInboundIdForBatch = newPending.id;
      outboundParams = { pendingInboundId: newPending.id, sku: skuDisplay, qty: order.qty, variantId: singleSkuVariantId! };
    }

    // 同步创建一条入库批次，使「入库批次列表」有数据
    await tx.inboundBatch.create({
      data: {
        pendingInboundId: pendingInboundIdForBatch,
        batchNumber: batchNum,
        warehouseId,
        warehouseName: warehouse.name,
        qty: receivedQty,
        receivedDate: now,
        notes: `拿货单 ${order.deliveryNumber} 入库`,
      },
    });

    // 只有单 SKU 入库时才创建 inventoryLog（多 SKU 情况较复杂，暂不处理）
    if (singleSkuVariantId) {
      await tx.inventoryLog.create({
        data: {
          type: "IN",
          status: "INBOUNDED",
          variantId: singleSkuVariantId,
          qty: receivedQty,
          warehouseId,
          deliveryOrderId,
          relatedOrderNo: order.deliveryNumber,
          notes: `拿货单入库：${order.deliveryNumber}，实收 ${receivedQty}`,
        },
      });
    }
  });

  // 入库完成后自动创建出库单（事务外执行，避免循环依赖）
  const params = outboundParams as { pendingInboundId: string; sku: string; qty: number; variantId?: string } | null;
  if (params) {
    try {
      await createOutboundOrderFromPendingInbound({
        pendingInboundId: params.pendingInboundId,
        variantId: params.variantId || '',
        sku: params.sku,
        qty: params.qty,
        warehouseId,
        warehouseName: warehouse.name,
      });
    } catch (err) {
      console.error("入库完成后自动创建出库单失败:", err);
      // 不阻断入库成功结果
    }
  }

  return { success: true };
}
