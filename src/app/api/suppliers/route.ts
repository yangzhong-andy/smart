import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 600; // 10分钟
const CACHE_KEY_PREFIX = 'suppliers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const country = searchParams.get("country")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      category || 'all',
      country || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Suppliers cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {}
    if (category) where.category = category
    const [suppliers, total] = await prisma.$transaction([
      prisma.supplier.findMany({
        where,
        select: {
          id: true, name: true, category: true,
          contact: true, phone: true, address: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplier.count({ where }),
    ])

    const response = {
      data: suppliers.map(s => ({
        id: s.id,
        name: s.name,
        code: undefined,
        category: s.category ?? undefined,
        country: undefined,
        contact: s.contact,
        phone: s.phone,
        email: undefined,
        address: s.address ?? undefined,
        paymentTerms: undefined,
        currency: undefined,
        status: undefined,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch suppliers' },
      { status: 500 }
    )
  }
}

// POST - 创建新供应商（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const supplier = await prisma.supplier.create({
      data: {
        name: body.name,
        contact: body.contact ?? '',
        phone: body.phone ?? '',
        depositRate: body.depositRate ?? 0,
        tailPeriodDays: body.tailPeriodDays ?? 0,
        settleBase: (body.settleBase ?? 'SHIPMENT') as any,
        category: body.category ?? null,
        address: body.address ?? null,
      }
    })

    // 清除供应商相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: supplier.id,
      name: supplier.name,
      category: supplier.category,
      createdAt: supplier.createdAt.toISOString()
    })
  } catch (error) {
    console.error('Error creating supplier:', error)
    return NextResponse.json(
      { error: 'Failed to create supplier' },
      { status: 500 }
    )
  }
}
