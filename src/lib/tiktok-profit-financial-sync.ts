import { prisma } from "@/lib/prisma";
import {
  getTransactionsByStatement,
  getUnsettledTransactions,
  refreshAccessToken,
} from "@/lib/tiktok-shop-api";

type FinancialAggregate = {
  orderId: string;
  shopId: string;
  orderCreateTime: Date | null;
  currency: string;
  revenueAmount: number;
  feeTaxAmount: number;
  shippingCostAmount: number;
  adjustmentAmount: number;
  settlementAmount: number;
  source: "SETTLED" | "ESTIMATED";
  statementIds: Set<string>;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function transactionDate(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function addTransaction(
  target: Map<string, FinancialAggregate>,
  shopId: string,
  transaction: any,
  source: "SETTLED" | "ESTIMATED",
  statementId?: string,
) {
  const orderId = String(transaction?.order_id || transaction?.id || "").trim();
  if (!orderId) return;
  const current = target.get(orderId) || {
    orderId,
    shopId,
    orderCreateTime: transactionDate(transaction?.order_create_time),
    currency: String(transaction?.currency || "BRL").toUpperCase(),
    revenueAmount: 0,
    feeTaxAmount: 0,
    shippingCostAmount: 0,
    adjustmentAmount: 0,
    settlementAmount: 0,
    source,
    statementIds: new Set<string>(),
  };
  current.revenueAmount += number(source === "SETTLED" ? transaction?.revenue_amount : transaction?.est_revenue_amount);
  current.feeTaxAmount += number(source === "SETTLED" ? transaction?.fee_tax_amount : transaction?.est_fee_tax_amount);
  current.shippingCostAmount += number(source === "SETTLED" ? transaction?.shipping_cost_amount : transaction?.est_shipping_cost_amount);
  current.adjustmentAmount += number(source === "SETTLED" ? transaction?.adjustment_amount : transaction?.est_adjustment_amount);
  current.settlementAmount += number(source === "SETTLED" ? transaction?.settlement_amount : transaction?.est_settlement_amount);
  if (statementId) current.statementIds.add(statementId);
  target.set(orderId, current);
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
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
        shippingCostAmount: row.shippingCostAmount,
        adjustmentAmount: row.adjustmentAmount,
        settlementAmount: row.settlementAmount,
        source: row.source,
        statementIds: [...row.statementIds],
        syncedAt: new Date(),
      },
      update: {
        shopId: row.shopId,
        orderCreateTime: row.orderCreateTime,
        currency: row.currency,
        revenueAmount: row.revenueAmount,
        feeTaxAmount: row.feeTaxAmount,
        shippingCostAmount: row.shippingCostAmount,
        adjustmentAmount: row.adjustmentAmount,
        settlementAmount: row.settlementAmount,
        source: row.source,
        statementIds: [...row.statementIds],
        syncedAt: new Date(),
      },
    })));
    saved += batch.length;
  }
  return saved;
}

export async function syncTikTokProfitFinancials(shopId: string, days = 45) {
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

  const start = new Date(Date.now() - Math.max(1, Math.min(days, 366)) * 86400000);
  const statements = await prisma.tikTokStatement.findMany({
    where: { shopId, statementTime: { gte: start } },
    select: { statementId: true, currency: true },
    orderBy: { statementTime: "asc" },
  });
  const settled = new Map<string, FinancialAggregate>();
  for (const statement of statements) {
    let pageToken: string | undefined;
    const seenTokens = new Set<string>();
    for (let page = 0; page < 50; page++) {
      const data = await getTransactionsByStatement(accessToken, shop.shopCipher, appKey, appSecret, statement.statementId, {
        page_size: 100,
        page_token: pageToken,
      });
      const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
      for (const transaction of transactions) {
        if (!transaction.currency && statement.currency) transaction.currency = statement.currency;
        addTransaction(settled, shopId, transaction, "SETTLED", statement.statementId);
      }
      const nextPageToken = data?.next_page_token as string | undefined;
      if (!nextPageToken || seenTokens.has(nextPageToken)) break;
      seenTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }
  }
  const settledSaved = await saveAggregates([...settled.values()]);

  const estimated = new Map<string, FinancialAggregate>();
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  for (let page = 0; page < 50; page++) {
    const data = await getUnsettledTransactions(accessToken, shop.shopCipher, appKey, appSecret, {
      page_size: 100,
      page_token: pageToken,
    });
    const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
    for (const transaction of transactions) addTransaction(estimated, shopId, transaction, "ESTIMATED");
    const nextPageToken = data?.next_page_token as string | undefined;
    if (!nextPageToken || seenTokens.has(nextPageToken)) break;
    seenTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }
  for (const orderId of settled.keys()) estimated.delete(orderId);
  const estimatedIds = [...estimated.keys()];
  for (const batch of chunks(estimatedIds, 1000)) {
    const actual = await prisma.tikTokOrderFinancial.findMany({
      where: { orderId: { in: batch }, source: "SETTLED" },
      select: { orderId: true },
    });
    for (const row of actual) estimated.delete(row.orderId);
  }
  const estimatedSaved = await saveAggregates([...estimated.values()]);

  return {
    shopId,
    statements: statements.length,
    settledOrders: settledSaved,
    estimatedOrders: estimatedSaved,
    syncedAt: new Date().toISOString(),
  };
}
