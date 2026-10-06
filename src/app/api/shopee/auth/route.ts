import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { getShopeeAuthUrl, type ShopeeEnvironment } from "@/lib/shopee-open-api";

export const dynamic = "force-dynamic";

function redirectUri(app: { environment: string; testRedirectDomain: string | null; liveRedirectDomain: string | null }) {
  const configured = app.environment === "live" ? app.liveRedirectDomain : app.testRedirectDomain;
  const envConfigured = app.environment === "live" ? process.env.SHOPEE_LIVE_REDIRECT_URI : process.env.SHOPEE_TEST_REDIRECT_URI;
  const base = configured || envConfigured || "https://www.baxi8.com";
  if (base.includes("/api/shopee/oauth/callback")) return base;
  return `${base.replace(/\/+$/, "")}/api/shopee/oauth/callback`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const appId = params.get("appId");
  const app = appId
    ? await prisma.shopeeAppConfig.findUnique({ where: { id: appId } })
    : await prisma.shopeeAppConfig.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
  if (!app) return NextResponse.json({ error: "请先配置 Shopee App" }, { status: 400 });
  const state = randomUUID().replace(/-/g, "");
  await prisma.shopeeOAuthState.create({ data: { state, appConfigId: app.id, environment: app.environment, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  return NextResponse.json({ authUrl: getShopeeAuthUrl(app.environment as ShopeeEnvironment, app.partnerId, redirectUri(app), state), environment: app.environment });
}
