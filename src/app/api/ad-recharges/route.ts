import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adAccountId = searchParams.get("adAccountId");
    const where = adAccountId ? { adAccountId } : {};
    const list = await prisma.adRecharge.findMany({
      where,
      orderBy: { date: "desc" },
    });
    const serialized = list.map((r) => ({
      ...r,
      amount: Number(r.amount),
      rebateAmount: r.rebateAmount ? Number(r.rebateAmount) : null,
      rebateRate: r.rebateRate ? Number(r.rebateRate) : null,
      date: r.date.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("GET ad-recharges error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const recharge = await prisma.adRecharge.create({
      data: {
        uid: body.uid,
        adAccountId: body.adAccountId,
        accountName: body.accountName,
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        amount: body.amount,
        currency: body.currency ?? "USD",
        rebateAmount: body.rebateAmount,
        rebateRate: body.rebateRate,
        date: new Date(body.date),
        month: body.month,
        paymentStatus: body.paymentStatus ?? "Pending",
        voucher: body.voucher,
        notes: body.notes,
      },
    });
    return NextResponse.json({
      ...recharge,
      amount: Number(recharge.amount),
      date: recharge.date.toISOString().slice(0, 10),
      createdAt: recharge.createdAt.toISOString(),
      updatedAt: recharge.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST ad-recharges error:", error);
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
