import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const DEFAULT_REDIRECT_URI = "https://www.baxi8.com/api/mercadolivre/oauth/callback";

function redirectUri(value: unknown) {
  const candidate = String(value || process.env.MERCADO_LIVRE_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("redirect URI 必须使用 HTTP(S)");
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const apps = await prisma.mercadoLivreAppConfig.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      appName: true,
      clientId: true,
      redirectUri: true,
      pkceEnabled: true,
      status: true,
      createdAt: true,
      _count: { select: { accounts: true } },
    },
  });
  return NextResponse.json({
    apps: apps.map(({ _count, ...app }) => ({ ...app, accountCount: _count.accounts })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const appName = String(body.appName || "").trim();
    const clientId = String(body.clientId || body.appId || "").trim();
    const clientSecret = String(body.clientSecret || body.appSecret || "").trim();
    const callback = redirectUri(body.redirectUri);
    if (!appName || !clientId || !clientSecret || !callback) {
      return NextResponse.json({ error: "应用名称、Client ID、Client Secret 和有效回调地址均不能为空" }, { status: 400 });
    }
    const app = await prisma.mercadoLivreAppConfig.create({
      data: { appName, clientId, clientSecret, redirectUri: callback, pkceEnabled: body.pkceEnabled === true },
      select: { id: true },
    });
    return NextResponse.json({ success: true, id: app.id });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "该 Client ID 和回调地址已存在" }, { status: 409 });
    return NextResponse.json({ error: error?.message || "保存 Mercado Livre 应用失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "缺少应用 id" }, { status: 400 });
  const accountCount = await prisma.mercadoLivreAccount.count({ where: { appConfigId: id, status: "active" } });
  if (accountCount > 0) return NextResponse.json({ error: `该应用仍有 ${accountCount} 个已连接账号，请先断开授权` }, { status: 409 });
  await prisma.mercadoLivreAppConfig.update({ where: { id }, data: { status: "disabled" } });
  return NextResponse.json({ success: true });
}
