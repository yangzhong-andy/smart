import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'purchase-orders';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const storeId = searchParams.get("storeId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      platform || 'all',
      storeId || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !platform && !storeId && !status) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Purchase orders cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (platform) where.platform = platform;
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;

    const [orders, total] = await prisma.$transaction([
      prisma.purchaseOrder.findMany({
        where,
        select: {
          id: true, uid: true, platform: true, storeId: true, storeName: true,
          orderNumber: true, expectedDeliveryDate: true, createdBy: true, createdAt: true, updatedAt: true,
          status: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    const response = {
      data: orders.map(o => ({
        id: o.id,
        uid: o.uid || undefined,
        platform: o.platform,
        storeId: o.storeId || undefined,
        storeName: o.storeName ?? undefined,
        orderNumber: o.orderNumber,
        orderDate: o.expectedDeliveryDate ? o.expectedDeliveryDate.toISOString().split('T')[0] : o.createdAt.toISOString().split('T')[0],
        totalAmount: undefined as number | undefined,
        currency: 'CNY',
        status: o.status,
        paymentStatus: undefined as string | undefined,
        createdBy: o.createdBy,
        updatedAt: o.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !platform && !storeId && !status) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET purchase-orders error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const order = await prisma.purchaseOrder.create({
      data: {
        uid: body.uid || null,
        platform: body.platform,
        storeId: body.storeId || null,
        storeName: body.storeName ?? null,
        orderNumber: body.orderNumber,
        expectedDeliveryDate: body.createdAt ? new Date(body.createdAt) : null,
        status: (body.status || "PENDING_RISK") as any,
        createdBy: body.createdBy || '系统',
      },
    });

    // 清除采购订单缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST purchase-orders error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
