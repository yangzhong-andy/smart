import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTransactionsByStatement, refreshAccessToken } from "@/lib/tiktok-shop-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/tiktok/all-transactions?shopId=xxx&days=30
 * 获取所有结算单的订单交易明细（按订单维度汇总）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const days = parseInt(searchParams.get("days") || "30");

    if (!shopId) return NextResponse.json({ error: "缺少 shopId" }, { status: 400 });

    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
    if (!shop || !shop.accessToken || !shop.shopCipher) {
      return NextResponse.json({ error: "店铺未授权" }, { status: 400 });
    }

    const appConfig = shop.appKey ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } }) : null;
    const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";

    // 刷新 token
    let accessToken = shop.accessToken;
    if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
      const refreshed = await refreshAccessToken(shop.refreshToken!, appKey, appSecret);
      accessToken = refreshed.accessToken;
      await prisma.tikTokShopSetting.update({
        where: { shopId },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
        },
      });
    }

    // 获取最近的结算单列表
    const now = Math.floor(Date.now() / 1000);
    const past = now - days * 86400;
    const statements = await prisma.tikTokStatement.findMany({
      where: {
        shopId,
        statementTime: { gte: new Date(past * 1000) },
      },
      orderBy: { statementTime: "desc" },
      select: { statementId: true, statementTime: true, currency: true },
    });

    console.log(`[TikTok AllTxns] 店铺 ${shopId}: ${statements.length} 个结算单`);

    // 遍历每个结算单获取交易明细
    const allOrders: any[] = [];
    for (const stmt of statements) {
      try {
        let pageToken: string | undefined = undefined;
        let pageCount = 0;
        while (pageCount < 10) {
          pageCount++;
          const data = await getTransactionsByStatement(accessToken, shop.shopCipher, appKey, appSecret, stmt.statementId, {
            page_size: 100,
            page_token: pageToken,
          });

          const txns = data.transactions || [];
          for (const t of txns) {
            allOrders.push({
              orderId: t.order_id || "",
              orderCreateTime: t.order_create_time ? new Date(t.order_create_time * 1000).toISOString() : null,
              statementId: stmt.statementId,
              statementDate: stmt.statementTime?.toISOString() || null,
              revenueAmount: t.revenue_amount || "0",
              feeTaxAmount: t.fee_tax_amount || "0",
              shippingCostAmount: t.shipping_cost_amount || "0",
              adjustmentAmount: t.adjustment_amount || "0",
              settlementAmount: t.settlement_amount || "0",
              currency: stmt.currency || "BRL",
            });
          }

          pageToken = data.next_page_token;
          if (!pageToken) break;
        }
      } catch (e: any) {
        console.error(`[TikTok AllTxns] 结算单 ${stmt.statementId} 失败:`, e.message);
      }
    }

    // 按订单创建时间倒序
    allOrders.sort((a, b) => {
      const ta = a.orderCreateTime ? new Date(a.orderCreateTime).getTime() : 0;
      const tb = b.orderCreateTime ? new Date(b.orderCreateTime).getTime() : 0;
      return tb - ta;
    });

    console.log(`[TikTok AllTxns] 总计 ${allOrders.length} 笔订单交易`);

    return NextResponse.json({
      success: true,
      orders: allOrders,
      count: allOrders.length,
    });
  } catch (error: any) {
    console.error("[TikTok AllTxns] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
