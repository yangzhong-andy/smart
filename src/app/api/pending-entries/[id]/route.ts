import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entry = await prisma.pendingEntry.findUnique({
      where: { id: params.id },
    });
    if (!entry) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    return NextResponse.json({
      ...entry,
      amount: Number(entry.amount),
      netAmount: Number(entry.netAmount),
      approvedAt: entry.approvedAt.toISOString(),
      entryDate: entry.entryDate?.toISOString(),
      entryAt: entry.entryAt?.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("GET pending-entry error:", error);
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
    if (body.status !== undefined) data.status = body.status;
    if (body.entryAccountId !== undefined) data.entryAccountId = body.entryAccountId;
    if (body.entryAccountName !== undefined) data.entryAccountName = body.entryAccountName;
    if (body.entryDate !== undefined) data.entryDate = body.entryDate ? new Date(body.entryDate) : null;
    if (body.entryBy !== undefined) data.entryBy = body.entryBy;
    if (body.entryFlowId !== undefined) data.entryFlowId = body.entryFlowId;
    if (body.entryAt !== undefined) data.entryAt = body.entryAt ? new Date(body.entryAt) : null;

    const entry = await prisma.pendingEntry.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({
      ...entry,
      amount: Number(entry.amount),
      netAmount: Number(entry.netAmount),
      approvedAt: entry.approvedAt.toISOString(),
      entryDate: entry.entryDate?.toISOString(),
      entryAt: entry.entryAt?.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("PATCH pending-entry error:", error);
    return NextResponse.json(
      { error: error.message || "更新失败" },
      { status: 500 }
    );
  }
}
