import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isBusinessDate } from "@/lib/order-business-time";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_OPERATION_ACTION_LENGTH = 1000;

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const shopId = String(body.shopId || "").trim();
    const date = String(body.date || "").trim();
    const operationAction = String(body.operationAction || "").trim();

    if (!shopId) return NextResponse.json({ error: "请选择 TikTok 店铺" }, { status: 400 });
    if (!isBusinessDate(date)) return NextResponse.json({ error: "日期格式必须为 YYYY-MM-DD" }, { status: 400 });
    if (operationAction.length > MAX_OPERATION_ACTION_LENGTH) {
      return NextResponse.json({ error: `运营动作不能超过 ${MAX_OPERATION_ACTION_LENGTH} 个字符` }, { status: 400 });
    }

    const shop = await prisma.tikTokShopSetting.findFirst({ where: { shopId, status: "active" }, select: { shopId: true } });
    if (!shop) return NextResponse.json({ error: "未找到已授权的 TikTok 店铺" }, { status: 404 });

    if (!operationAction) {
      await prisma.tikTokDailyOperationAction.deleteMany({ where: { shopId, date } });
      return NextResponse.json({ date, operationAction: "" });
    }

    const saved = await prisma.tikTokDailyOperationAction.upsert({
      where: { shopId_date: { shopId, date } },
      create: { shopId, date, operationAction, updatedBy: auth.user.name || auth.user.email },
      update: { operationAction, updatedBy: auth.user.name || auth.user.email },
      select: { date: true, operationAction: true },
    });
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[TikTok operation action] error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "运营动作保存失败" }, { status: 500 });
  }
}
