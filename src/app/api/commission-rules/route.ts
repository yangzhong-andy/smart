import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DepartmentEnum, CommissionRuleType, CommissionPeriod } from '@prisma/client'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 600; // 10分钟（佣金规则变动少）
const CACHE_KEY_PREFIX = 'commission-rules';

// GET - 获取所有佣金规则
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department')
    const enabled = searchParams.get('enabled')
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      department || 'all',
      enabled || 'all',
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
    if (department) where.department = department as DepartmentEnum
    if (enabled !== null) where.enabled = enabled === 'true'

    const [rules, total] = await prisma.$transaction([
      prisma.commissionRule.findMany({
        where,
        select: {
          id: true, name: true, department: true, position: true,
          type: true, config: true, dataSource: true, period: true,
          startDate: true, endDate: true, enabled: true, description: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.commissionRule.count({ where }),
    ])

    const response = {
      data: rules.map(r => ({
        id: r.id,
        name: r.name,
        department: r.department,
        position: r.position || undefined,
        type: r.type,
        config: r.config ? JSON.parse(JSON.stringify(r.config)) : {},
        dataSource: r.dataSource ? JSON.parse(JSON.stringify(r.dataSource)) : {},
        period: r.period,
        startDate: r.startDate?.toISOString() || undefined,
        endDate: r.endDate?.toISOString() || undefined,
        enabled: r.enabled,
        description: r.description || undefined,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString()
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
      { error: 'Failed to fetch commission rules' },
      { status: 500 }
    )
  }
}

// POST - 创建佣金规则（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const rule = await prisma.commissionRule.create({
      data: {
        name: body.name,
        department: body.department,
        position: body.position || null,
        type: body.type,
        config: body.config || {},
        dataSource: body.dataSource || {},
        period: body.period || 'MONTHLY',
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        enabled: body.enabled ?? true,
        description: body.description || null,
      }
    });

    // 清除佣金规则缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX)

    return NextResponse.json({
      id: rule.id,
      name: rule.name,
      department: rule.department,
      enabled: rule.enabled,
      createdAt: rule.createdAt.toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create commission rule' },
      { status: 500 }
    );
  }
}
