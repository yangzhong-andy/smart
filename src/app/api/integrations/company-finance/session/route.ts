import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { canReadCompanyReports } from "@/lib/company-reports";

export const dynamic = "force-dynamic";

/** Lightweight current-user introspection for the independent finance app.
 * No report calculation, session token exposure or caller-controlled identity. */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const headers = { "Cache-Control": "private, no-store" };
  if (!canReadCompanyReports(auth.user)) return NextResponse.json({ error: "仅管理员及财务中心人员可查看报表" }, { status: 403, headers });
  return NextResponse.json({ user: { id: `erp:${auth.user.id}`, canReadCompanyReports: true } }, { headers });
}
