import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 600; // 10分钟
const CACHE_KEY_PREFIX = 'logistics-channels';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const noCache = searchParams.get('noCache') === 'true'

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const [channels, total] = await prisma.$transaction([
      prisma.logisticsChannel.findMany({
        select: {
          id: true, name: true, channelCode: true, contact: true,
          phone: true, queryUrl: true, createdAt: true, updatedAt: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.logisticsChannel.count(),
    ])

    const response = {
      data: channels.map(c => ({
        id: c.id,
        name: c.name,
        channelCode: c.channelCode,
        contact: c.contact || undefined,
        phone: c.phone || undefined,
        queryUrl: c.queryUrl || undefined,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch logistics channels' },
      { status: 500 }
    )
  }
}

// POST - 创建新物流渠道（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 验证必填字段
    if (!body.name?.trim() || !body.channelCode?.trim()) {
      return NextResponse.json(
        { error: '请填写物流商名称和渠道代码' },
        { status: 400 }
      );
    }

    const channel = await prisma.logisticsChannel.create({
      data: {
        name: body.name.trim(),
        channelCode: body.channelCode.trim(),
        contact: body.contact?.trim() || '',
        phone: body.phone?.trim() || '',
        queryUrl: body.queryUrl?.trim() || '',
      }
    })

    // 清除物流渠道缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: channel.id,
      name: channel.name,
      channelCode: channel.channelCode,
      createdAt: channel.createdAt.toISOString()
    });
  } catch (error: any) {
    console.error('Create logistics channel error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create logistics channel' },
      { status: 500 }
    );
  }
}
