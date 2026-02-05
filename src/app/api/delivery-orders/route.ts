import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DeliveryOrderStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// 状态映射
const STATUS_MAP_DB_TO_FRONT: Record<DeliveryOrderStatus, string> = {
  PENDING: '待发货',
  SHIPPED: '已发货',
  IN_TRANSIT: '运输中',
  RECEIVED: '已入库',
  CANCELLED: '已取消'
}

const STATUS_MAP_FRONT_TO_DB: Record<string, DeliveryOrderStatus> = {
  '待发货': DeliveryOrderStatus.PENDING,
  '已发货': DeliveryOrderStatus.SHIPPED,
  '运输中': DeliveryOrderStatus.IN_TRANSIT,
  '已入库': DeliveryOrderStatus.RECEIVED,
  '已取消': DeliveryOrderStatus.CANCELLED
}

// GET - 获取所有交付订单
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const contractId = searchParams.get('contractId')

    const where: any = {}
    if (contractId) where.contractId = contractId

    const orders = await prisma.deliveryOrder.findMany({
      where,
      include: {
        contract: true
      },
      orderBy: { createdAt: 'desc' }
    })

    const transformed = orders.map(o => ({
      id: o.id,
      deliveryNumber: o.deliveryNumber,
      contractId: o.contractId,
      contractNumber: o.contractNumber,
      qty: o.qty,
      domesticTrackingNumber: o.domesticTrackingNumber || undefined,
      shippedDate: o.shippedDate?.toISOString() || undefined,
      status: STATUS_MAP_DB_TO_FRONT[o.status],
      tailAmount: Number(o.tailAmount),
      tailPaid: Number(o.tailPaid),
      tailDueDate: o.tailDueDate?.toISOString() || undefined,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching delivery orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch delivery orders' },
      { status: 500 }
    )
  }
}

// POST - 创建新交付订单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const order = await prisma.deliveryOrder.create({
      data: {
        deliveryNumber: body.deliveryNumber,
        contractId: body.contractId,
        contractNumber: body.contractNumber,
        qty: Number(body.qty),
        domesticTrackingNumber: body.domesticTrackingNumber || null,
        shippedDate: body.shippedDate ? new Date(body.shippedDate) : null,
        status: STATUS_MAP_FRONT_TO_DB[body.status] || DeliveryOrderStatus.PENDING,
        tailAmount: Number(body.tailAmount),
        tailPaid: Number(body.tailPaid) || 0,
        tailDueDate: body.tailDueDate ? new Date(body.tailDueDate) : null
      }
    })

    return NextResponse.json({
      id: order.id,
      deliveryNumber: order.deliveryNumber,
      contractId: order.contractId,
      contractNumber: order.contractNumber,
      qty: order.qty,
      domesticTrackingNumber: order.domesticTrackingNumber || undefined,
      shippedDate: order.shippedDate?.toISOString() || undefined,
      status: STATUS_MAP_DB_TO_FRONT[order.status],
      tailAmount: Number(order.tailAmount),
      tailPaid: Number(order.tailPaid),
      tailDueDate: order.tailDueDate?.toISOString() || undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating delivery order:', error)
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: '交付单号已存在' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create delivery order' },
      { status: 500 }
    )
  }
}
