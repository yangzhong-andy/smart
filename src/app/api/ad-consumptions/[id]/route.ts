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
    const c = await prisma.adConsumption.findUnique({
      where: { id: params.id },
    });
    if (!c) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    return NextResponse.json({
      ...c,
      amount: Number(c.amount),
      date: c.date.toISOString().slice(0, 10),
      dueDate: c.dueDate?.toISOString().slice(0, 10),
      rebateDueDate: c.rebateDueDate?.toISOString().slice(0, 10),
      settledAt: c.settledAt?.toISOString(),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("GET ad-consumption error:", error);
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
    const fields = ["accountName", "agencyId", "agencyName", "storeId", "storeName", "month", "amount", "currency", "estimatedRebate", "rebateRate", "campaignName", "isSettled", "voucher", "notes"];
    fields.forEach((f) => {
      if (body[f] !== undefined) data[f] = body[f];
    });
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.rebateDueDate !== undefined) data.rebateDueDate = body.rebateDueDate ? new Date(body.rebateDueDate) : null;
    if (body.settledAt !== undefined) data.settledAt = body.settledAt ? new Date(body.settledAt) : null;

    const c = await prisma.adConsumption.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({
      ...c,
      amount: Number(c.amount),
      date: c.date.toISOString().slice(0, 10),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("PUT ad-consumption error:", error);
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

    await prisma.adConsumption.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE ad-consumption error:", error);
    return NextResponse.json(
      { error: error.message || "删除失败" },
      { status: 500 }
    );
  }
}
