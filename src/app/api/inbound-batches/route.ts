import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";
import { InventoryLogType, InventoryLogStatus, StockLogReason, InventoryMovementType } from "@prisma/client";

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
        include: {
          pendingInbound: {
            include: {
              variant: { include: { product: true } },
            },
          },
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
        warehouseName: b.warehouseName ?? "",
        qty: b.qty,
        receivedDate: b.receivedDate.toISOString(),
        notes: b.notes || undefined,
        createdAt: b.createdAt.toISOString(),
        inboundNumber: b.pendingInbound?.inboundNumber ?? undefined,
        sku: b.pendingInbound?.sku ?? undefined,
        contractNumber: b.pendingInbound?.contractNumber ?? "",
        deliveryNumber: b.pendingInbound?.deliveryNumber ?? "",
        status: b.pendingInbound?.status ?? undefined,
        productName: b.pendingInbound?.variant?.product?.name ?? "",
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

// POST - 创建入库批次，并自动增加库存（参考出库批次逻辑，用 $transaction 保证一致性）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pendingInboundId = body.pendingInboundId ?? body.inboundId;
    const batchNumber = body.batchNumber;
    const warehouseId = body.warehouseId;
    const warehouseName = body.warehouseName;
    const qty = body.qty != null ? Number(body.qty) : NaN;
    const receivedDate = body.receivedDate ? new Date(body.receivedDate) : null;

    if (!pendingInboundId || !batchNumber || !warehouseId || !warehouseName || !Number.isFinite(qty) || qty < 0 || !receivedDate) {
      return NextResponse.json(
        { error: "请提供 pendingInboundId、batchNumber、warehouseId、warehouseName、qty（≥0）、receivedDate" },
        { status: 400 }
      );
    }

    // 1. 获取入库批次关联的 PendingInbound，得到 variantId（SKU）
    const pending = await prisma.pendingInbound.findUnique({
      where: { id: pendingInboundId },
      select: { id: true, inboundNumber: true, sku: true, variantId: true },
    });
    if (!pending) {
      return NextResponse.json({ error: "待入库单不存在" }, { status: 404 });
    }

    let variantId: string | null = pending.variantId ?? null;
    if (!variantId && pending.sku) {
      const bySku = await prisma.productVariant.findFirst({
        where: { skuId: pending.sku },
        select: { id: true },
      });
      if (bySku) variantId = bySku.id;
    }
    if (!variantId) {
      return NextResponse.json(
        { error: "无法解析待入库单的 SKU（variantId），请先在产品档案中维护" },
        { status: 400 }
      );
    }

    const now = new Date();

    const batch = await prisma.$transaction(async (tx) => {
      // 2. 检查或创建 Stock 记录，并增加库存：stock.qty += 入库数量
      const existing = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } },
      });

      let qtyBefore: number;
      let qtyAfter: number;
      if (existing) {
        qtyBefore = existing.qty;
        qtyAfter = qtyBefore + qty;
        await tx.stock.update({
          where: { id: existing.id },
          data: {
            qty: qtyAfter,
            availableQty: existing.availableQty + qty,
            updatedAt: now,
          },
        });
      } else {
        qtyBefore = 0;
        qtyAfter = qty;
        await tx.stock.create({
          data: {
            variantId,
            warehouseId,
            qty: qty,
            reservedQty: 0,
            availableQty: qty,
          },
        });
      }

      // 3. 创建入库批次
      const newBatch = await tx.inboundBatch.create({
        data: {
          pendingInboundId,
          batchNumber,
          warehouseId,
          warehouseName,
          qty,
          receivedDate,
          notes: body.notes || null,
        },
      });

      // 4. 创建 InventoryLog，type = IN，status = INBOUNDED
      await tx.inventoryLog.create({
        data: {
          type: InventoryLogType.IN,
          status: InventoryLogStatus.INBOUNDED,
          variantId,
          qty,
          warehouseId,
          relatedOrderNo: `${pending.inboundNumber} / ${batchNumber}`,
          notes: `入库批次 ${batchNumber}，待入库单 ${pending.inboundNumber}`,
        },
      });

      // 5. 创建 StockLog，入库原因用 PURCHASE_INBOUND
      await tx.stockLog.create({
        data: {
          variantId,
          warehouseId,
          reason: StockLogReason.PURCHASE_INBOUND,
          movementType: InventoryMovementType.DOMESTIC_INBOUND,
          qty,
          qtyBefore,
          qtyAfter,
          operationDate: now,
          relatedOrderId: newBatch.id,
          relatedOrderType: "InboundBatch",
          relatedOrderNumber: batchNumber,
          notes: `入库批次 ${batchNumber}，待入库单 ${pending.inboundNumber}，数量 ${qty}`,
        },
      });

      return newBatch;
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
    return NextResponse.json(
      { error: error?.message || "创建失败" },
      { status: 500 }
    );
  }
}
