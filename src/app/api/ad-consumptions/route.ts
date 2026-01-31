import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get("adAccountId");
    const where = adAccountId ? { adAccountId } : {};
    const list = await prisma.adConsumption.findMany({
      where,
      orderBy: { date: "desc" },
    });
    const serialized = list.map((c) => ({
      ...c,
      amount: Number(c.amount),
      estimatedRebate: c.estimatedRebate ? Number(c.estimatedRebate) : null,
      rebateRate: c.rebateRate ? Number(c.rebateRate) : null,
      date: c.date.toISOString().slice(0, 10),
      dueDate: c.dueDate?.toISOString().slice(0, 10),
      rebateDueDate: c.rebateDueDate?.toISOString().slice(0, 10),
      settledAt: c.settledAt?.toISOString(),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("GET ad-consumptions error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const consumption = await prisma.adConsumption.create({
      data: {
        adAccountId: body.adAccountId,
        accountName: body.accountName,
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        storeId: body.storeId,
        storeName: body.storeName,
        month: body.month,
        date: new Date(body.date),
        amount: body.amount,
        currency: body.currency,
        estimatedRebate: body.estimatedRebate,
        rebateRate: body.rebateRate,
        campaignName: body.campaignName,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        rebateDueDate: body.rebateDueDate ? new Date(body.rebateDueDate) : null,
        isSettled: body.isSettled ?? false,
        voucher: body.voucher,
        notes: body.notes,
      },
    });
    return NextResponse.json({
      ...consumption,
      amount: Number(consumption.amount),
      date: consumption.date.toISOString().slice(0, 10),
      createdAt: consumption.createdAt.toISOString(),
      updatedAt: consumption.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST ad-consumptions error:", error);
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
