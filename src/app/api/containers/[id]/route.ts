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
            outboundBatchItems: true,
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
      destinationCountry: container.destinationCountry ?? undefined,
      etd: container.etd?.toISOString() ?? undefined,
      eta: container.eta?.toISOString() ?? undefined,
      actualDeparture: container.actualDeparture?.toISOString() ?? undefined,
      actualArrival: container.actualArrival?.toISOString() ?? undefined,
      status: container.status,
      // 出口模式
      exportMode: container.exportMode ?? undefined,
      serviceMode: container.serviceMode ?? undefined,
      // 主体
      exporterId: container.exporterId ?? undefined,
      exporterName: container.exporterName ?? undefined,
      overseasCompanyId: container.overseasCompanyId ?? undefined,
      overseasCompanyName: container.overseasCompanyName ?? undefined,
      // 申报
      declaredValue: container.declaredValue ? container.declaredValue.toString() : undefined,
      declaredCurrency: container.declaredCurrency ?? undefined,
      // 关税
      dutyAmount: container.dutyAmount ? container.dutyAmount.toString() : undefined,
      dutyPayer: container.dutyPayer ?? undefined,
      dutyCurrency: container.dutyCurrency ?? undefined,
      dutyPaidAmount: container.dutyPaidAmount ? container.dutyPaidAmount.toString() : undefined,
      // 回款
      returnAmount: container.returnAmount ? container.returnAmount.toString() : undefined,
      returnDate: container.returnDate?.toISOString() ?? undefined,
      returnCurrency: container.returnCurrency ?? undefined,
      // 仓库
      warehouseId: container.warehouseId ?? undefined,
      warehouseName: container.warehouseName ?? undefined,
      // 销售
      platform: container.platform ?? undefined,
      storeId: container.storeId ?? undefined,
      storeName: container.storeName ?? undefined,
      // 汇总
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
        // 批次级运输/追踪（出库后维护，便于在「柜子详情」看本柜在途情况）
        shippingMethod: b.shippingMethod ?? undefined,
        trackingNumber: b.trackingNumber ?? undefined,
        vesselName: b.vesselName ?? undefined,
        vesselVoyage: b.vesselVoyage ?? undefined,
        portOfLoading: b.portOfLoading ?? undefined,
        portOfDischarge: b.portOfDischarge ?? undefined,
        eta: b.eta?.toISOString() ?? undefined,
        actualDepartureDate: b.actualDepartureDate?.toISOString() ?? undefined,
        actualArrivalDate: b.actualArrivalDate?.toISOString() ?? undefined,
        destinationCountry: b.destinationCountry ?? undefined,
        destinationPlatform: b.destinationPlatform ?? undefined,
        destinationStoreName: b.destinationStoreName ?? undefined,
        ownerName: b.ownerName ?? undefined,
        currentLocation: b.currentLocation ?? undefined,
        lastEvent: b.lastEvent ?? undefined,
        lastEventTime: b.lastEventTime?.toISOString() ?? undefined,
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
        skuLines: b.outboundBatchItems.map((line) => ({
          id: line.id,
          variantId: line.variantId ?? undefined,
          sku: line.sku,
          skuName: line.skuName ?? undefined,
          spec: line.spec ?? undefined,
          qty: line.qty,
        })),
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
    if (body.destinationCountry !== undefined) data.destinationCountry = body.destinationCountry || null;
    if (body.etd !== undefined) data.etd = body.etd ? new Date(body.etd) : null;
    if (body.eta !== undefined) data.eta = body.eta ? new Date(body.eta) : null;
    if (body.actualDeparture !== undefined)
      data.actualDeparture = body.actualDeparture ? new Date(body.actualDeparture) : null;
    if (body.actualArrival !== undefined)
      data.actualArrival = body.actualArrival ? new Date(body.actualArrival) : null;
    if (body.status) data.status = body.status;
    // 出口模式
    if (body.exportMode !== undefined) data.exportMode = body.exportMode || null;
    if (body.serviceMode !== undefined) data.serviceMode = body.serviceMode || null;
    // 主体
    if (body.exporterId !== undefined) data.exporterId = body.exporterId || null;
    if (body.exporterName !== undefined) data.exporterName = body.exporterName || null;
    if (body.overseasCompanyId !== undefined) data.overseasCompanyId = body.overseasCompanyId || null;
    if (body.overseasCompanyName !== undefined) data.overseasCompanyName = body.overseasCompanyName || null;
    // 申报
    if (body.declaredValue !== undefined)
      data.declaredValue = body.declaredValue != null ? Number(body.declaredValue) : null;
    if (body.declaredCurrency !== undefined) data.declaredCurrency = body.declaredCurrency || null;
    // 关税
    if (body.dutyAmount !== undefined)
      data.dutyAmount = body.dutyAmount != null ? Number(body.dutyAmount) : null;
    if (body.dutyPayer !== undefined) data.dutyPayer = body.dutyPayer || null;
    if (body.dutyCurrency !== undefined) data.dutyCurrency = body.dutyCurrency || null;
    if (body.dutyPaidAmount !== undefined)
      data.dutyPaidAmount = body.dutyPaidAmount != null ? Number(body.dutyPaidAmount) : null;
    // 回款
    if (body.returnAmount !== undefined)
      data.returnAmount = body.returnAmount != null ? Number(body.returnAmount) : null;
    if (body.returnDate !== undefined)
      data.returnDate = body.returnDate ? new Date(body.returnDate) : null;
    if (body.returnCurrency !== undefined) data.returnCurrency = body.returnCurrency || null;
    // 仓库
    if (body.warehouseId !== undefined) data.warehouseId = body.warehouseId || null;
    if (body.warehouseName !== undefined) data.warehouseName = body.warehouseName || null;
    // 销售
    if (body.platform !== undefined) data.platform = body.platform || null;
    if (body.storeId !== undefined) data.storeId = body.storeId || null;
    if (body.storeName !== undefined) data.storeName = body.storeName || null;
    // 汇总
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

