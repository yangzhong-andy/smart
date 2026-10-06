import { prisma } from "@/lib/prisma";
import { refreshMercadoLivreToken } from "@/lib/mercado-livre-api";

export const MERCADO_LIVRE_TOKEN_REFRESH_LEAD_MS = 60 * 60 * 1000;

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Token 续期失败"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function refreshMercadoLivreAccountToken(accountId: string, options?: { force?: boolean }) {
  const account = await prisma.mercadoLivreAccount.findUnique({
    where: { id: accountId },
    include: { appConfig: true },
  });
  if (!account) return { status: "failed" as const, error: "Mercado Livre 授权账号不存在" };
  if (account.status !== "active" && !options?.force) return { status: "skipped" as const, reason: "inactive" };
  const dueAt = new Date(Date.now() + MERCADO_LIVRE_TOKEN_REFRESH_LEAD_MS);
  if (!options?.force && account.accessToken && account.tokenExpireAt && account.tokenExpireAt > dueAt) {
    return { status: "skipped" as const, reason: "not_due", tokenExpireAt: account.tokenExpireAt };
  }
  if (!account.refreshToken) {
    const error = "没有可用的 Refresh Token，请重新授权";
    await prisma.mercadoLivreAccount.update({
      where: { id: account.id },
      data: { status: "expired", tokenRefreshFailedAt: new Date(), tokenRefreshFailureCount: { increment: 1 }, tokenRefreshError: error },
    });
    return { status: "failed" as const, error };
  }

  try {
    const token = await refreshMercadoLivreToken({
      clientId: account.appConfig.clientId,
      clientSecret: account.appConfig.clientSecret,
      refreshToken: account.refreshToken,
    });
    if (!token.access_token) throw new Error("Mercado Livre 返回的 Access Token 为空");
    const tokenExpireAt = Number(token.expires_in) > 0
      ? new Date(Date.now() + Number(token.expires_in) * 1000)
      : null;
    await prisma.mercadoLivreAccount.update({
      where: { id: account.id },
      data: {
        accessToken: token.access_token,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        tokenExpireAt,
        tokenRefreshedAt: new Date(),
        tokenRefreshFailedAt: null,
        tokenRefreshFailureCount: 0,
        tokenRefreshError: null,
        status: "active",
      },
    });
    return { status: "refreshed" as const, tokenExpireAt };
  } catch (error) {
    const message = errorMessage(error);
    await prisma.mercadoLivreAccount.update({
      where: { id: account.id },
      data: {
        status: "expired",
        tokenRefreshFailedAt: new Date(),
        tokenRefreshFailureCount: { increment: 1 },
        tokenRefreshError: message,
      },
    });
    return { status: "failed" as const, error: message };
  }
}

export async function refreshDueMercadoLivreTokens(options?: { force?: boolean; accountId?: string }) {
  const where = options?.accountId
    ? { id: options.accountId }
    : options?.force
      ? { status: { in: ["active", "expired"] } }
      : {
          status: "active",
          OR: [
            { accessToken: null },
            { tokenExpireAt: null },
            { tokenExpireAt: { lte: new Date(Date.now() + MERCADO_LIVRE_TOKEN_REFRESH_LEAD_MS) } },
          ],
        };
  const accounts = await prisma.mercadoLivreAccount.findMany({ where, select: { id: true, userId: true } });
  const results = [];
  for (const account of accounts) {
    results.push({ accountId: account.id, userId: account.userId, ...(await refreshMercadoLivreAccountToken(account.id, { force: options?.force })) });
  }
  return {
    selected: accounts.length,
    refreshed: results.filter((result) => result.status === "refreshed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}

export async function withFreshMercadoLivreToken<T>(accountId: string, call: (accessToken: string) => Promise<T>) {
  const refresh = await refreshMercadoLivreAccountToken(accountId);
  if (refresh.status === "failed") throw new Error(refresh.error);
  let account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId }, select: { accessToken: true } });
  if (!account?.accessToken) throw new Error("Mercado Livre Access Token 不可用，请重新授权");
  try {
    return await call(account.accessToken);
  } catch (error: any) {
    if (Number(error?.status) !== 401) throw error;
    const forced = await refreshMercadoLivreAccountToken(accountId, { force: true });
    if (forced.status === "failed") throw new Error(forced.error);
    account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId }, select: { accessToken: true } });
    if (!account?.accessToken) throw new Error("Mercado Livre Access Token 续期后仍不可用");
    return call(account.accessToken);
  }
}
