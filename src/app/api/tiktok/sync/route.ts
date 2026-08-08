import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deductStockForOrder, restoreStockForCancelledOrder } from "@/lib/tiktok-stock-deduct";
import {
  refreshAccessToken,
  searchOrders,
  getStatements,
  getPayments,
  searchProducts,
} from "@/lib/tiktok-shop-api";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/tiktok/sync
 * 同步数据，每个店铺使用对应的 App Key/Secret
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { dataType = "all", days = 7 } = body;
    const requestedDays = Number(days);
    const syncDays = Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.floor(requestedDays)
      : 7;

    const shops = await prisma.tikTokShopSetting.findMany({
      where: { status: "active", accessToken: { not: null } },
    });

    if (shops.length === 0) {
      return NextResponse.json({ error: "没有已授权的店铺" }, { status: 400 });
    }

    // 获取所有 App 配置
    const appConfigs = await prisma.tikTokAppConfig.findMany();
    const appMap = new Map(appConfigs.map(c => [c.appKey, c]));

    const results: any[] = [];

    for (const shop of shops) {
      console.log(`[TikTok Sync] 开始同步: ${shop.shopName} (${shop.shopId})`);
      const result: any = { shopName: shop.shopName, shopId: shop.shopId };

      try {
        // 获取这个店铺对应的 App 配置
        const appConfig = shop.appKey ? appMap.get(shop.appKey) : null;
        const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
        const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";

        // 刷新 token
        let accessToken = shop.accessToken!;
        if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
          console.log("[TikTok Sync] Token 即将过期，刷新中...");
          const refreshed = await refreshAccessToken(shop.refreshToken!, appKey, appSecret);
          accessToken = refreshed.accessToken;
          await prisma.tikTokShopSetting.update({
            where: { shopId: shop.shopId },
            data: {
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
            },
          });
        }

        const cipher = shop.shopCipher;
        if (!cipher) throw new Error("缺少 shopCipher，请重新授权");

        const now = Math.floor(Date.now() / 1000);
        const past = now - syncDays * 86400;

        // 同步订单（分段拉取，每段7天，避免单次订单太多超过翻页上限）
        if (dataType === "all" || dataType === "orders") {
          try {
            let count = 0;
            const segmentDays = 7;
            const totalSegments = Math.max(1, Math.ceil(syncDays / segmentDays));
            for (let seg = 0; seg < totalSegments; seg++) {
              const segEnd = now - seg * segmentDays * 86400;
              const segStart = Math.max(past, segEnd - segmentDays * 86400);
              let pageToken: string | undefined = undefined;
              let pageCount = 0;
              const seenPageTokens = new Set<string>();
              let reachedSegmentStart = false;
              while (pageCount < 500) {
                pageCount++;
                const ordersData = await searchOrders(accessToken, cipher, appKey, appSecret, {
                  page_size: 50, page_token: pageToken,
                  update_time_ge: segStart, update_time_lt: segEnd,
                  sort_field: "update_time", sort_order: "DESC",
                });
                const orders = Array.isArray(ordersData?.orders) ? ordersData.orders : [];
                const nextPageToken = ordersData?.next_page_token as string | undefined;

                // TikTok may return an empty page together with a cursor. Keep following
                // it, but stop on a repeated cursor to avoid an infinite sync loop.
                if (orders.length === 0) {
                  if (!nextPageToken) break;
                  if (seenPageTokens.has(nextPageToken)) {
                    throw new Error("TikTok returned a repeated order page token");
                  }
                  seenPageTokens.add(nextPageToken);
                  pageToken = nextPageToken;
                  continue;
                }

                for (const o of orders) {
                  const updateSeconds = Number(o.update_time);
                  if (Number.isFinite(updateSeconds)) {
                    if (updateSeconds < segStart) {
                      reachedSegmentStart = true;
                      continue;
                    }
                    if (updateSeconds >= segEnd) continue;
                  }

                  await prisma.tikTokOrder.upsert({
                    where: { orderId: o.id },
                    create: {
                      shopId: shop.shopId, orderId: o.id, status: o.status, orderStatus: o.status,
                      totalAmount: o.payment?.total_amount || o.total_amount || null,
                      currency: o.payment?.currency || o.currency || null,
                      itemCount: o.line_items?.length || null,
                      createTime: o.create_time ? new Date(o.create_time * 1000) : null,
                      updateTime: o.update_time ? new Date(o.update_time * 1000) : null,
                      rawData: o,
                    },
                    update: {
                      status: o.status, orderStatus: o.status,
                      totalAmount: o.payment?.total_amount || o.total_amount || null,
                      updateTime: o.update_time ? new Date(o.update_time * 1000) : null,
                      rawData: o,
                    },
                  });

                  // 定时同步也负责库存补漏：待揽收订单扣减，取消订单回补。
                  // 两个操作都有扣减状态保护，重复同步不会重复增减库存。
                  try {
                    if (o.status === "CANCELLED") {
                      await restoreStockForCancelledOrder(o.id);
                    } else if (o.status === "AWAITING_COLLECTION") {
                      await deductStockForOrder(o.id, shop.shopId, o);
                    }
                  } catch (stockError: any) {
                    console.error(`[TikTok Stock] 定时同步订单 ${o.id} 库存处理失败:`, stockError.message);
                  }
                  count++;
                }

                if (reachedSegmentStart || !nextPageToken) break;
                if (seenPageTokens.has(nextPageToken)) {
                  throw new Error("TikTok returned a repeated order page token");
                }
                seenPageTokens.add(nextPageToken);
                pageToken = nextPageToken;
              }
              console.log(`[TikTok Sync] ${shop.shopName} 第${seg+1}/${totalSegments}段(${pageCount}页) 累计${count}条`);
            }
            result.orders = count;
            console.log(`[TikTok Sync] ${shop.shopName} 订单同步完成: ${count}条`);
          } catch (e: any) {
            result.ordersError = e.message;
            console.error(`[TikTok Sync] ${shop.shopName} 订单同步失败:`, e.message);
          }
        }

        // 同步结算报表
        if (dataType === "all" || dataType === "statements") {
          try {
            let count = 0;
            let pageToken: string | undefined = undefined;
            let pageCount = 0;
            while (pageCount < 10) {
              pageCount++;
              const stmtsData = await getStatements(accessToken, cipher, appKey, appSecret, {
                start_time: past, end_time: now, page_size: 50, page_token: pageToken,
              });
              const stmts = stmtsData?.statements || [];
              if (stmts.length === 0) break;
              for (const s of stmts) {
                await prisma.tikTokStatement.upsert({
                  where: { statementId: s.id },
                  create: {
                    shopId: shop.shopId, statementId: s.id,
                    statementTime: s.statement_time ? new Date(s.statement_time * 1000) : null,
                    paymentId: s.payment_id || null, paymentStatus: s.payment_status || null,
                    paymentTime: s.payment_time ? new Date(s.payment_time * 1000) : null,
                    netSalesAmount: s.net_sales_amount || null, feeAmount: s.fee_amount || null,
                    adjustmentAmount: s.adjustment_amount || null, shippingCost: s.shipping_cost_amount || null,
                    settlementAmount: s.settlement_amount || null, revenueAmount: s.revenue_amount || null,
                    currency: s.currency || null, rawData: s,
                  },
                  update: {
                    paymentStatus: s.payment_status || null,
                    paymentTime: s.payment_time ? new Date(s.payment_time * 1000) : null,
                    settlementAmount: s.settlement_amount || null, rawData: s,
                  },
                });
                count++;
              }
              pageToken = stmtsData?.next_page_token;
              if (!pageToken) break;
            }
            result.statements = count;
          } catch (e: any) { result.statementsError = e.message; }
        }

        // 同步回款
        if (dataType === "all" || dataType === "payments") {
          try {
            let count = 0;
            let cashFlowCount = 0;
            const paymentSegmentSeconds = 24 * 60 * 60;

            // The payments endpoint only honours create_time_ge/create_time_lt. Query one
            // day at a time so a busy shop does not lose newer records behind a page limit.
            for (let paymentStart = past; paymentStart < now; paymentStart += paymentSegmentSeconds) {
              const paymentEnd = Math.min(paymentStart + paymentSegmentSeconds, now);
              let pageToken: string | undefined = undefined;
              let pageCount = 0;
              const seenPageTokens = new Set<string>();

              while (pageCount < 100) {
              pageCount++;
              const paysData = await getPayments(accessToken, cipher, appKey, appSecret, {
                create_time_ge: paymentStart,
                create_time_lt: paymentEnd,
                page_size: 100,
                page_token: pageToken,
              });
              const pays = Array.isArray(paysData?.payments) ? paysData.payments : [];
              const nextPageToken = paysData?.next_page_token as string | undefined;

              if (pays.length === 0) {
                if (!nextPageToken) break;
                if (pageCount >= 100) {
                  throw new Error("TikTok returned too many payment pages for one day");
                }
                if (seenPageTokens.has(nextPageToken)) {
                  throw new Error("TikTok returned a repeated payment page token");
                }
                seenPageTokens.add(nextPageToken);
                pageToken = nextPageToken;
                continue;
              }
              for (const p of pays) {
                const isNowPaid = p.status === "PAID";

                await prisma.tikTokPayment.upsert({
                  where: { paymentId: p.id },
                  create: {
                    shopId: shop.shopId, paymentId: p.id,
                    amount: p.amount?.value || null, currency: p.amount?.currency || null,
                    settlementAmount: p.settlement_amount?.value || null,
                    reserveAmount: p.reserve_amount?.value || null,
                    exchangeRate: p.exchange_rate || null, status: p.status || null,
                    bankAccount: p.bank_account || null,
                    createTime: p.create_time ? new Date(p.create_time * 1000) : null,
                    paidTime: p.paid_time ? new Date(p.paid_time * 1000) : null,
                    rawData: p,
                  },
                  update: {
                    amount: p.amount?.value || null,
                    currency: p.amount?.currency || null,
                    settlementAmount: p.settlement_amount?.value || null,
                    reserveAmount: p.reserve_amount?.value || null,
                    exchangeRate: p.exchange_rate || null,
                    status: p.status || null,
                    bankAccount: p.bank_account || null,
                    createTime: p.create_time ? new Date(p.create_time * 1000) : null,
                    paidTime: p.paid_time ? new Date(p.paid_time * 1000) : null,
                    rawData: p,
                  },
                });
                count++;

                // Keep the generated cash-flow synchronized for every PAID payment.
                // This also backfills flows after an account is linked and corrects
                // a changed payment amount without creating duplicates.
                if (isNowPaid && shop.bankAccountId) {
                  const cashFlowUid = `TIKTOK_PAY_${p.id}`;
                  const bankAccount = await prisma.bankAccount.findUnique({ where: { id: shop.bankAccountId } });
                  if (bankAccount) {
                    const paidDate = p.paid_time
                      ? new Date(p.paid_time * 1000)
                      : (p.create_time ? new Date(p.create_time * 1000) : new Date());
                    await prisma.cashFlow.upsert({
                      where: { uid: cashFlowUid },
                      create: {
                        uid: cashFlowUid,
                        date: paidDate,
                        summary: `TikTok回款 - ${shop.shopName}`,
                        category: "回款/店铺回款",
                        type: "INCOME",
                        amount: parseFloat(p.amount?.value || "0"),
                        accountId: shop.bankAccountId,
                        accountName: bankAccount.name,
                        currency: p.amount?.currency || "BRL",
                        status: "CONFIRMED",
                        relatedId: p.id,
                        remark: `付款单ID: ${p.id}`,
                        exchangeRate: 1.3,
                        platform: "TikTok",
                        storeId: bankAccount.storeId || null,
                        storeName: shop.shopName,
                      },
                      update: {
                        date: paidDate,
                        summary: `TikTok回款 - ${shop.shopName}`,
                        amount: parseFloat(p.amount?.value || "0"),
                        accountId: shop.bankAccountId,
                        accountName: bankAccount.name,
                        currency: p.amount?.currency || "BRL",
                        status: "CONFIRMED",
                        relatedId: p.id,
                        remark: `付款单ID: ${p.id}`,
                        platform: "TikTok",
                        storeId: bankAccount.storeId || null,
                        storeName: shop.shopName,
                      },
                    });
                    cashFlowCount++;
                    console.log(`[TikTok CashFlow] 已同步: ${shop.shopName} +${p.amount?.value} ${p.amount?.currency}`);
                  }
                }
              }
              if (!nextPageToken) break;
              if (pageCount >= 100) {
                throw new Error("TikTok returned too many payment pages for one day");
              }
              if (seenPageTokens.has(nextPageToken)) {
                throw new Error("TikTok returned a repeated payment page token");
              }
              seenPageTokens.add(nextPageToken);
              pageToken = nextPageToken;
              }
            }
            result.payments = count;
            result.cashFlows = cashFlowCount;
            console.log(`[TikTok Sync] ${shop.shopName} 回款: ${count}条, 流水: ${cashFlowCount}条`);
          } catch (e: any) { result.paymentsError = e.message; }
        }

        // 同步产品
        if (dataType === "all" || dataType === "products") {
          try {
            let count = 0;
            let pageToken: string | undefined = undefined;
            let pageCount = 0;
            while (pageCount < 10) {
              pageCount++;
              const prodsData = await searchProducts(accessToken, cipher, appKey, appSecret, {
                page_size: 50, page_token: pageToken,
              });
              const prods = prodsData?.products || [];
              if (prods.length === 0) break;
              for (const p of prods) {
                await prisma.tikTokProduct.upsert({
                  where: { productId: p.id },
                  create: {
                    shopId: shop.shopId, productId: p.id, title: p.title || null,
                    description: p.description || null, status: p.status || null,
                    categoryId: p.category_id || null,
                    mainImage: p.main_images?.[0]?.url || null,
                    images: p.main_images?.map((img: any) => img.url).filter(Boolean) || [],
                    url: p.url || null,
                    createTime: p.create_time ? new Date(p.create_time * 1000) : null,
                    rawData: p,
                  },
                  update: { title: p.title || null, status: p.status || null, rawData: p },
                });
                count++;
              }
              pageToken = prodsData?.next_page_token;
              if (!pageToken) break;
            }
            result.products = count;
          } catch (e: any) { result.productsError = e.message; }
        }

        await prisma.tikTokShopSetting.update({
          where: { shopId: shop.shopId },
          data: { lastSyncAt: new Date() },
        });
        result.success = true;
      } catch (e: any) {
        result.success = false;
        result.error = e.message;
        console.error(`[TikTok Sync] ${shop.shopName} 同步失败:`, e.message);
      }
      results.push(result);
    }

    // The accounts page caches the full cash-flow list.  Clear it after a
    // payment sync so a newly paid or corrected payment is visible immediately.
    await clearCacheByPrefix("cash-flow");

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[TikTok Sync] 全局错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
