import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ShippingMethod } from "@prisma/client";

export const dynamic = "force-dynamic";

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
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20") || 20, 100);

    const where: Record<string, unknown> = {};
    if (outboundOrderId) where.outboundOrderId = outboundOrderId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;

    const [batches, total] = await prisma.$transaction([
      prisma.outboundBatch.findMany({
        where,
        include: {
          outboundOrder: true,
          warehouse: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.outboundBatch.count({ where }),
    ]);

    const data = batches.map((b) => ({
      id: b.id,
      outboundOrderId: b.outboundOrderId,
      batchNumber: b.batchNumber,
      warehouseId: b.warehouseId,
      warehouseName: b.warehouseName,
      qty: b.qty,
      shippedDate: b.shippedDate.toISOString(),
      destination: b.destination ?? undefined,
      trackingNumber: b.trackingNumber ?? undefined,
      shippingMethod: b.shippingMethod ?? undefined,
      vesselName: b.vesselName ?? undefined,
      vesselVoyage: b.vesselVoyage ?? undefined,
      portOfLoading: b.portOfLoading ?? undefined,
      portOfDischarge: b.portOfDischarge ?? undefined,
      eta: b.eta?.toISOString() ?? undefined,
      actualDepartureDate: b.actualDepartureDate?.toISOString() ?? undefined,
      actualArrivalDate: b.actualArrivalDate?.toISOString() ?? undefined,
      status: b.status,
      notes: b.notes ?? undefined,
      createdAt: b.createdAt.toISOString(),
      outboundOrder: b.outboundOrder
        ? {
            id: b.outboundOrder.id,
            outboundNumber: b.outboundOrder.outboundNumber,
            sku: b.outboundOrder.sku,
            qty: b.outboundOrder.qty,
            shippedQty: b.outboundOrder.shippedQty,
            status: b.outboundOrder.status,
          }
        : undefined,
      warehouse: b.warehouse
        ? {
            id: b.warehouse.id,
            name: b.warehouse.name,
            code: b.warehouse.code ?? undefined,
            address: b.warehouse.address ?? undefined,
          }
        : undefined,
    }));

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
    console.error("GET outbound-batch error:", error);
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

    const batch = await prisma.outboundBatch.create({
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
        notes: body.notes ?? null,
      },
      include: {
        outboundOrder: true,
        warehouse: true,
      },
    });

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
    console.error("POST outbound-batch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 500 }
    );
  }
}
