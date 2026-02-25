import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeDeliveryOrderInbound } from "@/lib/inbound-delivery-order";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY_PREFIX = "pending-inbound";
const OUTBOUND_ORDERS_CACHE_PREFIX = "outbound-orders";

/**
 * POST 待入库单入库（物流页「入库」按钮）
 * Body: { receivedQty: number, warehouseId?: string }
 * 若未传 warehouseId，使用系统第一个仓库
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pendingInboundId } = await params;
    const body = await request.json();
    const receivedQty = body.receivedQty != null ? Number(body.receivedQty) : undefined;
    let warehouseId = (body.warehouseId as string) || undefined;

    if (receivedQty == null || receivedQty < 0) {
      return NextResponse.json(
        { error: "请提供有效的实收数量（receivedQty ≥ 0）" },
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

    const result = await executeDeliveryOrderInbound(
      pending.deliveryOrderId,
      warehouseId,
      receivedQty
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    await clearCacheByPrefix(OUTBOUND_ORDERS_CACHE_PREFIX);

    return NextResponse.json({
      success: true,
      message: "入库成功，库存已增加，待入库单已更新",
    });
  } catch (error: any) {
    console.error("POST pending-inbound receive error:", error);
    return NextResponse.json(
      { error: error?.message || "入库失败" },
      { status: 500 }
    );
  }
}
