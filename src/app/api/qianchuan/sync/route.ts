import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncQianchuanAdvertising } from "@/lib/qianchuan-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function canSync(request: NextRequest) {
  const token = request.headers.get("x-platform-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!(await canSync(request))) return NextResponse.json({ error: "没有权限同步千川广告数据" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncQianchuanAdvertising({
      connectionId: body.connectionId ? String(body.connectionId) : undefined,
      startDate: body.startDate ? String(body.startDate) : undefined,
      endDate: body.endDate ? String(body.endDate) : undefined,
      days: body.days === undefined ? undefined : Number(body.days),
    });
    const partialFailure = result.errors.length > 0 || Boolean(result.billSyncError);
    return NextResponse.json({
      success: !partialFailure,
      ...(partialFailure ? { error: "部分千川广告数据或月账单同步失败" } : {}),
      ...result,
    }, { status: result.errors.length ? 502 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "千川广告数据同步失败" }, { status: 500 });
  }
}
