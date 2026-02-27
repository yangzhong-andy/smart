import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟
const CACHE_KEY_PREFIX = 'pending-inbound';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deliveryOrderId = searchParams.get("deliveryOrderId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      deliveryOrderId || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !deliveryOrderId && !status) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (deliveryOrderId) where.deliveryOrderId = deliveryOrderId;
    if (status) where.status = status;

    const [items, total] = await prisma.$transaction([
      prisma.pendingInbound.findMany({
        where,
        select: {
          id: true, inboundNumber: true, deliveryOrderId: true, deliveryNumber: true,
          contractId: true, contractNumber: true, sku: true, variantId: true,
          qty: true, receivedQty: true, domesticTrackingNumber: true,
          shippedDate: true, status: true, createdAt: true, updatedAt: true,
          _count: { select: { batches: true } },
          batches: {
            take: 1,
            orderBy: { createdAt: 'desc' as const },
            select: { warehouseName: true },
          },
          variant: { select: { product: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.pendingInbound.count({ where }),
    ]);

    const response = {
      data: items.map(item => ({
        id: item.id,
        inboundNumber: item.inboundNumber,
        deliveryOrderId: item.deliveryOrderId,
        deliveryNumber: item.deliveryNumber,
        contractId: item.contractId || undefined,
        contractNumber: item.contractNumber || undefined,
        sku: item.sku,
        variantId: item.variantId || undefined,
        qty: item.qty,
        receivedQty: item.receivedQty,
        domesticTrackingNumber: item.domesticTrackingNumber || undefined,
        shippedDate: item.shippedDate?.toISOString(),
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        batchCount: item._count.batches,
        warehouseName: item.batches?.[0]?.warehouseName ?? undefined,
        productName: item.variant?.product?.name ?? "",
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !deliveryOrderId && !status) {
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
    const item = await prisma.pendingInbound.create({
      data: {
        inboundNumber: body.inboundNumber,
        deliveryOrderId: body.deliveryOrderId,
        deliveryNumber: body.deliveryNumber,
        contractId: body.contractId || null,
        contractNumber: body.contractNumber || null,
        sku: body.sku,
        variantId: body.variantId || null,
        qty: body.qty,
        receivedQty: body.receivedQty ?? 0,
        domesticTrackingNumber: body.domesticTrackingNumber || null,
        shippedDate: body.shippedDate ? new Date(body.shippedDate) : null,
        status: body.status || "PENDING",
      },
    });

    // 清除待入库缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: item.id,
      inboundNumber: item.inboundNumber,
      sku: item.sku,
      createdAt: item.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
