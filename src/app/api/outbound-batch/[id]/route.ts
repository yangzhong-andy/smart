import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { ShippingMethod } from "@prisma/client";
import { buildOutboundBatchSkuPayload } from "@/lib/outbound-batch-serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/outbound-batch/[id] - 获取单条出库批次（含出库单、仓库）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const includeFull = {
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

    const includeLegacy = {
      outboundOrder: {
        include: {
          items: { include: { variant: true } },
          variant: true,
        },
      },
      warehouse: true,
      container: true,
    } as const;

    let batch: Awaited<ReturnType<typeof prisma.outboundBatch.findUnique>> | null = null;

    try {
      batch = await prisma.outboundBatch.findUnique({
        where: { id },
        include: includeFull as any,
      });
    } catch (e) {
      console.error(
        "[outbound-batch/id] 含 OutboundBatchItem 的查询失败（是否未 migrate？），已回退：",
        e
      );
      batch = await prisma.outboundBatch.findUnique({
        where: { id },
        include: includeLegacy as any,
      });
      if (batch) {
        batch = { ...batch, outboundBatchItems: [] } as any;
      }
    }

    if (!batch) {
      return NextResponse.json({ error: "出库批次不存在" }, { status: 404 });
    }

    const batchForSku = {
      ...batch,
      outboundBatchItems:
        (batch as { outboundBatchItems?: unknown }).outboundBatchItems ?? [],
    };

    const skuPayload = buildOutboundBatchSkuPayload(batchForSku as any);

    return NextResponse.json({
      id: batch.id,
      outboundOrderId: batch.outboundOrderId,
      batchNumber: batch.batchNumber,
      warehouseId: batch.warehouseId,
      warehouseName: batch.warehouseName,
      qty: batch.qty,
      shippedDate: batch.shippedDate.toISOString(),
      destination: batch.destination ?? undefined,
      trackingNumber: batch.trackingNumber ?? undefined,
      shippingMethod: batch.shippingMethod ?? undefined,
      vesselName: batch.vesselName ?? undefined,
      vesselVoyage: batch.vesselVoyage ?? undefined,
      portOfLoading: batch.portOfLoading ?? undefined,
      portOfDischarge: batch.portOfDischarge ?? undefined,
      eta: batch.eta?.toISOString() ?? undefined,
      actualDepartureDate: batch.actualDepartureDate?.toISOString() ?? undefined,
      actualArrivalDate: batch.actualArrivalDate?.toISOString() ?? undefined,
      status: batch.status,
      destinationCountry: batch.destinationCountry ?? undefined,
      destinationPlatform: batch.destinationPlatform ?? undefined,
      destinationStoreId: batch.destinationStoreId ?? undefined,
      destinationStoreName: batch.destinationStoreName ?? undefined,
      ownerType: batch.ownerType ?? undefined,
      ownerId: batch.ownerId ?? undefined,
      ownerName: batch.ownerName ?? undefined,
      sourceBatchNumber: batch.sourceBatchNumber ?? undefined,
      currentLocation: batch.currentLocation ?? undefined,
      lastEvent: batch.lastEvent ?? undefined,
      lastEventTime: batch.lastEventTime?.toISOString() ?? undefined,
      notes: batch.notes ?? undefined,
      createdAt: batch.createdAt.toISOString(),
      containerId: batch.containerId ?? undefined,
      container: batch.container
        ? {
            id: batch.container.id,
            containerNo: batch.container.containerNo,
            status: batch.container.status,
          }
        : undefined,
      skuLines: skuPayload.skuLines,
      skuLinesEstimated: skuPayload.skuLinesEstimated,
      skuLinesNote: skuPayload.skuLinesNote,
      totalVolumeCBM: skuPayload.totalVolumeCBM,
      totalWeightKG: skuPayload.totalWeightKG,
      outboundOrder: batch.outboundOrder
        ? {
            id: batch.outboundOrder.id,
            outboundNumber: batch.outboundOrder.outboundNumber,
            sku: batch.outboundOrder.sku,
            qty: batch.outboundOrder.qty,
            shippedQty: batch.outboundOrder.shippedQty,
            status: batch.outboundOrder.status,
          }
        : undefined,
      warehouse: batch.warehouse
        ? {
            id: batch.warehouse.id,
            name: batch.warehouse.name,
            code: batch.warehouse.code ?? undefined,
            address: batch.warehouse.address ?? undefined,
          }
        : undefined,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取失败" },
      { status: 500 }
    );
  }
}

// 允许的物流状态（手动更新：已发货 → 运输中 → 已清关 → 已到达）
const LOGISTICS_STATUS_LIST = ["待发货", "已发货", "运输中", "已清关", "已到达"];

