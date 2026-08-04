import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/status
 * 查看已授权的 TikTok 店铺列表和状态
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const shops = await prisma.tikTokShopSetting.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      shops: shops.map((s) => ({
        id: s.id,
        shopId: s.shopId,
        shopName: s.shopName,
        region: s.region,
        sellerType: s.sellerType,
        status: s.status,
        tokenExpireAt: s.tokenExpireAt?.toISOString() || null,
        lastSyncAt: s.lastSyncAt?.toISOString() || null,
        isExpired: s.tokenExpireAt ? s.tokenExpireAt < new Date() : true,
      })),
      appKey: process.env.TIKTOK_APP_KEY || "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/tiktok/status?shopId=xxx
 * 断开店铺授权
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "缺少 shopId" }, { status: 400 });
    }

    await prisma.tikTokShopSetting.update({
      where: { shopId },
      data: {
        status: "disconnected",
        accessToken: null,
        refreshToken: null,
        tokenExpireAt: null,
      },
    });

    await clearCacheByPrefix("tiktok");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
