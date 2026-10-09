import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { KWAI_CALLBACK, KwaiError, sealKwai } from "@/lib/kwai-api";
import { kwaiAdmin, kwaiSafeError, startKwaiAuthorization, KWAI_COOKIE, kwaiCookieOptions, usableKwaiShop } from "@/lib/kwai-service";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = await kwaiAdmin(request);
    if (auth.response) return auth.response;
    const apps = await prisma.kwaiAppConfig.findMany({ select: { id: true, appKey: true, appName: true }, orderBy: { createdAt: "asc" } });
    const shops = await prisma.kwaiShopSetting.findMany({ select: { id: true, merchantId: true, shopName: true, appId: true, status: true, tokenExpireAt: true, refreshExpireAt: true, scopes: true, lastReadAt: true }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ apps, shops, callback: KWAI_CALLBACK }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: kwaiSafeError(error) }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await kwaiAdmin(request, true);
    if (auth.response) return auth.response;
    const body = await request.json();
    if (body.action === "save") {
      const { appKey, appSecret, signSecret, appName } = body;
      if (![appKey, appSecret, signSecret].every((s) => typeof s === "string" && /^[a-zA-Z0-9_-]{8,256}$/.test(s)) || typeof appName !== "string" || !appName.trim() || appName.length > 100) throw new KwaiError("请完整填写应用名称和三项有效凭证");
      const credentials = sealKwai({ appSecret, signSecret });
      await prisma.kwaiAppConfig.upsert({ where: { appKey }, create: { appKey, appName: appName.trim(), credentials }, update: { appName: appName.trim(), credentials, revision: { increment: 1 } } });
      return NextResponse.json({ success: true });
    }
    if (body.action === "authorize" && typeof body.appId === "string") {
      const started = await startKwaiAuthorization(body.appId, auth.user.id);
      const response = NextResponse.json({ authUrl: started.authUrl });
      response.cookies.set(KWAI_COOKIE, started.browser, kwaiCookieOptions);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    if (body.action === "refresh" && typeof body.shopId === "string") {
      await usableKwaiShop(body.shopId, true);
      return NextResponse.json({ success: true });
    }
    if (body.action === "disconnect" && typeof body.shopId === "string") {
      await prisma.kwaiShopSetting.update({ where: { id: body.shopId }, data: { status: "disconnected", tokenCipher: "" } });
      return NextResponse.json({ success: true });
    }
    throw new KwaiError("不支持的操作");
  } catch (error) { return NextResponse.json({ error: kwaiSafeError(error) }, { status: error instanceof KwaiError ? 400 : 500 }); }
}
