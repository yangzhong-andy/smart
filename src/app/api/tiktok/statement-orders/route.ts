import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/statement-orders?date=2026-07-26&shopId=xxx
 * 查询某一天的订单明细（关联结算明细）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date"); // 2026-07-26
    const shopId = searchParams.get("shopId");

    if (!date) return NextResponse.json({ error: "缺少 date 参数" }, { status: 400 });

    // 当天时间范围（巴西时区 UTC-3，所以用 UTC 03:00 ~ 次日 03:00）
    // date 是巴西日期，转成 UTC 范围
    const [year, month, day] = date.split("-").map(Number);
    const startUtc = new Date(Date.UTC(year, month - 1, day, 3, 0, 0)); // 巴西 00:00 = UTC 03:00
    const endUtc = new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0));

    const where: any = {
      createTime: { gte: startUtc, lt: endUtc },
      status: { notIn: ["CANCELLED", "UNPAID"] },
    };
    if (shopId) where.shopId = shopId;

    const orders = await prisma.tikTokOrder.findMany({
      where,
      orderBy: { createTime: "desc" },
      select: {
        orderId: true,
        status: true,
        totalAmount: true,
        createTime: true,
        rawData: true,
      },
    });

    // 提取订单摘要
    const result = orders.map(o => {
      const raw = o.rawData as any;
      const items = raw?.line_items || [];
      const firstName = (raw?.recipient_address?.first_name || "").trim();
      const lastName = (raw?.recipient_address?.last_name || "").trim();
      let buyerName = [firstName, lastName].filter(Boolean).join(" ");
      if (!buyerName) buyerName = raw?.cpf_name || "";

      return {
        orderId: o.orderId,
        status: o.status,
        amount: o.totalAmount,
        currency: raw?.payment?.currency || "BRL",
        buyerName: buyerName || "-",
        sku: items[0]?.seller_sku || "-",
        itemQty: items.length,
        paymentMethod: raw?.payment_method_name || "-",
        createTime: o.createTime,
      };
    });

    // 汇总
    const totalAmount = result.reduce((sum, o) => sum + parseFloat(o.amount || "0"), 0);

    return NextResponse.json({
      date,
      orderCount: result.length,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      orders: result,
    });
  } catch (error: any) {
    console.error("[TikTok Statement Orders] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
