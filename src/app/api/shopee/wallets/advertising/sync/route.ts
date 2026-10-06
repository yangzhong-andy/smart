import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncShopeeAdvertisingWallet } from "@/lib/shopee-ad-wallet-sync";

export const dynamic = "force-dynamic";

async function allowed(request: NextRequest) {
  const token = request.headers.get("x-shopee-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!await allowed(request)) return NextResponse.json({ error: "没有权限同步 Shopee 广告钱包" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncShopeeAdvertisingWallet({
      shopId: body.shopId ? String(body.shopId) : undefined,
      settlementDays: Number(body.settlementDays || 730),
      adDays: Number(body.adDays || 7),
    });
    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Shopee 广告钱包同步失败" }, { status: 500 });
  }
}
