import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeDeliveryOrderInbound } from "@/lib/inbound-delivery-order";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY_PREFIX = "pending-inbound";
const OUTBOUND_ORDERS_CACHE_PREFIX = "outbound-orders";
const INBOUND_BATCHES_CACHE_PREFIX = "inbound-batches";

/**
 * POST 待入库单入库（物流页「入库」按钮）
 * Body: { itemQtys?: Record<string, number>, receivedQty?: number, warehouseId?: string }
 * - itemQtys: 多SKU时每个SKU的实收数量，key是item id，value是数量
 * - receivedQty: 单SKU时的实收数量（兼容旧版本）
 * 若未传 warehouseId，使用系统第一个仓库
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pendingInboundId } = await params;
    const body = await request.json();
    const itemQtys = body.itemQtys as Record<string, number> | undefined;
    const receivedQty = body.receivedQty != null ? Number(body.receivedQty) : undefined;
    let warehouseId = (body.warehouseId as string) || undefined;

    // 校验：需要提供 itemQtys（多SKU）或 receivedQty（单SKU）之一
    const hasItemQtys = itemQtys && Object.keys(itemQtys).length > 0;
    const hasReceivedQty = receivedQty != null && receivedQty >= 0;

    if (!hasItemQtys && !hasReceivedQty) {
      return NextResponse.json(
        { error: "请提供实收数量（多SKU用 itemQtys，单SKU用 receivedQty）" },
        { status: 400 }
      );
    }

    const pending = await prisma.pendingInbound.findUnique({
      where: { id: pendingInboundId },
      select: { deliveryOrderId: true },
    });

    if (!pending) {
      return NextResponse.json({ error: "待入库单不存在" }, { status: 404 });
    }

    if (!warehouseId) {
      const first = await prisma.warehouse.findFirst({
        orderBy: { id: "asc" },
        select: { id: true },
      });
      if (!first) {
        return NextResponse.json(
          { error: "系统中暂无仓库，请先创建仓库或传入 warehouseId" },
          { status: 400 }
        );
      }
      warehouseId = first.id;
    }

    // 优先使用 itemQtys（多SKU模式），否则使用 receivedQty（单SKU兼容模式）
    const result = await executeDeliveryOrderInbound(
      pending.deliveryOrderId,
      warehouseId,
      hasItemQtys ? itemQtys! : receivedQty!
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    await clearCacheByPrefix(OUTBOUND_ORDERS_CACHE_PREFIX);
    await clearCacheByPrefix(INBOUND_BATCHES_CACHE_PREFIX);

    return NextResponse.json({
      success: true,
      message: "入库成功，库存已增加，待入库单已更新",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "入库失败" },
      { status: 500 }
    );
  }
}
