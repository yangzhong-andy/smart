import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 120; // 2分钟（库存高频）
const CACHE_KEY_PREFIX = 'inventory-stocks';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId");
    const warehouseId = searchParams.get("warehouseId");
    const location = searchParams.get("location");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      variantId || 'all',
      warehouseId || 'all',
      location || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !variantId && !warehouseId && !location) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (variantId) where.variantId = variantId;
    if (warehouseId) where.storeId = warehouseId;
    if (location) where.location = location;

    const [stocks, total] = await prisma.$transaction([
      prisma.inventoryStock.findMany({
        where,
        select: {
          id: true, variantId: true, storeId: true, location: true, qty: true,
          updatedAt: true,
          variant: { select: { id: true, skuId: true, product: { select: { name: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventoryStock.count({ where }),
    ]);

    const response = {
      data: stocks.map(s => ({
        id: s.id,
        variantId: s.variantId,
        sku: s.variant?.skuId,
        productName: s.variant?.product?.name,
        warehouseId: s.storeId ?? undefined,
        warehouseName: undefined,
        location: s.location,
        availableQty: s.qty,
        lockedQty: 0,
        totalQty: s.qty,
        updatedAt: s.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !variantId && !warehouseId && !location) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}
