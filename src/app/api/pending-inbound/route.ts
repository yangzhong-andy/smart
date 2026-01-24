import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - 获取所有待入库单
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const deliveryOrderId = searchParams.get('deliveryOrderId')
    const status = searchParams.get('status')

    const where: any = {}
    if (deliveryOrderId) where.deliveryOrderId = deliveryOrderId
    if (status) where.status = status

    const pendingInbound = await prisma.pendingInbound.findMany({
      where,
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const transformed = pendingInbound.map(item => ({
      id: item.id,
      inboundNumber: item.inboundNumber,
      deliveryOrderId: item.deliveryOrderId,
      deliveryNumber: item.deliveryNumber,
      contractId: item.contractId,
      contractNumber: item.contractNumber,
      sku: item.sku,
      skuId: item.variantId || undefined,
      qty: item.qty,
      receivedQty: item.receivedQty,
      domesticTrackingNumber: item.domesticTrackingNumber || undefined,
      shippedDate: item.shippedDate?.toISOString() || undefined,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      batches: item.batches.map(batch => ({
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
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching pending inbound:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending inbound' },
      { status: 500 }
    )
  }
}

// POST - 创建新待入库单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const pendingInbound = await prisma.pendingInbound.create({
      data: {
        inboundNumber: body.inboundNumber,
        deliveryOrderId: body.deliveryOrderId,
        deliveryNumber: body.deliveryNumber,
        contractId: body.contractId,
        contractNumber: body.contractNumber,
        sku: body.sku,
        variantId: body.variantId || null,
        qty: body.qty,
        receivedQty: body.receivedQty || 0,
        domesticTrackingNumber: body.domesticTrackingNumber || null,
        shippedDate: body.shippedDate ? new Date(body.shippedDate) : null,
        status: body.status || '待入库'
      },
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
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating pending inbound:', error)
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: '入库单号或拿货单号已存在' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create pending inbound' },
      { status: 500 }
    )
  }
}
