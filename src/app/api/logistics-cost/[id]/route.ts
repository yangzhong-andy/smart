import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/logistics-cost/[id] - 更新物流费用
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: any = {};

    if (body.outboundBatchId !== undefined) data.outboundBatchId = body.outboundBatchId ?? null;
    if (body.logisticsChannelId !== undefined) data.logisticsChannelId = body.logisticsChannelId ?? null;
    if (body.costType !== undefined) data.costType = body.costType;
    if (body.amount !== undefined) data.amount = Number(body.amount);
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.paymentType !== undefined) data.paymentType = body.paymentType;
    if (body.creditDays !== undefined) data.creditDays = body.creditDays ?? null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.paymentStatus !== undefined) data.paymentStatus = body.paymentStatus;
    if (body.paidDate !== undefined) data.paidDate = body.paidDate ? new Date(body.paidDate) : null;
    if (body.invoiceNumber !== undefined) data.invoiceNumber = body.invoiceNumber ?? null;
    if (body.invoiceStatus !== undefined) data.invoiceStatus = body.invoiceStatus ?? null;
    if (body.notes !== undefined) data.notes = body.notes ?? null;

    const updated = await prisma.logisticsCost.update({
      where: { id },
      data,
      include: {
        outboundBatch: {
          include: {
            outboundOrder: true,
            warehouse: true,
          },
        },
        logisticsChannel: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      outboundBatchId: updated.outboundBatchId ?? undefined,
      logisticsChannelId: updated.logisticsChannelId ?? undefined,
      costType: updated.costType,
      amount: updated.amount.toString(),
      currency: updated.currency,
      paymentStatus: updated.paymentStatus,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "物流费用记录不存在" }, { status: 404 });
    }
    console.error("PATCH logistics-cost [id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/logistics-cost/[id] - 删除物流费用
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

    await prisma.logisticsCost.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "物流费用记录不存在" }, { status: 404 });
    }
    console.error("DELETE logistics-cost [id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    );
  }
}

