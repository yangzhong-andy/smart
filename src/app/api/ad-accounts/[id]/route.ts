import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const account = await prisma.adAccount.findUnique({
      where: { id: params.id },
      include: { AdAgency: true },
    });
    if (!account) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    const { AdAgency, ...rest } = account;
    return NextResponse.json({
      ...rest,
      agency: AdAgency,
      currentBalance: Number(account.currentBalance),
      rebateReceivable: Number(account.rebateReceivable),
      creditLimit: Number(account.creditLimit),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    });
  } catch (error: any) {
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
    // 🔐 权限检查
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const userRole = session.user?.role;
    if (userRole !== "ADMIN" && userRole !== "MANAGER") {
      return NextResponse.json({ error: "没有权限" }, { status: 403 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.agencyName !== undefined) data.agencyName = body.agencyName;
    if (body.accountName !== undefined) data.accountName = body.accountName;
    if (body.platformAccountId !== undefined) {
      data.platformAccountId =
        typeof body.platformAccountId === "string" && body.platformAccountId.trim()
          ? body.platformAccountId.trim()
          : null;
    }
    if (body.currentBalance !== undefined) data.currentBalance = body.currentBalance;
    if (body.rebateReceivable !== undefined) data.rebateReceivable = body.rebateReceivable;
    if (body.creditLimit !== undefined) data.creditLimit = body.creditLimit;
    if (body.currency !== undefined) data.currency = body.currency;
    if (body.country !== undefined) data.country = body.country;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.storeId !== undefined) {
      data.storeId =
        typeof body.storeId === "string" && body.storeId.trim() ? body.storeId.trim() : null;
    }
    if (body.storeName !== undefined) {
      data.storeName =
        typeof body.storeName === "string" && body.storeName.trim()
          ? body.storeName.trim()
          : null;
    }

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
    // 🔐 权限检查
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const userRole = session.user?.role;
    if (userRole !== "ADMIN" && userRole !== "MANAGER") {
      return NextResponse.json({ error: "没有权限" }, { status: 403 });
    }

    await prisma.adAccount.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "删除失败" },
      { status: 500 }
    );
  }
}
