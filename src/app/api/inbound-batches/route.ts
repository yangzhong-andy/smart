import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟
const CACHE_KEY_PREFIX = 'inbound-batches';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pendingInboundId = searchParams.get("pendingInboundId");
    const warehouseId = searchParams.get("warehouseId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      pendingInboundId || 'all',
      warehouseId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !pendingInboundId && !warehouseId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Inbound batches cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (pendingInboundId) where.pendingInboundId = pendingInboundId;
    if (warehouseId) where.warehouseId = warehouseId;

    const [batches, total] = await prisma.$transaction([
      prisma.inboundBatch.findMany({
        where,
        select: {
          id: true, inboundId: true, batchNumber: true,
          warehouseId: true, warehouseName: true, qty: true,
          receivedDate: true, notes: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inboundBatch.count({ where }),
    ]);

    const response = {
      data: batches.map(b => ({
        id: b.id,
        inboundId: b.pendingInboundId,
        batchNumber: b.batchNumber,
        warehouseId: b.warehouseId,
        warehouseName: b.warehouseName,
        qty: b.qty,
        receivedDate: b.receivedDate.toISOString(),
        notes: b.notes || undefined,
        createdAt: b.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !pendingInboundId && !warehouseId) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET inbound-batches error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const batch = await prisma.inboundBatch.create({
      data: {
        inboundId: body.pendingInboundId,
        batchNumber: body.batchNumber,
        warehouseId: body.warehouseId,
        warehouseName: body.warehouseName,
        qty: body.qty,
        receivedDate: new Date(body.receivedDate),
        notes: body.notes || null,
      },
    });

    // 清除入库批次缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: batch.id,
      batchNumber: batch.batchNumber,
      createdAt: batch.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST inbound-batches error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
