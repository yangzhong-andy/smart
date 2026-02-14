import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'delivery-orders';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      contractId || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !contractId && !status) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Delivery orders cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (contractId) where.contractId = contractId;
    if (status) where.status = status;

    const [orders, total] = await prisma.$transaction([
      prisma.deliveryOrder.findMany({
        where,
        select: {
          id: true, deliveryNumber: true, contractId: true, contractNumber: true,
          qty: true, itemQtys: true, domesticTrackingNumber: true,
          shippedDate: true, status: true, tailAmount: true, tailPaid: true,
          tailDueDate: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.deliveryOrder.count({ where }),
    ]);

    const STATUS_MAP_DB_TO_FRONT: Record<string, string> = {
      PENDING: '待发货',
      SHIPPED: '已发货',
      IN_TRANSIT: '运输中',
      RECEIVED: '已入库',
      CANCELLED: '已取消'
    };

    const response = {
      data: orders.map(o => ({
        id: o.id,
        deliveryNumber: o.deliveryNumber,
        contractId: o.contractId || undefined,
        contractNumber: o.contractNumber,
        qty: o.qty,
        itemQtys: o.itemQtys != null ? (o.itemQtys as Record<string, number>) : undefined,
        domesticTrackingNumber: o.domesticTrackingNumber || undefined,
        shippedDate: o.shippedDate?.toISOString(),
        status: STATUS_MAP_DB_TO_FRONT[o.status] || o.status,
        tailAmount: Number(o.tailAmount),
        tailPaid: Number(o.tailPaid),
        tailDueDate: o.tailDueDate?.toISOString(),
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !contractId && !status) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET delivery-orders error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const order = await prisma.deliveryOrder.create({
      data: {
        deliveryNumber: body.deliveryNumber,
        contractId: body.contractId || null,
        contractNumber: body.contractNumber,
        qty: body.qty,
        itemQtys: body.itemQtys ?? undefined,
        domesticTrackingNumber: body.domesticTrackingNumber || null,
        shippedDate: body.shippedDate ? new Date(body.shippedDate) : null,
        status: body.status || 'PENDING',
        tailAmount: body.tailAmount ?? 0,
        tailPaid: body.tailPaid ?? 0,
        tailDueDate: body.tailDueDate ? new Date(body.tailDueDate) : null,
      },
    });

    // 清除交付订单缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: order.id,
      deliveryNumber: order.deliveryNumber,
      createdAt: order.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST delivery-orders error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
