import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateShopeePendingSettlements } from "@/lib/shopee-wallet-settlement-sync";

// Kept for compatibility with historical audit data. New store-wallet
// statements come directly from ShopeeWalletTransaction and never create a
// balance-baseline entry.
export const SHOPEE_OFFICIAL_BALANCE_BASELINE_SOURCE = "SHOPEE_OFFICIAL_BALANCE_BASELINE";
export const SHOPEE_OFFICIAL_TRANSACTION_SOURCE = "SHOPEE_OFFICIAL_TRANSACTION";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function officialWalletEntryType(transactionType: string, moneyFlow: string) {
  if (moneyFlow === "MONEY_IN") return "OFFICIAL_WALLET_IN";
  if (transactionType === "WITHDRAWAL_CREATED") return "OFFICIAL_WITHDRAWAL_OUT";
  if (transactionType === "SPM_DEDUCT") return "OFFICIAL_WALLET_PAYMENT_OUT";
  if (transactionType === "ESCROW_VERIFIED_MINUS") return "OFFICIAL_ORDER_ADJUSTMENT_OUT";
  return "OFFICIAL_WALLET_OUT";
}

export function officialBalanceMatches(balanceBefore: number, amount: number, officialBalanceAfter: number) {
  return Math.abs(roundMoney(balanceBefore + amount) - roundMoney(officialBalanceAfter)) < 0.005;
}

/** Enables official mode without posting a synthetic adjustment entry. */
export async function enableShopeeOfficialBalanceMode(walletId: string, _createdBy: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${walletId}`}))`;
    const wallet = await tx.shopeeWalletAccount.findUnique({
      where: { id: walletId },
      select: { id: true, shopSettingId: true, walletType: true, enabled: true, balance: true, currency: true, officialBalanceMode: true },
    });
    if (!wallet || wallet.walletType !== "STORE" || !wallet.enabled) throw new Error("请选择有效的 Shopee 店铺钱包");
    if (wallet.officialBalanceMode) throw new Error("该钱包已启用官方流水同步");

    const latest = await tx.shopeeWalletTransaction.findFirst({
      where: { walletId, currentBalance: { not: null } },
      select: { transactionId: true, currentBalance: true, occurredAt: true },
      orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }],
    });
    if (latest?.currentBalance == null) throw new Error("尚未取得 Shopee 官方钱包余额，请先同步官方流水");

    const balanceBefore = Number(wallet.balance);
    const officialBalance = roundMoney(Number(latest.currentBalance));
    if (officialBalance < 0) throw new Error("Shopee 官方钱包余额异常，已停止同步");
    const pending = await calculateShopeePendingSettlements(wallet.shopSettingId, wallet.currency);
    const updated = await tx.shopeeWalletAccount.update({
      where: { id: walletId },
      data: {
        balance: new Prisma.Decimal(officialBalance),
        pendingBalance: new Prisma.Decimal(pending.pendingBalance),
        officialBalanceMode: true,
        officialBalanceCursorAt: latest.occurredAt,
        officialBalanceCursorTransactionId: latest.transactionId,
        officialBalanceLastSyncAt: new Date(),
      },
    });
    return {
      wallet: updated,
      balanceBefore,
      officialBalance,
      adjustment: 0,
      pending,
      cursorTransactionId: latest.transactionId,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
}

/**
 * Refreshes the wallet card from the latest official transaction. It does not
 * create a second internal statement: ShopeeWalletTransaction is the only
 * store-wallet statement source, including pending withdrawals.
 */
export async function syncShopeeOfficialWalletLedger(input: { shopId?: string } = {}) {
  const wallets = await prisma.shopeeWalletAccount.findMany({
    where: {
      walletType: "STORE",
      enabled: true,
      officialBalanceMode: true,
      ...(input.shopId ? { shopSetting: { shopId: input.shopId } } : {}),
    },
    select: {
      id: true,
      officialBalanceCursorAt: true,
      officialBalanceCursorTransactionId: true,
      shopSetting: { select: { shopId: true } },
    },
  });
  const results: Array<{ shopId: string; walletId: string; applied: number; amount: number; skippedZero: number; balance: number }> = [];
  const errors: Array<{ shopId: string; error: string }> = [];

  for (const wallet of wallets) {
    try {
      const latest = await prisma.shopeeWalletTransaction.findFirst({
        where: { walletId: wallet.id, currentBalance: { not: null } },
        select: { transactionId: true, currentBalance: true, occurredAt: true },
        orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }],
      });
      if (latest?.currentBalance == null) throw new Error("尚未取得 Shopee 官方钱包余额");

      const newerWhere: Prisma.ShopeeWalletTransactionWhereInput = wallet.officialBalanceCursorAt && wallet.officialBalanceCursorTransactionId
        ? {
            walletId: wallet.id,
            OR: [
              { occurredAt: { gt: wallet.officialBalanceCursorAt } },
              { occurredAt: wallet.officialBalanceCursorAt, transactionId: { gt: wallet.officialBalanceCursorTransactionId } },
            ],
          }
        : { walletId: wallet.id };
      const [applied, amount] = await Promise.all([
        prisma.shopeeWalletTransaction.count({ where: newerWhere }),
        prisma.shopeeWalletTransaction.aggregate({ where: newerWhere, _sum: { amount: true } }),
      ]);
      const balance = roundMoney(Number(latest.currentBalance));
      await prisma.shopeeWalletAccount.update({
        where: { id: wallet.id },
        data: {
          balance: new Prisma.Decimal(balance),
          officialBalanceCursorAt: latest.occurredAt,
          officialBalanceCursorTransactionId: latest.transactionId,
          officialBalanceLastSyncAt: new Date(),
        },
      });
      results.push({
        shopId: wallet.shopSetting.shopId,
        walletId: wallet.id,
        applied,
        amount: roundMoney(Number(amount._sum.amount || 0)),
        skippedZero: 0,
        balance,
      });
    } catch (error) {
      errors.push({
        shopId: wallet.shopSetting.shopId,
        error: (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 500),
      });
    }
  }
  return {
    success: errors.length === 0,
    wallets: wallets.length,
    applied: results.reduce((sum, item) => sum + item.applied, 0),
    amount: roundMoney(results.reduce((sum, item) => sum + item.amount, 0)),
    results,
    errors,
  };
}
