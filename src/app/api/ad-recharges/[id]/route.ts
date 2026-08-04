import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';
const CACHE_KEY_PREFIX = 'ad-recharges';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const r = await prisma.adRecharge.findUnique({
      where: { id: params.id },
    });
    if (!r) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    return NextResponse.json({
      ...r,
      amount: Number(r.amount),
      date: r.date.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
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
    const body = await request.json();
    const data: Record<string, unknown> = {};
    const fields = ["accountName", "agencyName", "amount", "currency", "rebateAmount", "rebateRate", "month", "paymentStatus", "voucher", "notes"];
    fields.forEach((f) => {
      if (body[f] !== undefined) data[f] = body[f];
    });
    if (body.date !== undefined) data.date = new Date(body.date);

    const r = await prisma.adRecharge.update({
      where: { id: params.id },
      data,
    });
    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    return NextResponse.json({
      ...r,
      amount: Number(r.amount),
      date: r.date.toISOString().slice(0, 10),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
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
    await prisma.adRecharge.delete({ where: { id: params.id } });
    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "删除失败" },
      { status: 500 }
    );
  }
}
