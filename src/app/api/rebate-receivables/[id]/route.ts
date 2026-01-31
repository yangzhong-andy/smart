import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const r = await prisma.rebateReceivable.findUnique({
      where: { id: params.id },
    });
    if (!r) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    return NextResponse.json({
      ...r,
      rebateAmount: Number(r.rebateAmount),
      currentBalance: Number(r.currentBalance),
      rechargeDate: r.rechargeDate.toISOString().slice(0, 10),
      writeoffRecords: (r.writeoffRecords as object[]) || [],
      adjustments: (r.adjustments as object[]) || [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("GET rebate-receivable error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.currentBalance !== undefined) data.currentBalance = body.currentBalance;
    if (body.status !== undefined) data.status = body.status;
    if (body.writeoffRecords !== undefined) data.writeoffRecords = body.writeoffRecords;
    if (body.adjustments !== undefined) data.adjustments = body.adjustments;
    if (body.notes !== undefined) data.notes = body.notes;

    const r = await prisma.rebateReceivable.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({
      ...r,
      rebateAmount: Number(r.rebateAmount),
      currentBalance: Number(r.currentBalance),
      rechargeDate: r.rechargeDate.toISOString().slice(0, 10),
      writeoffRecords: (r.writeoffRecords as object[]) || [],
      adjustments: (r.adjustments as object[]) || [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("PATCH rebate-receivable error:", error);
    return NextResponse.json(
      { error: error.message || "更新失败" },
      { status: 500 }
    );
  }
}
