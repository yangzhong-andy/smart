import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getShopeeWalletTransactionList } from "@/lib/shopee-open-api";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";
import {
  classifyShopeeWalletTransaction,
  normalizeShopeeWalletTransaction,
  splitShopeeWalletWindows,
} from "@/lib/shopee-wallet-transactions";
import { syncShopeeOfficialWalletLedger } from "@/lib/shopee-wallet-official-ledger";
import { syncShopeeOfficialWalletBusinessFlows } from "@/lib/shopee-wallet-business-sync";
import { refreshShopeePendingSettlementBalances } from "@/lib/shopee-wallet-settlement-sync";
import { syncShopeeAdvertisingWallet } from "@/lib/shopee-ad-wallet-sync";

const PAGE_SIZE = 100;
const MAX_PAGES_PER_WINDOW = 10_000;

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Shopee 钱包流水同步失败"))
    .replace(/\s+/g, " ").trim().slice(0, 500);
}

export async function syncShopeeOfficialWalletTransactions(input: {
  shopId?: string;
  days?: number;
  timeFrom?: number;
  timeTo?: number;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const days = Math.min(730, Math.max(1, Math.trunc(input.days || 7)));
  const timeTo = Math.min(now, Math.trunc(input.timeTo || now));
  const timeFrom = Math.max(1, Math.trunc(input.timeFrom || (timeTo - days * 24 * 60 * 60)));
  const windows = splitShopeeWalletWindows(timeFrom, timeTo);
  const shops = await prisma.shopeeShopSetting.findMany({
    where: {
      status: "active",
      ...(input.shopId ? { shopId: input.shopId } : {}),
      appConfig: { status: "active" },
    },
    select: {
      id: true,
      shopId: true,
      shopName: true,
      currency: true,
      walletAccounts: {
        where: { walletType: "STORE", enabled: true },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{
    shopId: string;
    shopName: string;
    fetched: number;
    created: number;
    updated: number;
    matched: number;
    review: number;
    windows: number;
  }> = [];
  const errors: Array<{ shopId: string; window?: string; error: string }> = [];

  for (const shop of shops) {
    const walletId = shop.walletAccounts[0]?.id || null;
    let fetched = 0;
    let created = 0;
    let updated = 0;
    let matched = 0;
    let review = 0;

    for (const window of windows) {
      for (let pageNo = 1; pageNo <= MAX_PAGES_PER_WINDOW; pageNo += 1) {
        try {
          const response = await withFreshShopeeToken(shop.id, (credentials) => getShopeeWalletTransactionList({
            ...credentials,
            createTimeFrom: window.timeFrom,
            createTimeTo: window.timeTo,
            pageNo,
            pageSize: PAGE_SIZE,
          }));
          const rawRows = Array.isArray(response.transaction_list) ? response.transaction_list : [];
          if (rawRows.length === 0) break;
          fetched += rawRows.length;
          const normalizedRows = rawRows.map((raw) => ({
            raw,
            normalized: normalizeShopeeWalletTransaction(raw, shop.currency || "BRL"),
          }));
          const orderSns = [...new Set(normalizedRows.map((item) => item.normalized.orderSn).filter(Boolean))] as string[];
          const [existingTransactions, settlementEntries] = await Promise.all([
            prisma.shopeeWalletTransaction.findMany({
              where: {
                shopSettingId: shop.id,
                transactionId: { in: normalizedRows.map((item) => item.normalized.transactionId) },
              },
              select: { transactionId: true },
            }),
            walletId && orderSns.length > 0 ? prisma.shopeeWalletEntry.findMany({
              where: {
                walletId,
                sourceType: { in: ["SHOPEE_SETTLEMENT", "SHOPEE_SETTLEMENT_ADJUSTMENT"] },
                relatedOrderSn: { in: orderSns },
              },
              select: { id: true, relatedOrderSn: true, amount: true },
            }) : [],
          ]);
          const existingIds = new Set(existingTransactions.map((item) => item.transactionId));
          const settlementsByOrder = new Map<string, Array<{ id: string; amount: Prisma.Decimal }>>();
          for (const entry of settlementEntries) {
            if (!entry.relatedOrderSn) continue;
            const list = settlementsByOrder.get(entry.relatedOrderSn) || [];
            list.push({ id: entry.id, amount: entry.amount });
            settlementsByOrder.set(entry.relatedOrderSn, list);
          }

          await prisma.$transaction(normalizedRows.map(({ raw, normalized }) => {
            const match = walletId ? classifyShopeeWalletTransaction({
              status: normalized.status,
              moneyFlow: normalized.moneyFlow,
              amount: normalized.amount,
              orderSn: normalized.orderSn,
              settlementEntries: normalized.orderSn ? settlementsByOrder.get(normalized.orderSn) || [] : [],
            }) : { matchStatus: "NO_STORE_WALLET", matchedEntryId: null };
            if (match.matchStatus === "MATCHED_SETTLEMENT") matched += 1;
            else if (!match.matchStatus.startsWith("IGNORED")) review += 1;
            const data = {
              walletId,
              status: normalized.status,
              walletType: normalized.walletType,
              transactionType: normalized.transactionType,
              transactionTabType: normalized.transactionTabType,
              moneyFlow: normalized.moneyFlow,
              amount: new Prisma.Decimal(normalized.amount),
              currentBalance: normalized.currentBalance == null ? null : new Prisma.Decimal(normalized.currentBalance),
              transactionFee: normalized.transactionFee == null ? null : new Prisma.Decimal(normalized.transactionFee),
              currency: normalized.currency,
              orderSn: normalized.orderSn,
              refundSn: normalized.refundSn,
              withdrawalType: normalized.withdrawalType,
              withdrawalId: normalized.withdrawalId,
              rootWithdrawalId: normalized.rootWithdrawalId,
              description: normalized.description,
              reason: normalized.reason,
              buyerName: normalized.buyerName,
              matchStatus: match.matchStatus,
              matchedEntryId: match.matchedEntryId,
              raw: safeJson(raw),
              occurredAt: normalized.occurredAt,
              syncedAt: new Date(),
            };
            return prisma.shopeeWalletTransaction.upsert({
              where: { shopSettingId_transactionId: { shopSettingId: shop.id, transactionId: normalized.transactionId } },
              create: { shopSettingId: shop.id, transactionId: normalized.transactionId, ...data },
              update: data,
            });
          }));
          created += normalizedRows.filter((item) => !existingIds.has(item.normalized.transactionId)).length;
          updated += normalizedRows.filter((item) => existingIds.has(item.normalized.transactionId)).length;
          if (!response.more || rawRows.length < PAGE_SIZE) break;
        } catch (error) {
          errors.push({
            shopId: shop.shopId,
            window: `${window.timeFrom}-${window.timeTo}`,
            error: errorMessage(error),
          });
          break;
        }
      }
    }

    results.push({
      shopId: shop.shopId,
      shopName: shop.shopName || shop.shopId,
      fetched,
      created,
      updated,
      matched,
      review,
      windows: windows.length,
    });
  }

  const businessFlows = await syncShopeeOfficialWalletBusinessFlows({ shopId: input.shopId });
  for (const businessError of businessFlows.errors) {
    errors.push({ shopId: businessError.shopId, error: businessError.error });
  }

  const walletLedger = await syncShopeeOfficialWalletLedger({ shopId: input.shopId });
  for (const ledgerError of walletLedger.errors) {
    errors.push({ shopId: ledgerError.shopId, error: ledgerError.error });
  }
  const pendingSettlements = await refreshShopeePendingSettlementBalances({ shopId: input.shopId });
  const advertisingWallet = await syncShopeeAdvertisingWallet({
    shopId: input.shopId,
    settlementDays: 730,
    adDays: days,
  });
  for (const item of [...advertisingWallet.orderFunding.errors, ...advertisingWallet.advertisingSpend.errors]) {
    errors.push({ shopId: item.shopId, error: item.error });
  }

  return {
    success: errors.length === 0,
    timeFrom,
    timeTo,
    shops: shops.length,
    fetched: results.reduce((sum, item) => sum + item.fetched, 0),
    created: results.reduce((sum, item) => sum + item.created, 0),
    updated: results.reduce((sum, item) => sum + item.updated, 0),
    matched: results.reduce((sum, item) => sum + item.matched, 0),
    review: results.reduce((sum, item) => sum + item.review, 0),
    results,
    errors,
    businessFlows,
    walletLedger,
    pendingSettlements,
    advertisingWallet,
  };
}
