import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { shopeeReturnRange, syncShopeeReturns } from "@/lib/shopee-return-sync";

export const dynamic = "force-dynamic";

async function allowed(request: NextRequest) {
  const internalToken = request.headers.get("x-shopee-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (internalToken && process.env.NEXTAUTH_SECRET && internalToken === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request);
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!await allowed(request)) return NextResponse.json({ error: "没有权限同步 Shopee 售后" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const days = Number(body.days || (body.incremental ? 30 : 365));
    const range = shopeeReturnRange(days);
    const result = await syncShopeeReturns({
      shopId: body.shopId ? String(body.shopId) : undefined,
      ...range,
    });
    return NextResponse.json({
      success: result.errors.length === 0,
      ...(result.errors.length ? { error: "部分 Shopee 店铺售后同步失败" } : {}),
      ...result,
    }, { status: result.errors.length ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Shopee 售后同步失败" }, { status: 500 });
  }
}
