import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { requireApiUser } from "./api-auth";
import { KWAI_ORIGIN, KwaiError, hashKwai, kwaiAuthorizeUrl, kwaiRefresh, openKwai, sealKwai, type KwaiCredentials, type KwaiToken } from "./kwai-api";

export const KWAI_COOKIE = "__Host-kwai-oauth";
export const kwaiCookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
export async function kwaiAdmin(request: NextRequest, write = false) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth;
  if (write && request.headers.get("origin") !== KWAI_ORIGIN) throw new KwaiError(`请从 ${KWAI_ORIGIN} 登录后操作，密钥仅通过 HTTPS 提交`);
  return auth;
}
export function kwaiSafeError(error: unknown) {
  return error instanceof KwaiError ? error.message : "Kwai 操作失败，请刷新重试或联系管理员";
}
export function tokenDates(token: KwaiToken, now = Date.now()) {
  return { tokenExpireAt: new Date(now + token.expiresIn * 1000), refreshExpireAt: new Date(now + token.refreshTokenExpiresIn * 1000) };
}
export async function startKwaiAuthorization(appId: string, userId: string) {
  const app = await prisma.kwaiAppConfig.findUnique({ where: { id: appId } });
  if (!app) throw new KwaiError("请先配置 Kwai 应用");
  openKwai<KwaiCredentials>(app.credentials);
  const state = randomBytes(32).toString("hex"), browser = randomBytes(32).toString("hex");
  await prisma.kwaiOAuthState.create({ data: { stateHash: hashKwai(state), browserHash: hashKwai(browser), appId, appRevision: app.revision, userId, expiresAt: new Date(Date.now() + 600000) } });
  return { authUrl: kwaiAuthorizeUrl(app.appKey, state), browser };
}
export async function usableKwaiShop(shopId: string, force = false) {
  // Cross-process serialization is required because refresh rotates the old refreshToken.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "KwaiShopSetting" WHERE "id" = ${shopId} FOR UPDATE`;
    const shop = await tx.kwaiShopSetting.findUnique({ where: { id: shopId }, include: { app: true } });
    if (!shop || shop.status !== "active" || !shop.tokenCipher) throw new KwaiError("店铺尚未授权或已断开，请重新授权");
    const credentials = openKwai<KwaiCredentials>(shop.app.credentials);
    let token = openKwai<KwaiToken>(shop.tokenCipher);
    if (force || shop.tokenExpireAt.getTime() < Date.now() + 300000) {
      if (shop.refreshExpireAt.getTime() <= Date.now()) throw new KwaiError("店铺授权已过期，请重新授权");
      token = await kwaiRefresh(shop.app.appKey, credentials.appSecret, token);
      await tx.kwaiShopSetting.update({ where: { id: shop.id }, data: { tokenCipher: sealKwai(token), ...tokenDates(token), scopes: token.scopes } });
    }
    return { shop, credentials, token };
  }, { timeout: 30000, maxWait: 5000 });
}
