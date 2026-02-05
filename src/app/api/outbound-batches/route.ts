import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取所有出库批次
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const outboundOrderId = searchParams.get('outboundOrderId')
    const warehouseId = searchParams.get('warehouseId')

    const where: any = {}
    if (outboundOrderId) where.outboundOrderId = outboundOrderId
    if (warehouseId) where.warehouseId = warehouseId

    const batches = await prisma.outboundBatch.findMany({
      where,
      include: {
        outboundOrder: true,
        warehouse: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const transformed = batches.map(batch => ({
      id: batch.id,
      outboundId: batch.outboundOrderId,
      batchNumber: batch.batchNumber,
      warehouse: batch.warehouseName,
      warehouseId: batch.warehouseId,
      qty: batch.qty,
      shippedDate: batch.shippedDate.toISOString(),
      destination: batch.destination || undefined,
      trackingNumber: batch.trackingNumber || undefined,
      notes: batch.notes || undefined,
      createdAt: batch.createdAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching outbound batches:', error)
    return NextResponse.json(
      { error: 'Failed to fetch outbound batches' },
      { status: 500 }
    )
  }
}

// POST - 创建新出库批次
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 获取仓库信息
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: body.warehouseId }
    })

    if (!warehouse) {
      return NextResponse.json(
        { error: '仓库不存在' },
        { status: 400 }
      )
    }

    // 创建批次
    const batch = await prisma.outboundBatch.create({
      data: {
        outboundOrderId: body.outboundId,
        batchNumber: body.batchNumber,
        warehouseId: body.warehouseId,
        warehouseName: warehouse.name,
        qty: body.qty,
        shippedDate: new Date(body.shippedDate),
        destination: body.destination || null,
        trackingNumber: body.trackingNumber || null,
        notes: body.notes || null
      },
      include: {
        outboundOrder: true,
        warehouse: true
      }
    })

    // 更新出库单的已出库数量
    const outboundOrder = await prisma.outboundOrder.findUnique({
      where: { id: body.outboundId }
    })

    if (outboundOrder) {
      const newShippedQty = outboundOrder.shippedQty + body.qty
      let newStatus = outboundOrder.status

      if (newShippedQty >= outboundOrder.qty) {
        newStatus = '已出库'
      } else if (newShippedQty > 0) {
        newStatus = '部分出库'
      }

      await prisma.outboundOrder.update({
        where: { id: body.outboundId },
        data: {
          shippedQty: newShippedQty,
          status: newStatus
        }
      })
    }

    return NextResponse.json({
      id: batch.id,
      outboundId: batch.outboundOrderId,
      batchNumber: batch.batchNumber,
      warehouse: batch.warehouseName,
      warehouseId: batch.warehouseId,
      qty: batch.qty,
      shippedDate: batch.shippedDate.toISOString(),
      destination: batch.destination || undefined,
      trackingNumber: batch.trackingNumber || undefined,
      notes: batch.notes || undefined,
      createdAt: batch.createdAt.toISOString()
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating outbound batch:', error)
    return NextResponse.json(
      { error: 'Failed to create outbound batch', details: error.message },
      { status: 500 }
    )
  }
}
