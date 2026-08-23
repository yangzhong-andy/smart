import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTransactionsByStatement, refreshAccessToken } from "@/lib/tiktok-shop-api";
import { decryptTikTokSecret, encryptTikTokSecret } from "@/lib/tiktok-secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/tiktok/statement-transactions?statementId=xxx&shopId=xxx
 * 获取某个结算单的所有订单交易明细
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statementId = searchParams.get("statementId");
    const shopId = searchParams.get("shopId");

    if (!statementId || !shopId) {
      return NextResponse.json({ error: "缺少 statementId 或 shopId" }, { status: 400 });
    }

    // 获取店铺信息
    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
    if (!shop || !shop.accessToken || !shop.shopCipher) {
      return NextResponse.json({ error: "店铺未授权" }, { status: 400 });
    }

    // 获取 App 配置
    const appConfig = shop.appKey ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } }) : null;
    const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const appSecret = decryptTikTokSecret(appConfig?.appSecret) || process.env.TIKTOK_APP_SECRET || "";

    // 刷新 token
    let accessToken = decryptTikTokSecret(shop.accessToken)!;
    if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
      const refreshed = await refreshAccessToken(decryptTikTokSecret(shop.refreshToken)!, appKey, appSecret);
      accessToken = refreshed.accessToken;
      await prisma.tikTokShopSetting.update({
        where: { shopId },
        data: {
          accessToken: encryptTikTokSecret(refreshed.accessToken),
          refreshToken: encryptTikTokSecret(refreshed.refreshToken),
          tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
        },
      });
    }

    // 获取结算单交易明细（翻页拉取全部）
    let allTransactions: any[] = [];
    let pageToken: string | undefined = undefined;
    let summary: any = null;
    let pageCount = 0;

    while (pageCount < 20) {
      pageCount++;
      const data = await getTransactionsByStatement(accessToken, shop.shopCipher, appKey, appSecret, statementId, {
        page_size: 100,
        page_token: pageToken,
      });

      if (!summary) {
        summary = {
          totalCount: data.total_count,
          currency: data.currency,
          payableAmount: data.payable_amount,
          totalSettlementAmount: data.total_settlement_amount,
          totalReserveAmount: data.total_reserve_amount,
          status: data.status,
          breakdown: data.total_settlement_breakdown,
        };
      }

      const txns = data.transactions || [];
      if (txns.length === 0) break;
      allTransactions = allTransactions.concat(txns);

      pageToken = data.next_page_token;
      if (!pageToken) break;
    }

    // 简化交易数据
    const simplified = allTransactions.map((t: any) => ({
      orderId: t.order_id || "",
      orderCreateTime: t.order_create_time ? new Date(t.order_create_time * 1000).toISOString() : null,
      revenueAmount: t.revenue_amount || "0",
      feeTaxAmount: t.fee_tax_amount || "0",
      adjustmentAmount: t.adjustment_amount || "0",
      shippingCostAmount: t.shipping_cost_amount || "0",
      settlementAmount: t.settlement_amount || "0",
    }));

    console.log(`[TikTok] 结算单 ${statementId}: ${simplified.length} 笔交易`);

    return NextResponse.json({
      success: true,
      summary,
      transactions: simplified,
      count: simplified.length,
    });
  } catch (error: any) {
    console.error("[TikTok Statement Transactions] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
