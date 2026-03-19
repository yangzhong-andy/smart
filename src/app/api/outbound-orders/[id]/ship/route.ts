import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/outbound-orders/[id]/ship - 出库操作（创建批次）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { shippedQty, logisticsChannelId, logisticsChannelName } = body;

    // 获取出库单
    const order = await prisma.outboundOrder.findUnique({
      where: { id },
    });

    if (!order) {
      return NextResponse.json({ error: "出库单不存在" }, { status: 404 });
    }

    // 创建批次
    const batch = await prisma.outboundBatch.create({
      data: {
        outboundOrderId: id,
        batchNumber: `BATCH-${Date.now()}`,
        warehouseId: order.warehouseId,
        warehouseName: order.warehouseName,
        qty: shippedQty,
        shippedDate: new Date(),
        logisticsChannelId: logisticsChannelId || null,
        logisticsChannelName: logisticsChannelName || null,
      },
    });

    // 更新出库单的已出库数量和状态
    const newShippedQty = order.shippedQty + shippedQty;
    const newStatus =
      newShippedQty >= (order.qty || 0) ? "已出库" : "部分出库";

    await prisma.outboundOrder.update({
      where: { id },
      data: {
        shippedQty: newShippedQty,
        status: newStatus,
      },
    });

    // 更新库存（减少出库仓库的库存）
    if (order.variantId && order.warehouseId) {
      await prisma.stock.updateMany({
        where: {
          variantId: order.variantId,
          warehouseId: order.warehouseId,
        },
        data: {
          qty: {
            decrement: shippedQty,
          },
        },
      });
    }

    return NextResponse.json({
      id: batch.id,
      batchNumber: batch.batchNumber,
      status: newStatus,
    });
  } catch (error: any) {
    console.error("出库失败:", error);
    return NextResponse.json(
      { error: error.message || "出库失败" },
      { status: 500 }
    );
  }
}
