import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟
const CACHE_KEY_PREFIX = 'outbound-orders';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId");
    const status = searchParams.get("status");
    const variantId = searchParams.get("variantId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      warehouseId || 'all',
      status || 'all',
      variantId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !warehouseId && !status && !variantId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (variantId) where.variantId = variantId;

    const [orders, total] = await prisma.$transaction([
      prisma.outboundOrder.findMany({
        where,
        select: {
          id: true, outboundNumber: true, variantId: true, sku: true,
          qty: true, shippedQty: true, warehouseId: true, warehouseName: true,
          destination: true, status: true, reason: true,
          createdAt: true, updatedAt: true,
          _count: { select: { batches: true } },
          variant: { select: { product: { select: { name: true } } } },
          pendingInbound: { select: { contractNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.outboundOrder.count({ where }),
    ]);

    const response = {
      data: orders.map(o => ({
        id: o.id,
        outboundNumber: o.outboundNumber,
        variantId: o.variantId,
        sku: o.sku,
        qty: o.qty,
        shippedQty: o.shippedQty,
        warehouseId: o.warehouseId,
        warehouseName: o.warehouseName,
        destination: o.destination || undefined,
        status: o.status,
        reason: o.reason || undefined,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        batchCount: o._count.batches,
        productName: o.variant?.product?.name ?? "",
        contractNumber: o.pendingInbound?.contractNumber ?? "",
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !warehouseId && !status && !variantId) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const order = await prisma.outboundOrder.create({
      data: {
        outboundNumber: body.outboundNumber,
        variantId: body.variantId,
        sku: body.sku,
        qty: body.qty,
        shippedQty: body.shippedQty ?? 0,
        warehouseId: body.warehouseId,
        warehouseName: body.warehouseName,
        destination: body.destination || null,
        status: body.status || 'PENDING',
        reason: body.reason || null,
      },
    });

    // 清除出库订单缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: order.id,
      outboundNumber: order.outboundNumber,
      createdAt: order.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
