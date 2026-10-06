import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeMercadoLivreCode,
  getMercadoLivreUser,
  type MercadoLivreTokenResponse,
} from "@/lib/mercado-livre-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_BASE_URL = "https://www.baxi8.com";

function callbackBase(uri?: string | null) {
  try { return new URL(uri || DEFAULT_BASE_URL).origin; } catch { return DEFAULT_BASE_URL; }
}

function callbackUrl(base: string, params: Record<string, string>) {
  const url = new URL("/platforms/mercado-livre/stores", base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function tokenValue(token: MercadoLivreTokenResponse) {
  return token.access_token || "";
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code")?.trim();
  const state = params.get("state")?.trim();
  const oauthError = params.get("error_description") || params.get("error");
  let returnBase = DEFAULT_BASE_URL;

  if (!state) return NextResponse.redirect(callbackUrl(returnBase, { error: oauthError || "missing_callback_state" }));

  try {
    const oauthState = await prisma.mercadoLivreOAuthState.findUnique({ where: { state }, include: { appConfig: true } });
    if (!oauthState) throw new Error("授权状态无效，请重新发起授权");
    returnBase = callbackBase(oauthState.appConfig.redirectUri);
    if (oauthState.usedAt || oauthState.expiresAt < new Date()) throw new Error("授权状态已过期，请重新发起授权");
    const claimed = await prisma.mercadoLivreOAuthState.updateMany({
      where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error("授权状态已被使用，请重新发起授权");
    if (oauthError || !code) throw new Error(oauthError || "Mercado Livre 未返回授权码");

    const token = await exchangeMercadoLivreCode({
      clientId: oauthState.appConfig.clientId,
      clientSecret: oauthState.appConfig.clientSecret,
      code,
      redirectUri: oauthState.appConfig.redirectUri,
      codeVerifier: oauthState.codeVerifier,
    });
    const accessToken = tokenValue(token);
    if (!accessToken) throw new Error("Mercado Livre 返回的 Access Token 为空");
    const user = await getMercadoLivreUser(accessToken);
    const userId = String(user.id || token.user_id || "").trim();
    if (!userId) throw new Error("无法读取 Mercado Livre 卖家账号 ID");
    const country = String(user.country_id || "BR").toUpperCase();
    const siteId = String(user.site_id || "MLB").toUpperCase();
    const currency = country === "BR" || siteId === "MLB" ? "BRL" : "USD";
    const expiresAt = Number(token.expires_in) > 0 ? new Date(Date.now() + Number(token.expires_in) * 1000) : null;

    const existingStore = await prisma.store.findFirst({
      where: { platform: "MERCADO_LIVRE", OR: [{ accountId: userId }, { name: user.nickname || `Mercado Livre-${userId}` }] },
      select: { id: true },
    });
    const store = existingStore || await prisma.store.create({
      data: {
        name: user.nickname || `Mercado Livre-${userId}`,
        platform: "MERCADO_LIVRE",
        country,
        currency,
        accountId: userId,
        accountName: user.nickname || userId,
      },
      select: { id: true },
    });

    const [accountForApp, accountForStore] = await Promise.all([
      prisma.mercadoLivreAccount.findUnique({
        where: { appConfigId_userId: { appConfigId: oauthState.appConfigId, userId } },
        select: { id: true },
      }),
      prisma.mercadoLivreAccount.findUnique({
        where: { storeId: store.id },
        select: { id: true },
      }),
    ]);
    if (accountForApp && accountForStore && accountForApp.id !== accountForStore.id) {
      throw new Error("检测到重复的 Mercado Livre 店铺授权记录，请联系管理员处理");
    }

    const existingAccount = accountForApp || accountForStore;
    const accountData = {
      userId,
      nickname: user.nickname || null,
      siteId,
      country,
      currency,
      appConfigId: oauthState.appConfigId,
      accessToken,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      scope: token.scope || null,
      tokenExpireAt: expiresAt,
      tokenRefreshedAt: new Date(),
      tokenRefreshFailedAt: null,
      tokenRefreshFailureCount: 0,
      tokenRefreshError: null,
      status: "active",
      storeId: store.id,
    };

    if (existingAccount) {
      // Keep the account id so existing orders and webhook logs remain attached when an app is replaced.
      await prisma.mercadoLivreAccount.update({
        where: { id: existingAccount.id },
        data: accountData,
      });
    } else {
      await prisma.mercadoLivreAccount.create({
        data: {
          ...accountData,
          refreshToken: token.refresh_token || null,
        },
      });
    }
    return NextResponse.redirect(callbackUrl(returnBase, { success: "1", userId }));
  } catch (error: any) {
    console.error("[Mercado Livre] OAuth callback failed", error);
    return NextResponse.redirect(callbackUrl(returnBase, { error: error?.message || "授权失败" }));
  }
}
