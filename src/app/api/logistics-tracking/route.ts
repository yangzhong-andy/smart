import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LogisticsStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// 状态映射
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

// GET - 获取所有物流跟踪
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const storeId = searchParams.get('storeId')
    const status = searchParams.get('status')

    const where: any = {}
    if (channelId) where.channelId = channelId
    if (storeId) where.storeId = storeId
    if (status) where.currentStatus = STATUS_MAP_FRONT_TO_DB[status] || status as LogisticsStatus

    const trackings = await prisma.logisticsTracking.findMany({
      where,
      include: {
        channel: true,
        store: true,
        events: {
          orderBy: { timestamp: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const transformed = trackings.map(t => ({
      id: t.id,
      internalOrderNumber: t.internalOrderNumber,
      trackingNumber: t.trackingNumber,
      channelId: t.channelId,
      channelName: t.channel.name,
      channelCode: t.channel.channelCode,
      storeId: t.storeId || undefined,
      currentStatus: STATUS_MAP_DB_TO_FRONT[t.currentStatus],
      shippedDate: t.shippedDate.toISOString(),
      lastUpdatedAt: t.lastUpdatedAt.toISOString(),
      transportDays: t.transportDays || undefined,
      orderId: t.orderId || undefined,
      events: t.events.map(e => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        location: e.location || undefined,
        description: e.description,
        status: STATUS_MAP_DB_TO_FRONT[e.status]
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching logistics tracking:', error)
    return NextResponse.json(
      { error: 'Failed to fetch logistics tracking' },
      { status: 500 }
    )
  }
}

// POST - 创建新物流跟踪
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const tracking = await prisma.logisticsTracking.create({
      data: {
        internalOrderNumber: body.internalOrderNumber,
        trackingNumber: body.trackingNumber,
        channelId: body.channelId,
        storeId: body.storeId || null,
        currentStatus: STATUS_MAP_FRONT_TO_DB[body.currentStatus] || LogisticsStatus.PENDING,
        shippedDate: new Date(body.shippedDate),
        lastUpdatedAt: new Date(body.lastUpdatedAt || body.shippedDate),
        transportDays: body.transportDays || null,
        orderId: body.orderId || null,
        events: {
          create: body.events?.map((e: any) => ({
            timestamp: new Date(e.timestamp),
            location: e.location || null,
            description: e.description,
            status: STATUS_MAP_FRONT_TO_DB[e.status] || LogisticsStatus.PENDING
          })) || []
        }
      },
      include: {
        channel: true,
        store: true,
        events: true
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
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating logistics tracking:', error)
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: '物流单号已存在' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create logistics tracking' },
      { status: 500 }
    )
  }
}
