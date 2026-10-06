import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const shops = await prisma.shopeeShopSetting.findMany({ include: { appConfig: { select: { appName: true, partnerId: true, environment: true } }, store: { select: { id: true, name: true, country: true, currency: true } }, tokenRefreshLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, trigger: true, createdAt: true, message: true } } }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ shops: shops.map((shop) => ({ id: shop.id, shopId: shop.shopId, shopName: shop.shopName, region: shop.region, currency: shop.currency, status: shop.status, tokenExpireAt: shop.tokenExpireAt, tokenRefreshedAt: shop.tokenRefreshedAt, tokenRefreshFailedAt: shop.tokenRefreshFailedAt, tokenRefreshFailureCount: shop.tokenRefreshFailureCount, tokenRefreshError: shop.tokenRefreshError, lastTokenRefreshLog: shop.tokenRefreshLogs[0] || null, lastSyncAt: shop.lastSyncAt, store: shop.store, app: shop.appConfig })) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  const shopId = new URL(request.url).searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "缺少 shopId" }, { status: 400 });
  await prisma.shopeeShopSetting.updateMany({
    where: { shopId },
    data: { status: "disconnected", accessToken: null, refreshToken: null, tokenExpireAt: null },
  });
  return NextResponse.json({ success: true });
}
