import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get("agencyId");
    const adAccountId = searchParams.get("adAccountId");
    const status = searchParams.get("status");
    const rechargeId = searchParams.get("rechargeId");
    const where: Record<string, string> = {};
    if (agencyId) where.agencyId = agencyId;
    if (adAccountId) where.adAccountId = adAccountId;
    if (status) where.status = status;
    if (rechargeId) where.rechargeId = rechargeId;

    const list = await prisma.rebateReceivable.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    const serialized = list.map((r) => ({
      ...r,
      rebateAmount: Number(r.rebateAmount),
      currentBalance: Number(r.currentBalance),
      rechargeDate: r.rechargeDate.toISOString().slice(0, 10),
      writeoffRecords: (r.writeoffRecords as object[]) || [],
      adjustments: (r.adjustments as object[]) || [],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("GET rebate-receivables error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const receivable = await prisma.rebateReceivable.create({
      data: {
        rechargeId: body.rechargeId,
        rechargeDate: new Date(body.rechargeDate),
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        adAccountId: body.adAccountId,
        accountName: body.accountName,
        platform: body.platform ?? "OTHER",
        rebateAmount: body.rebateAmount,
        currency: body.currency ?? "USD",
        currentBalance: body.currentBalance ?? body.rebateAmount,
        status: body.status ?? "待核销",
        writeoffRecords: body.writeoffRecords ?? [],
        adjustments: body.adjustments ?? [],
        notes: body.notes,
      },
    });
    return NextResponse.json({
      ...receivable,
      rebateAmount: Number(receivable.rebateAmount),
      currentBalance: Number(receivable.currentBalance),
      rechargeDate: receivable.rechargeDate.toISOString().slice(0, 10),
      writeoffRecords: (receivable.writeoffRecords as object[]) || [],
      adjustments: (receivable.adjustments as object[]) || [],
      createdAt: receivable.createdAt.toISOString(),
      updatedAt: receivable.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST rebate-receivables error:", error);
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
