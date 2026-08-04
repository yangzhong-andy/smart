import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'logistics-tracking';

// GET - 获取所有物流跟踪
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const storeId = searchParams.get('storeId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      channelId || 'all',
      storeId || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    )

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !channelId && !storeId) {
      const cached = await getCache<any>(cacheKey)
      if (cached) {
        return NextResponse.json(cached)
      }
    }

    const STATUS_MAP_FRONT_TO_DB: Record<string, any> = {
      'Pending': 'PENDING',
      'In Transit': 'IN_TRANSIT',
      'Delivered': 'DELIVERED',
      'Exception': 'EXCEPTION'
    }

    const where: any = {}
    if (channelId) where.channelId = channelId
    if (storeId) where.storeId = storeId
    if (status) where.currentStatus = STATUS_MAP_FRONT_TO_DB[status] || status

    const [trackings, total] = await prisma.$transaction([
      prisma.logisticsTracking.findMany({
        where,
        select: {
          id: true, internalOrderNumber: true, trackingNumber: true,
          channelId: true, storeId: true, currentStatus: true,
          shippedDate: true, lastUpdatedAt: true, transportDays: true,
          orderId: true, createdAt: true, updatedAt: true,
          channel: { select: { id: true, name: true, channelCode: true, queryUrl: true } },
          store: { select: { id: true, name: true } },
          _count: { select: { events: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.logisticsTracking.count({ where }),
    ])

    const STATUS_MAP_DB_TO_FRONT: Record<string, string> = {
      PENDING: 'Pending',
      IN_TRANSIT: 'In Transit',
      DELIVERED: 'Delivered',
      EXCEPTION: 'Exception'
    }

    const response = {
      data: trackings.map(t => ({
        id: t.id,
        internalOrderNumber: t.internalOrderNumber,
        trackingNumber: t.trackingNumber,
        channelId: t.channelId,
        channelName: t.channel.name,
        channelCode: t.channel.channelCode,
        channelQueryUrl: t.channel.queryUrl,
        storeId: t.storeId || undefined,
        storeName: t.store?.name,
        currentStatus: STATUS_MAP_DB_TO_FRONT[t.currentStatus] || t.currentStatus,
        shippedDate: t.shippedDate.toISOString(),
        lastUpdatedAt: t.lastUpdatedAt.toISOString(),
        transportDays: t.transportDays || undefined,
        orderId: t.orderId || undefined,
        eventCount: t._count.events,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    }

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !channelId && !storeId) {
      await setCache(cacheKey, response, CACHE_TTL)
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch logistics tracking' },
      { status: 500 }
    )
  }
}
