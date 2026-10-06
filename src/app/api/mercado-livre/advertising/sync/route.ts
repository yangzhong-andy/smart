import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncMercadoLivreAdvertising } from "@/lib/mercado-livre-advertising";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function canSync(request: NextRequest) {
  const token = request.headers.get("x-platform-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!(await canSync(request))) return NextResponse.json({ error: "没有权限同步 Mercado Ads 广告数据" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncMercadoLivreAdvertising({
      accountId: body.accountId ? String(body.accountId) : undefined,
      startDate: body.startDate ? String(body.startDate) : undefined,
      endDate: body.endDate ? String(body.endDate) : undefined,
      days: body.days ? Number(body.days) : undefined,
    });
    return NextResponse.json(
      { success: result.errors.length === 0, ...(result.errors.length ? { error: "部分 Mercado Ads 数据同步失败" } : {}), ...result },
      { status: result.errors.length ? 502 : 200 },
    );
  } catch (error) {
    console.error("[Mercado Ads] sync failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mercado Ads 数据同步失败" }, { status: 500 });
  }
}

