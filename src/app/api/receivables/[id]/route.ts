import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const r = await prisma.receivable.findUnique({ where: { id: params.id } });
    if (!r) return NextResponse.json({ error: "未找到" }, { status: 404 });
    return NextResponse.json({
      ...r, originalAmount: Number(r.originalAmount), currentBalance: Number(r.currentBalance),
      receiptRecords: r.receiptRecords || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data: any = { updatedAt: new Date() };
    if (body.status !== undefined) data.status = body.status;
    if (body.approvedBy !== undefined) data.approvedBy = body.approvedBy;
    if (body.approvedAt !== undefined) data.approvedAt = new Date(body.approvedAt);
    if (body.submittedAt !== undefined) data.submittedAt = body.submittedAt ? new Date(body.submittedAt) : null;
    if (body.rejectionReason !== undefined) data.rejectionReason = body.rejectionReason;
    if (body.currentBalance !== undefined) data.currentBalance = Number(body.currentBalance);
    if (body.receiptRecords !== undefined) data.receiptRecords = body.receiptRecords;
    if (body.outFlowId !== undefined) data.outFlowId = body.outFlowId;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const updated = await prisma.receivable.update({ where: { id: params.id }, data });
    await clearCacheByPrefix("receivables");
    return NextResponse.json({ ...updated, originalAmount: Number(updated.originalAmount), currentBalance: Number(updated.currentBalance) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.receivable.delete({ where: { id: params.id } });
    await clearCacheByPrefix("receivables");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
