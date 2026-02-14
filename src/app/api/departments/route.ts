import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 600; // 10分钟（部门数据变动少）
const CACHE_KEY_PREFIX = 'departments';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('activeOnly') !== 'false'
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const noCache = searchParams.get('noCache') === 'true'

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      activeOnly ? 'active' : 'all',
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

    const where: any = {}
    if (activeOnly) where.isActive = true

    const [departments, total] = await prisma.$transaction([
      prisma.department.findMany({
        where,
        select: {
          id: true, name: true, code: true, description: true,
          isActive: true, createdAt: true, updatedAt: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.department.count({ where }),
    ])

    const response = {
      data: departments.map(dept => ({
        id: dept.id,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        isActive: dept.isActive,
        createdAt: dept.createdAt.toISOString(),
        updatedAt: dept.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching departments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    )
  }
}
