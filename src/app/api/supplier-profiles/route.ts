import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'supplier-profiles';

// GET - 获取供应商档案列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      typeParam || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Supplier profiles cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const TYPE_MAP_FRONT_TO_DB: Record<string, any> = {
      '广告代理商': 'AD_AGENCY',
      '物流商': 'LOGISTICS',
      '供货商': 'VENDOR'
    };
    const TYPE_MAP_DB_TO_FRONT: Record<string, string> = {
      'AD_AGENCY': '广告代理商',
      'LOGISTICS': '物流商',
      'VENDOR': '供货商'
    };

    const where: any = {};
    if (typeParam) {
      const t = TYPE_MAP_FRONT_TO_DB[typeParam] ?? typeParam;
      if (t) where.type = t;
    }

    const [list, total] = await prisma.$transaction([
      prisma.supplierProfile.findMany({
        where,
        select: {
          id: true, name: true, type: true, contact: true, phone: true,
          email: true, address: true, rebateRate: true, settlementDay: true,
          creditTerm: true, currency: true, agencyId: true, supplierId: true,
          notes: true, createdAt: true, updatedAt: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplierProfile.count({ where }),
    ]);

    const response = {
      data: list.map((p) => ({
        id: p.id,
        name: p.name,
        type: TYPE_MAP_DB_TO_FRONT[p.type] ?? p.type,
        contact: p.contact || undefined,
        phone: p.phone || undefined,
        email: p.email ?? undefined,
        address: p.address ?? undefined,
        rebateRate: p.rebateRate != null ? Number(p.rebateRate) : undefined,
        settlementDay: p.settlementDay ?? undefined,
        creditTerm: p.creditTerm ?? undefined,
        currency: p.currency ?? undefined,
        agencyId: p.agencyId ?? undefined,
        supplierId: p.supplierId ?? undefined,
        notes: p.notes ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString()
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching supplier profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier profiles', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建档案（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, contact, phone, email, address, rebateRate, settlementDay, creditTerm, currency, agencyId, supplierId, notes } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'name and type are required' }, { status: 400 });
    }

    const TYPE_MAP_FRONT_TO_DB: Record<string, any> = {
      '广告代理商': 'AD_AGENCY',
      '物流商': 'LOGISTICS',
      '供货商': 'VENDOR'
    };

    const profile = await prisma.supplierProfile.create({
      data: {
        name,
        type: TYPE_MAP_FRONT_TO_DB[type] ?? type,
        contact: contact || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        rebateRate: rebateRate ?? null,
        settlementDay: settlementDay ?? null,
        creditTerm: creditTerm ?? null,
        currency: currency || null,
        agencyId: agencyId || null,
        supplierId: supplierId || null,
        notes: notes || null,
      }
    });

    // 清除供应商档案缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: profile.id,
      name: profile.name,
      type: profile.type,
      createdAt: profile.createdAt.toISOString()
    });
  } catch (error: any) {
    console.error('Error creating supplier profile:', error);
    return NextResponse.json(
      { error: 'Failed to create supplier profile', details: error.message },
      { status: 500 }
    );
  }
}
