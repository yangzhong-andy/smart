import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeShopeeCode, getShopeeShopInfo, type ShopeeEnvironment } from "@/lib/shopee-open-api";

export const dynamic = "force-dynamic";

const DEFAULT_BASE_URL = "https://www.baxi8.com";

function callbackBase(configuredUrl?: string | null) {
  try {
    return new URL(configuredUrl || DEFAULT_BASE_URL).origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const shopId = params.get("shop_id") || params.get("main_account_id");
  const state = params.get("state");
  if (!code || !shopId || !state) return NextResponse.redirect(`${DEFAULT_BASE_URL}/platforms/shopee/stores?error=missing_callback_params`);
  let returnBase = DEFAULT_BASE_URL;
  try {
    const oauthState = await prisma.shopeeOAuthState.findUnique({ where: { state }, include: { appConfig: true } });
    if (!oauthState || oauthState.usedAt || oauthState.expiresAt < new Date()) throw new Error("授权状态无效或已过期");
    await prisma.shopeeOAuthState.update({ where: { id: oauthState.id }, data: { usedAt: new Date() } });
    const app = oauthState.appConfig;
    const configuredRedirect = app.environment === "live"
      ? app.liveRedirectDomain || process.env.SHOPEE_LIVE_REDIRECT_URI
      : app.testRedirectDomain || process.env.SHOPEE_TEST_REDIRECT_URI;
    returnBase = callbackBase(configuredRedirect);
    const token = await exchangeShopeeCode({ environment: app.environment as ShopeeEnvironment, partnerId: app.partnerId, partnerKey: app.partnerKey, code, shopId });
    let shopName: string | null = null;
    try {
      const info: any = await getShopeeShopInfo({ environment: app.environment as ShopeeEnvironment, partnerId: app.partnerId, partnerKey: app.partnerKey, accessToken: token.access_token || token.accessToken, shopId });
      shopName = info.shop_name || info.shopName || null;
    } catch (error) { console.warn("[Shopee] shop info unavailable", error); }
    const existingStore = await prisma.store.findFirst({ where: { platform: "SHOPEE", OR: [{ name: shopName || `Shopee-${shopId}` }, { accountId: shopId }] } });
    const store = existingStore || await prisma.store.create({ data: { name: shopName || `Shopee-${shopId}`, platform: "SHOPEE", country: "BR", currency: "BRL", accountId: shopId, accountName: shopName || `Shopee-${shopId}` } });
    await prisma.shopeeShopSetting.upsert({
      where: { shopId_appConfigId: { shopId: String(shopId), appConfigId: app.id } },
      create: { shopId: String(shopId), shopName, region: "BR", currency: "BRL", appConfigId: app.id, accessToken: token.access_token || token.accessToken, refreshToken: token.refresh_token || token.refreshToken, tokenExpireAt: token.expire_in ? new Date(Date.now() + Number(token.expire_in) * 1000) : null, status: "active", storeId: store.id },
      update: { shopName, accessToken: token.access_token || token.accessToken, refreshToken: token.refresh_token || token.refreshToken, tokenExpireAt: token.expire_in ? new Date(Date.now() + Number(token.expire_in) * 1000) : undefined, status: "active", storeId: store.id },
    });
    return NextResponse.redirect(`${returnBase}/platforms/shopee/stores?success=1&shopId=${encodeURIComponent(shopId)}`);
  } catch (error: any) {
    console.error("[Shopee] OAuth callback failed", error);
    return NextResponse.redirect(`${returnBase}/platforms/shopee/stores?error=${encodeURIComponent(error?.message || "授权失败")}`);
  }
}
