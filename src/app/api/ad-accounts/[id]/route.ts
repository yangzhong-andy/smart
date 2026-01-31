import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const account = await prisma.adAccount.findUnique({
      where: { id: params.id },
      include: { agency: true },
    });
    if (!account) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    return NextResponse.json({
      ...account,
      currentBalance: Number(account.currentBalance),
      rebateReceivable: Number(account.rebateReceivable),
      creditLimit: Number(account.creditLimit),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("GET ad-account error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.agencyName !== undefined) data.agencyName = body.agencyName;
    if (body.accountName !== undefined) data.accountName = body.accountName;
    if (body.currentBalance !== undefined) data.currentBalance = body.currentBalance;
    if (body.rebateReceivable !== undefined) data.rebateReceivable = body.rebateReceivable;
    if (body.creditLimit !== undefined) data.creditLimit = body.creditLimit;
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.country !== undefined) data.country = body.country;
    if (body.notes !== undefined) data.notes = body.notes;

    const account = await prisma.adAccount.update({
      where: { id: params.id },
      data,
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
    console.error("PUT ad-account error:", error);
    return NextResponse.json(
      { error: error.message || "更新失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.adAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE ad-account error:", error);
    return NextResponse.json(
      { error: error.message || "删除失败" },
      { status: 500 }
    );
  }
}
