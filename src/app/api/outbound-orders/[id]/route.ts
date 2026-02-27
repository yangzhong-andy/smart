import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取单个出库单
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await prisma.outboundOrder.findUnique({
      where: { id: params.id },
      include: {
        variant: {
          include: {
            product: true
          }
        },
        warehouse: true,
        batches: {
          include: {
            warehouse: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Outbound order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: order.id,
      outboundNumber: order.outboundNumber,
      skuId: order.variantId,
      sku: order.sku,
      qty: order.qty,
      shippedQty: order.shippedQty,
      warehouse: order.warehouseName,
      warehouseId: order.warehouseId,
      destination: order.destination || undefined,
      status: order.status,
      reason: order.reason || undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      batches: order.batches.map(batch => ({
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
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch outbound order' },
      { status: 500 }
    )
  }
}

// PUT - 更新出库单
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.shippedQty !== undefined) updateData.shippedQty = body.shippedQty
    if (body.destination !== undefined) updateData.destination = body.destination || null
    if (body.reason !== undefined) updateData.reason = body.reason || null

    const order = await prisma.outboundOrder.update({
      where: { id: params.id },
      data: updateData,
      include: {
        variant: true,
        warehouse: true,
        batches: true
      }
    })

    return NextResponse.json({
      id: order.id,
      outboundNumber: order.outboundNumber,
      skuId: order.variantId,
      sku: order.sku,
      qty: order.qty,
      shippedQty: order.shippedQty,
      warehouse: order.warehouseName,
      warehouseId: order.warehouseId,
      destination: order.destination || undefined,
      status: order.status,
      reason: order.reason || undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update outbound order' },
      { status: 500 }
    )
  }
}

// DELETE - 删除出库单
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.outboundOrder.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete outbound order' },
      { status: 500 }
    )
  }
}
