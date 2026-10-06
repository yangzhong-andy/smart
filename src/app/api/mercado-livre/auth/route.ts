import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { getMercadoLivreAuthorizationUrl } from "@/lib/mercado-livre-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const appId = new URL(request.url).searchParams.get("appId")?.trim();
  const app = appId
    ? await prisma.mercadoLivreAppConfig.findUnique({ where: { id: appId } })
    : await prisma.mercadoLivreAppConfig.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
  if (!app || app.status !== "active") return NextResponse.json({ error: "请先配置 Mercado Livre 应用" }, { status: 400 });

  const state = randomUUID().replace(/-/g, "");
  const codeVerifier = app.pkceEnabled ? randomBytes(48).toString("base64url") : null;
  const codeChallenge = codeVerifier
    ? createHash("sha256").update(codeVerifier).digest("base64url")
    : undefined;
  await prisma.mercadoLivreOAuthState.create({
    data: { state, appConfigId: app.id, codeVerifier, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  return NextResponse.json({
    authUrl: getMercadoLivreAuthorizationUrl({ clientId: app.clientId, redirectUri: app.redirectUri, state, codeChallenge }),
    appName: app.appName,
  });
}
