import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function integer(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  const connections = await prisma.qianchuanConnection.findMany({
    include: {
      adAccount: {
        select: { id: true, accountName: true, accountId: true, currency: true, storeIds: true, agency: { select: { id: true, name: true, platform: true } } },
      },
      _count: { select: { dailyMetrics: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    data: connections.map((connection) => ({
      ...connection,
      dailyMetricCount: connection._count.dailyMetrics,
      _count: undefined,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const adAccountId = String(body.adAccountId || "").trim();
    const name = String(body.name || "").trim();
    if (!adAccountId || !name) return NextResponse.json({ error: "连接名称和系统广告账户不能为空" }, { status: 400 });
    const account = await prisma.adAccount.findUnique({ where: { id: adAccountId }, select: { id: true, currency: true } });
    if (!account) return NextResponse.json({ error: "系统广告账户不存在" }, { status: 404 });
    const existing = await prisma.qianchuanConnection.findUnique({ where: { adAccountId } });
    if (existing) return NextResponse.json({ error: "该系统广告账户已经绑定千川连接" }, { status: 409 });
    const connection = await prisma.qianchuanConnection.create({
      data: {
        name,
        adAccountId,
        externalUserIds: stringList(body.externalUserIds),
        externalGroupIds: stringList(body.externalGroupIds),
        categoryId: integer(body.categoryId, 0),
        reportType: integer(body.reportType, 1),
        currency: String(body.currency || account.currency || "CNY").trim().toUpperCase(),
        enabled: body.enabled !== false,
      },
    });
    return NextResponse.json({ data: connection }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建千川连接失败" }, { status: 500 });
  }
}
