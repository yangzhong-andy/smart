import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-response";
import { claimOutboundBatchesForContainer, ContainerBatchAlreadyLoadedError } from "@/lib/container-batch-guard";

export const dynamic = "force-dynamic";

class PreRecordAlreadyConvertedError extends Error {
  constructor() {
    super("该预录单已生成柜子，请刷新后查看，不能重复转柜");
    this.name = "PreRecordAlreadyConvertedError";
  }
}

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

    if (preRecord.status === "Converted" || preRecord.containerId) {
      return badRequest("该预录单已生成柜子，不能重复转柜");
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

    // 支持拼柜：可显式传入多个批次ID，未传时回退到预录单主关联批次
    const outboundBatchIds = Array.isArray(body?.outboundBatchIds)
      ? [...new Set((body.outboundBatchIds as unknown[]).map((v) => String(v).trim()).filter(Boolean))]
      : [];
    const batchIds = outboundBatchIds.length > 0
      ? outboundBatchIds
      : (preRecord.outboundBatchId ? [preRecord.outboundBatchId] : []);
    if (preRecord.outboundBatchId && !batchIds.includes(preRecord.outboundBatchId)) {
      return badRequest("所选批次与预录单不符，请刷新后重试");
    }

    // Claim the pre-record and all batches atomically. If another request has
    // already converted or loaded any row, the transaction rolls back the new cabinet.
    const container = await prisma.$transaction(async (tx) => {
      const claimed = await tx.containerPreRecord.updateMany({
        where: { id, containerId: null, status: { not: "Converted" } },
        data: { status: "Converted" },
      });
      if (claimed.count !== 1) throw new PreRecordAlreadyConvertedError();

      const created = await tx.container.create({
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

      if (batchIds.length > 0) {
        await claimOutboundBatchesForContainer(tx, batchIds, created.id);
      }
      await tx.containerPreRecord.update({
        where: { id },
        data: { containerId: created.id },
      });
      return created;
    });

    return NextResponse.json({
      id: container.id,
      containerNo: container.containerNo,
      containerType: container.containerType,
      totalVolumeCBM: container.totalVolumeCBM?.toString(),
      totalWeightKG: container.totalWeightKG?.toString(),
      createdAt: container.createdAt.toISOString(),
      outboundBatchId: preRecord.outboundBatchId ?? undefined,
      outboundBatchIds: batchIds,
    });
  } catch (error) {
    if (error instanceof PreRecordAlreadyConvertedError || error instanceof ContainerBatchAlreadyLoadedError) {
      return badRequest(error.message);
    }
    if ((error as { code?: string })?.code === "P2002") {
      return badRequest("该柜号已存在");
    }
    return serverError("转柜失败", error, { includeDetailsInDev: true });
  }
}
