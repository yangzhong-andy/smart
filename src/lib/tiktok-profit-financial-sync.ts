import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getStatements,
  getTransactionsByStatement,
  getUnsettledTransactions,
  refreshAccessToken,
} from "@/lib/tiktok-shop-api";

const PLATFORM = "TIKTOK";

type ShopApiContext = {
  shopId: string;
  shopCipher: string;
  accessToken: string;
  appKey: string;
  appSecret: string;
};

type FinancialAggregate = {
  orderId: string;
  shopId: string;
  orderCreateTime: Date | null;
  currency: string;
  revenueAmount: number;
  feeTaxAmount: number;
  referralFeeAmount: number;
  smartPromotionFeeAmount: number;
  shippingCostAmount: number;
  actualShippingFeeAmount: number;
  fbtFulfillmentFeeAmount: number;
  adjustmentAmount: number;
  settlementAmount: number;
  transactionCount: number;
  source: "SETTLED" | "ESTIMATED";
  statementIds: Set<string>;
};

export type TikTokFinancialSyncOptions = {
  days?: number;
  allStatements?: boolean;
  maxStatements?: number;
  force?: boolean;
  retryFailed?: boolean;
  includeUnsettled?: boolean;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function transactionDate(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function feeBreakdown(transaction: any, source: "SETTLED" | "ESTIMATED") {
  return source === "SETTLED"
    ? transaction?.fee_tax_breakdown?.fee
    : transaction?.est_fee_tax_breakdown?.fee;
}

function shippingBreakdown(transaction: any, source: "SETTLED" | "ESTIMATED") {
  return source === "SETTLED"
    ? transaction?.shipping_cost_breakdown
    : transaction?.est_shipping_cost_breakdown;
}

function transactionAmounts(transaction: any, source: "SETTLED" | "ESTIMATED") {
  const fee = feeBreakdown(transaction, source) || {};
  const shipping = shippingBreakdown(transaction, source) || {};
  const shippingSupplementary = shipping?.supplementary_component || {};
  return {
    revenueAmount: number(source === "SETTLED" ? transaction?.revenue_amount : transaction?.est_revenue_amount),
    feeTaxAmount: number(source === "SETTLED" ? transaction?.fee_tax_amount : transaction?.est_fee_tax_amount),
    referralFeeAmount: number(fee?.referral_fee_amount),
    smartPromotionFeeAmount: number(fee?.smart_promotion_fee_amount),
    shippingCostAmount: number(source === "SETTLED" ? transaction?.shipping_cost_amount : transaction?.est_shipping_cost_amount),
    actualShippingFeeAmount: number(shipping?.actual_shipping_fee_amount),
    fbtFulfillmentFeeAmount: number(shippingSupplementary?.fbt_fulfillment_fee_amount),
    adjustmentAmount: number(source === "SETTLED" ? transaction?.adjustment_amount : transaction?.est_adjustment_amount),
    settlementAmount: number(source === "SETTLED" ? transaction?.settlement_amount : transaction?.est_settlement_amount),
  };
}

function addTransaction(
  target: Map<string, FinancialAggregate>,
  shopId: string,
  transaction: any,
  source: "SETTLED" | "ESTIMATED",
  statementId?: string,
  fallbackCurrency = "UNSET",
) {
  const orderId = String(transaction?.order_id || "").trim();
  if (!orderId) return;
  const current = target.get(orderId) || {
    orderId,
    shopId,
    orderCreateTime: transactionDate(transaction?.order_create_time),
    currency: String(transaction?.currency || fallbackCurrency).toUpperCase(),
    revenueAmount: 0,
    feeTaxAmount: 0,
    referralFeeAmount: 0,
    smartPromotionFeeAmount: 0,
    shippingCostAmount: 0,
    actualShippingFeeAmount: 0,
    fbtFulfillmentFeeAmount: 0,
    adjustmentAmount: 0,
    settlementAmount: 0,
    transactionCount: 0,
    source,
    statementIds: new Set<string>(),
  };
  const amounts = transactionAmounts(transaction, source);
  current.revenueAmount += amounts.revenueAmount;
  current.feeTaxAmount += amounts.feeTaxAmount;
  current.referralFeeAmount += amounts.referralFeeAmount;
  current.smartPromotionFeeAmount += amounts.smartPromotionFeeAmount;
  current.shippingCostAmount += amounts.shippingCostAmount;
  current.actualShippingFeeAmount += amounts.actualShippingFeeAmount;
  current.fbtFulfillmentFeeAmount += amounts.fbtFulfillmentFeeAmount;
  current.adjustmentAmount += amounts.adjustmentAmount;
  current.settlementAmount += amounts.settlementAmount;
  current.transactionCount += 1;
  if (statementId) current.statementIds.add(statementId);
  target.set(orderId, current);
}

async function getShopApiContext(shopId: string): Promise<ShopApiContext> {
  const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
  if (!shop || !shop.accessToken || !shop.shopCipher) throw new Error("店铺未授权");
  const appConfig = shop.appKey
    ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } })
    : null;
  const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
  const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";
  if (!appKey || !appSecret) throw new Error("店铺应用配置不完整");

  let accessToken = shop.accessToken;
  if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
    if (!shop.refreshToken) throw new Error("店铺授权已过期");
    const refreshed = await refreshAccessToken(shop.refreshToken, appKey, appSecret);
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

  return { shopId, shopCipher: shop.shopCipher, accessToken, appKey, appSecret };
}

