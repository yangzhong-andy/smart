import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 120; // 2分钟（通知高频）
const CACHE_KEY_PREFIX = 'notifications';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const relatedId = searchParams.get("relatedId");
    const relatedType = searchParams.get("relatedType");
    const read = searchParams.get("read");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      relatedId || 'all',
      relatedType || 'all',
      read || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页且无筛选时）
    if (!noCache && page === 1 && !relatedId && !relatedType && read === null) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Notifications cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (relatedId) where.relatedId = relatedId;
    if (relatedType) where.relatedType = relatedType;
    if (read !== null && read !== '') where.read = read === 'true';

    const [notifications, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        select: {
          id: true, type: true, title: true, message: true,
          relatedId: true, relatedType: true, createdAt: true,
          read: true, readAt: true, actionUrl: true, priority: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
    ]);

    const response = {
      data: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedId: n.relatedId || undefined,
        relatedType: n.relatedType || undefined,
        createdAt: n.createdAt.toISOString(),
        read: n.read,
        readAt: n.readAt?.toISOString(),
        actionUrl: n.actionUrl || undefined,
        priority: n.priority,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !relatedId && !relatedType && read === null) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET notifications error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// PATCH - 批量标记已读（清除缓存）
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids is required' }, { status: 400 });
    }

    await prisma.notification.updateMany({
      where: { id: { in: ids } },
      data: { read: true, readAt: new Date() },
    });

    // 清除通知缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({ success: true, updatedCount: ids.length });
  } catch (error: any) {
    console.error("PATCH notifications error:", error);
    return NextResponse.json({ error: error.message || "更新失败" }, { status: 500 });
  }
}
