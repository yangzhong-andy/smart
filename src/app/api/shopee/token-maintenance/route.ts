import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { refreshDueShopeeTokens } from "@/lib/shopee-token-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function canRunMaintenance(request: NextRequest) {
  const internalToken = request.headers.get("x-monthly-bill-sync-token");
  if (
    internalToken &&
    process.env.NEXTAUTH_SECRET &&
    internalToken === process.env.NEXTAUTH_SECRET
  ) {
    return true;
  }
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!(await canRunMaintenance(request))) {
    return NextResponse.json({ error: "没有权限执行 Shopee Token 维护" }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const result = await refreshDueShopeeTokens({
      force: body.force === true,
      shopId: body.shopId ? String(body.shopId) : undefined,
      trigger: body.force === true ? "manual" : "scheduled",
    });
    return NextResponse.json({ success: result.failed === 0, ...result });
  } catch (error) {
    console.error("[Shopee Token] maintenance failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Shopee Token 维护失败" },
      { status: 500 },
    );
  }
}
