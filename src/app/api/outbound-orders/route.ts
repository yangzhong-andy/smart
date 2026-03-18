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

    // 尝试从缓存获取（仅第一页）- 暂时禁用以获取最新数据
    // if (!noCache && page === 1 && !warehouseId && !status && !variantId) {
    //   const cached = await getCache<any>(cacheKey);
    //   if (cached) {
    //     return NextResponse.json(cached);
    //   }
    // }

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
          items: {
            select: {
              id: true, variantId: true, sku: true, skuName: true, spec: true,
              qty: true, shippedQty: true, unitPrice: true
            }
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.outboundOrder.count({ where }),
    ]);

    const response = {
      data: orders.map(o => {
        // 计算总数量：优先从items计算，否则用单SKU字段
        const totalQty = o.items && o.items.length > 0 
          ? o.items.reduce((sum, item) => sum + item.qty, 0)
          : (o.qty || 0);
        const totalShipped = o.items && o.items.length > 0
          ? o.items.reduce((sum, item) => sum + item.shippedQty, 0)
          : (o.shippedQty || 0);
        
        return {
          id: o.id,
          outboundNumber: o.outboundNumber,
          variantId: o.variantId,
          sku: o.sku,
          qty: totalQty,
          shippedQty: totalShipped,
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
          // 多SKU明细
          items: o.items?.map(item => ({
            id: item.id,
            variantId: item.variantId || undefined,
            sku: item.sku,
            skuName: item.skuName || undefined,
            spec: item.spec || undefined,
            qty: item.qty,
            shippedQty: item.shippedQty,
            unitPrice: item.unitPrice ? Number(item.unitPrice) : undefined,
          })) || [],
          isMultiSku: (o.items?.length || 0) > 1,
        };
      }),
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

// POST - 创建出库单（支持多SKU）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = body.items as Array<{
      variantId?: string;
      sku: string;
      skuName?: string;
      spec?: string;
      qty: number;
      unitPrice?: number;
    }> | undefined;

    // 多SKU模式
    if (items && items.length > 0) {
      const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0);
      
      const order = await prisma.outboundOrder.create({
        data: {
          outboundNumber: body.outboundNumber,
          // 单SKU字段使用第一个item的值（兼容旧逻辑）
          variantId: items[0]?.variantId || null,
          sku: items[0]?.sku || null,
          qty: totalQty,
          shippedQty: 0,
          warehouseId: body.warehouseId,
          warehouseName: body.warehouseName,
          destination: body.destination || null,
          status: body.status || 'PENDING',
          reason: body.reason || null,
          pendingInboundId: body.pendingInboundId || null,
          items: {
            create: items.map(item => ({
              variantId: item.variantId || null,
              sku: item.sku,
              skuName: item.skuName || null,
              spec: item.spec || null,
              qty: item.qty,
              shippedQty: 0,
              unitPrice: item.unitPrice ? Number(item.unitPrice) : null,
            }))
          }
        },
        include: { items: true }
      });

      await clearCacheByPrefix(CACHE_KEY_PREFIX);

      return NextResponse.json({
        id: order.id,
        outboundNumber: order.outboundNumber,
        createdAt: order.createdAt.toISOString(),
      });
    } else {
      // 单SKU模式（兼容旧版本）
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

      await clearCacheByPrefix(CACHE_KEY_PREFIX);

      return NextResponse.json({
        id: order.id,
        outboundNumber: order.outboundNumber,
        createdAt: order.createdAt.toISOString(),
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
