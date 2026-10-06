import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MAX_OPERATION_ACTION_LENGTH = 1000;

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const shopId = String(body.shopId || "").trim();
  const date = String(body.date || "").trim();
  const operationAction = String(body.operationAction || "").trim();

  if (!shopId) return NextResponse.json({ error: "请选择 Shopee 店铺" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "日期格式必须为 YYYY-MM-DD" }, { status: 400 });
  }
  if (operationAction.length > MAX_OPERATION_ACTION_LENGTH) {
    return NextResponse.json({ error: `运营动作不能超过 ${MAX_OPERATION_ACTION_LENGTH} 个字符` }, { status: 400 });
  }

  const shop = await prisma.shopeeShopSetting.findFirst({
    where: { shopId, status: "active", appConfig: { status: "active" } },
    select: { id: true },
  });
  if (!shop) return NextResponse.json({ error: "未找到已授权的 Shopee 店铺" }, { status: 404 });

  if (!operationAction) {
    await prisma.shopeeDailyOperationAction.deleteMany({
      where: { shopSettingId: shop.id, date },
    });
    return NextResponse.json({ date, operationAction: "" });
  }

  const saved = await prisma.shopeeDailyOperationAction.upsert({
    where: { shopSettingId_date: { shopSettingId: shop.id, date } },
    create: {
      shopSettingId: shop.id,
      date,
      operationAction,
      updatedBy: auth.user.name || auth.user.email,
    },
    update: {
      operationAction,
      updatedBy: auth.user.name || auth.user.email,
    },
    select: { date: true, operationAction: true },
  });

  return NextResponse.json(saved);
}
