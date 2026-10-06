import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncShopeeOfficialWalletTransactions } from "@/lib/shopee-wallet-transaction-sync";

export const dynamic = "force-dynamic";

async function allowed(request: NextRequest) {
  const token = request.headers.get("x-shopee-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!await allowed(request)) return NextResponse.json({ error: "没有权限同步 Shopee 官方钱包流水" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncShopeeOfficialWalletTransactions({
      shopId: body.shopId ? String(body.shopId) : undefined,
      days: Number(body.days || 7),
      timeFrom: body.timeFrom == null ? undefined : Number(body.timeFrom),
      timeTo: body.timeTo == null ? undefined : Number(body.timeTo),
    });
    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Shopee 官方钱包流水同步失败" }, { status: 500 });
  }
}
