import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncMercadoLivreProducts } from "@/lib/mercado-livre-product-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function canSync(request: NextRequest) {
  const token = request.headers.get("x-platform-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!(await canSync(request))) {
    return NextResponse.json({ error: "没有权限同步 Mercado Livre 商品数据" }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncMercadoLivreProducts({
      accountId: body.accountId ? String(body.accountId) : undefined,
      visitDays: body.visitDays ? Number(body.visitDays) : undefined,
    });
    return NextResponse.json(
      {
        success: result.errors.length === 0,
        ...(result.errors.length ? { error: "部分 Mercado Livre 商品数据同步失败" } : {}),
        ...result,
      },
      { status: result.errors.length ? 502 : 200 },
    );
  } catch (error) {
    console.error("[Mercado Livre Products] sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mercado Livre 商品数据同步失败" },
      { status: 500 },
    );
  }
}
