import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOutboundOrderFromPendingInbound } from "@/lib/create-outbound-from-inbound";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const OUTBOUND_ORDERS_CACHE_PREFIX = "outbound-orders";

/**
 * POST /api/inbound-batches/[id]/create-outbound
 * 根据指定入库批次一键生成出库单（关联该批次所属的待入库单 + 仓库）
 * 若该待入库单已有出库单则返回已有，不重复创建
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inboundBatchId } = await params;

    const batch = await prisma.inboundBatch.findUnique({
      where: { id: inboundBatchId },
      include: {
        pendingInbound: true,
        warehouse: true,
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "入库批次不存在" }, { status: 404 });
    }

    const pending = batch.pendingInbound;
    if (!pending) {
      return NextResponse.json({ error: "该入库批次未关联待入库单" }, { status: 400 });
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
        { error: "无法解析 SKU 对应的 variantId，请先在待入库单或产品档案中维护" },
        { status: 400 }
      );
    }

    const order = await createOutboundOrderFromPendingInbound({
      pendingInboundId: pending.id,
      variantId,
      sku: pending.sku,
      qty: pending.qty,
      warehouseId: batch.warehouseId,
      warehouseName: batch.warehouseName,
    });

    await clearCacheByPrefix(OUTBOUND_ORDERS_CACHE_PREFIX);

    return NextResponse.json({
      success: true,
      outboundOrder: {
        id: order.id,
        outboundNumber: order.outboundNumber,
        createdAt: order.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建出库单失败" },
      { status: 500 }
    );
  }
}
