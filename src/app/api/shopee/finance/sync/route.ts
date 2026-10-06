import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncShopeeSettlements } from "@/lib/shopee-settlement-sync";

export const dynamic = "force-dynamic";
async function allowed(request: NextRequest) { const token = request.headers.get("x-shopee-sync-token") || request.headers.get("x-monthly-bill-sync-token"); if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true; const auth = await requireApiUser(request); return !auth.response; }

export async function POST(request: NextRequest) {
  if (!await allowed(request)) return NextResponse.json({ error: "没有权限同步 Shopee 结算" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncShopeeSettlements({
      shopId: body.shopId ? String(body.shopId) : undefined,
      days: Number(body.days || 365),
      missingOnly: body.missingOnly === true,
      batchSize: Number(body.batchSize || 200),
    });
    return NextResponse.json({ success: result.errors.length === 0, ...(result.errors.length ? { error: "部分 Shopee 订单结算同步失败" } : {}), ...result }, { status: result.errors.length ? 207 : 200 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Shopee 结算同步失败" }, { status: 500 }); }
}
