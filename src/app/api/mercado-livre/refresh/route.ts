import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { refreshMercadoLivreAccountToken } from "@/lib/mercado-livre-token-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = String(body.id || body.accountId || "").trim();
    if (!accountId) return NextResponse.json({ error: "缺少账号 id" }, { status: 400 });
    const account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId }, select: { id: true } });
    if (!account) return NextResponse.json({ error: "Mercado Livre 授权账号不存在" }, { status: 404 });
    const result = await refreshMercadoLivreAccountToken(accountId, { force: true });
    if (result.status === "failed") return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Mercado Livre Token 续期失败" }, { status: 502 });
  }
}
