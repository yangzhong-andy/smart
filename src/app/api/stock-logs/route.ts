import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟
const CACHE_KEY_PREFIX = 'stock-logs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get("variantId");
    const type = searchParams.get("type");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      variantId || 'all',
      type || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !variantId && !type) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Stock logs cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (variantId) where.variantId = variantId;
    if (type) where.movementType = type;

    const [logs, total] = await prisma.$transaction([
      prisma.stockLog.findMany({
        where,
        select: {
          id: true, variantId: true, movementType: true, qty: true, qtyAfter: true,
          relatedOrderId: true, relatedOrderType: true,
          notes: true, operator: true, createdAt: true,
          variant: { select: { id: true, skuId: true, product: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.stockLog.count({ where }),
    ]);

    const response = {
      data: logs.map(l => ({
        id: l.id,
        variantId: l.variantId,
        sku: l.variant?.skuId,
        productName: l.variant?.product?.name,
        type: l.movementType,
        qty: l.qty,
        balance: l.qtyAfter,
        relatedOrderId: l.relatedOrderId ?? undefined,
        relatedOrderType: l.relatedOrderType ?? undefined,
        notes: l.notes ?? undefined,
        operator: l.operator ?? undefined,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !variantId && !type) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET stock-logs error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const qty = Number(body.qty) || 0;
    const qtyBefore = body.qtyBefore != null ? Number(body.qtyBefore) : (body.balance != null ? Number(body.balance) - qty : 0);
    const qtyAfter = body.qtyAfter != null ? Number(body.qtyAfter) : (body.balance != null ? Number(body.balance) : qtyBefore + qty);
    const log = await prisma.stockLog.create({
      data: {
        variantId: body.variantId,
        warehouseId: body.warehouseId ?? "",
        reason: (body.reason ?? "OTHER") as any,
        movementType: (body.type ?? body.movementType ?? "OTHER") as any,
        qty,
        qtyBefore,
        qtyAfter,
        operationDate: body.operationDate ? new Date(body.operationDate) : new Date(),
        relatedOrderId: body.relatedOrderId ?? null,
        relatedOrderType: body.relatedOrderType ?? null,
        notes: body.notes ?? null,
        operator: body.operator ?? null,
      },
    });

    // 清除库存日志缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: log.id,
      variantId: log.variantId,
      type: log.movementType,
      createdAt: log.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST stock-logs error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
