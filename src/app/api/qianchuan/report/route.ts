import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isBusinessDate } from "@/lib/order-business-time";
import { getQianchuanAdvertTotal, normalizeQianchuanAdvertTotal } from "@/lib/qianchuan-api";

export const dynamic = "force-dynamic";

function ids(value: unknown): Array<string | number> {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || "");
    if (!isBusinessDate(startDate) || !isBusinessDate(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
    }
    const connection = body.connectionId
      ? await prisma.qianchuanConnection.findUnique({ where: { id: String(body.connectionId) } })
      : null;
    if (body.connectionId && !connection) return NextResponse.json({ error: "千川连接不存在" }, { status: 404 });
    const response = await getQianchuanAdvertTotal({
      startDate,
      endDate,
      groupIds: connection?.externalGroupIds || ids(body.groupIds),
      userIds: connection?.externalUserIds || ids(body.userIds),
      type: connection?.reportType ?? Number(body.type || 1),
      categoryId: connection?.categoryId ?? Number(body.categoryId || 0),
    });
    return NextResponse.json({ data: response.data ?? response, dailyMetrics: normalizeQianchuanAdvertTotal(response, startDate, endDate) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "获取千川广告汇总失败" }, { status: 502 });
  }
}
