import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { DeliveryOrderStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

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

// GET - 获取单个交付订单
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await prisma.deliveryOrder.findUnique({
      where: { id: params.id },
      include: { contract: true }
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Delivery order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: order.id,
      deliveryNumber: order.deliveryNumber,
      contractId: order.contractId,
      contractNumber: order.contractNumber,
      qty: order.qty,
      itemQtys: order.itemQtys != null ? (order.itemQtys as Record<string, number>) : undefined,
      domesticTrackingNumber: order.domesticTrackingNumber || undefined,
      shippedDate: order.shippedDate?.toISOString() || undefined,
      status: STATUS_MAP_DB_TO_FRONT[order.status],
      tailAmount: Number(order.tailAmount),
      tailPaid: Number(order.tailPaid),
      tailDueDate: order.tailDueDate?.toISOString() || undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error fetching delivery order:', error)
    return NextResponse.json(
      { error: 'Failed to fetch delivery order' },
      { status: 500 }
    )
  }
}

// PUT - 更新交付订单
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const body = await request.json()

    const updateData: any = {}
    if (body.qty !== undefined) updateData.qty = Number(body.qty)
    if (body.itemQtys !== undefined) updateData.itemQtys = body.itemQtys
    if (body.domesticTrackingNumber !== undefined) updateData.domesticTrackingNumber = body.domesticTrackingNumber || null
    if (body.shippedDate !== undefined) updateData.shippedDate = body.shippedDate ? new Date(body.shippedDate) : null
    if (body.status !== undefined) updateData.status = STATUS_MAP_FRONT_TO_DB[body.status] || DeliveryOrderStatus.PENDING
    if (body.tailAmount !== undefined) updateData.tailAmount = Number(body.tailAmount)
    if (body.tailPaid !== undefined) updateData.tailPaid = Number(body.tailPaid)
    if (body.tailDueDate !== undefined) updateData.tailDueDate = body.tailDueDate ? new Date(body.tailDueDate) : null

    const order = await prisma.deliveryOrder.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({
      id: order.id,
      deliveryNumber: order.deliveryNumber,
      contractId: order.contractId,
      contractNumber: order.contractNumber,
      qty: order.qty,
      itemQtys: order.itemQtys != null ? (order.itemQtys as Record<string, number>) : undefined,
      domesticTrackingNumber: order.domesticTrackingNumber || undefined,
      shippedDate: order.shippedDate?.toISOString() || undefined,
      status: STATUS_MAP_DB_TO_FRONT[order.status],
      tailAmount: Number(order.tailAmount),
      tailPaid: Number(order.tailPaid),
      tailDueDate: order.tailDueDate?.toISOString() || undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error updating delivery order:', error)
    return NextResponse.json(
      { error: 'Failed to update delivery order' },
      { status: 500 }
    )
  }
}

// DELETE - 删除交付订单
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    await prisma.deliveryOrder.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting delivery order:', error)
    return NextResponse.json(
      { error: 'Failed to delete delivery order' },
      { status: 500 }
    )
  }
}
