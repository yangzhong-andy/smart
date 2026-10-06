import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveCashFlowExchangeRateToCny } from "@/lib/cash-flow-exchange-rate";
import { clearCacheByPrefix } from "@/lib/redis";

export const SHOPEE_OFFICIAL_AD_TOPUP_SOURCE = "SHOPEE_OFFICIAL_AD_TOPUP";

export function shopeeWithdrawalCashFlowUid(withdrawalId: string) {
  return `SHOPEE_WITHDRAWAL_${withdrawalId}`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function officialWalletBusinessKind(transactionType: string, moneyFlow: string) {
  if (transactionType === "SPM_DEDUCT" && moneyFlow === "MONEY_OUT") return "AD_TOPUP";
  if (transactionType === "WITHDRAWAL_CREATED" && moneyFlow === "MONEY_OUT") return "WITHDRAWAL_CREATED";
  if (transactionType === "WITHDRAWAL_COMPLETED") return "WITHDRAWAL_COMPLETED";
  if (transactionType === "ESCROW_VERIFIED_MINUS" && moneyFlow === "MONEY_OUT") return "ORDER_ADJUSTMENT";
  return "OTHER";
}

export async function syncShopeeOfficialWalletBusinessFlows(input: { shopId?: string } = {}) {
  const shops = await prisma.shopeeShopSetting.findMany({
    where: {
      status: "active",
      ...(input.shopId ? { shopId: input.shopId } : {}),
    },
    select: {
      id: true,
      shopId: true,
      shopName: true,
      storeId: true,
      walletAccounts: {
        where: { enabled: true },
        select: {
          id: true,
          walletType: true,
          currency: true,
          balance: true,
          isOfficialTopupTarget: true,
          officialBalanceMode: true,
          officialBalanceCursorAt: true,
          officialBalanceCursorTransactionId: true,
          defaultPayoutBankAccountId: true,
          defaultPayoutBankAccount: {
            select: {
              id: true,
              name: true,
              currency: true,
              exchangeRate: true,
              storeId: true,
            },
          },
        },
      },
    },
  });

  const results: Array<{
    shopId: string;
    adTopupsCreated: number;
    adTopupAmount: number;
    withdrawalsCreated: number;
    withdrawalsCompleted: number;
    cashFlowsCreated: number;
    unassignedAdTopups: number;
  }> = [];
  const errors: Array<{ shopId: string; transactionId?: string; error: string }> = [];

  for (const shop of shops) {
    let adTopupsCreated = 0;
    let adTopupAmount = 0;
    let withdrawalsCreated = 0;
    let withdrawalsCompleted = 0;
    let cashFlowsCreated = 0;
    let unassignedAdTopups = 0;
    const storeWallet = shop.walletAccounts.find((wallet) => wallet.walletType === "STORE");
    const advertisingWallets = shop.walletAccounts.filter((wallet) => wallet.walletType === "ADVERTISING");
    const selectedTargets = advertisingWallets.filter((wallet) => wallet.isOfficialTopupTarget);
    const adTarget = selectedTargets.length === 1
      ? selectedTargets[0]
      : selectedTargets.length === 0 && advertisingWallets.length === 1
        ? advertisingWallets[0]
        : null;
    if (adTarget && !adTarget.isOfficialTopupTarget) {
      await prisma.shopeeWalletAccount.update({
        where: { id: adTarget.id },
        data: { isOfficialTopupTarget: true },
      });
    }

    const transactions = await prisma.shopeeWalletTransaction.findMany({
      where: {
        shopSettingId: shop.id,
        OR: [
          {
            status: "COMPLETED",
            transactionType: { in: ["SPM_DEDUCT", "WITHDRAWAL_CREATED", "WITHDRAWAL_COMPLETED", "ESCROW_VERIFIED_MINUS"] },
          },
          {
            status: "PENDING",
            transactionType: "WITHDRAWAL_CREATED",
          },
        ],
      },
      orderBy: [{ occurredAt: "asc" }, { transactionId: "asc" }],
    });

    for (const transaction of transactions) {
      try {
        const kind = officialWalletBusinessKind(transaction.transactionType, transaction.moneyFlow);
        if (kind === "AD_TOPUP") {
          if (!adTarget || !storeWallet || adTarget.currency !== transaction.currency) {
            unassignedAdTopups += 1;
            await prisma.shopeeWalletTransaction.update({
              where: { id: transaction.id },
              data: { matchStatus: "AD_TOPUP_UNASSIGNED", matchedEntryId: null },
            });
            continue;
          }
          const amount = roundMoney(Math.abs(Number(transaction.amount)));
          if (amount < 0.005) continue;
          const created = await prisma.$transaction(async (tx) => {
            for (const walletId of [storeWallet.id, adTarget.id].sort()) {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${walletId}`}))`;
            }
            const [existingAdEntry, existingStoreEntry] = await Promise.all([
              tx.shopeeWalletEntry.findUnique({
              where: {
                walletId_sourceType_sourceId: {
                  walletId: adTarget.id,
                  sourceType: SHOPEE_OFFICIAL_AD_TOPUP_SOURCE,
                  sourceId: transaction.transactionId,
                },
              },
              select: { id: true },
              }),
              tx.shopeeWalletEntry.findUnique({
                where: {
                  walletId_sourceType_sourceId: {
                    walletId: storeWallet.id,
                    sourceType: "SHOPEE_OFFICIAL_TRANSACTION",
                    sourceId: transaction.transactionId,
                  },
                },
                select: { id: true },
              }),
            ]);
            let adEntryId = existingAdEntry?.id || null;
            let adCreated = false;
            if (!existingAdEntry) {
              const currentAd = await tx.shopeeWalletAccount.findUnique({
                where: { id: adTarget.id },
                select: { balance: true, enabled: true },
              });
              if (!currentAd?.enabled) throw new Error("广告充值目标钱包已停用");
              const balanceBefore = Number(currentAd.balance);
              const balanceAfter = roundMoney(balanceBefore + amount);
              const entry = await tx.shopeeWalletEntry.create({
              data: {
                walletId: adTarget.id,
                entryType: "OFFICIAL_AD_TOPUP_IN",
                amount: new Prisma.Decimal(amount),
                balanceBefore: new Prisma.Decimal(balanceBefore),
                balanceAfter: new Prisma.Decimal(balanceAfter),
                sourceType: SHOPEE_OFFICIAL_AD_TOPUP_SOURCE,
                sourceId: transaction.transactionId,
                counterpartyWalletId: storeWallet.id,
                occurredAt: transaction.occurredAt,
                notes: `Shopee 官方广告充值 · ${transaction.transactionId}`,
                details: {
                  officialTransactionId: transaction.transactionId,
                  transactionType: transaction.transactionType,
                  storeWalletId: storeWallet.id,
                },
                createdBy: "Shopee 官方钱包自动同步",
              },
              });
              await tx.shopeeWalletAccount.update({
                where: { id: adTarget.id },
                data: { balance: new Prisma.Decimal(balanceAfter) },
              });
              adEntryId = entry.id;
              adCreated = true;
            }
            if (!storeWallet.officialBalanceMode && !existingStoreEntry) {
              const currentStore = await tx.shopeeWalletAccount.findUnique({
                where: { id: storeWallet.id },
                select: { balance: true, enabled: true },
              });
              if (!currentStore?.enabled) throw new Error("店铺钱包已停用");
              const balanceBefore = Number(currentStore.balance);
              const balanceAfter = roundMoney(balanceBefore - amount);
              if (balanceAfter < 0) throw new Error("店铺钱包余额不足，无法补记官方广告划拨");
              await tx.shopeeWalletEntry.create({
                data: {
                  walletId: storeWallet.id,
                  entryType: "OFFICIAL_WALLET_PAYMENT_OUT",
                  amount: new Prisma.Decimal(-amount),
                  balanceBefore: new Prisma.Decimal(balanceBefore),
                  balanceAfter: new Prisma.Decimal(balanceAfter),
                  sourceType: "SHOPEE_OFFICIAL_TRANSACTION",
                  sourceId: transaction.transactionId,
                  counterpartyWalletId: adTarget.id,
                  occurredAt: transaction.occurredAt,
                  notes: `Shopee 官方广告充值划拨 · ${transaction.transactionId}`,
                  details: { transactionType: transaction.transactionType, advertisingWalletId: adTarget.id },
                  createdBy: "Shopee 官方钱包自动同步",
                },
              });
              await tx.shopeeWalletAccount.update({
                where: { id: storeWallet.id },
                data: { balance: new Prisma.Decimal(balanceAfter) },
              });
            }
            await tx.shopeeWalletTransaction.update({
              where: { id: transaction.id },
              data: { matchStatus: "MATCHED_AD_WALLET", matchedEntryId: adEntryId },
            });
            return adCreated;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
          if (created) {
            adTopupsCreated += 1;
            adTopupAmount = roundMoney(adTopupAmount + amount);
          }
          continue;
        }

        if (kind === "WITHDRAWAL_CREATED") {
          if (!storeWallet) throw new Error("店铺尚未建立店铺钱包");
          const amount = roundMoney(Math.abs(Number(transaction.amount)));
          if (amount < 0.005) continue;
          const officialWithdrawalId = transaction.withdrawalId || transaction.rootWithdrawalId || null;
          const existing = await prisma.shopeeWalletWithdrawal.findUnique({
            where: { officialTransactionId: transaction.transactionId },
            select: { id: true },
          });
          const withdrawal = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${storeWallet.id}`}))`;
            const result = await tx.shopeeWalletWithdrawal.upsert({
            where: { officialTransactionId: transaction.transactionId },
            create: {
              shopSettingId: shop.id,
              walletId: storeWallet.id,
              amount: new Prisma.Decimal(amount),
              currency: transaction.currency,
              status: "IN_TRANSIT",
              payoutReference: officialWithdrawalId || transaction.transactionId,
              officialTransactionId: transaction.transactionId,
              officialWithdrawalId,
              requestedAt: transaction.occurredAt,
              notes: "Shopee 官方提现；等待公司账户真实到账流水核销",
              createdBy: "Shopee 官方钱包自动同步",
            },
            update: {
              payoutReference: officialWithdrawalId || transaction.transactionId,
              officialWithdrawalId,
            },
            });
            const existingStoreEntry = await tx.shopeeWalletEntry.findUnique({
              where: { walletId_sourceType_sourceId: { walletId: storeWallet.id, sourceType: "SHOPEE_OFFICIAL_TRANSACTION", sourceId: transaction.transactionId } },
              select: { id: true },
            });
            if (!storeWallet.officialBalanceMode && !existingStoreEntry) {
              const currentStore = await tx.shopeeWalletAccount.findUnique({ where: { id: storeWallet.id }, select: { balance: true } });
              if (!currentStore) throw new Error("店铺钱包不存在");
              const balanceBefore = Number(currentStore.balance);
              const balanceAfter = roundMoney(balanceBefore - amount);
              if (balanceAfter < 0) throw new Error("店铺钱包余额不足，无法补记官方提现");
              await tx.shopeeWalletEntry.create({ data: {
                walletId: storeWallet.id,
                entryType: "OFFICIAL_WITHDRAWAL_OUT",
                amount: new Prisma.Decimal(-amount),
                balanceBefore: new Prisma.Decimal(balanceBefore),
                balanceAfter: new Prisma.Decimal(balanceAfter),
                sourceType: "SHOPEE_OFFICIAL_TRANSACTION",
                sourceId: transaction.transactionId,
                occurredAt: transaction.occurredAt,
                notes: `Shopee 官方提现 · ${officialWithdrawalId || transaction.transactionId}`,
                details: { officialWithdrawalId },
                createdBy: "Shopee 官方钱包自动同步",
              } });
              await tx.shopeeWalletAccount.update({ where: { id: storeWallet.id }, data: { balance: new Prisma.Decimal(balanceAfter) } });
            }
            return result;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
          await prisma.shopeeWalletTransaction.update({
            where: { id: transaction.id },
            data: { matchStatus: withdrawal.cashFlowId ? "WITHDRAWAL_RECONCILED" : "WITHDRAWAL_PENDING" },
          });
          if (!existing) withdrawalsCreated += 1;
          continue;
        }

        if (kind === "ORDER_ADJUSTMENT") {
          if (!storeWallet || storeWallet.officialBalanceMode) continue;
          const amount = roundMoney(Math.abs(Number(transaction.amount)));
          if (amount < 0.005) continue;
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${storeWallet.id}`}))`;
            const existing = await tx.shopeeWalletEntry.findUnique({
              where: { walletId_sourceType_sourceId: { walletId: storeWallet.id, sourceType: "SHOPEE_OFFICIAL_TRANSACTION", sourceId: transaction.transactionId } },
              select: { id: true },
            });
            if (existing) return;
            const current = await tx.shopeeWalletAccount.findUnique({ where: { id: storeWallet.id }, select: { balance: true } });
            if (!current) throw new Error("店铺钱包不存在");
            const balanceBefore = Number(current.balance);
            const balanceAfter = roundMoney(balanceBefore - amount);
            if (balanceAfter < 0) throw new Error("店铺钱包余额不足，无法补记官方订单冲减");
            await tx.shopeeWalletEntry.create({ data: {
              walletId: storeWallet.id,
              entryType: "OFFICIAL_ORDER_ADJUSTMENT_OUT",
              amount: new Prisma.Decimal(-amount),
              balanceBefore: new Prisma.Decimal(balanceBefore),
              balanceAfter: new Prisma.Decimal(balanceAfter),
              sourceType: "SHOPEE_OFFICIAL_TRANSACTION",
              sourceId: transaction.transactionId,
              relatedOrderSn: transaction.orderSn,
              occurredAt: transaction.occurredAt,
              notes: `Shopee 官方订单冲减 · ${transaction.orderSn || transaction.transactionId}`,
              createdBy: "Shopee 官方钱包自动同步",
            } });
            await tx.shopeeWalletAccount.update({ where: { id: storeWallet.id }, data: { balance: new Prisma.Decimal(balanceAfter) } });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
          await prisma.shopeeWalletTransaction.update({ where: { id: transaction.id }, data: { matchStatus: "ORDER_ADJUSTMENT_APPLIED" } });
          continue;
        }

        if (kind === "WITHDRAWAL_COMPLETED") {
          const officialIds = [...new Set([transaction.withdrawalId, transaction.rootWithdrawalId].filter(Boolean))] as string[];
          if (officialIds.length === 0) continue;
          const completed = await prisma.$transaction(async (tx) => {
            const withdrawals = await tx.shopeeWalletWithdrawal.findMany({
              where: {
                shopSettingId: shop.id,
                officialWithdrawalId: { in: officialIds },
                status: { not: "CANCELLED" },
              },
              orderBy: { requestedAt: "asc" },
            });
            let completedCount = 0;
            let createdCount = 0;
            for (const withdrawal of withdrawals) {
              if (!withdrawal.platformCompletedAt) completedCount += 1;
              if (withdrawal.cashFlowId || withdrawal.status === "RECEIVED") {
                await tx.shopeeWalletWithdrawal.update({
                  where: { id: withdrawal.id },
                  data: { platformCompletedAt: withdrawal.platformCompletedAt || transaction.occurredAt },
                });
                continue;
              }

              const destination = storeWallet?.defaultPayoutBankAccount;
              if (!destination) {
                await tx.shopeeWalletWithdrawal.update({
                  where: { id: withdrawal.id },
                  data: { platformCompletedAt: withdrawal.platformCompletedAt || transaction.occurredAt },
                });
                continue;
              }
              const withdrawalCurrency = withdrawal.currency === "RMB" ? "CNY" : withdrawal.currency;
              const accountCurrency = destination.currency === "RMB" ? "CNY" : destination.currency;
              if (withdrawalCurrency !== accountCurrency) {
                throw new Error(`提现币种 ${withdrawalCurrency} 与默认到账账户币种 ${accountCurrency} 不一致`);
              }
              const amount = roundMoney(Math.abs(Number(withdrawal.amount)));
              if (amount < 0.005) throw new Error("Shopee 提现回款金额必须大于 0");
              const cashFlowUid = shopeeWithdrawalCashFlowUid(withdrawal.id);
              const existingFlow = await tx.cashFlow.findUnique({
                where: { uid: cashFlowUid },
                select: { id: true },
              });
              const paidAt = transaction.occurredAt;
              const reference = withdrawal.officialWithdrawalId || withdrawal.payoutReference || transaction.transactionId;
              const cashFlow = await tx.cashFlow.upsert({
                where: { uid: cashFlowUid },
                create: {
                  uid: cashFlowUid,
                  date: paidAt,
                  summary: `Shopee回款 - ${shop.shopName || shop.shopId}`,
                  category: "回款/店铺回款",
                  type: "INCOME",
                  amount: new Prisma.Decimal(amount),
                  accountId: destination.id,
                  accountName: destination.name,
                  currency: destination.currency,
                  status: "CONFIRMED",
                  relatedId: reference,
                  businessNumber: reference,
                  remark: `Shopee提现号: ${reference}`,
                  exchangeRate: resolveCashFlowExchangeRateToCny(destination.currency, null, destination.exchangeRate),
                  platform: "SHOPEE",
                  storeId: destination.storeId || shop.storeId || null,
                  storeName: shop.shopName,
                },
                update: {
                  date: paidAt,
                  summary: `Shopee回款 - ${shop.shopName || shop.shopId}`,
                  amount: new Prisma.Decimal(amount),
                  accountId: destination.id,
                  accountName: destination.name,
                  currency: destination.currency,
                  status: "CONFIRMED",
                  relatedId: reference,
                  businessNumber: reference,
                  remark: `Shopee提现号: ${reference}`,
                  exchangeRate: resolveCashFlowExchangeRateToCny(destination.currency, null, destination.exchangeRate),
                  platform: "SHOPEE",
                  storeId: destination.storeId || shop.storeId || null,
                  storeName: shop.shopName,
                },
              });
              await tx.shopeeWalletWithdrawal.update({
                where: { id: withdrawal.id },
                data: {
                  status: "RECEIVED",
                  platformCompletedAt: withdrawal.platformCompletedAt || paidAt,
                  destinationAccountId: destination.id,
                  cashFlowId: cashFlow.id,
                  actualReceivedAmount: new Prisma.Decimal(amount),
                  receivedAt: paidAt,
                  notes: [withdrawal.notes, `平台完成后自动回款至 ${destination.name}`]
                    .filter(Boolean)
                    .join(" · ")
                    .slice(0, 1000),
                },
              });
              await tx.shopeeWalletTransaction.updateMany({
                where: {
                  shopSettingId: shop.id,
                  OR: [
                    { transactionId: withdrawal.officialTransactionId || "__none__" },
                    { withdrawalId: { in: officialIds } },
                    { rootWithdrawalId: { in: officialIds } },
                  ],
                },
                data: { matchStatus: "WITHDRAWAL_RECONCILED" },
              });
              if (!existingFlow) createdCount += 1;
            }
            return { completedCount, createdCount };
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
          withdrawalsCompleted += completed.completedCount;
          cashFlowsCreated += completed.createdCount;
          await prisma.shopeeWalletTransaction.update({
            where: { id: transaction.id },
            data: {
              matchStatus: completed.createdCount > 0
                ? "WITHDRAWAL_RECONCILED"
                : completed.completedCount > 0
                  ? "WITHDRAWAL_PLATFORM_COMPLETED"
                  : transaction.matchStatus,
            },
          });
        }
      } catch (error) {
        errors.push({
          shopId: shop.shopId,
          transactionId: transaction.transactionId,
          error: (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 500),
        });
      }
    }

    results.push({
      shopId: shop.shopId,
      adTopupsCreated,
      adTopupAmount,
      withdrawalsCreated,
      withdrawalsCompleted,
      cashFlowsCreated,
      unassignedAdTopups,
    });
  }

  const cashFlowsCreated = results.reduce((sum, item) => sum + item.cashFlowsCreated, 0);
  if (cashFlowsCreated > 0) {
    await Promise.all([
      clearCacheByPrefix("cash-flow"),
      clearCacheByPrefix("accounts"),
    ]);
  }

  return {
    success: errors.length === 0,
    adTopupsCreated: results.reduce((sum, item) => sum + item.adTopupsCreated, 0),
    adTopupAmount: roundMoney(results.reduce((sum, item) => sum + item.adTopupAmount, 0)),
    withdrawalsCreated: results.reduce((sum, item) => sum + item.withdrawalsCreated, 0),
    withdrawalsCompleted: results.reduce((sum, item) => sum + item.withdrawalsCompleted, 0),
    cashFlowsCreated,
    unassignedAdTopups: results.reduce((sum, item) => sum + item.unassignedAdTopups, 0),
    results,
    errors,
  };
}
