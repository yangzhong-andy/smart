import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, handlePrismaError, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

// GET /api/containers/[id] - 获取单个柜子详情（含出库批次）
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const container = await prisma.container.findUnique({
      where: { id },
      include: {
        outboundBatches: {
          include: {
            outboundOrder: true,
            warehouse: true,
          },
          orderBy: { shippedDate: "asc" },
        },
      },
    });

    if (!container) {
      return NextResponse.json({ error: "柜子不存在" }, { status: 404 });
    }

    return NextResponse.json({
      id: container.id,
      containerNo: container.containerNo,
      containerType: container.containerType,
      sealNo: container.sealNo ?? undefined,
      shippingMethod: container.shippingMethod,
      shipCompany: container.shipCompany ?? undefined,
      vesselName: container.vesselName ?? undefined,
      voyageNo: container.voyageNo ?? undefined,
      originPort: container.originPort ?? undefined,
      destinationPort: container.destinationPort ?? undefined,
      etd: container.etd?.toISOString() ?? undefined,
      eta: container.eta?.toISOString() ?? undefined,
      actualDeparture: container.actualDeparture?.toISOString() ?? undefined,
      actualArrival: container.actualArrival?.toISOString() ?? undefined,
      status: container.status,
      totalVolumeCBM: container.totalVolumeCBM ? container.totalVolumeCBM.toString() : undefined,
      totalWeightKG: container.totalWeightKG ? container.totalWeightKG.toString() : undefined,
      createdAt: container.createdAt.toISOString(),
      updatedAt: container.updatedAt.toISOString(),
      outboundBatches: container.outboundBatches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        qty: b.qty,
        shippedDate: b.shippedDate.toISOString(),
        status: b.status,
        warehouse: b.warehouse
          ? {
              id: b.warehouse.id,
              name: b.warehouse.name,
            }
          : undefined,
        outboundOrder: b.outboundOrder
          ? {
              id: b.outboundOrder.id,
              outboundNumber: b.outboundOrder.outboundNumber,
              sku: b.outboundOrder.sku,
            }
          : undefined,
      })),
    });
  } catch (error) {
    return serverError("获取柜子详情失败", error, { includeDetailsInDev: true });
  }
}

// PUT /api/containers/[id] - 更新柜子信息（状态、时间等）
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const data: any = {};

    if (body.containerNo != null) data.containerNo = String(body.containerNo).trim();
    if (body.containerType != null) data.containerType = String(body.containerType).trim();
    if (body.sealNo !== undefined) data.sealNo = body.sealNo || null;
    if (body.shippingMethod) data.shippingMethod = body.shippingMethod;
    if (body.shipCompany !== undefined) data.shipCompany = body.shipCompany || null;
    if (body.vesselName !== undefined) data.vesselName = body.vesselName || null;
    if (body.voyageNo !== undefined) data.voyageNo = body.voyageNo || null;
    if (body.originPort !== undefined) data.originPort = body.originPort || null;
    if (body.destinationPort !== undefined) data.destinationPort = body.destinationPort || null;
    if (body.etd !== undefined) data.etd = body.etd ? new Date(body.etd) : null;
    if (body.eta !== undefined) data.eta = body.eta ? new Date(body.eta) : null;
    if (body.actualDeparture !== undefined)
      data.actualDeparture = body.actualDeparture ? new Date(body.actualDeparture) : null;
    if (body.actualArrival !== undefined)
      data.actualArrival = body.actualArrival ? new Date(body.actualArrival) : null;
    if (body.status) data.status = body.status;
    if (body.totalVolumeCBM !== undefined)
      data.totalVolumeCBM = body.totalVolumeCBM != null ? Number(body.totalVolumeCBM) : null;
    if (body.totalWeightKG !== undefined)
      data.totalWeightKG = body.totalWeightKG != null ? Number(body.totalWeightKG) : null;

    if (Object.keys(data).length === 0) {
      return badRequest("没有可更新的字段");
    }

    const updated = await prisma.container.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      updatedAt: updated.updatedAt.toISOString(),
      status: updated.status,
    });
  } catch (error) {
    return handlePrismaError(error, {
      notFoundMessage: "柜子不存在",
      serverMessage: "更新柜子失败",
    });
  }
}

