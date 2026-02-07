import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DeliveryOrderStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const typeMap: Record<string, string> = { IN: '入库', OUT: '出库', TRANSFER: '调拨' };
const statusMap: Record<string, string> = {
  PENDING_INBOUND: '待入库',
  INBOUNDED: '已入库',
  IN_TRANSIT: '在途中',
  ARRIVED: '已到达'
};

// GET - 列表，支持 type / status / warehouseId / deliveryOrderId / variantId 筛选
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const warehouseId = searchParams.get('warehouseId');
    const deliveryOrderId = searchParams.get('deliveryOrderId');
    const variantId = searchParams.get('variantId');

    const where: Record<string, unknown> = {};
    if (type && ['IN', 'OUT', 'TRANSFER'].includes(type)) where.type = type;
    if (status && ['PENDING_INBOUND', 'INBOUNDED', 'IN_TRANSIT', 'ARRIVED'].includes(status)) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    if (deliveryOrderId) where.deliveryOrderId = deliveryOrderId;
    if (variantId) where.variantId = variantId;

    const list = await prisma.inventoryLog.findMany({
      where,
      include: {
        variant: { include: { product: true } },
        warehouse: true,
        fromWarehouse: true,
        toWarehouse: true,
        deliveryOrder: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const transformed = list.map((log) => ({
      id: log.id,
      type: log.type,
      typeLabel: typeMap[log.type] || log.type,
      status: log.status,
      statusLabel: statusMap[log.status] || log.status,
      variantId: log.variantId,
      skuId: log.variant?.skuId,
      productName: log.variant?.product?.name,
      qty: log.qty,
      warehouseId: log.warehouseId,
      warehouseName: log.warehouse?.name,
      fromWarehouseId: log.fromWarehouseId,
      fromWarehouseName: log.fromWarehouse?.name,
      toWarehouseId: log.toWarehouseId,
      toWarehouseName: log.toWarehouse?.name,
      deliveryOrderId: log.deliveryOrderId,
      deliveryNumber: log.deliveryOrder?.deliveryNumber,
      relatedOrderNo: log.relatedOrderNo,
      notes: log.notes,
      createdAt: log.createdAt.toISOString(),
      updatedAt: log.updatedAt.toISOString()
    }));

    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Inventory logs GET:', error);
    if (error.message?.includes('does not exist') || error.code === 'P2021') {
      return NextResponse.json([]);
    }
    return NextResponse.json(
      { error: 'Failed to fetch inventory logs', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 新增流水；国内仓入库(IN+INBOUNDED)且带 deliveryOrderId 时自动更新 Stock 与拿货单状态
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type === 'OUT' ? 'OUT' : body.type === 'TRANSFER' ? 'TRANSFER' : 'IN';
    const status = ['PENDING_INBOUND', 'INBOUNDED', 'IN_TRANSIT', 'ARRIVED'].includes(body.status)
      ? body.status
      : 'PENDING_INBOUND';
    const variantId = body.variantId;
    const qty = body.qty != null ? Number(body.qty) : 0;
    const warehouseId = body.warehouseId || null;
    const fromWarehouseId = body.fromWarehouseId || null;
    const toWarehouseId = body.toWarehouseId || null;
    const deliveryOrderId = body.deliveryOrderId || null;
    const relatedOrderNo = body.relatedOrderNo || null;
    const notes = body.notes || null;

    if (!variantId || qty <= 0) {
      return NextResponse.json(
        { error: 'variantId 必填，qty 必须大于 0' },
        { status: 400 }
      );
    }

    // 国内仓入库且已入库、关联拿货单：事务内更新 Stock + DeliveryOrder + 写 InventoryLog
    if (type === 'IN' && status === 'INBOUNDED' && deliveryOrderId && warehouseId) {
      const order = await prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: { contract: true }
      });
      if (!order) {
        return NextResponse.json({ error: '拿货单不存在' }, { status: 400 });
      }
      if (order.status === DeliveryOrderStatus.RECEIVED) {
        return NextResponse.json({ error: '该拿货单已入库' }, { status: 400 });
      }
      const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!warehouse) {
        return NextResponse.json({ error: '仓库不存在' }, { status: 400 });
      }

      await prisma.$transaction(async (tx) => {
        const existing = await tx.stock.findUnique({
          where: { variantId_warehouseId: { variantId, warehouseId } }
        });
        if (existing) {
          await tx.stock.update({
            where: { id: existing.id },
            data: {
              qty: existing.qty + qty,
              availableQty: existing.availableQty + qty,
              updatedAt: new Date()
            }
          });
        } else {
          await tx.stock.create({
            data: {
              variantId,
              warehouseId,
              qty,
              reservedQty: 0,
              availableQty: qty
            }
          });
        }
        await tx.deliveryOrder.update({
          where: { id: deliveryOrderId },
          data: { status: DeliveryOrderStatus.RECEIVED, updatedAt: new Date() }
        });
        await tx.inventoryLog.create({
          data: {
            type: 'IN',
            status: 'INBOUNDED',
            variantId,
            qty,
            warehouseId,
            deliveryOrderId,
            relatedOrderNo: relatedOrderNo || order.deliveryNumber,
            notes
          }
        });
      });
      const created = await prisma.inventoryLog.findFirst({
        where: { deliveryOrderId, type: 'IN', status: 'INBOUNDED' },
        orderBy: { createdAt: 'desc' },
        include: { variant: { include: { product: true } }, warehouse: true, deliveryOrder: true }
      });
      return NextResponse.json(
        {
          id: created?.id,
          type: 'IN',
          status: 'INBOUNDED',
          variantId,
          qty,
          warehouseId,
          deliveryOrderId,
          message: '已入库并更新拿货单状态'
        },
        { status: 201 }
      );
    }

    // 仅写流水（不改库存/拿货单）
    const log = await prisma.inventoryLog.create({
      data: {
        type,
        status,
        variantId,
        qty,
        warehouseId,
        fromWarehouseId,
        toWarehouseId,
        deliveryOrderId,
        relatedOrderNo,
        notes
      },
      include: {
        variant: { include: { product: true } },
        warehouse: true,
        fromWarehouse: true,
        toWarehouse: true,
        deliveryOrder: true
      }
    });

    return NextResponse.json(
      {
        id: log.id,
        type: log.type,
        typeLabel: typeMap[log.type],
        status: log.status,
        statusLabel: statusMap[log.status],
        variantId: log.variantId,
        skuId: log.variant?.skuId,
        productName: log.variant?.product?.name,
        qty: log.qty,
        warehouseId: log.warehouseId,
        warehouseName: log.warehouse?.name,
        fromWarehouseId: log.fromWarehouseId,
        toWarehouseId: log.toWarehouseId,
        deliveryOrderId: log.deliveryOrderId,
        deliveryNumber: log.deliveryOrder?.deliveryNumber,
        relatedOrderNo: log.relatedOrderNo,
        notes: log.notes,
        createdAt: log.createdAt.toISOString(),
        updatedAt: log.updatedAt.toISOString()
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Inventory logs POST:', error);
    return NextResponse.json(
      { error: error.message || '创建库存流水失败' },
      { status: 500 }
    );
  }
}
