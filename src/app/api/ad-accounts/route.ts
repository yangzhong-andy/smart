import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get("agencyId");
    const where = agencyId ? { agencyId } : {};
    const list = await prisma.adAccount.findMany({
      where,
      include: { agency: true },
      orderBy: { createdAt: "desc" },
    });
    const serialized = list.map((a) => ({
      ...a,
      currentBalance: Number(a.currentBalance),
      rebateReceivable: Number(a.rebateReceivable),
      creditLimit: Number(a.creditLimit),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("GET ad-accounts error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = await prisma.adAccount.create({
      data: {
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        accountName: body.accountName,
        currentBalance: body.currentBalance ?? 0,
        rebateReceivable: body.rebateReceivable ?? 0,
        creditLimit: body.creditLimit ?? 0,
        currency: body.currency ?? "USD",
        country: body.country,
        notes: body.notes,
      },
    });
    return NextResponse.json({
      ...account,
      currentBalance: Number(account.currentBalance),
      rebateReceivable: Number(account.rebateReceivable),
      creditLimit: Number(account.creditLimit),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST ad-accounts error:", error);
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
