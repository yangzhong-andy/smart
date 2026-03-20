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
    const {
      shippedQty,
      itemShippings,
      logisticsChannelId,
      logisticsChannelName,
      destinationCountry,
      destinationPlatform,
      destinationStoreId,
      destinationStoreName,
      ownerType,
      ownerId,
      ownerName,
    } = body;

    // 获取出库单
    const order = await prisma.outboundOrder.findUnique({
      where: { id },
    });

    if (!order) {
      return NextResponse.json({ error: "出库单不存在" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const orderWithItems = await tx.outboundOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!orderWithItems) throw new Error("出库单不存在");

      const hasItems = Array.isArray(orderWithItems.items) && orderWithItems.items.length > 0;
      let totalShipQty = 0;

      if (hasItems) {
        if (!Array.isArray(itemShippings) || itemShippings.length === 0) {
          throw new Error("请选择 SKU 并填写出库数量");
        }
        // 规范化并过滤无效项
        const normalized = itemShippings
          .map((it: any) => ({
            itemId: String(it.itemId || ""),
            qty: Number(it.qty || 0),
          }))
          .filter((it: { itemId: string; qty: number }) => it.itemId && Number.isFinite(it.qty) && it.qty > 0);
        if (normalized.length === 0) throw new Error("请输入有效的 SKU 出库数量");

        // 合并重复 itemId
        const shipMap = new Map<string, number>();
        for (const it of normalized) {
          shipMap.set(it.itemId, (shipMap.get(it.itemId) || 0) + Math.floor(it.qty));
        }

        for (const item of orderWithItems.items) {
          const ship = shipMap.get(item.id) || 0;
          if (ship <= 0) continue;
          const remaining = (item.qty || 0) - (item.shippedQty || 0);
          if (ship > remaining) {
            throw new Error(`SKU ${item.sku} 出库数量超出待出库（最多 ${remaining}）`);
          }
          totalShipQty += ship;
        }
        if (totalShipQty <= 0) throw new Error("至少有一个 SKU 出库数量大于 0");

        // 更新 item shippedQty + 扣库存
        for (const item of orderWithItems.items) {
          const ship = shipMap.get(item.id) || 0;
          if (ship <= 0) continue;
          await tx.outboundOrderItem.update({
            where: { id: item.id },
            data: { shippedQty: { increment: ship } },
          });
          if (item.variantId && orderWithItems.warehouseId) {
            await tx.stock.updateMany({
              where: { variantId: item.variantId, warehouseId: orderWithItems.warehouseId },
              data: {
                qty: { decrement: ship },
                availableQty: { decrement: ship },
              },
            });
          }
        }
      } else {
        const qty = Number(shippedQty || 0);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error("请输入有效的出库数量");
        const remain = (orderWithItems.qty || 0) - (orderWithItems.shippedQty || 0);
        if (qty > remain) throw new Error(`出库数量超出待出库（最多 ${remain}）`);
        totalShipQty = Math.floor(qty);
        if (orderWithItems.variantId && orderWithItems.warehouseId) {
          await tx.stock.updateMany({
            where: { variantId: orderWithItems.variantId, warehouseId: orderWithItems.warehouseId },
            data: {
              qty: { decrement: totalShipQty },
              availableQty: { decrement: totalShipQty },
            },
          });
        }
      }

      // 创建批次
      const batch = await tx.outboundBatch.create({
        data: {
          outboundOrderId: id,
          batchNumber: `BATCH-${Date.now()}`,
          warehouseId: orderWithItems.warehouseId,
          warehouseName: orderWithItems.warehouseName,
          qty: totalShipQty,
          shippedDate: new Date(),
          logisticsChannelId: logisticsChannelId || null,
          logisticsChannelName: logisticsChannelName || null,
          destinationCountry: destinationCountry || null,
          destinationPlatform: destinationPlatform || null,
          destinationStoreId: destinationStoreId || null,
          destinationStoreName: destinationStoreName || null,
          ownerType: ownerType || null,
          ownerId: ownerId || null,
          ownerName: ownerName || null,
        },
      });

      // 汇总已出库数量并更新出库单状态
      const refreshed = await tx.outboundOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      const totalPlanned = refreshed?.items?.length
        ? refreshed.items.reduce((s: number, it: any) => s + (it.qty || 0), 0)
        : (refreshed?.qty || 0);
      const totalShipped = refreshed?.items?.length
        ? refreshed.items.reduce((s: number, it: any) => s + (it.shippedQty || 0), 0)
        : ((refreshed?.shippedQty || 0) + totalShipQty);
      const newStatus = totalShipped >= totalPlanned ? "已出库" : "部分出库";
      await tx.outboundOrder.update({
        where: { id },
        data: { shippedQty: totalShipped, status: newStatus },
      });

      return { batch, newStatus };
    });

    return NextResponse.json({
      id: result.batch.id,
      batchNumber: result.batch.batchNumber,
      status: result.newStatus,
    });
  } catch (error: any) {
    console.error("出库失败:", error);
    return NextResponse.json(
      { error: error.message || "出库失败" },
      { status: 500 }
    );
  }
}