/**
 * PATCH /api/outbound-batch/[id] - 更新出库批次（含物流信息、物流追踪状态）
 * Body: destination, trackingNumber, shippingMethod, vesselName, vesselVoyage,
 *       portOfLoading, portOfDischarge, eta, actualDepartureDate, actualArrivalDate,
 *       status, currentLocation, lastEvent, lastEventTime, notes
 * 当更新 status 时，会同步更新 lastEvent / lastEventTime（除非显式传了 lastEvent/lastEventTime）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.destination !== undefined) updateData.destination = body.destination ?? null;
    if (body.destinationCountry !== undefined) updateData.destinationCountry = body.destinationCountry ?? null;
    if (body.destinationPlatform !== undefined) updateData.destinationPlatform = body.destinationPlatform ?? null;
    if (body.destinationStoreId !== undefined) updateData.destinationStoreId = body.destinationStoreId ?? null;
    if (body.destinationStoreName !== undefined) updateData.destinationStoreName = body.destinationStoreName ?? null;
    if (body.ownerType !== undefined) updateData.ownerType = body.ownerType ?? null;
    if (body.ownerId !== undefined) updateData.ownerId = body.ownerId ?? null;
    if (body.ownerName !== undefined) updateData.ownerName = body.ownerName ?? null;
    if (body.sourceBatchNumber !== undefined) updateData.sourceBatchNumber = body.sourceBatchNumber ?? null;
    if (body.trackingNumber !== undefined) updateData.trackingNumber = body.trackingNumber ?? null;
    if (body.notes !== undefined) updateData.notes = body.notes ?? null;

    // 物流信息
    if (body.shippingMethod !== undefined) {
      const v = String(body.shippingMethod).toUpperCase();
      updateData.shippingMethod =
        v === "SEA" || v === "AIR" || v === "EXPRESS" ? (v as ShippingMethod) : null;
    }
    if (body.vesselName !== undefined) updateData.vesselName = body.vesselName ?? null;
    if (body.vesselVoyage !== undefined) updateData.vesselVoyage = body.vesselVoyage ?? null;
    if (body.portOfLoading !== undefined) updateData.portOfLoading = body.portOfLoading ?? null;
    if (body.portOfDischarge !== undefined) updateData.portOfDischarge = body.portOfDischarge ?? null;
    if (body.eta !== undefined) updateData.eta = body.eta ? new Date(body.eta) : null;
    if (body.actualDepartureDate !== undefined)
      updateData.actualDepartureDate = body.actualDepartureDate ? new Date(body.actualDepartureDate) : null;
    if (body.actualArrivalDate !== undefined)
      updateData.actualArrivalDate = body.actualArrivalDate ? new Date(body.actualArrivalDate) : null;

    // 物流状态（可手动更新：待发货→已发货→运输中→已清关→已到达）
    if (body.status !== undefined) {
      const s = String(body.status).trim();
      updateData.status = LOGISTICS_STATUS_LIST.includes(s) ? s : "待发货";
      // 同步更新物流追踪：将 lastEvent 设为当前状态，lastEventTime 设为当前时间（仅当未显式传 lastEvent 时）
      if (body.lastEvent === undefined) updateData.lastEvent = updateData.status;
      if (body.lastEventTime === undefined) updateData.lastEventTime = new Date();
    }

    // 物流追踪字段（可单独维护）
    if (body.currentLocation !== undefined) updateData.currentLocation = body.currentLocation ?? null;
    if (body.lastEvent !== undefined) updateData.lastEvent = body.lastEvent ?? null;
    if (body.lastEventTime !== undefined) updateData.lastEventTime = body.lastEventTime ? new Date(body.lastEventTime) : null;

    const batch = await prisma.outboundBatch.update({
      where: { id },
      data: updateData,
      include: {
        outboundOrder: true,
        warehouse: true,
      },
    });

    return NextResponse.json({
      id: batch.id,
      outboundOrderId: batch.outboundOrderId,
      batchNumber: batch.batchNumber,
      warehouseId: batch.warehouseId,
      warehouseName: batch.warehouseName,
      qty: batch.qty,
      shippedDate: batch.shippedDate.toISOString(),
      destination: batch.destination ?? undefined,
      trackingNumber: batch.trackingNumber ?? undefined,
      shippingMethod: batch.shippingMethod ?? undefined,
      vesselName: batch.vesselName ?? undefined,
      vesselVoyage: batch.vesselVoyage ?? undefined,
      portOfLoading: batch.portOfLoading ?? undefined,
      portOfDischarge: batch.portOfDischarge ?? undefined,
      eta: batch.eta?.toISOString() ?? undefined,
      actualDepartureDate: batch.actualDepartureDate?.toISOString() ?? undefined,
      actualArrivalDate: batch.actualArrivalDate?.toISOString() ?? undefined,
      status: batch.status,
      destinationCountry: batch.destinationCountry ?? undefined,
      destinationPlatform: batch.destinationPlatform ?? undefined,
      destinationStoreId: batch.destinationStoreId ?? undefined,
      destinationStoreName: batch.destinationStoreName ?? undefined,
      ownerType: batch.ownerType ?? undefined,
      ownerId: batch.ownerId ?? undefined,
      ownerName: batch.ownerName ?? undefined,
      sourceBatchNumber: batch.sourceBatchNumber ?? undefined,
      currentLocation: batch.currentLocation ?? undefined,
      lastEvent: batch.lastEvent ?? undefined,
      lastEventTime: batch.lastEventTime?.toISOString() ?? undefined,
      notes: batch.notes ?? undefined,
      createdAt: batch.createdAt.toISOString(),
      outboundOrder: batch.outboundOrder
        ? {
            id: batch.outboundOrder.id,
            outboundNumber: batch.outboundOrder.outboundNumber,
            sku: batch.outboundOrder.sku,
          }
        : undefined,
      warehouse: batch.warehouse
        ? { id: batch.warehouse.id, name: batch.warehouse.name }
        : undefined,
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "出库批次不存在" }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/outbound-batch/[id] - 删除出库批次（需 ADMIN 或 MANAGER）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const userRole = session.user?.role;
    if (userRole !== "ADMIN" && userRole !== "MANAGER") {
      return NextResponse.json({ error: "没有权限" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.outboundBatch.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "出库批次不存在" }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    );
  }
}
