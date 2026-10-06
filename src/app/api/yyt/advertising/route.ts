import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncYytAdvertising } from "@/lib/yyt-advertising-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function canSync(request: NextRequest) {
  const token = request.headers.get("x-platform-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  const today = new Date().toISOString().slice(0, 10);
  const startDate = request.nextUrl.searchParams.get("startDate") || addDays(today, -6);
  const endDate = request.nextUrl.searchParams.get("endDate") || today;
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
  }
  const rows = await prisma.yytAdvertisingDaily.findMany({
    where: {
      date: {
        gte: new Date(`${startDate}T00:00:00.000Z`),
        lt: new Date(`${addDays(endDate, 1)}T00:00:00.000Z`),
      },
    },
    orderBy: [{ date: "desc" }, { cost: "desc" }, { advertiserName: "asc" }],
  });
  const data = rows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    advertiserId: row.advertiserId,
    advertiserName: row.advertiserName,
    currency: row.currency,
    cost: Number(row.cost),
    orders: row.orders,
    grossRevenue: Number(row.grossRevenue),
    costPerOrder: Number(row.costPerOrder),
    roi: Number(row.roi),
    productImpressions: row.productImpressions,
    productClicks: row.productClicks,
    adConversion: row.adConversion,
    adConversionRate: Number(row.adConversionRate),
    itemNum: row.itemNum,
    relationName: row.relationName,
    syncedAt: row.syncedAt.toISOString(),
  }));
  const summary = data.reduce((sum, row) => ({
    cost: sum.cost + row.cost,
    orders: sum.orders + row.orders,
    grossRevenue: sum.grossRevenue + row.grossRevenue,
    productImpressions: sum.productImpressions + row.productImpressions,
    productClicks: sum.productClicks + row.productClicks,
    adConversion: sum.adConversion + row.adConversion,
  }), { cost: 0, orders: 0, grossRevenue: 0, productImpressions: 0, productClicks: 0, adConversion: 0 });
  return NextResponse.json({ data, summary, startDate, endDate });
}

export async function POST(request: NextRequest) {
  if (!(await canSync(request))) return NextResponse.json({ error: "没有权限同步 YYT 广告数据" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncYytAdvertising({
      startDate: body.startDate ? String(body.startDate) : undefined,
      endDate: body.endDate ? String(body.endDate) : undefined,
      days: body.days === undefined ? undefined : Number(body.days),
    });
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "YYT 广告数据同步失败" }, { status: 500 });
  }
}
