import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const entries = await prisma.pendingEntry.findMany({
      orderBy: { createdAt: "desc" },
    });
    const serialized = entries.map((e) => ({
      ...e,
      amount: Number(e.amount),
      netAmount: Number(e.netAmount),
      approvedAt: e.approvedAt.toISOString(),
      entryDate: e.entryDate?.toISOString(),
      entryAt: e.entryAt?.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));
    return NextResponse.json(serialized);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry = await prisma.pendingEntry.create({
      data: {
        type: body.type,
        relatedId: body.relatedId,
        billCategory: body.billCategory,
        billType: body.billType,
        month: body.month,
        agencyName: body.agencyName,
        supplierName: body.supplierName,
        factoryName: body.factoryName,
        accountName: body.accountName,
        expenseItem: body.expenseItem,
        storeName: body.storeName,
        amount: body.amount,
        currency: body.currency,
        netAmount: body.netAmount,
        approvedBy: body.approvedBy,
        approvedAt: new Date(body.approvedAt),
        status: body.status ?? "Pending",
      },
    });
    return NextResponse.json({
      ...entry,
      amount: Number(entry.amount),
      netAmount: Number(entry.netAmount),
      approvedAt: entry.approvedAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
