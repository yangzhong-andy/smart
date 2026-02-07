import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DeliveryOrderStatus } from '@prisma/client';
import { StockLogReason } from '@prisma/client';
import { InventoryMovementType } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * POST 拿货单入库
 * 事务：1. 增加 Stock 库存  2. 拿货单状态改为已入库  3. 可选更新 PendingInbound
 * Body: { warehouseId: string, receivedQty: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deliveryOrderId } = await params;
  try {
    const body = await request.json();
    const warehouseId = body.warehouseId as string | undefined;
    const receivedQty = body.receivedQty != null ? Number(body.receivedQty) : undefined;

    if (!warehouseId || receivedQty == null || receivedQty < 0) {
      return NextResponse.json(
        { error: '请提供有效的 warehouseId 和实收数量（receivedQty ≥ 0）' },
        { status: 400 }
      );
    }

    const order = await prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: {
        contract: {
          include: {
            items: { orderBy: { sortOrder: 'asc' } }
          }
        },
        pendingInbound: true
      }
    });

    if (!order) {
      return NextResponse.json({ error: '拿货单不存在' }, { status: 404 });
    }
    if (order.status === DeliveryOrderStatus.RECEIVED) {
      return NextResponse.json({ error: '该拿货单已入库，无需重复操作' }, { status: 400 });
    }
    if (order.status === DeliveryOrderStatus.CANCELLED) {
      return NextResponse.json({ error: '该拿货单已取消，无法入库' }, { status: 400 });
    }

    const contract = order.contract;
    let variantId: string | null = null;
    if (contract.items?.length) {
      variantId = contract.items[0].variantId ?? null;
    }
    if (!variantId && contract.skuId) {
      const byId = await prisma.productVariant.findUnique({
        where: { id: contract.skuId }
      });
      if (byId) variantId = byId.id;
    }
    if (!variantId && contract.sku) {
      const bySku = await prisma.productVariant.findUnique({
        where: { skuId: contract.sku }
      });
      if (bySku) variantId = bySku.id;
    }
    if (!variantId) {
      return NextResponse.json(
        { error: '无法解析该合同对应的 SKU（variantId），请确认合同已关联产品' },
        { status: 400 }
      );
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId }
    });
    if (!warehouse) {
      return NextResponse.json({ error: '所选仓库不存在' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();

      const existing = await tx.stock.findUnique({
        where: {
          variantId_warehouseId: { variantId, warehouseId }
        }
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
            updatedAt: now
          }
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
            availableQty: receivedQty
          }
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
          relatedOrderType: 'DeliveryOrder',
          relatedOrderNumber: order.deliveryNumber,
          notes: `拿货单入库：${order.deliveryNumber}，实收 ${receivedQty}`
        }
      });

      await tx.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: { status: DeliveryOrderStatus.RECEIVED, updatedAt: now }
      });

      if (order.pendingInbound) {
        const newReceivedQty = order.pendingInbound.receivedQty + receivedQty;
        const newStatus = newReceivedQty >= order.pendingInbound.qty ? '已入库' : '部分入库';
        await tx.pendingInbound.update({
          where: { id: order.pendingInbound.id },
          data: { receivedQty: newReceivedQty, status: newStatus, updatedAt: now }
        });
      }

      // 国内中转-海外分发：记录 InventoryLog，关联拿货单
      await tx.inventoryLog.create({
        data: {
          type: 'IN',
          status: 'INBOUNDED',
          variantId,
          qty: receivedQty,
          warehouseId,
          deliveryOrderId,
          relatedOrderNo: order.deliveryNumber,
          notes: `拿货单入库：${order.deliveryNumber}，实收 ${receivedQty}`
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: '入库成功，库存已增加，拿货单状态已更新为已入库'
    });
  } catch (error: any) {
    console.error('Delivery order inbound error:', error);
    return NextResponse.json(
      { error: error.message || '入库失败' },
      { status: 500 }
    );
  }
}
