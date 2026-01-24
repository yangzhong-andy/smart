import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

// POST - 创建新入库批次
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
    const batch = await prisma.inboundBatch.create({
      data: {
        pendingInboundId: body.inboundId,
        batchNumber: body.batchNumber,
        warehouseId: body.warehouseId,
        warehouseName: warehouse.name,
        qty: body.qty,
        receivedDate: new Date(body.receivedDate),
        notes: body.notes || null
      },
      include: {
        pendingInbound: true,
        warehouse: true
      }
    })

    // 更新待入库单的已入库数量
    const pendingInbound = await prisma.pendingInbound.findUnique({
      where: { id: body.inboundId }
    })

    if (pendingInbound) {
      const newReceivedQty = pendingInbound.receivedQty + body.qty
      let newStatus = pendingInbound.status

      if (newReceivedQty >= pendingInbound.qty) {
        newStatus = '已入库'
      } else if (newReceivedQty > 0) {
        newStatus = '部分入库'
      }

      await prisma.pendingInbound.update({
        where: { id: body.inboundId },
        data: {
          receivedQty: newReceivedQty,
          status: newStatus
        }
      })
    }

    return NextResponse.json({
      id: batch.id,
      inboundId: batch.pendingInboundId,
      batchNumber: batch.batchNumber,
      warehouse: batch.warehouseName,
      warehouseId: batch.warehouseId,
      qty: batch.qty,
      receivedDate: batch.receivedDate.toISOString(),
      notes: batch.notes || undefined,
      createdAt: batch.createdAt.toISOString()
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating inbound batch:', error)
    return NextResponse.json(
      { error: 'Failed to create inbound batch', details: error.message },
      { status: 500 }
    )
  }
}
