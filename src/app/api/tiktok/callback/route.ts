import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccessToken, getAuthorizedShops } from "@/lib/tiktok-shop-api";

export const dynamic = "force-dynamic";

const BASE_URL = "https://www.baxi8.com";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state") || "";

    if (!code) {
      return NextResponse.redirect(`${BASE_URL}/settings/tiktok?error=no_code`);
    }

    // 从 state 中解析 appKey（格式: uuid_appKey）
    const stateParts = state.split("_");
    const appKey = stateParts.length > 1 ? stateParts[stateParts.length - 1] : "";
    console.log("[TikTok] callback appKey:", appKey, "state:", state.substring(0, 30));

    // 获取对应的 App Secret
    const appConfig = appKey
      ? await prisma.tikTokAppConfig.findUnique({ where: { appKey } })
      : null;

    const finalAppKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const finalAppSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";

    // 1. 获取 token
    const tokenData = await getAccessToken(code, finalAppKey, finalAppSecret);
    console.log("[TikTok] token成功, openId:", tokenData.openId);

    // 2. 获取店铺列表
    let shops: any[] = [];
    try {
      shops = await getAuthorizedShops(tokenData.accessToken, finalAppKey, finalAppSecret);
      console.log("[TikTok] shops成功:", shops.length, "个");
    } catch (e: any) {
      console.error("[TikTok] shops失败:", e.message);
    }

    // 3. 如果获取不到店铺列表
    if (shops.length === 0) {
      const expireAt = new Date(Date.now() + tokenData.accessTokenExpireIn * 1000);
      await prisma.tikTokShopSetting.upsert({
        where: { shopId: tokenData.openId || "unknown" },
        create: {
          shopId: tokenData.openId || "unknown",
          shopName: "TikTok Shop (待获取)",
          region: "BR",
          appKey: finalAppKey,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          tokenExpireAt: expireAt,
          openId: tokenData.openId,
          status: "active",
        },
        update: {
          appKey: finalAppKey,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          tokenExpireAt: expireAt,
          openId: tokenData.openId,
          status: "active",
        },
      });
      return NextResponse.redirect(`${BASE_URL}/settings/tiktok?success=1&shops=0&warn=shops_api`);
    }

    // 4. 循环存储所有店铺
    const expireAt = new Date(Date.now() + tokenData.accessTokenExpireIn * 1000);
    for (const shop of shops) {
      console.log(`[TikTok] 存储店铺: ${shop.name} (${shop.id}) appKey=${finalAppKey}`);
      await prisma.tikTokShopSetting.upsert({
        where: { shopId: shop.id },
        create: {
          shopId: shop.id,
          shopName: shop.name,
          region: shop.region || "BR",
          sellerType: shop.seller_type || null,
          shopCipher: shop.cipher || null,
          appKey: finalAppKey,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          tokenExpireAt: expireAt,
          openId: tokenData.openId,
          status: "active",
        },
        update: {
          shopName: shop.name,
          region: shop.region || "BR",
          sellerType: shop.seller_type || null,
          shopCipher: shop.cipher || null,
          appKey: finalAppKey,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          tokenExpireAt: expireAt,
          openId: tokenData.openId,
          status: "active",
        },
      });
    }

    return NextResponse.redirect(`${BASE_URL}/settings/tiktok?success=1&shops=${shops.length}`);
  } catch (error: any) {
    console.error("[TikTok] callback error:", error.message);
    return NextResponse.redirect(`${BASE_URL}/settings/tiktok?error=${encodeURIComponent(error.message)}`);
  }
}
