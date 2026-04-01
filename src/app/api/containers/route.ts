import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ContainerStatus } from "@prisma/client";
import { badRequest, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

function sanitizeContainerDisplayFields(c: {
  loadingDate: Date | null;
  actualDeparture: Date | null;
}) {
  const hasInvalidActualDeparture =
    !!c.loadingDate && !!c.actualDeparture && c.actualDeparture.getTime() < c.loadingDate.getTime();

  return {
    actualDeparture: hasInvalidActualDeparture ? null : c.actualDeparture,
  };
}

/**
 * GET /api/containers
 * 查询柜子列表
 * Query:
 *  - status?: ContainerStatus
 *  - shippingMethod?: ShippingMethod
 *  - containerNo?: string (模糊)
 *  - page?: number
 *  - pageSize?: number
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const shippingMethod = searchParams.get("shippingMethod");
    const containerNo = searchParams.get("containerNo");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10) || 20, 50);

    const where: any = {};
    if (status) where.status = status;
    if (shippingMethod) where.shippingMethod = shippingMethod;
    if (containerNo) {
      where.containerNo = {
        contains: containerNo,
        mode: "insensitive",
      };
    }

    const [rows, total] = await prisma.$transaction([
      prisma.container.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          outboundBatches: {
            select: {
              id: true,
              batchNumber: true,
              qty: true,
              shippedDate: true,
              status: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.container.count({ where }),
    ]);

    const data = rows.map((c) => {
      const sanitized = sanitizeContainerDisplayFields({
        loadingDate: c.loadingDate,
        actualDeparture: c.actualDeparture,
      });
      return {
        id: c.id,
        containerNo: c.containerNo,
        containerType: c.containerType,
        sealNo: c.sealNo ?? undefined,
        shippingMethod: c.shippingMethod,
        shipCompany: c.shipCompany ?? undefined,
        vesselName: c.vesselName ?? undefined,
        voyageNo: c.voyageNo ?? undefined,
        originPort: c.originPort ?? undefined,
        destinationPort: c.destinationPort ?? undefined,
        destinationCountry: c.destinationCountry ?? undefined,
        loadingDate: c.loadingDate?.toISOString() ?? undefined,
        etd: c.etd?.toISOString() ?? undefined,
        eta: c.eta?.toISOString() ?? undefined,
        actualDeparture: sanitized.actualDeparture?.toISOString() ?? undefined,
        actualArrival: c.actualArrival?.toISOString() ?? undefined,
        status: c.status,
        // 出口模式
        exportMode: c.exportMode ?? undefined,
        serviceMode: c.serviceMode ?? undefined,
        // 主体
        exporterId: c.exporterId ?? undefined,
        exporterName: c.exporterName ?? undefined,
        overseasCompanyId: c.overseasCompanyId ?? undefined,
        overseasCompanyName: c.overseasCompanyName ?? undefined,
        // 申报
        declaredValue: c.declaredValue ? c.declaredValue.toString() : undefined,
        declaredCurrency: c.declaredCurrency ?? undefined,
        // 关税
        dutyAmount: c.dutyAmount ? c.dutyAmount.toString() : undefined,
        dutyPayer: c.dutyPayer ?? undefined,
        dutyCurrency: c.dutyCurrency ?? undefined,
        dutyPaidAmount: c.dutyPaidAmount ? c.dutyPaidAmount.toString() : undefined,
        // 回款
        returnAmount: c.returnAmount ? c.returnAmount.toString() : undefined,
        returnDate: c.returnDate?.toISOString() ?? undefined,
        returnCurrency: c.returnCurrency ?? undefined,
        // 仓库
        warehouseId: c.warehouseId ?? undefined,
        warehouseName: c.warehouseName ?? undefined,
        // 销售
        platform: c.platform ?? undefined,
        storeId: c.storeId ?? undefined,
        storeName: c.storeName ?? undefined,
        // 汇总
        totalVolumeCBM: c.totalVolumeCBM ? c.totalVolumeCBM.toString() : undefined,
        totalWeightKG: c.totalWeightKG ? c.totalWeightKG.toString() : undefined,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        outboundBatchCount: c.outboundBatches.length,
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
  } catch (error) {
    return serverError("获取柜子列表失败", error, { includeDetailsInDev: true });
  }
}

/**
 * POST /api/containers
 * 创建柜子
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const containerNo = String(body.containerNo || "").trim();
    const containerType = String(body.containerType || "").trim();
    const shippingMethod = body.shippingMethod as string | undefined;

    if (!containerNo || !containerType || !shippingMethod) {
      return badRequest("请填写柜号、柜型和运输方式");
    }

    const exists = await prisma.container.findUnique({
      where: { containerNo },
      select: { id: true },
    });
    if (exists) {
      return badRequest("该柜号已存在");
    }

    const requestedStatus = (body.status as string | undefined) ?? undefined;
    const normalizedStatus: ContainerStatus =
      requestedStatus && Object.values(ContainerStatus).includes(requestedStatus as ContainerStatus)
        ? (requestedStatus as ContainerStatus)
        : ContainerStatus.PLANNED;

    const container = await prisma.container.create({
      data: {
        containerNo,
        containerType,
        sealNo: body.sealNo ?? null,
        shippingMethod: shippingMethod as any,
        shipCompany: body.shipCompany ?? null,
        vesselName: body.vesselName ?? null,
        voyageNo: body.voyageNo ?? null,
        originPort: body.originPort ?? null,
        destinationPort: body.destinationPort ?? null,
        destinationCountry: body.destinationCountry ?? null,
        loadingDate: body.loadingDate ? new Date(body.loadingDate) : null,
        etd: body.etd ? new Date(body.etd) : null,
        eta: body.eta ? new Date(body.eta) : null,
        actualDeparture: body.actualDeparture ? new Date(body.actualDeparture) : null,
        actualArrival: body.actualArrival ? new Date(body.actualArrival) : null,
        status: normalizedStatus,
        // 出口模式
        exportMode: body.exportMode ?? null,
        serviceMode: body.serviceMode ?? null,
        // 主体
        exporterId: body.exporterId ?? null,
        exporterName: body.exporterName ?? null,
        overseasCompanyId: body.overseasCompanyId ?? null,
        overseasCompanyName: body.overseasCompanyName ?? null,
        // 申报
        declaredValue: body.declaredValue != null ? Number(body.declaredValue) : null,
        declaredCurrency: body.declaredCurrency ?? null,
        // 关税
        dutyAmount: body.dutyAmount != null ? Number(body.dutyAmount) : null,
        dutyPayer: body.dutyPayer ?? null,
        dutyCurrency: body.dutyCurrency ?? null,
        dutyPaidAmount: body.dutyPaidAmount != null ? Number(body.dutyPaidAmount) : null,
        // 回款
        returnAmount: body.returnAmount != null ? Number(body.returnAmount) : null,
        returnDate: body.returnDate ? new Date(body.returnDate) : null,
        returnCurrency: body.returnCurrency ?? null,
        // 仓库
        warehouseId: body.warehouseId ?? null,
        warehouseName: body.warehouseName ?? null,
        // 销售
        platform: body.platform ?? null,
        storeId: body.storeId ?? null,
        storeName: body.storeName ?? null,
        // 汇总
        totalVolumeCBM: body.totalVolumeCBM != null ? Number(body.totalVolumeCBM) : null,
        totalWeightKG: body.totalWeightKG != null ? Number(body.totalWeightKG) : null,
      },
    });

    return NextResponse.json({
      id: container.id,
      containerNo: container.containerNo,
      createdAt: container.createdAt.toISOString(),
    });
  } catch (error) {
    return serverError("创建柜子失败", error, { includeDetailsInDev: true });
  }
}

