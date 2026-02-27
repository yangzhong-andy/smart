import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { InventoryLogType, InventoryLogStatus, StockLogReason, InventoryMovementType } from "@prisma/client";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const OUTBOUND_ORDERS_CACHE_PREFIX = "outbound-orders";

function generateOutboundNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OB-${date}-${r}`;
}

/**
 * POST /api/outbound-batch/from-inbound
 * 从入库批次生成出库单+出库批次，并自动扣减库存
 * Body: inboundBatchId, warehouseId?（默认国内仓）, destination, qty
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inboundBatchId = body.inboundBatchId;
    let warehouseId = body.warehouseId;
    const destination = body.destination ?? "";
    const qty = body.qty != null ? Number(body.qty) : NaN;

    if (!inboundBatchId || !Number.isFinite(qty) || qty < 0) {
      return NextResponse.json(
        { error: "请提供 inboundBatchId 和有效的出库数量 qty（≥0）" },
        { status: 400 }
      );
    }

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

    if (qty > batch.qty) {
      return NextResponse.json(
        { error: `出库数量不能超过入库数量（当前批次入库 ${batch.qty}）` },
        { status: 400 }
      );
    }
    if (qty === 0) {
      return NextResponse.json({ error: "出库数量需大于 0" }, { status: 400 });
    }

    let variantId: string | null = batch.pendingInbound?.variantId ?? null;
    const sku = batch.pendingInbound?.sku ?? "";
    if (!variantId && sku) {
      const bySku = await prisma.productVariant.findFirst({
        where: { skuId: sku },
        select: { id: true },
      });
      if (bySku) variantId = bySku.id;
    }
    if (!variantId) {
      return NextResponse.json(
        { error: "无法解析该批次的 SKU（variantId），请先维护产品档案" },
        { status: 400 }
      );
    }

    // 默认出库仓库：未传时取第一个国内仓
    let warehouse = batch.warehouse;
    if (!warehouseId) {
      const domestic = await prisma.warehouse.findFirst({
        where: { type: "DOMESTIC", isActive: true },
        orderBy: { id: "asc" },
      });
      if (!domestic) {
        return NextResponse.json(
          { error: "未找到国内仓，请传入 warehouseId 或先创建国内仓库" },
          { status: 400 }
        );
      }
      warehouseId = domestic.id;
      warehouse = domestic;
    } else {
      const w = await prisma.warehouse.findUnique({
        where: { id: warehouseId },
      });
      if (!w) {
        return NextResponse.json({ error: "出库仓库不存在" }, { status: 404 });
      }
      warehouse = w;
    }

    const warehouseName = warehouse.name;
    const now = new Date();
    const shippedDate = now;
    let outboundNumber = generateOutboundNumber();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.outboundOrder.findUnique({
        where: { outboundNumber },
        select: { id: true },
      });
      if (!clash) break;
      outboundNumber = generateOutboundNumber();
    }

    const batchNumber = `OB-${batch.batchNumber}-${Date.now().toString(36).slice(-4)}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. 扣减库存
      const stock = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } },
      });

      if (!stock) {
        throw new Error("该仓库下无此 SKU 库存记录，无法出库");
      }
      if (stock.qty < qty) {
        throw new Error(`库存不足：当前 ${stock.qty}，出库需求 ${qty}`);
      }
      if (stock.availableQty < qty) {
        throw new Error(`可用库存不足：当前可用 ${stock.availableQty}，出库需求 ${qty}`);
      }

      const qtyBefore = stock.qty;
      const qtyAfter = qtyBefore - qty;

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: qtyAfter,
          availableQty: stock.availableQty - qty,
          updatedAt: now,
        },
      });

      // 2. 创建出库单
      const order = await tx.outboundOrder.create({
        data: {
          outboundNumber,
          variantId,
          sku,
          qty,
          shippedQty: 0,
          warehouseId,
          warehouseName,
          destination: destination || null,
          status: "待出库",
          reason: "从入库批次生成",
        },
      });

      // 3. 创建出库批次
      const outboundBatch = await tx.outboundBatch.create({
        data: {
          outboundOrderId: order.id,
          batchNumber,
          warehouseId,
          warehouseName,
          qty,
          shippedDate,
          destination: destination || null,
          status: "待发货",
        },
      });

      // 4. InventoryLog OUT
      await tx.inventoryLog.create({
        data: {
          type: InventoryLogType.OUT,
          status: InventoryLogStatus.IN_TRANSIT,
          variantId,
          qty,
          warehouseId,
          relatedOrderNo: `${outboundNumber} / ${batchNumber}`,
          notes: `从入库批次 ${batch.batchNumber} 生成出库，目的地 ${destination || "-"}`,
        },
      });

      // 5. StockLog
      await tx.stockLog.create({
        data: {
          variantId,
          warehouseId,
          reason: StockLogReason.SALE_OUTBOUND,
          movementType: InventoryMovementType.DOMESTIC_OUTBOUND,
          qty: -qty,
          qtyBefore,
          qtyAfter,
          operationDate: now,
          relatedOrderId: outboundBatch.id,
          relatedOrderType: "OutboundBatch",
          relatedOrderNumber: batchNumber,
          notes: `从入库批次 ${batch.batchNumber} 生成出库，数量 ${qty}`,
        },
      });

      return { order, outboundBatch };
    });

    await clearCacheByPrefix(OUTBOUND_ORDERS_CACHE_PREFIX);

    return NextResponse.json({
      success: true,
      outboundOrder: {
        id: result.order.id,
        outboundNumber: result.order.outboundNumber,
      },
      outboundBatch: {
        id: result.outboundBatch.id,
        batchNumber: result.outboundBatch.batchNumber,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "创建失败";
    const isBusiness =
      msg.includes("库存不足") ||
      msg.includes("无此 SKU 库存") ||
      msg.includes("可用库存不足") ||
      msg.includes("入库批次不存在") ||
      msg.includes("出库数量不能超过") ||
      msg.includes("未找到国内仓");
    return NextResponse.json(
      { error: msg },
      { status: isBusiness ? 400 : 500 }
    );
  }
}
