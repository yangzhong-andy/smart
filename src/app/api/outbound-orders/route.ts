import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - 获取所有出库单
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get('warehouseId')
    const status = searchParams.get('status')
    const variantId = searchParams.get('variantId')

    const where: any = {}
    if (warehouseId) where.warehouseId = warehouseId
    if (status) where.status = status
    if (variantId) where.variantId = variantId

    const orders = await prisma.outboundOrder.findMany({
      where,
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const transformed = orders.map(order => ({
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
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching outbound orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch outbound orders' },
      { status: 500 }
    )
  }
}

// POST - 创建新出库单
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

    // 获取SKU信息
    const variant = await prisma.productVariant.findUnique({
      where: { id: body.skuId },
      include: {
        product: true
      }
    })

    if (!variant) {
      return NextResponse.json(
        { error: 'SKU不存在' },
        { status: 400 }
      )
    }

    const order = await prisma.outboundOrder.create({
      data: {
        outboundNumber: body.outboundNumber,
        variantId: body.skuId,
        sku: variant.skuId,
        qty: body.qty,
        shippedQty: body.shippedQty || 0,
        warehouseId: body.warehouseId,
        warehouseName: warehouse.name,
        destination: body.destination || null,
        status: body.status || '待出库',
        reason: body.reason || null
      },
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
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating outbound order:', error)
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: '出库单号已存在' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create outbound order', details: error.message },
      { status: 500 }
    )
  }
}
