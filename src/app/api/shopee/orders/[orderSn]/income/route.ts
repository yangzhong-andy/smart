import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getShopeeEscrowDetail } from "@/lib/shopee-open-api";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";
import {
  isShopeeEscrowEligible,
  normalizeShopeeSettlement,
  SHOPEE_SETTLEMENT_PUBLIC_SELECT,
} from "@/lib/shopee-settlements";
import { syncShopeeSettlementWalletEntries } from "@/lib/shopee-wallet-settlement-sync";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Shopee 订单收入明细获取失败");
}

export async function GET(
  request: NextRequest,
  { params }: { params: { orderSn: string } },
) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const orderSn = decodeURIComponent(params.orderSn || "").trim();
  const shopId = new URL(request.url).searchParams.get("shopId")?.trim();
  if (!orderSn || !shopId) {
    return NextResponse.json({ error: "缺少 Shopee 订单号或店铺编号" }, { status: 400 });
  }

  const order = await prisma.shopeeOrder.findUnique({
    where: { shopId_orderSn: { shopId, orderSn } },
    select: {
      id: true,
      orderSn: true,
      shopSettingId: true,
      shopId: true,
      currency: true,
      status: true,
      settlement: { select: SHOPEE_SETTLEMENT_PUBLIC_SELECT },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "未找到该 Shopee 订单" }, { status: 404 });
  }

  if (!isShopeeEscrowEligible(order.status)) {
    return NextResponse.json({
      available: Boolean(order.settlement),
      settlement: order.settlement,
      source: order.settlement ? "cache" : null,
      reason: order.settlement ? null : "订单尚未进入可查询收入明细的状态",
    });
  }

  try {
    const raw = await withFreshShopeeToken(order.shopSettingId, (credentials) =>
      getShopeeEscrowDetail({ ...credentials, orderSn: order.orderSn }),
    );
    const data = normalizeShopeeSettlement(raw as Record<string, any>, order);
    const settlement = await prisma.shopeeSettlement.upsert({
      where: { shopId_orderSn: { shopId: order.shopId, orderSn: order.orderSn } },
      create: data,
      update: data,
      select: SHOPEE_SETTLEMENT_PUBLIC_SELECT,
    });
    await syncShopeeSettlementWalletEntries({
      shopSettingId: order.shopSettingId,
      orderSn: order.orderSn,
      days: 730,
    });
    return NextResponse.json({ available: true, settlement, source: "official", reason: null });
  } catch (error) {
    const message = errorMessage(error);
    if (order.settlement) {
      return NextResponse.json({
        available: true,
        settlement: order.settlement,
        source: "cache",
        reason: null,
        warning: `官方实时刷新失败，当前显示最近一次同步数据：${message}`,
      });
    }
    if (message.includes("has no order_income")) {
      return NextResponse.json({
        available: false,
        settlement: null,
        source: null,
        reason: "Shopee 尚未生成这笔订单的收入明细，请稍后再试",
      });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
