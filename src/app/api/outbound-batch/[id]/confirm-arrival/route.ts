import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  InventoryLogType,
  InventoryLogStatus,
  StockLogReason,
  InventoryMovementType,
} from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/outbound-batch/[id]/confirm-arrival
 * 确认出库批次到达目的地（海外仓），增加海外仓库存并更新状态
 * Body: { toWarehouseId: string } 必填，目的地/海外仓 ID（需先在系统中创建类型为 OVERSEAS 的仓库）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: batchId } = await params;
    const body = await request.json().catch(() => ({}));
    const toWarehouseId = body.toWarehouseId as string | undefined;

    if (!toWarehouseId || typeof toWarehouseId !== "string") {
      return NextResponse.json(
        { error: "请提供 toWarehouseId（目的地/海外仓 ID）" },
        { status: 400 }
      );
    }

    // 1. 找到对应的出库批次，并带上出库单（取 variantId）
    const batch = await prisma.outboundBatch.findUnique({
      where: { id: batchId },
      include: {
        outboundOrder: { select: { id: true, variantId: true, outboundNumber: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: "出库批次不存在" }, { status: 404 });
    }

    // 2. 验证：已确认过则不再重复处理
    if (batch.arrivalConfirmedAt) {
      return NextResponse.json(
        { error: "该批次已确认到达，请勿重复操作" },
        { status: 400 }
      );
    }

    // 状态必须允许确认到达（非已取消即可，手动确认）
    if (batch.status === "已取消") {
      return NextResponse.json(
        { error: "已取消的批次无法确认到达" },
        { status: 400 }
      );
    }

    const variantId = batch.outboundOrder?.variantId;
    if (!variantId) {
      return NextResponse.json(
        { error: "出库批次关联的出库单无 SKU 信息" },
        { status: 400 }
      );
    }

    const fromWarehouseId = batch.warehouseId;
    const qty = batch.qty;

    // 目的地仓库必须存在且建议为海外仓
    const toWarehouse = await prisma.warehouse.findUnique({
      where: { id: toWarehouseId },
    });
    if (!toWarehouse) {
      return NextResponse.json(
        { error: "目的地仓库不存在，请先创建海外仓或传入有效的 toWarehouseId" },
        { status: 404 }
      );
    }

    if (fromWarehouseId === toWarehouseId) {
      return NextResponse.json(
        { error: "目的地仓库不能与出库仓库相同" },
        { status: 400 }
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // 4. 查找或创建海外仓的 Stock 记录
      let stock = await tx.stock.findUnique({
        where: {
          variantId_warehouseId: { variantId, warehouseId: toWarehouseId },
        },
      });

      let qtyBefore: number;
      let qtyAfter: number;
      if (stock) {
        qtyBefore = stock.qty;
        qtyAfter = qtyBefore + qty;
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            qty: qtyAfter,
            availableQty: stock.availableQty + qty,
            updatedAt: now,
          },
        });
      } else {
        qtyBefore = 0;
        qtyAfter = qty;
        await tx.stock.create({
          data: {
            variantId,
            warehouseId: toWarehouseId,
            qty: qty,
            reservedQty: 0,
            availableQty: qty,
          },
        });
      }

      // 6. 更新 OutboundBatch：arrivalConfirmedAt、status = "已到达"
      await tx.outboundBatch.update({
        where: { id: batchId },
        data: {
          arrivalConfirmedAt: now,
          status: "已到达",
          actualArrivalDate: batch.actualArrivalDate ?? now,
        },
      });

      // 7. 创建 InventoryLog：type TRANSFER, status ARRIVED
      await tx.inventoryLog.create({
        data: {
          type: InventoryLogType.TRANSFER,
          status: InventoryLogStatus.ARRIVED,
          variantId,
          qty,
          fromWarehouseId,
          toWarehouseId,
          relatedOrderNo: batch.batchNumber,
          notes: `出库批次 ${batch.batchNumber} 确认到达，调拨至 ${toWarehouse.name}`,
        },
      });

      // 8. 创建 StockLog，调拨入库原因（记录在目的仓）
      await tx.stockLog.create({
        data: {
          variantId,
          warehouseId: toWarehouseId,
          reason: StockLogReason.TRANSFER_INBOUND,
          movementType: InventoryMovementType.TRANSFER,
          qty,
          qtyBefore,
          qtyAfter,
          operationDate: now,
          relatedOrderId: batchId,
          relatedOrderType: "OutboundBatch",
          relatedOrderNumber: batch.batchNumber,
          notes: `出库批次 ${batch.batchNumber} 确认到达，调入数量 ${qty}`,
        },
      });
    });

    const updated = await prisma.outboundBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        status: true,
        arrivalConfirmedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      batch: {
        id: updated?.id,
        status: updated?.status,
        arrivalConfirmedAt: updated?.arrivalConfirmedAt?.toISOString(),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "确认到达失败",
      },
      { status: 500 }
    );
  }
}
