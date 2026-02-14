import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 600; // 10分钟
const CACHE_KEY_PREFIX = 'product-suppliers';

// GET - 获取供应商关联的产品
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const productId = searchParams.get('productId');
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      supplierId || 'all',
      productId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !supplierId && !productId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Product suppliers cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (supplierId) where.supplierId = supplierId;
    if (productId) where.productId = productId;

    const [productSuppliers, total] = await prisma.$transaction([
      prisma.productSupplier.findMany({
        where,
        select: {
          id: true, supplierId: true, productId: true,
          isPrimary: true, moq: true, leadTime: true,
          unitPrice: true, currency: true, notes: true,
          createdAt: true, updatedAt: true,
          supplier: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productSupplier.count({ where }),
    ]);

    const response = {
      data: productSuppliers.map(ps => ({
        id: ps.id,
        supplierId: ps.supplierId,
        supplierName: ps.supplier?.name,
        productId: ps.productId,
        productName: ps.product?.name,
        productSku: ps.product?.sku,
        isPrimary: ps.isPrimary || false,
        moq: ps.moq || undefined,
        leadTime: ps.leadTime || undefined,
        unitPrice: ps.unitPrice ? Number(ps.unitPrice) : undefined,
        currency: ps.currency || undefined,
        notes: ps.notes || undefined,
        createdAt: ps.createdAt.toISOString(),
        updatedAt: ps.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !supplierId && !productId) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching product suppliers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product suppliers' },
      { status: 500 }
    );
  }
}

// POST - 创建关联（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierId, productId, isPrimary, moq, leadTime, unitPrice, currency, notes } = body;

    if (!supplierId || !productId) {
      return NextResponse.json({ error: 'supplierId and productId are required' }, { status: 400 });
    }

    const ps = await prisma.productSupplier.create({
      data: {
        supplierId,
        productId,
        isPrimary: isPrimary ?? false,
        moq: moq ?? null,
        leadTime: leadTime ?? null,
        unitPrice: unitPrice ?? null,
        currency: currency || null,
        notes: notes || null,
      }
    });

    // 清除产品供应商缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: ps.id,
      supplierId: ps.supplierId,
      productId: ps.productId,
      createdAt: ps.createdAt.toISOString()
    });
  } catch (error: any) {
    console.error('Error creating product supplier:', error);
    return NextResponse.json(
      { error: 'Failed to create product supplier', details: error.message },
      { status: 500 }
    );
  }
}
