import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { getCache, setCache, generateCacheKey } from '@/lib/redis'
import { badRequest, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'warehouses';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === '1'
    const activeOnly = searchParams.get('activeOnly') !== 'false'
    const location = searchParams.get('location')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const noCache = searchParams.get('noCache') === 'true'

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      all ? 'all' : 'active',
      location || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅在第一页时使用缓存）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {}
    if (!all && activeOnly) where.isActive = true
    if (location) where.location = location

    const [warehouses, total] = await prisma.$transaction([
      prisma.warehouse.findMany({
        where,
        select: {
          id: true, code: true, name: true, address: true,
          contact: true, phone: true, manager: true,
          location: true, type: true, isActive: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.warehouse.count({ where }),
    ])

    const response = {
      data: warehouses,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response)
  } catch (error: any) {
    if (error.message?.includes('does not exist') || error.code === 'P2021') {
      return NextResponse.json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } })
    }
    return serverError('Failed to fetch warehouses', error, { includeDetailsInDev: true })
  }
}

// POST - 创建新仓库（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const code = body.code?.trim() || `WH-${Date.now()}`
    const location = body.location || 'DOMESTIC'
    const typeVal = body.type === 'OVERSEAS' ? 'OVERSEAS' : 'DOMESTIC'

    const warehouse = await prisma.warehouse.create({
      data: {
        code,
        name: body.name,
        address: body.address || null,
        contact: body.contact || null,
        phone: body.phone || null,
        manager: body.manager || null,
        location,
        type: typeVal,
      }
    })

    // 清除仓库相关缓存
    await import('@/lib/redis').then(m => m.clearCacheByPrefix(CACHE_KEY_PREFIX));

    return NextResponse.json({
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      location: warehouse.location,
      createdAt: warehouse.createdAt.toISOString()
    });
  } catch (error: any) {
    return serverError('Failed to create warehouse', error, { includeDetailsInDev: true })
  }
}

// DELETE - 删除仓库（需 ADMIN 或 MANAGER，通过 query id 指定）
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return badRequest('缺少仓库 id')
    }
    await prisma.warehouse.delete({ where: { id } })
    await import('@/lib/redis').then((m) => m.clearCacheByPrefix(CACHE_KEY_PREFIX))
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return serverError('Failed to delete warehouse', error, { includeDetailsInDev: true })
  }
}
