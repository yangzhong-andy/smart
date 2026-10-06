import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { refreshShopeeShopToken } from "@/lib/shopee-token-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const { shopId } = await request.json();
    if (!shopId) return NextResponse.json({ error: "缺少 shopId" }, { status: 400 });
    const shop = await prisma.shopeeShopSetting.findFirst({ where: { shopId: String(shopId) }, select: { id: true, refreshToken: true } });
    if (!shop?.refreshToken) return NextResponse.json({ error: "该店铺没有可用的 Refresh Token，请重新授权" }, { status: 400 });
    const result = await refreshShopeeShopToken(shop.id, { force: true, trigger: "manual" });
    if (result.status === "failed") {
      return NextResponse.json({ error: result.error || "Token 刷新失败" }, { status: 502 });
    }
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Token 刷新失败" }, { status: 500 });
  }
}
