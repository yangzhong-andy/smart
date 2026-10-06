import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { addBusinessDays, isBusinessDate } from "@/lib/order-business-time";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  const params = request.nextUrl.searchParams;
  const connectionId = params.get("connectionId") || undefined;
  const startDate = params.get("startDate") || undefined;
  const endDate = params.get("endDate") || undefined;
  if ((startDate && !isBusinessDate(startDate)) || (endDate && !isBusinessDate(endDate)) || (startDate && endDate && startDate > endDate)) {
    return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
  }
  const rows = await prisma.qianchuanDailyMetric.findMany({
    where: {
      ...(connectionId ? { connectionId } : {}),
      ...((startDate || endDate) ? {
        date: {
          ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
          ...(endDate ? { lt: new Date(`${addBusinessDays(endDate, 1)}T00:00:00.000Z`) } : {}),
        },
      } : {}),
    },
    include: { connection: { select: { name: true, currency: true, adAccountId: true } } },
    orderBy: [{ date: "desc" }, { connectionId: "asc" }],
  });
  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      connectionId: row.connectionId,
      connectionName: row.connection.name,
      adAccountId: row.connection.adAccountId,
      currency: row.connection.currency,
      date: row.date.toISOString().slice(0, 10),
      spend: row.spend === null ? null : Number(row.spend),
      conversions: row.conversions,
      attributedRevenue: row.attributedRevenue === null ? null : Number(row.attributedRevenue),
      roi: row.roi === null ? null : Number(row.roi),
      adCount: row.adCount,
      syncedAt: row.syncedAt.toISOString(),
    })),
  });
}
