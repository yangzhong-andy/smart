import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { canReadCompanyReports, validateReportPeriod, type CompanyReportResponse } from "@/lib/company-reports";
import { loadCompanyReports } from "@/lib/company-report-loader";

export const dynamic = "force-dynamic";
const state = globalThis as typeof globalThis & {
  __companyReports?: {
    active?: { key: string; promise: Promise<CompanyReportResponse> };
    cache: Map<string, { expiresAt: number; value: CompanyReportResponse }>;
  };
};

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  if (!canReadCompanyReports(auth.user)) return NextResponse.json({ error: "公司级财务分析仅限管理员及财务中心人员查看" }, { status: 403 });
  const start = request.nextUrl.searchParams.get("startDate") || "";
  const end = request.nextUrl.searchParams.get("endDate") || "";
  try { validateReportPeriod(start, end); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }

  const runtime: NonNullable<typeof state.__companyReports> = state.__companyReports ||= { cache: new Map() };
  const key = `${start}:${end}`;
  for (const [entryKey, entry] of runtime.cache) if (entry.expiresAt <= Date.now()) runtime.cache.delete(entryKey);
  const cached = runtime.cache.get(key);
  const headers = { "Cache-Control": "private, no-store", "X-Report-Source": "SYSTEM_ONLY" };
  if (cached) return NextResponse.json(cached.value, { headers: { ...headers, "X-Report-Cache": "HIT" } });
  if (runtime.active && runtime.active.key !== key) return NextResponse.json({ error: "财务报表正在计算中，请稍后重试；为保护业务系统不并行全量核算" }, { status: 429, headers: { "Retry-After": "30" } });
  try {
    if (!runtime.active) {
      const promise = loadCompanyReports(request, start, end);
      runtime.active = { key, promise };
      // One calculation per runtime, two small compact results, no order payload cache.
      void promise.then((value) => {
        if (JSON.stringify(value).length <= 1_000_000) {
          while (runtime.cache.size >= 2) runtime.cache.delete(runtime.cache.keys().next().value!);
          runtime.cache.set(key, { expiresAt: Date.now() + 120_000, value });
        }
      }).catch(() => {}).finally(() => { runtime.active = undefined; });
    }
    return NextResponse.json(await runtime.active.promise, { headers: { ...headers, "X-Report-Cache": "MISS" } });
  } catch (error) {
    console.error("[company-reports]", error);
    return NextResponse.json({ error: "财务报表读取失败，请检查数据库连接或缩短期间后重试；未修改业务数据" }, { status: 503, headers });
  }
}
