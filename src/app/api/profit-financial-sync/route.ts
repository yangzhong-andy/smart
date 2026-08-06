import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { syncTikTokProfitFinancials } from "@/lib/tiktok-profit-financial-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const shopId = request.nextUrl.searchParams.get("shopId") || undefined;
    const where = shopId ? { shopId } : undefined;
    const [total, settled, estimated, latest] = await Promise.all([
      prisma.tikTokOrderFinancial.count({ where }),
      prisma.tikTokOrderFinancial.count({ where: { ...where, source: "SETTLED" } }),
      prisma.tikTokOrderFinancial.count({ where: { ...where, source: "ESTIMATED" } }),
      prisma.tikTokOrderFinancial.findFirst({ where, orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
    ]);
    return NextResponse.json({ total, settled, estimated, lastSyncedAt: latest?.syncedAt.toISOString() || null });
  } catch (error: any) {
    console.error("[Profit Financial Sync Status]", error);
    return NextResponse.json({ error: error?.message || "逐单财务状态读取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const shopId = String(body?.shopId || "").trim();
    const days = Math.max(1, Math.min(366, Math.round(Number(body?.days) || 45)));
    if (!shopId) return NextResponse.json({ error: "请选择店铺" }, { status: 400 });
    const result = await syncTikTokProfitFinancials(shopId, days);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Profit Financial Sync]", error);
    return NextResponse.json({ error: error?.message || "逐单财务同步失败" }, { status: 500 });
  }
}
