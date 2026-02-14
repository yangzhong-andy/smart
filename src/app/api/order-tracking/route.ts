import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟
const CACHE_KEY_PREFIX = 'order-tracking';

const STATUS_MAP_FRONT_TO_DB: Record<string, any> = {
  '采购中': 'PURCHASING',
  '生产中': 'PRODUCING',
  '已发货': 'SHIPPED',
  '部分到货': 'PARTIAL_ARRIVAL',
  '已到货': 'ARRIVED',
  '已完成': 'COMPLETED'
};
const STATUS_MAP_DB_TO_FRONT: Record<string, string> = {
  PURCHASING: '采购中',
  PRODUCING: '生产中',
  SHIPPED: '已发货',
  PARTIAL_ARRIVAL: '部分到货',
  ARRIVED: '已到货',
  COMPLETED: '已完成'
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const poId = searchParams.get("poId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      poId || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !poId && !status) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Order tracking cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (poId) where.poId = poId;
    if (status) where.status = STATUS_MAP_FRONT_TO_DB[status] || status;

    const [list, total] = await prisma.$transaction([
      prisma.orderTracking.findMany({
        where,
        select: {
          id: true, poId: true, status: true, statusDate: true,
          notes: true, createdAt: true, updatedAt: true,
        },
        orderBy: { statusDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.orderTracking.count({ where }),
    ]);

    const response = {
      data: list.map(t => ({
        id: t.id,
        poId: t.poId,
        status: STATUS_MAP_DB_TO_FRONT[t.status] || t.status,
        statusDate: t.statusDate.toISOString().split('T')[0],
        notes: t.notes || undefined,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !poId && !status) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET order-tracking error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tracking = await prisma.orderTracking.create({
      data: {
        poId: body.poId,
        status: STATUS_MAP_FRONT_TO_DB[body.status] || body.status,
        statusDate: new Date(body.statusDate),
        notes: body.notes || null,
      },
    });

    // 清除订单追踪缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: tracking.id,
      poId: tracking.poId,
      status: STATUS_MAP_DB_TO_FRONT[tracking.status] || tracking.status,
      createdAt: tracking.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST order-tracking error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
