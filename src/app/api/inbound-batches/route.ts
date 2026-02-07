import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DeliveryOrderStatus } from '@prisma/client'
import { StockLogReason } from '@prisma/client'
import { InventoryMovementType } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET - 获取所有入库批次
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pendingInboundId = searchParams.get('pendingInboundId')
    const warehouseId = searchParams.get('warehouseId')

    const where: any = {}
    if (pendingInboundId) where.pendingInboundId = pendingInboundId
    if (warehouseId) where.warehouseId = warehouseId

    const batches = await prisma.inboundBatch.findMany({
      where,
      include: {
        pendingInbound: true,
        warehouse: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const transformed = batches.map(batch => ({
      id: batch.id,
      inboundId: batch.pendingInboundId,
      batchNumber: batch.batchNumber,
      warehouse: batch.warehouseName,
      warehouseId: batch.warehouseId,
      qty: batch.qty,
      receivedDate: batch.receivedDate.toISOString(),
      notes: batch.notes || undefined,
      createdAt: batch.createdAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching inbound batches:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inbound batches' },
      { status: 500 }
    )
  }
}

// POST - 创建新入库批次（国内入库页登记）：同时增加库存、更新拿货单状态、写流水
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const warehouseId = body.warehouseId
    const inboundId = body.inboundId
    const qty = Number(body.qty) || 0
    if (!warehouseId || !inboundId || qty <= 0) {
      return NextResponse.json(
        { error: '请提供 inboundId、warehouseId 和有效数量' },
        { status: 400 }
      )
    }

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId }
    })
    if (!warehouse) {
      return NextResponse.json(
        { error: '仓库不存在' },
        { status: 400 }
      )
    }

    const pendingInbound = await prisma.pendingInbound.findUnique({
      where: { id: inboundId },
      include: {
        deliveryOrder: { include: { contract: { include: { items: { orderBy: { sortOrder: 'asc' } } } } } },
        variant: true
      }
    })
    if (!pendingInbound) {
      return NextResponse.json(
        { error: '待入库单不存在' },
        { status: 400 }
      )
    }

    let variantId: string | null = pendingInbound.variantId ?? null
    if (!variantId && pendingInbound.deliveryOrder?.contract) {
      const contract = pendingInbound.deliveryOrder.contract
      if (contract.items?.length) variantId = contract.items[0].variantId ?? null
      if (!variantId && contract.skuId) {
        const v = await prisma.productVariant.findUnique({ where: { id: contract.skuId } })
        if (v) variantId = v.id
      }
      if (!variantId && contract.sku) {
        const v = await prisma.productVariant.findUnique({ where: { skuId: contract.sku } })
        if (v) variantId = v.id
      }
    }
    if (!variantId) {
      return NextResponse.json(
        { error: '无法解析该待入库单的 SKU（variantId），请确认合同已关联产品' },
        { status: 400 }
      )
    }

    const deliveryOrderId = pendingInbound.deliveryOrderId
    const deliveryNumber = pendingInbound.deliveryNumber

    await prisma.$transaction(async (tx) => {
      const now = new Date()

      const batch = await tx.inboundBatch.create({
        data: {
          pendingInboundId: inboundId,
          batchNumber: body.batchNumber || `BATCH-${Date.now()}`,
          warehouseId,
          warehouseName: warehouse.name,
          qty,
          receivedDate: body.receivedDate ? new Date(body.receivedDate) : now,
          notes: body.notes || null
        }
      })

      const newReceivedQty = pendingInbound.receivedQty + qty
      const newStatus = newReceivedQty >= pendingInbound.qty ? '已入库' : newReceivedQty > 0 ? '部分入库' : pendingInbound.status

      await tx.pendingInbound.update({
        where: { id: inboundId },
        data: { receivedQty: newReceivedQty, status: newStatus, updatedAt: now }
      })

      const existing = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } }
      })
      let qtyBefore: number
      let qtyAfter: number
      if (existing) {
        qtyBefore = existing.qty
        qtyAfter = qtyBefore + qty
        await tx.stock.update({
          where: { id: existing.id },
          data: {
            qty: qtyAfter,
            availableQty: existing.availableQty + qty,
            updatedAt: now
          }
        })
      } else {
        qtyBefore = 0
        qtyAfter = qty
        await tx.stock.create({
          data: {
            variantId,
            warehouseId,
            qty,
            reservedQty: 0,
            availableQty: qty
          }
        })
      }

      await tx.stockLog.create({
        data: {
          variantId,
          warehouseId,
          reason: StockLogReason.PURCHASE_INBOUND,
          movementType: InventoryMovementType.DOMESTIC_INBOUND,
          qty,
          qtyBefore,
          qtyAfter,
          operationDate: now,
          relatedOrderId: deliveryOrderId,
          relatedOrderType: 'DeliveryOrder',
          relatedOrderNumber: deliveryNumber,
          notes: `国内入库批次：${pendingInbound.inboundNumber}，数量 ${qty}`
        }
      })

      if (newStatus === '已入库' && pendingInbound.deliveryOrder) {
        await tx.deliveryOrder.update({
          where: { id: deliveryOrderId },
          data: { status: DeliveryOrderStatus.RECEIVED, updatedAt: now }
        })
      }

      await tx.inventoryLog.create({
        data: {
          type: 'IN',
          status: 'INBOUNDED',
          variantId,
          qty,
          warehouseId,
          deliveryOrderId,
          relatedOrderNo: deliveryNumber,
          notes: body.notes || `国内入库：${pendingInbound.inboundNumber}`
        }
      })
    })

    const batch = await prisma.inboundBatch.findFirst({
      where: { pendingInboundId: inboundId },
      orderBy: { createdAt: 'desc' },
      include: { pendingInbound: true, warehouse: true }
    })

    return NextResponse.json({
      id: batch?.id,
      inboundId: batch?.pendingInboundId,
      batchNumber: batch?.batchNumber,
      warehouse: batch?.warehouseName,
      warehouseId: batch?.warehouseId,
      qty: batch?.qty,
      receivedDate: batch?.receivedDate.toISOString(),
      notes: batch?.notes ?? undefined,
      createdAt: batch?.createdAt.toISOString(),
      message: '入库批次已登记，库存已增加' + (pendingInbound.receivedQty + qty >= pendingInbound.qty ? '，拿货单已更新为已入库' : '')
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating inbound batch:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create inbound batch' },
      { status: 500 }
    )
  }
}
