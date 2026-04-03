import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProductVariantInventory } from "@/lib/inventory-sync";
import { buildOutboundBatchSkuPayload } from "@/lib/outbound-batch-serialize";
import { ShippingMethod, InventoryLogType, InventoryLogStatus, StockLogReason, InventoryMovementType } from "@prisma/client";

export const dynamic = "force-dynamic";

const INCLUDE_OUTBOUND_BATCH_FULL = {
  outboundBatchItems: { include: { variant: true } },
  outboundOrder: {
    include: {
      items: { include: { variant: true } },
      variant: true,
    },
  },
  warehouse: true,
  container: true,
} as const;

const INCLUDE_OUTBOUND_BATCH_LEGACY = {
  outboundOrder: {
    include: {
      items: { include: { variant: true } },
      variant: true,
    },
  },
  warehouse: true,
  container: true,
} as const;

/** 未跑迁移时 OutboundBatchItem 表不存在，回退查询避免列表空白 */
async function findManyOutboundBatchSafe(
  args: {
    where: Record<string, unknown>;
    skip: number;
    take: number;
  }
) {
  const { where, skip, take } = args;
  try {
    return await prisma.outboundBatch.findMany({
      where,
      include: INCLUDE_OUTBOUND_BATCH_FULL as any,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  } catch (e) {
    console.error(
      "[outbound-batch] 含批次明细的查询失败（是否未执行 prisma migrate？），已回退：",
      e
    );
    const rows = await prisma.outboundBatch.findMany({
      where,
      include: INCLUDE_OUTBOUND_BATCH_LEGACY as any,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
    return rows.map((b) => ({
      ...b,
      outboundBatchItems: [] as any[],
    }));
  }
}

/**
 * GET /api/outbound-batch - 获取出库批次列表（包含关联的出库单、仓库信息）
 * Query: page, pageSize, outboundOrderId, warehouseId, status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const outboundOrderId = searchParams.get("outboundOrderId");
    const warehouseId = searchParams.get("warehouseId");
    const status = searchParams.get("status");
    const destinationCountry = searchParams.get("destinationCountry");
    const destinationPlatform = searchParams.get("destinationPlatform");
    const destinationStoreId = searchParams.get("destinationStoreId");
    const ownerId = searchParams.get("ownerId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20") || 20, 30);

    const where: Record<string, unknown> = {};
    if (outboundOrderId) where.outboundOrderId = outboundOrderId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;
    if (destinationCountry) where.destinationCountry = destinationCountry;
    if (destinationPlatform) where.destinationPlatform = destinationPlatform;
    if (destinationStoreId) where.destinationStoreId = destinationStoreId;
    if (ownerId) where.ownerId = ownerId;

    const [batches, total] = await Promise.all([
      findManyOutboundBatchSafe({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.outboundBatch.count({ where }),
    ]);

    // findMany 推断类型常不含 include 的关联字段，用 any 与运行时一致（与 GET [id] 相同原因）
    const data = batches.map((b) => {
      const row = b as any;
      const skuPayload = buildOutboundBatchSkuPayload(row);
      return {
        id: row.id,
        outboundOrderId: row.outboundOrderId,
        batchNumber: row.batchNumber,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        qty: row.qty,
        shippedDate: row.shippedDate.toISOString(),
        destination: row.destination ?? undefined,
        trackingNumber: row.trackingNumber ?? undefined,
        shippingMethod: row.shippingMethod ?? undefined,
        vesselName: row.vesselName ?? undefined,
        vesselVoyage: row.vesselVoyage ?? undefined,
        portOfLoading: row.portOfLoading ?? undefined,
        portOfDischarge: row.portOfDischarge ?? undefined,
        eta: row.eta?.toISOString() ?? undefined,
        actualDepartureDate: row.actualDepartureDate?.toISOString() ?? undefined,
        actualArrivalDate: row.actualArrivalDate?.toISOString() ?? undefined,
        arrivalConfirmedAt: row.arrivalConfirmedAt?.toISOString() ?? undefined,
        status: row.status,
        destinationCountry: row.destinationCountry ?? undefined,
        destinationPlatform: row.destinationPlatform ?? undefined,
        destinationStoreId: row.destinationStoreId ?? undefined,
        destinationStoreName: row.destinationStoreName ?? undefined,
        ownerType: row.ownerType ?? undefined,
        ownerId: row.ownerId ?? undefined,
        ownerName: row.ownerName ?? undefined,
        sourceBatchNumber: row.sourceBatchNumber ?? undefined,
        currentLocation: row.currentLocation ?? undefined,
        lastEvent: row.lastEvent ?? undefined,
        lastEventTime: row.lastEventTime?.toISOString() ?? undefined,
        notes: row.notes ?? undefined,
        createdAt: row.createdAt.toISOString(),
        containerId: row.containerId ?? undefined,
        container: row.container
          ? {
              id: row.container.id,
              containerNo: row.container.containerNo,
              status: row.container.status,
              destinationCountry: row.container.destinationCountry ?? undefined,
            }
          : undefined,
        skuLines: skuPayload.skuLines,
        skuLinesEstimated: skuPayload.skuLinesEstimated,
        skuLinesNote: skuPayload.skuLinesNote,
        totalVolumeCBM: skuPayload.totalVolumeCBM,
        totalWeightKG: skuPayload.totalWeightKG,
        outboundOrder: row.outboundOrder
          ? {
              id: row.outboundOrder.id,
              outboundNumber: row.outboundOrder.outboundNumber,
              sku: row.outboundOrder.sku,
              qty: row.outboundOrder.qty,
              shippedQty: row.outboundOrder.shippedQty,
              status: row.outboundOrder.status,
            }
          : undefined,
        warehouse: row.warehouse
          ? {
              id: row.warehouse.id,
              name: row.warehouse.name,
              code: row.warehouse.code ?? undefined,
              address: row.warehouse.address ?? undefined,
            }
          : undefined,
      };
    });

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/outbound-batch - 创建出库批次
 * Body: outboundOrderId, batchNumber, warehouseId, warehouseName, qty, shippedDate,
 *       destination?, trackingNumber?, shippingMethod?, vesselName?, vesselVoyage?,
 *       portOfLoading?, portOfDischarge?, eta?, actualDepartureDate?, actualArrivalDate?, status?, notes?
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const outboundOrderId = body.outboundOrderId ?? body.outboundId;
    const batchNumber = body.batchNumber;
    const warehouseId = body.warehouseId;
    const warehouseName = body.warehouseName;
    const qty = body.qty != null ? Number(body.qty) : undefined;
    const shippedDate = body.shippedDate ? new Date(body.shippedDate) : undefined;

    if (!outboundOrderId || !batchNumber || !warehouseId || !warehouseName || qty == null || qty < 0 || !shippedDate) {
      return NextResponse.json(
        { error: "请提供 outboundOrderId、batchNumber、warehouseId、warehouseName、qty（≥0）、shippedDate" },
        { status: 400 }
      );
    }

    const shippingMethod =
      body.shippingMethod != null && ["SEA", "AIR", "EXPRESS"].includes(String(body.shippingMethod).toUpperCase())
        ? (String(body.shippingMethod).toUpperCase() as ShippingMethod)
        : undefined;

    // 获取出库单以得到 variantId（SKU）
    const outboundOrder = await prisma.outboundOrder.findUnique({
      where: { id: outboundOrderId },
      select: { id: true, variantId: true, outboundNumber: true, sku: true },
    });
    if (!outboundOrder) {
      return NextResponse.json({ error: "出库单不存在" }, { status: 404 });
    }
    const variantId = outboundOrder.variantId;

    const now = new Date();
    const destinationCountry = body.destinationCountry ?? null;
    const destinationPlatform = body.destinationPlatform ?? null;
    const destinationStoreId = body.destinationStoreId ?? null;
    const destinationStoreName = body.destinationStoreName ?? null;
    const ownerType = body.ownerType ?? null;
    const ownerId = body.ownerId ?? null;
    const ownerName = body.ownerName ?? null;
    const sourceBatchNumber = body.sourceBatchNumber ?? null;

      const batch = await prisma.$transaction(async (tx) => {
      // 1. 获取当前仓库该 SKU 的库存
      if (!variantId) {
        throw new Error("SKU 不能为空");
      }
      const stock = await tx.stock.findUnique({
        where: {
          variantId_warehouseId: { variantId, warehouseId },
        },
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

      // 2. 扣减 Stock
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: qtyAfter,
          availableQty: stock.availableQty - qty,
          updatedAt: now,
        },
      });

      // 3. 创建出库批次
      const newBatch = await tx.outboundBatch.create({
        data: {
          outboundOrderId,
          batchNumber,
          warehouseId,
          warehouseName,
          qty,
          shippedDate,
          destination: body.destination ?? null,
          trackingNumber: body.trackingNumber ?? null,
          shippingMethod: shippingMethod ?? null,
          vesselName: body.vesselName ?? null,
          vesselVoyage: body.vesselVoyage ?? null,
          portOfLoading: body.portOfLoading ?? null,
          portOfDischarge: body.portOfDischarge ?? null,
          eta: body.eta ? new Date(body.eta) : null,
          actualDepartureDate: body.actualDepartureDate ? new Date(body.actualDepartureDate) : null,
          actualArrivalDate: body.actualArrivalDate ? new Date(body.actualArrivalDate) : null,
          status: body.status ?? "待发货",
          containerId: body.containerId ?? null,
          destinationCountry,
          destinationPlatform,
          destinationStoreId,
          destinationStoreName,
          ownerType,
          ownerId,
          ownerName,
          sourceBatchNumber,
          notes: body.notes ?? null,
        },
        include: {
          outboundOrder: true,
          warehouse: true,
        },
      });

      // 4. 记录 InventoryLog（type OUT）
      await tx.inventoryLog.create({
        data: {
          type: InventoryLogType.OUT,
          status: InventoryLogStatus.IN_TRANSIT,
          variantId,
          qty,
          warehouseId,
          relatedOrderNo: `${outboundOrder.outboundNumber} / ${batchNumber}`,
          notes: `出库批次 ${batchNumber}，出库单 ${outboundOrder.outboundNumber}`,
        },
      });

      // 5. 记录 StockLog（出库流水）
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
          relatedOrderId: newBatch.id,
          relatedOrderType: "OutboundBatch",
          relatedOrderNumber: batchNumber,
          notes: `出库批次 ${batchNumber}，出库单 ${outboundOrder.outboundNumber}，数量 ${qty}`,
        },
      });

      const variantMeta = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { skuId: true, product: { select: { name: true } } },
      });

      await (tx as any).outboundBatchItem.create({
        data: {
          outboundBatchId: newBatch.id,
          outboundOrderItemId: null,
          variantId,
          sku: outboundOrder.sku || "",
          skuName: variantMeta?.product?.name ?? null,
          spec: null,
          qty,
        },
      });

      await tx.inventoryOwnershipLedger.create({
        data: {
          variantId,
          skuId: variantMeta?.skuId ?? null,
          productName: variantMeta?.product?.name ?? null,
          qty,
          bizType: "SHIP_OUT",
          bizNo: batchNumber,
          relatedOrderId: newBatch.id,
          relatedOrderType: "OutboundBatch",
          fromWarehouseId: warehouseId,
          fromWarehouseName: warehouseName,
          toWarehouseName: (body.destination as string) ?? null,
          fromOwnerType: "WAREHOUSE",
          fromOwnerId: warehouseId,
          fromOwnerName: warehouseName,
          toOwnerType: ownerType,
          toOwnerId: ownerId,
          toOwnerName: ownerName,
          country: destinationCountry,
          platform: destinationPlatform,
          storeId: destinationStoreId,
          storeName: destinationStoreName,
          sourceBatchNumber,
          outboundBatchId: newBatch.id,
          outboundBatchNumber: newBatch.batchNumber,
          eventTime: now,
        },
      });

      return newBatch;
    });

    if (variantId) {
      await syncProductVariantInventory(variantId);
    }

    return NextResponse.json({
      id: batch.id,
      batchNumber: batch.batchNumber,
      createdAt: batch.createdAt.toISOString(),
      outboundOrder: batch.outboundOrder
        ? { id: batch.outboundOrder.id, outboundNumber: batch.outboundOrder.outboundNumber }
        : undefined,
      warehouse: batch.warehouse ? { id: batch.warehouse.id, name: batch.warehouse.name } : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "创建失败";
    const isBusinessError =
      message.includes("库存不足") ||
      message.includes("无此 SKU 库存") ||
      message.includes("可用库存不足") ||
      message.includes("出库单不存在");
    return NextResponse.json(
      { error: message },
      { status: isBusinessError ? 400 : 500 }
    );
  }
}
