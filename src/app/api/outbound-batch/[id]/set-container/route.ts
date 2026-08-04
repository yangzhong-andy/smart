import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, handlePrismaError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/outbound-batch/[id]/set-container
 * 绑定或解绑柜子
 * Body: { containerId?: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json().catch(() => ({}));

    if (!body || typeof body !== "object") {
      return badRequest("无效的请求体");
    }

    const containerId =
      body.containerId === null || body.containerId === ""
        ? null
        : (body.containerId as string | undefined);

    const updated = await prisma.outboundBatch.update({
      where: { id },
      data: {
        containerId,
      },
      include: {
        container: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      containerId: updated.containerId ?? undefined,
      container: updated.container
        ? {
            id: updated.container.id,
            containerNo: updated.container.containerNo,
            status: updated.container.status,
          }
        : undefined,
    });
  } catch (error) {
    return handlePrismaError(error, {
      notFoundMessage: "出库批次不存在",
      serverMessage: "更新柜子绑定失败",
    });
  }
}

