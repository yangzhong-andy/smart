import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { LogisticsStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const STATUS_MAP_DB_TO_FRONT: Record<LogisticsStatus, string> = {
  PENDING: 'Pending',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Exception'
}

const STATUS_MAP_FRONT_TO_DB: Record<string, LogisticsStatus> = {
  'Pending': LogisticsStatus.PENDING,
  'In Transit': LogisticsStatus.IN_TRANSIT,
  'Delivered': LogisticsStatus.DELIVERED,
  'Exception': LogisticsStatus.EXCEPTION
}

// GET - 获取单个物流跟踪
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tracking = await prisma.logisticsTracking.findUnique({
      where: { id: params.id },
      include: {
        channel: true,
        store: true,
        events: {
          orderBy: { timestamp: 'desc' }
        }
      }
    })

    if (!tracking) {
      return NextResponse.json(
        { error: 'Logistics tracking not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: tracking.id,
      internalOrderNumber: tracking.internalOrderNumber,
      trackingNumber: tracking.trackingNumber,
      channelId: tracking.channelId,
      channelName: tracking.channel.name,
      channelCode: tracking.channel.channelCode,
      storeId: tracking.storeId || undefined,
      currentStatus: STATUS_MAP_DB_TO_FRONT[tracking.currentStatus],
      shippedDate: tracking.shippedDate.toISOString(),
      lastUpdatedAt: tracking.lastUpdatedAt.toISOString(),
      transportDays: tracking.transportDays || undefined,
      orderId: tracking.orderId || undefined,
      events: tracking.events.map(e => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        location: e.location || undefined,
        description: e.description,
        status: STATUS_MAP_DB_TO_FRONT[e.status]
      })),
      createdAt: tracking.createdAt.toISOString(),
      updatedAt: tracking.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error fetching logistics tracking:', error)
    return NextResponse.json(
      { error: 'Failed to fetch logistics tracking' },
      { status: 500 }
    )
  }
}

// PUT - 更新物流跟踪
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.currentStatus !== undefined) updateData.currentStatus = STATUS_MAP_FRONT_TO_DB[body.currentStatus] || LogisticsStatus.PENDING
    if (body.lastUpdatedAt !== undefined) updateData.lastUpdatedAt = new Date(body.lastUpdatedAt)
    if (body.transportDays !== undefined) updateData.transportDays = body.transportDays || null

    // 如果有新的事件，创建它们
    if (body.events && Array.isArray(body.events)) {
      // 先删除旧事件（可选，根据业务需求）
      // await prisma.trackingEvent.deleteMany({ where: { trackingId: params.id } })
      
      // 创建新事件
      updateData.events = {
        create: body.events.map((e: any) => ({
          timestamp: new Date(e.timestamp),
          location: e.location || null,
          description: e.description,
          status: STATUS_MAP_FRONT_TO_DB[e.status] || LogisticsStatus.PENDING
        }))
      }
    }

    const tracking = await prisma.logisticsTracking.update({
      where: { id: params.id },
      data: updateData,
      include: {
        channel: true,
        store: true,
        events: {
          orderBy: { timestamp: 'desc' }
        }
      }
    })

    return NextResponse.json({
      id: tracking.id,
      internalOrderNumber: tracking.internalOrderNumber,
      trackingNumber: tracking.trackingNumber,
      channelId: tracking.channelId,
      channelName: tracking.channel.name,
      channelCode: tracking.channel.channelCode,
      storeId: tracking.storeId || undefined,
      currentStatus: STATUS_MAP_DB_TO_FRONT[tracking.currentStatus],
      shippedDate: tracking.shippedDate.toISOString(),
      lastUpdatedAt: tracking.lastUpdatedAt.toISOString(),
      transportDays: tracking.transportDays || undefined,
      orderId: tracking.orderId || undefined,
      events: tracking.events.map(e => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        location: e.location || undefined,
        description: e.description,
        status: STATUS_MAP_DB_TO_FRONT[e.status]
      })),
      createdAt: tracking.createdAt.toISOString(),
      updatedAt: tracking.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error updating logistics tracking:', error)
    return NextResponse.json(
      { error: 'Failed to update logistics tracking' },
      { status: 500 }
    )
  }
}

// DELETE - 删除物流跟踪
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

    await prisma.logisticsTracking.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting logistics tracking:', error)
    return NextResponse.json(
      { error: 'Failed to delete logistics tracking' },
      { status: 500 }
    )
  }
}
