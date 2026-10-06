import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function stringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("广告户或分组 ID 必须是数组");
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("报表类型或类目 ID 必须是整数");
  return parsed;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;
  try {
    const existing = await prisma.qianchuanConnection.findUnique({
      where: { id: params.id },
      include: { _count: { select: { dailyMetrics: true } } },
    });
    if (!existing) return NextResponse.json({ error: "千川连接不存在" }, { status: 404 });
    const body = await request.json();
    const requestedAdAccountId = body.adAccountId === undefined ? undefined : String(body.adAccountId).trim();
    if (requestedAdAccountId && requestedAdAccountId !== existing.adAccountId && existing._count.dailyMetrics > 0) {
      return NextResponse.json({ error: "该连接已有同步数据，不能直接更换系统广告账户；请停用后新建连接" }, { status: 409 });
    }
    if (requestedAdAccountId) {
      const account = await prisma.adAccount.findUnique({ where: { id: requestedAdAccountId }, select: { id: true } });
      if (!account) return NextResponse.json({ error: "系统广告账户不存在" }, { status: 404 });
    }
    const name = body.name === undefined ? undefined : String(body.name).trim();
    if (name === "") return NextResponse.json({ error: "连接名称不能为空" }, { status: 400 });
    const currency = body.currency === undefined ? undefined : String(body.currency).trim().toUpperCase();
    if (currency === "") return NextResponse.json({ error: "币种不能为空" }, { status: 400 });
    const connection = await prisma.qianchuanConnection.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(requestedAdAccountId ? { adAccountId: requestedAdAccountId } : {}),
        ...(body.externalUserIds !== undefined ? { externalUserIds: stringList(body.externalUserIds) } : {}),
        ...(body.externalGroupIds !== undefined ? { externalGroupIds: stringList(body.externalGroupIds) } : {}),
        ...(body.categoryId !== undefined ? { categoryId: optionalInteger(body.categoryId) } : {}),
        ...(body.reportType !== undefined ? { reportType: optionalInteger(body.reportType) } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      },
    });
    return NextResponse.json({ data: connection });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新千川连接失败" }, { status: 500 });
  }
}
