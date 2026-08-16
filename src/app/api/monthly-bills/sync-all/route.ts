import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { syncAllMonthlyBills } from "@/lib/auto-generate-bills";

export const dynamic = "force-dynamic";

async function canRunSync(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (role === "ADMIN" || role === "MANAGER") return true;

  // The server timer runs locally and authenticates with the app secret. It is
  // never exposed to the browser or returned in the response.
  const internalToken = request.headers.get("x-monthly-bill-sync-token");
  return Boolean(
    internalToken &&
      process.env.NEXTAUTH_SECRET &&
      internalToken === process.env.NEXTAUTH_SECRET,
  );
}

export async function POST(request: NextRequest) {
  if (!(await canRunSync(request))) {
    return NextResponse.json({ error: "没有权限执行月账单补账" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncAllMonthlyBills(
      Array.isArray(body.months) ? body.months.map(String) : undefined,
    );
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("[monthly-bills/sync-all] failed:", error);
    return NextResponse.json(
      { error: error?.message || "月账单补账失败" },
      { status: 500 },
    );
  }
}
