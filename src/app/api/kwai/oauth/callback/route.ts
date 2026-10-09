import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { KWAI_ORIGIN, KWAI_CALLBACK, hashKwai, kwaiExchange, openKwai, sealKwai, type KwaiCredentials } from "@/lib/kwai-api";
import { KWAI_COOKIE, kwaiCookieOptions, tokenDates } from "@/lib/kwai-service";
export const dynamic = "force-dynamic";
function finish(result: string) {
  const response = NextResponse.redirect(`${KWAI_ORIGIN}/platforms/kwai?${result}`);
  response.cookies.set(KWAI_COOKIE, "", { ...kwaiCookieOptions, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (!params.size) return NextResponse.json({ service: "Kwai OAuth callback", ready: true, callback: KWAI_CALLBACK, message: "回调接口已部署，请从 ERP 平台中心发起店铺授权；此页不代表已授权" }, { headers: { "Cache-Control": "no-store" } });
  const code = params.get("code"), state = params.get("status"), browser = request.cookies.get(KWAI_COOKIE)?.value;
  if (!code || code.length > 2048 || !state || !/^[a-f0-9]{64}$/.test(state) || !browser || !/^[a-f0-9]{64}$/.test(browser)) return finish("error=invalid_callback");
  try {
    const pending = await prisma.kwaiOAuthState.findUnique({ where: { stateHash: hashKwai(state) }, include: { app: true } });
    if (!pending || pending.browserHash !== hashKwai(browser) || pending.usedAt || pending.expiresAt <= new Date() || pending.appRevision !== pending.app.revision) return finish("error=expired_state");
    const user = await prisma.user.findUnique({ where: { id: pending.userId }, select: { isActive: true, role: true } });
    if (!user?.isActive || !["SUPER_ADMIN", "ADMIN"].includes(user.role)) return finish("error=permission_denied");
    const claim = await prisma.kwaiOAuthState.updateMany({ where: { id: pending.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claim.count !== 1) return finish("error=expired_state");
    const credentials = openKwai<KwaiCredentials>(pending.app.credentials);
    const token = await kwaiExchange(pending.app.appKey, credentials.appSecret, code);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "KwaiAppConfig" WHERE "id" = ${pending.appId} FOR UPDATE`;
      const app = await tx.kwaiAppConfig.findUnique({ where: { id: pending.appId } });
      if (app?.revision !== pending.appRevision) throw new Error("config_changed");
      const currentUser = await tx.user.findUnique({ where: { id: pending.userId }, select: { isActive: true, role: true } });
      if (!currentUser?.isActive || !["SUPER_ADMIN", "ADMIN"].includes(currentUser.role)) throw new Error("permission_changed");
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`kwai-merchant:${token.merchantId}`}))`;
      const existing = await tx.kwaiShopSetting.findUnique({ where: { merchantId: token.merchantId } });
      if (existing && existing.appId !== pending.appId) throw new Error("shop_app_conflict");
      const data = { appId: pending.appId, shopName: token.shopName, tokenCipher: sealKwai(token), ...tokenDates(token), scopes: token.scopes, status: "active" };
      if (existing) {
        await tx.kwaiShopSetting.update({ where: { id: existing.id }, data });
      } else {
        const store = await tx.store.findFirst({ where: { platform: "KWAI", accountId: token.merchantId } }) || await tx.store.create({ data: { platform: "KWAI", name: token.shopName, accountId: token.merchantId, accountName: token.shopName, country: "BR", currency: "BRL" } });
        await tx.kwaiShopSetting.create({ data: { ...data, merchantId: token.merchantId, storeId: store.id } });
      }
    });
    await clearCacheByPrefix("stores");
    return finish("success=1");
  } catch {
    // Never log upstream errors, authorization codes or token responses.
    return finish("error=authorization_failed");
  }
}
