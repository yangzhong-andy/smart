import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_OPERATION_ACTION_LENGTH = 1000;

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();
  const date = String(body.date || "").trim();
  const operationAction = String(body.operationAction || "").trim();
  if (!accountId) return NextResponse.json({ error: "请选择 Mercado Livre 店铺" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "日期格式必须为 YYYY-MM-DD" }, { status: 400 });
  }
  if (operationAction.length > MAX_OPERATION_ACTION_LENGTH) {
    return NextResponse.json({ error: `运营动作不能超过 ${MAX_OPERATION_ACTION_LENGTH} 个字符` }, { status: 400 });
  }

  const account = await prisma.mercadoLivreAccount.findFirst({
    where: { id: accountId, status: "active", appConfig: { status: "active" } },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "未找到已授权的 Mercado Livre 店铺" }, { status: 404 });

  if (!operationAction) {
    await prisma.mercadoLivreDailyOperationAction.deleteMany({ where: { accountId, date } });
    return NextResponse.json({ date, operationAction: "" });
  }
  const saved = await prisma.mercadoLivreDailyOperationAction.upsert({
    where: { accountId_date: { accountId, date } },
    create: { accountId, date, operationAction, updatedBy: auth.user.name || auth.user.email },
    update: { operationAction, updatedBy: auth.user.name || auth.user.email },
    select: { date: true, operationAction: true },
  });
  return NextResponse.json(saved);
}
