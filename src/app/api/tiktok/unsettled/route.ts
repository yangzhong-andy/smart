import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUnsettledTransactions, refreshAccessToken } from "@/lib/tiktok-shop-api";
import { decryptTikTokSecret, encryptTikTokSecret } from "@/lib/tiktok-secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/tiktok/unsettled?shopId=xxx
 * 获取未结算的交易
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) return NextResponse.json({ error: "缺少 shopId" }, { status: 400 });

    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
    if (!shop || !shop.accessToken || !shop.shopCipher) {
      return NextResponse.json({ error: "店铺未授权" }, { status: 400 });
    }

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

    // 翻页拉取（最多5页）
    let allTxns: any[] = [];
    let pageToken: string | undefined = undefined;
    let summary: any = null;
    let pageCount = 0;

    while (pageCount < 5) {
      pageCount++;
      const data = await getUnsettledTransactions(accessToken, shop.shopCipher, appKey, appSecret, {
        page_size: 100,
        page_token: pageToken,
      });

      if (!summary) {
        summary = {
          totalCount: data.total_count,
          sumRevenue: data.sum_est_revenue_amount,
          sumFee: data.sum_est_fee_amount,
          sumAdjustment: data.sum_est_adjustment_amount,
          sumSettlement: data.sum_est_settlement_amount,
        };
      }

      const txns = data.transactions || [];
      if (txns.length === 0) break;
      allTxns = allTxns.concat(txns);

      pageToken = data.next_page_token;
      if (!pageToken) break;
    }

    // 简化交易数据
    const REASON_MAP: Record<string, string> = {
      "WAITING_FOR_PACKAGE_DELIVERY": "等待包裹送达",
      "ORDER_DELIVERED_AND_AWAITING_SETTLEMENT": "已送达等待结算",
      "ORDER_IN_PROGRESS": "订单进行中",
      "RETURN_OR_REFUND_IN_PROGRESS": "退款/退货处理中",
      "RISK_CONTROL": "风控审核中",
    };
    const simplified = allTxns
      .map((t: any) => {
        // estimated_settlement 可能是文字或时间戳
        let estSettlement = t.estimated_settlement || "-";
        const ts = parseInt(estSettlement);
        if (!isNaN(ts) && ts > 1000000000) {
          estSettlement = new Date(ts * 1000).toISOString().split("T")[0].replace(/-/g, "/");
        }
        return {
          orderId: t.order_id || t.id || "",
          orderCreateTime: t.order_create_time ? new Date(t.order_create_time * 1000).toISOString() : null,
          orderCreateTimestamp: t.order_create_time || 0,
          revenueAmount: t.est_revenue_amount || "0",
          feeTaxAmount: t.est_fee_tax_amount || "0",
          shippingCostAmount: t.est_shipping_cost_amount || "0",
          settlementAmount: t.est_settlement_amount || "0",
          estimatedSettlement: estSettlement,
          unsettledReason: REASON_MAP[t.unsettled_reason] || t.unsettled_reason || "-",
          type: t.type || "ORDER",
          currency: t.currency || "BRL",
        };
      })
      .sort((a, b) => b.orderCreateTimestamp - a.orderCreateTimestamp);

    return NextResponse.json({
      success: true,
      summary,
      transactions: simplified,
      count: simplified.length,
    });
  } catch (error: any) {
    console.error("[TikTok Unsettled] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
