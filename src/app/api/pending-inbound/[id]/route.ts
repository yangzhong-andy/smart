import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - 获取单个待入库单
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pendingInbound = await prisma.pendingInbound.findUnique({
      where: { id: params.id },
      include: {
        deliveryOrder: true,
        variant: {
          include: {
            product: true
          }
        },
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

    if (!pendingInbound) {
      return NextResponse.json(
        { error: 'Pending inbound not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: pendingInbound.id,
      inboundNumber: pendingInbound.inboundNumber,
      deliveryOrderId: pendingInbound.deliveryOrderId,
      deliveryNumber: pendingInbound.deliveryNumber,
      contractId: pendingInbound.contractId,
      contractNumber: pendingInbound.contractNumber,
      sku: pendingInbound.sku,
      skuId: pendingInbound.variantId || undefined,
      qty: pendingInbound.qty,
      receivedQty: pendingInbound.receivedQty,
      domesticTrackingNumber: pendingInbound.domesticTrackingNumber || undefined,
      shippedDate: pendingInbound.shippedDate?.toISOString() || undefined,
      status: pendingInbound.status,
      createdAt: pendingInbound.createdAt.toISOString(),
      updatedAt: pendingInbound.updatedAt.toISOString(),
      batches: pendingInbound.batches.map(batch => ({
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
    })
  } catch (error) {
    console.error('Error fetching pending inbound:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending inbound' },
      { status: 500 }
    )
  }
}

// PUT - 更新待入库单
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.status !== undefined) updateData.status = body.status
    if (body.receivedQty !== undefined) updateData.receivedQty = body.receivedQty
    if (body.domesticTrackingNumber !== undefined) updateData.domesticTrackingNumber = body.domesticTrackingNumber || null
    if (body.shippedDate !== undefined) updateData.shippedDate = body.shippedDate ? new Date(body.shippedDate) : null

    const pendingInbound = await prisma.pendingInbound.update({
      where: { id: params.id },
      data: updateData,
      include: {
        deliveryOrder: true,
        variant: true,
        batches: true
      }
    })

    return NextResponse.json({
      id: pendingInbound.id,
      inboundNumber: pendingInbound.inboundNumber,
      deliveryOrderId: pendingInbound.deliveryOrderId,
      deliveryNumber: pendingInbound.deliveryNumber,
      contractId: pendingInbound.contractId,
      contractNumber: pendingInbound.contractNumber,
      sku: pendingInbound.sku,
      skuId: pendingInbound.variantId || undefined,
      qty: pendingInbound.qty,
      receivedQty: pendingInbound.receivedQty,
      domesticTrackingNumber: pendingInbound.domesticTrackingNumber || undefined,
      shippedDate: pendingInbound.shippedDate?.toISOString() || undefined,
      status: pendingInbound.status,
      createdAt: pendingInbound.createdAt.toISOString(),
      updatedAt: pendingInbound.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error updating pending inbound:', error)
    return NextResponse.json(
      { error: 'Failed to update pending inbound' },
      { status: 500 }
    )
  }
}

// DELETE - 删除待入库单
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.pendingInbound.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting pending inbound:', error)
    return NextResponse.json(
      { error: 'Failed to delete pending inbound' },
      { status: 500 }
    )
  }
}
