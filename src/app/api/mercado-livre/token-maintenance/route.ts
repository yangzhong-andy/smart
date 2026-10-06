import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { refreshDueMercadoLivreTokens } from "@/lib/mercado-livre-token-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function allowed(request: NextRequest) {
  const internalToken = request.headers.get("x-platform-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (internalToken && process.env.NEXTAUTH_SECRET && internalToken === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!(await allowed(request))) return NextResponse.json({ error: "没有权限执行 Mercado Livre Token 维护" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const result = await refreshDueMercadoLivreTokens({
    force: body.force === true,
    accountId: body.accountId ? String(body.accountId) : undefined,
  });
  return NextResponse.json({ success: result.failed === 0, ...result }, { status: result.failed ? 207 : 200 });
}