async function withApiRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const retryable = /429|rate|timeout|ECONNRESET|fetch failed|50[234]/i.test(String(error?.message || error));
      if (!retryable || attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    }
  }
  throw new Error(`${label}: ${String((lastError as any)?.message || lastError)}`);
}

export async function refreshTikTokStatementsForShop(shopId: string, days = 30) {
  const context = await getShopApiContext(shopId);
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - Math.max(1, Math.min(366, Math.round(days))) * 86400;
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  let saved = 0;

  for (let page = 0; page < 100; page += 1) {
    const data = await withApiRetry(
      () => getStatements(context.accessToken, context.shopCipher, context.appKey, context.appSecret, {
        start_time: startTime,
        end_time: endTime,
        page_size: 50,
        page_token: pageToken,
      }),
      "TikTok结算单列表读取失败",
    );
    const statements = Array.isArray(data?.statements) ? data.statements : [];
    for (const statement of statements) {
      await prisma.tikTokStatement.upsert({
        where: { statementId: String(statement.id) },
        create: {
          shopId,
          statementId: String(statement.id),
          statementTime: statement.statement_time ? new Date(Number(statement.statement_time) * 1000) : null,
          paymentId: statement.payment_id || null,
          paymentStatus: statement.payment_status || null,
          paymentTime: statement.payment_time ? new Date(Number(statement.payment_time) * 1000) : null,
          netSalesAmount: statement.net_sales_amount || null,
          feeAmount: statement.fee_amount || null,
          adjustmentAmount: statement.adjustment_amount || null,
          shippingCost: statement.shipping_cost_amount || null,
          settlementAmount: statement.settlement_amount || null,
          revenueAmount: statement.revenue_amount || null,
          currency: statement.currency || null,
          rawData: statement,
        },
        update: {
          shopId,
          statementTime: statement.statement_time ? new Date(Number(statement.statement_time) * 1000) : null,
          paymentId: statement.payment_id || null,
          paymentStatus: statement.payment_status || null,
          paymentTime: statement.payment_time ? new Date(Number(statement.payment_time) * 1000) : null,
          netSalesAmount: statement.net_sales_amount || null,
          feeAmount: statement.fee_amount || null,
          adjustmentAmount: statement.adjustment_amount || null,
          shippingCost: statement.shipping_cost_amount || null,
          settlementAmount: statement.settlement_amount || null,
          revenueAmount: statement.revenue_amount || null,
          currency: statement.currency || null,
          rawData: statement,
          syncedAt: new Date(),
        },
      });
      saved += 1;
    }
    const nextPageToken = data?.next_page_token as string | undefined;
    if (!nextPageToken) break;
    if (seenTokens.has(nextPageToken)) throw new Error("TikTok结算单列表返回了重复分页游标");
    seenTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  return { shopId, saved };
}

async function saveAggregates(rows: FinancialAggregate[]) {
  let saved = 0;
  for (const batch of chunks(rows, 100)) {
    await prisma.$transaction(batch.map((row) => prisma.tikTokOrderFinancial.upsert({
      where: { orderId: row.orderId },
      create: {
        orderId: row.orderId,
        shopId: row.shopId,
        orderCreateTime: row.orderCreateTime,
        currency: row.currency,
        revenueAmount: row.revenueAmount,
        feeTaxAmount: row.feeTaxAmount,
        referralFeeAmount: row.referralFeeAmount,
        smartPromotionFeeAmount: row.smartPromotionFeeAmount,
        shippingCostAmount: row.shippingCostAmount,
        actualShippingFeeAmount: row.actualShippingFeeAmount,
        fbtFulfillmentFeeAmount: row.fbtFulfillmentFeeAmount,
        adjustmentAmount: row.adjustmentAmount,
        settlementAmount: row.settlementAmount,
        transactionCount: row.transactionCount,
        source: row.source,
        statementIds: [...row.statementIds].sort(),
        syncedAt: new Date(),
      },
      update: {
        shopId: row.shopId,
        orderCreateTime: row.orderCreateTime,
        currency: row.currency,
        revenueAmount: row.revenueAmount,
        feeTaxAmount: row.feeTaxAmount,
        referralFeeAmount: row.referralFeeAmount,
        smartPromotionFeeAmount: row.smartPromotionFeeAmount,
        shippingCostAmount: row.shippingCostAmount,
        actualShippingFeeAmount: row.actualShippingFeeAmount,
        fbtFulfillmentFeeAmount: row.fbtFulfillmentFeeAmount,
        adjustmentAmount: row.adjustmentAmount,
        settlementAmount: row.settlementAmount,
        transactionCount: row.transactionCount,
        source: row.source,
        statementIds: [...row.statementIds].sort(),
        syncedAt: new Date(),
      },
    })));
    saved += batch.length;
  }
  return saved;
}

async function rebuildSettledOrderFinancials(shopId: string, orderIds: string[]) {
  let saved = 0;
  for (const orderBatch of chunks([...new Set(orderIds)], 500)) {
    const transactions = await prisma.platformSettlementTransaction.findMany({
      where: { platform: PLATFORM, externalShopId: shopId, orderId: { in: orderBatch } },
      orderBy: [{ orderCreateTime: "asc" }, { externalTransactionId: "asc" }],
    });
    const aggregates = new Map<string, FinancialAggregate>();
    for (const transaction of transactions) {
      const current = aggregates.get(transaction.orderId) || {
        orderId: transaction.orderId,
        shopId,
        orderCreateTime: transaction.orderCreateTime,
        currency: transaction.currency,
        revenueAmount: 0,
        feeTaxAmount: 0,
        referralFeeAmount: 0,
        smartPromotionFeeAmount: 0,
        shippingCostAmount: 0,
        actualShippingFeeAmount: 0,
        fbtFulfillmentFeeAmount: 0,
        adjustmentAmount: 0,
        settlementAmount: 0,
        transactionCount: 0,
        source: "SETTLED" as const,
        statementIds: new Set<string>(),
      };
      current.revenueAmount += number(transaction.revenueAmount);
      current.feeTaxAmount += number(transaction.feeTaxAmount);
      current.referralFeeAmount += number(transaction.referralFeeAmount);
      current.smartPromotionFeeAmount += number(transaction.smartPromotionFeeAmount);
      current.shippingCostAmount += number(transaction.shippingCostAmount);
      current.actualShippingFeeAmount += number(transaction.actualShippingFeeAmount);
      current.fbtFulfillmentFeeAmount += number(transaction.fbtFulfillmentFeeAmount);
      current.adjustmentAmount += number(transaction.adjustmentAmount);
      current.settlementAmount += number(transaction.settlementAmount);
      current.transactionCount += 1;
      current.statementIds.add(transaction.externalStatementId);
      aggregates.set(transaction.orderId, current);
    }
    saved += await saveAggregates([...aggregates.values()]);
  }
  return saved;
}

async function saveStatementTransactions(
  context: ShopApiContext,
  statement: { statementId: string; currency: string | null },
) {
  const checkpointWhere = {
    platform_externalShopId_externalStatementId: {
      platform: PLATFORM,
      externalShopId: context.shopId,
      externalStatementId: statement.statementId,
    },
  };
  await prisma.platformSettlementSyncState.upsert({
    where: checkpointWhere,
    create: {
      platform: PLATFORM,
      externalShopId: context.shopId,
      externalStatementId: statement.statementId,
      status: "RUNNING",
      attemptCount: 1,
      startedAt: new Date(),
      lastError: null,
    },
    update: {
      status: "RUNNING",
      attemptCount: { increment: 1 },
      startedAt: new Date(),
      completedAt: null,
      lastError: null,
    },
  });

  const affectedOrderIds = new Set<string>();
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let expectedCount: number | null = null;
  let fetchedCount = 0;

  try {
    for (let page = 0; page < 500; page += 1) {
      const data = await withApiRetry(
        () => getTransactionsByStatement(
          context.accessToken,
          context.shopCipher,
          context.appKey,
          context.appSecret,
          statement.statementId,
          { page_size: 100, page_token: pageToken },
        ),
        `结算单 ${statement.statementId} 读取失败`,
      );
      if (expectedCount == null && Number.isFinite(Number(data?.total_count))) {
        expectedCount = Number(data.total_count);
      }
      const currency = String(data?.currency || statement.currency || "UNSET").toUpperCase();
      const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
      for (const batch of chunks(transactions, 100)) {
        await prisma.$transaction(batch.map((transaction: any) => {
          const orderId = String(transaction?.order_id || "").trim();
          const externalTransactionId = String(transaction?.id || "").trim() || createHash("sha256")
            .update(`${statement.statementId}:${JSON.stringify(transaction)}`)
            .digest("hex");
          const amounts = transactionAmounts(transaction, "SETTLED");
          if (orderId) affectedOrderIds.add(orderId);
          return prisma.platformSettlementTransaction.upsert({
            where: {
              platform_externalShopId_externalTransactionId: {
                platform: PLATFORM,
                externalShopId: context.shopId,
                externalTransactionId,
              },
            },
            create: {
              platform: PLATFORM,
              externalShopId: context.shopId,
              externalStatementId: statement.statementId,
              externalTransactionId,
              orderId,
              orderCreateTime: transactionDate(transaction?.order_create_time),
              transactionType: transaction?.type ? String(transaction.type) : null,
              currency,
              ...amounts,
              rawData: transaction as Prisma.InputJsonValue,
              syncedAt: new Date(),
            },
            update: {
              externalStatementId: statement.statementId,
              orderId,
              orderCreateTime: transactionDate(transaction?.order_create_time),
              transactionType: transaction?.type ? String(transaction.type) : null,
              currency,
              ...amounts,
              rawData: transaction as Prisma.InputJsonValue,
              syncedAt: new Date(),
            },
          });
        }));
      }
      fetchedCount += transactions.length;
      const nextPageToken = data?.next_page_token as string | undefined;
      if (!nextPageToken) break;
      if (seenTokens.has(nextPageToken)) throw new Error("TikTok返回了重复的结算明细分页游标");
      seenTokens.add(nextPageToken);
      pageToken = nextPageToken;
      if (page === 499) throw new Error("单张结算单超过500页，已停止以防数据截断");
    }

    if (expectedCount != null && fetchedCount !== expectedCount) {
      throw new Error(`明细数量不一致：接口应有 ${expectedCount} 条，实际读取 ${fetchedCount} 条`);
    }
    const settledOrders = await rebuildSettledOrderFinancials(context.shopId, [...affectedOrderIds]);
    await prisma.platformSettlementSyncState.update({
      where: checkpointWhere,
      data: {
        status: "COMPLETED",
        expectedCount,
        syncedCount: fetchedCount,
        lastError: null,
        completedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });
    return { transactions: fetchedCount, settledOrders };
  } catch (error: any) {
    await prisma.platformSettlementSyncState.update({
      where: checkpointWhere,
      data: {
        status: "FAILED",
        expectedCount,
        syncedCount: fetchedCount,
        lastError: String(error?.message || error).slice(0, 2000),
        lastSyncedAt: new Date(),
      },
    });
    throw error;
  }
}

async function syncUnsettledFinancials(context: ShopApiContext) {
  const estimated = new Map<string, FinancialAggregate>();
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const data = await withApiRetry(
      () => getUnsettledTransactions(context.accessToken, context.shopCipher, context.appKey, context.appSecret, {
        page_size: 100,
        page_token: pageToken,
      }),
      "未结算订单读取失败",
    );
    const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
    for (const transaction of transactions) addTransaction(estimated, context.shopId, transaction, "ESTIMATED");
    const nextPageToken = data?.next_page_token as string | undefined;
    if (!nextPageToken) break;
    if (seenTokens.has(nextPageToken)) throw new Error("TikTok返回了重复的未结算分页游标");
    seenTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  const estimatedIds = [...estimated.keys()];
  for (const batch of chunks(estimatedIds, 1000)) {
    const actual = await prisma.tikTokOrderFinancial.findMany({
      where: { orderId: { in: batch }, source: "SETTLED" },
      select: { orderId: true },
    });
    for (const row of actual) estimated.delete(row.orderId);
  }
  return saveAggregates([...estimated.values()]);
}

export async function syncTikTokProfitFinancials(
  shopId: string,
  input: number | TikTokFinancialSyncOptions = 45,
) {
  const options: TikTokFinancialSyncOptions = typeof input === "number" ? { days: input } : input;
  const days = Math.max(1, Math.min(options.days ?? 45, 366));
  const maxStatements = Math.max(0, Math.min(options.maxStatements ?? 100, 1000));
  const context = await getShopApiContext(shopId);
  const start = new Date(Date.now() - days * 86400000);
  const statements = await prisma.tikTokStatement.findMany({
    where: {
      shopId,
      ...(options.allStatements ? {} : { statementTime: { gte: start } }),
    },
    select: { statementId: true, currency: true },
    orderBy: { statementTime: "asc" },
  });
  const states = await prisma.platformSettlementSyncState.findMany({
    where: {
      platform: PLATFORM,
      externalShopId: shopId,
      externalStatementId: { in: statements.map((statement) => statement.statementId) },
    },
  });
  const stateByStatement = new Map(states.map((state) => [state.externalStatementId, state]));
  const candidates = statements.filter((statement) => {
    const state = stateByStatement.get(statement.statementId);
    if (options.force) return true;
    if (!state) return true;
    if (state.status === "COMPLETED") return false;
    if (state.status === "FAILED" && !options.retryFailed) return false;
    return true;
  }).slice(0, maxStatements);

  let syncedTransactions = 0;
  let settledOrders = 0;
  const failures: Array<{ statementId: string; error: string }> = [];
  for (const statement of candidates) {
    try {
      const result = await saveStatementTransactions(context, statement);
      syncedTransactions += result.transactions;
      settledOrders += result.settledOrders;
    } catch (error: any) {
      failures.push({ statementId: statement.statementId, error: String(error?.message || error) });
    }
  }

  const finalStates = await prisma.platformSettlementSyncState.findMany({
    where: {
      platform: PLATFORM,
      externalShopId: shopId,
      externalStatementId: { in: statements.map((statement) => statement.statementId) },
    },
    select: { externalStatementId: true, status: true },
  });
  const completedStatements = finalStates.filter((state) => state.status === "COMPLETED").length;
  const failedStatements = finalStates.filter((state) => state.status === "FAILED").length;
  const pendingStatements = Math.max(0, statements.length - completedStatements - failedStatements);
  const estimatedOrders = options.includeUnsettled === false ? 0 : await syncUnsettledFinancials(context);

  return {
    shopId,
    statements: statements.length,
    processedStatements: candidates.length,
    completedStatements,
    failedStatements,
    pendingStatements,
    syncedTransactions,
    settledOrders,
    estimatedOrders,
    failures,
    syncedAt: new Date().toISOString(),
  };
}
