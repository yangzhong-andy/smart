import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { syncAdvertisingMonthlyBills } from "@/lib/auto-generate-bills";

export const dynamic = 'force-dynamic';
const CACHE_KEY_PREFIX = 'ad-consumptions';

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
    const before = await prisma.adConsumption.findUnique({
      where: { id: params.id },
      select: { month: true, agencyId: true, adAccountId: true },
    });
    if (!before) {
      return NextResponse.json({ error: "未找到广告消耗记录" }, { status: 404 });
    }
    const data: Record<string, unknown> = {};
    const fields = ["accountName", "agencyId", "agencyName", "storeId", "storeName", "month", "amount", "currency", "estimatedRebate", "rebateRate", "campaignName", "campaignId", "consumptionType", "cashConsumption", "creditConsumption", "giftConsumption", "isSettled", "voucher", "notes"];
    fields.forEach((f) => {
      if (body[f] !== undefined) data[f] = body[f];
    });
    if (body.date !== undefined) {
      const date = new Date(body.date);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "广告消耗日期无效" }, { status: 400 });
      }
      data.date = date;
      if (body.month === undefined) data.month = date.toISOString().slice(0, 7);
    }
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.rebateDueDate !== undefined) data.rebateDueDate = body.rebateDueDate ? new Date(body.rebateDueDate) : null;
    if (body.settledAt !== undefined) data.settledAt = body.settledAt ? new Date(body.settledAt) : null;

    const c = await prisma.adConsumption.update({
      where: { id: params.id },
      data,
    });
    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    const affectedMonths = Array.from(
      new Set([before.month, c.month]),
    );
    const billSync = await syncAdvertisingMonthlyBills(affectedMonths);
    return NextResponse.json({
      ...c,
      amount: Number(c.amount),
      date: c.date.toISOString().slice(0, 10),
      billSync,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
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

    const existing = await prisma.adConsumption.findUnique({
      where: { id: params.id },
      select: { month: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "未找到广告消耗记录" }, { status: 404 });
    }
    await prisma.adConsumption.delete({ where: { id: params.id } });
    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    const billSync = await syncAdvertisingMonthlyBills([existing.month]);
    return NextResponse.json({ success: true, billSync });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "删除失败" },
      { status: 500 }
    );
  }
}
