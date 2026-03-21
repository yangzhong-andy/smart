import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * POST /api/container-pre-records/[id]/convert
 * 将预录单转为正式柜子
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 获取预录单详情
    const preRecord = await prisma.containerPreRecord.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!preRecord) {
      return notFound("预录单不存在");
    }

    if (preRecord.status === "Converted") {
      return badRequest("该预录单已转柜");
    }

    // 柜号必填
    const containerNo = body.containerNo?.trim();
    if (!containerNo) {
      return badRequest("请填写柜号");
    }

    // 检查柜号是否已存在
    const existingContainer = await prisma.container.findUnique({
      where: { containerNo },
    });

    if (existingContainer) {
      return badRequest("该柜号已存在");
    }

    // 创建正式柜子
    const container = await prisma.container.create({
      data: {
        containerNo,
        containerType: body.containerType || preRecord.suggestedContainerType || "40HQ",
        shippingMethod: (preRecord.shippingMethod as any) || "SEA",
        originPort: preRecord.originPort,
        destinationPort: preRecord.destinationPort,
        destinationCountry: preRecord.destinationCountry,
        exporterId: preRecord.exporterId,
        exporterName: preRecord.exporterName,
        overseasCompanyId: preRecord.overseasCompanyId,
        overseasCompanyName: preRecord.overseasCompanyName,
        warehouseId: preRecord.warehouseId,
        warehouseName: preRecord.warehouseName,
        platform: preRecord.platform,
        storeId: preRecord.storeId,
        storeName: preRecord.storeName,
        totalVolumeCBM: preRecord.totalVolumeCBM,
        totalWeightKG: preRecord.totalWeightKG,
        status: "PLANNED",
      },
    });

    // 更新预录单状态
    await prisma.containerPreRecord.update({
      where: { id },
      data: {
        status: "Converted",
        containerId: container.id,
      },
    });

    // 若预录单来自出库批次，自动把批次绑定到新柜子
    if (preRecord.outboundBatchId) {
      await prisma.outboundBatch.update({
        where: { id: preRecord.outboundBatchId },
        data: { containerId: container.id },
      });
    }

    return NextResponse.json({
      id: container.id,
      containerNo: container.containerNo,
      containerType: container.containerType,
      totalVolumeCBM: container.totalVolumeCBM?.toString(),
      totalWeightKG: container.totalWeightKG?.toString(),
      createdAt: container.createdAt.toISOString(),
      outboundBatchId: preRecord.outboundBatchId ?? undefined,
    });
  } catch (error) {
    return serverError("转柜失败", error, { includeDetailsInDev: true });
  }
}
