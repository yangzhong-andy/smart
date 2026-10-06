import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const accounts = await prisma.mercadoLivreAccount.findMany({
    include: {
      appConfig: { select: { appName: true, clientId: true, redirectUri: true } },
      store: { select: { id: true, name: true, country: true, currency: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    accounts: accounts.map((account) => ({
      id: account.id,
      userId: account.userId,
      nickname: account.nickname,
      siteId: account.siteId,
      country: account.country,
      currency: account.currency,
      scope: account.scope,
      status: account.status,
      tokenExpireAt: account.tokenExpireAt,
      tokenRefreshedAt: account.tokenRefreshedAt,
      tokenRefreshFailedAt: account.tokenRefreshFailedAt,
      tokenRefreshFailureCount: account.tokenRefreshFailureCount,
      tokenRefreshError: account.tokenRefreshError,
      lastSyncAt: account.lastSyncAt,
      store: account.store,
      app: account.appConfig,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const id = params.get("id")?.trim();
  const userId = params.get("userId")?.trim();
  if (!id && !userId) return NextResponse.json({ error: "缺少账号 id" }, { status: 400 });
  await prisma.mercadoLivreAccount.updateMany({
    where: id ? { id } : { userId: userId! },
    data: { status: "disconnected", accessToken: null, refreshToken: null, tokenExpireAt: null },
  });
  return NextResponse.json({ success: true });
}
