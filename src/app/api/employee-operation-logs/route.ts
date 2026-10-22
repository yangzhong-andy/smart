import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/api-auth";
import { AUDITED_MODULES } from "@/lib/employee-operation-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(["SUCCESS", "REJECTED", "ERROR"]);

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Math.min(100000, Number(params.get("page")) || 1));
  const pageSize = Math.max(1, Math.min(100, Number(params.get("pageSize")) || 30));
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  if ((from && !DATE.test(from)) || (to && !DATE.test(to)) || (from && to && from > to)) {
    return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
  }
  const fromDate = from ? new Date(`${from}T00:00:00+08:00`) : null;
  const toDate = to ? new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000) : null;
  if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) {
    return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
  }
  const moduleKey = params.get("module") || "";
  const status = params.get("status") || "";
  const actor = (params.get("actor") || "").trim().slice(0, 100);
  if (moduleKey && !(moduleKey in AUDITED_MODULES)) {
    return NextResponse.json({ error: "模块无效" }, { status: 400 });
  }
  if (status && !STATUSES.has(status)) {
    return NextResponse.json({ error: "结果无效" }, { status: 400 });
  }

  const where: Prisma.EmployeeOperationLogWhereInput = {
    ...(fromDate || toDate ? { occurredAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } } : {}),
    ...(moduleKey ? { module: moduleKey } : {}),
    ...(status ? { status } : {}),
    ...(actor ? { OR: [
      { actorName: { contains: actor, mode: "insensitive" } },
      { actorEmail: { contains: actor, mode: "insensitive" } },
    ] } : {}),
  };
  try {
    const [rows, total] = await prisma.$transaction([
      prisma.employeeOperationLog.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.employeeOperationLog.count({ where }),
    ]);
    return NextResponse.json({ rows, total, page, pageSize, modules: AUDITED_MODULES });
  } catch (error) {
    console.error("[employee-operation-audit] query failed", error);
    return NextResponse.json({ error: "操作日志读取失败" }, { status: 500 });
  }
}
