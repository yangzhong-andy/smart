import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'influencers';

// GET - 获取所有网红/达人
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const status = searchParams.get('cooperationStatus')
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      platform || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    )

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey)
      if (cached) {
        return NextResponse.json(cached)
      }
    }

    const where: any = {}
    if (platform) where.platform = platform as Platform
    if (status) where.cooperationStatus = status

    const [influencers, total] = await prisma.$transaction([
      prisma.influencer.findMany({
        where,
        select: {
          id: true, accountName: true, platform: true, accountUrl: true,
          followerCount: true, contactInfo: true, category: true,
          cooperationStatus: true, sampleStatus: true, sampleOrderNumber: true,
          sampleTrackingNumber: true, sampleProductSku: true, sampleProductId: true,
          sampleSentAt: true, sampleReceivedAt: true, historicalEngagementRate: true,
          estimatedOrders: true, actualOrders: true, notes: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.influencer.count({ where }),
    ])

    const response = {
      data: influencers.map(i => ({
        id: i.id,
        accountName: i.accountName,
        platform: i.platform,
        accountUrl: i.accountUrl || undefined,
        followerCount: i.followerCount,
        contactInfo: i.contactInfo || undefined,
        category: i.category || undefined,
        cooperationStatus: i.cooperationStatus,
        sampleStatus: i.sampleStatus,
        sampleOrderNumber: i.sampleOrderNumber || undefined,
        sampleTrackingNumber: i.sampleTrackingNumber || undefined,
        sampleProductSku: i.sampleProductSku || undefined,
        sampleProductId: i.sampleProductId || undefined,
        sampleSentAt: i.sampleSentAt?.toISOString() || undefined,
        sampleReceivedAt: i.sampleReceivedAt?.toISOString() || undefined,
        historicalEngagementRate: i.historicalEngagementRate ? Number(i.historicalEngagementRate) : undefined,
        estimatedOrders: i.estimatedOrders || undefined,
        actualOrders: i.actualOrders || undefined,
        notes: i.notes || undefined,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString()
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    }

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL)
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch influencers' },
      { status: 500 }
    )
  }
}

// POST - 创建网红（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const influencer = await prisma.influencer.create({
      data: {
        accountName: body.accountName,
        platform: body.platform,
        accountUrl: body.accountUrl || null,
        followerCount: body.followerCount || 0,
        contactInfo: body.contactInfo || null,
        category: body.category || null,
        cooperationStatus: body.cooperationStatus || 'NOT_STARTED',
        sampleStatus: body.sampleStatus || 'NOT_SENT',
        sampleOrderNumber: body.sampleOrderNumber || null,
        sampleTrackingNumber: body.sampleTrackingNumber || null,
        sampleProductSku: body.sampleProductSku || null,
        sampleProductId: body.sampleProductId || null,
        historicalEngagementRate: body.historicalEngagementRate || null,
        estimatedOrders: body.estimatedOrders || null,
        actualOrders: body.actualOrders || null,
        notes: body.notes || null,
      }
    });

    // 清除网红缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX)

    return NextResponse.json({
      id: influencer.id,
      accountName: influencer.accountName,
      platform: influencer.platform,
      createdAt: influencer.createdAt.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create influencer' },
      { status: 500 }
    );
  }
}
