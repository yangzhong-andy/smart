import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applySignedWalletAmount } from "@/lib/shopee-wallets";

export const SHOPEE_SETTLEMENT_WALLET_SOURCE = "SHOPEE_SETTLEMENT";
export const SHOPEE_SETTLEMENT_ADJUSTMENT_SOURCE = "SHOPEE_SETTLEMENT_ADJUSTMENT";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function settlementWalletCreditAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

export function settlementWalletAdjustmentAmount(targetValue: unknown, postedValue: unknown) {
  const target = settlementWalletCreditAmount(targetValue);
  const posted = Number(postedValue);
  if (!Number.isFinite(posted)) throw new Error("钱包已入账结算金额无效");
  return roundMoney(target - posted);
}

export function settlementWalletAdjustmentSourceId(
  settlementId: string,
  settlementSyncedAt: Date,
  targetAmount: number,
) {
  return `${settlementId}:${settlementSyncedAt.toISOString()}:${targetAmount.toFixed(2)}`;
}

export function settlementIsFinal(input: {
  orderStatus: string | null | undefined;
  orderUpdatedAt: Date | null | undefined;
  settlementSyncedAt: Date;
}) {
  if (String(input.orderStatus || "").toUpperCase() !== "COMPLETED") return false;
  return !input.orderUpdatedAt || input.settlementSyncedAt >= input.orderUpdatedAt;
}

type WalletSyncInput = {
  shopId?: string;
  shopSettingId?: string;
  orderSn?: string;
  days?: number;
};

type WalletSyncShopResult = {
  shopId: string;
  shopName: string;
  walletId: string;
  scanned: number;
  credited: number;
  creditedAmount: number;
  adjusted: number;
  adjustmentAmount: number;
  skippedExisting: number;
  skippedNotFinal: number;
  skippedCurrency: number;
  historyMode: "all" | "from_wallet_creation" | "official_wallet";
  pendingBalance: number;
};

export async function calculateShopeePendingSettlements(shopSettingId: string, currency: string) {
  const settlements = await prisma.shopeeSettlement.findMany({
    where: { shopSettingId, order: { status: "COMPLETED" } },
    select: {
      orderSn: true,
      currency: true,
      escrowAmountAfterAdjust: true,
      syncedAt: true,
      order: { select: { status: true, updateTime: true } },
    },
  });
  const eligible = settlements.filter((settlement) => {
    const settlementCurrency = String(settlement.currency || currency).toUpperCase();
    return settlementCurrency === currency.toUpperCase()
      && settlementIsFinal({
        orderStatus: settlement.order.status,
        orderUpdatedAt: settlement.order.updateTime,
        settlementSyncedAt: settlement.syncedAt,
      })
      && settlementWalletCreditAmount(settlement.escrowAmountAfterAdjust) > 0;
  });
  const officialRows = eligible.length > 0 ? await prisma.shopeeWalletTransaction.findMany({
    where: {
      shopSettingId,
      status: "COMPLETED",
      transactionType: "ESCROW_VERIFIED_ADD",
      moneyFlow: "MONEY_IN",
      orderSn: { in: eligible.map((item) => item.orderSn) },
    },
    select: { orderSn: true, amount: true },
  }) : [];
  const officialByOrder = new Map<string, number>();
  for (const row of officialRows) {
    if (!row.orderSn) continue;
    officialByOrder.set(row.orderSn, roundMoney((officialByOrder.get(row.orderSn) || 0) + Number(row.amount)));
  }
  let pendingBalance = 0;
  let mismatchAmount = 0;
  let pendingOrders = 0;
  let mismatchOrders = 0;
  for (const settlement of eligible) {
    const settlementAmount = settlementWalletCreditAmount(settlement.escrowAmountAfterAdjust);
    const officialAmount = officialByOrder.get(settlement.orderSn);
    if (officialAmount == null) {
      pendingOrders += 1;
      pendingBalance = roundMoney(pendingBalance + settlementAmount);
    } else if (Math.abs(settlementAmount - officialAmount) >= 0.005) {
      mismatchOrders += 1;
      mismatchAmount = roundMoney(mismatchAmount + settlementAmount - officialAmount);
    }
  }
  return { pendingBalance, pendingOrders, mismatchAmount, mismatchOrders };
}

export async function refreshShopeePendingSettlementBalances(input: { shopId?: string } = {}) {
  const wallets = await prisma.shopeeWalletAccount.findMany({
    where: {
      walletType: "STORE",
      enabled: true,
      officialBalanceMode: true,
      ...(input.shopId ? { shopSetting: { shopId: input.shopId } } : {}),
    },
    select: { id: true, shopSettingId: true, currency: true, shopSetting: { select: { shopId: true } } },
  });
  const results = [];
  for (const wallet of wallets) {
    const audit = await calculateShopeePendingSettlements(wallet.shopSettingId, wallet.currency);
    await prisma.shopeeWalletAccount.update({
      where: { id: wallet.id },
      data: { pendingBalance: new Prisma.Decimal(audit.pendingBalance) },
    });
    results.push({ walletId: wallet.id, shopId: wallet.shopSetting.shopId, ...audit });
  }
  return results;
}

/**
 * Credits final Shopee per-order settlement amounts into each shop's STORE
 * wallet. The settlement id is the deterministic source id, so scheduled
 * retries and historical backfills cannot post the same order twice.
 *
 * A brand-new, empty wallet receives cached history. If an operator already
 * established a balance or made another manual movement, only orders completed
 * after wallet creation are eligible, avoiding a double count against opening
 * balance.
 */
export async function syncShopeeSettlementWalletEntries(input: WalletSyncInput = {}) {
  const wallets = await prisma.shopeeWalletAccount.findMany({
    where: {
      walletType: "STORE",
      enabled: true,
      ...(input.shopSettingId ? { shopSettingId: input.shopSettingId } : {}),
      ...(input.shopId ? { shopSetting: { shopId: input.shopId } } : {}),
    },
    select: {
      id: true,
      shopSettingId: true,
      currency: true,
      createdAt: true,
      officialBalanceMode: true,
      shopSetting: { select: { shopId: true, shopName: true } },
      entries: {
        where: { sourceType: { notIn: [SHOPEE_SETTLEMENT_WALLET_SOURCE, SHOPEE_SETTLEMENT_ADJUSTMENT_SOURCE] } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const days = Math.min(3650, Math.max(1, Math.trunc(input.days || 730)));
  const earliest = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const results: WalletSyncShopResult[] = [];

  for (const wallet of wallets) {
    if (wallet.officialBalanceMode) {
      const pending = await calculateShopeePendingSettlements(wallet.shopSettingId, wallet.currency);
      await prisma.shopeeWalletAccount.update({
        where: { id: wallet.id },
        data: { pendingBalance: new Prisma.Decimal(pending.pendingBalance) },
      });
      results.push({
        shopId: wallet.shopSetting.shopId,
        shopName: wallet.shopSetting.shopName || wallet.shopSetting.shopId,
        walletId: wallet.id,
        scanned: 0,
        credited: 0,
        creditedAmount: 0,
        adjusted: 0,
        adjustmentAmount: 0,
        skippedExisting: 0,
        skippedNotFinal: 0,
        skippedCurrency: 0,
        historyMode: "official_wallet",
        pendingBalance: pending.pendingBalance,
      });
      continue;
    }
    const hasManualBaseline = wallet.entries.length > 0;
    const completedFrom = hasManualBaseline && wallet.createdAt > earliest ? wallet.createdAt : earliest;
    const settlements = await prisma.shopeeSettlement.findMany({
      where: {
        shopSettingId: wallet.shopSettingId,
        ...(input.orderSn ? { orderSn: input.orderSn } : {}),
        order: { status: "COMPLETED", updateTime: { gte: completedFrom } },
      },
      select: {
        id: true,
        orderSn: true,
        currency: true,
        escrowAmountAfterAdjust: true,
        syncedAt: true,
        order: { select: { status: true, updateTime: true } },
      },
      orderBy: [{ order: { updateTime: "asc" } }, { orderSn: "asc" }],
    });

    let credited = 0;
    let creditedAmount = 0;
    let adjusted = 0;
    let adjustmentAmount = 0;
    let skippedExisting = 0;
    let skippedNotFinal = 0;
    let skippedCurrency = 0;

    for (let offset = 0; offset < settlements.length; offset += 250) {
      const chunk = settlements.slice(offset, offset + 250);
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${wallet.id}`}))`;
        const currentWallet = await tx.shopeeWalletAccount.findUnique({
          where: { id: wallet.id },
          select: { id: true, balance: true, currency: true, enabled: true },
        });
        if (!currentWallet || !currentWallet.enabled) {
          return { credited: 0, amount: 0, adjusted: 0, adjustmentAmount: 0, existing: 0, notFinal: 0, currency: 0 };
        }

        const existing = await tx.shopeeWalletEntry.findMany({
          where: {
            walletId: wallet.id,
            sourceType: { in: [SHOPEE_SETTLEMENT_WALLET_SOURCE, SHOPEE_SETTLEMENT_ADJUSTMENT_SOURCE] },
            relatedOrderSn: { in: chunk.map((item) => item.orderSn) },
          },
          select: { id: true, sourceId: true, sourceType: true, relatedOrderSn: true, amount: true },
        });
        const originalIds = new Set(existing
          .filter((item) => item.sourceType === SHOPEE_SETTLEMENT_WALLET_SOURCE)
          .map((item) => item.sourceId));
        const postedByOrder = new Map<string, number>();
        for (const entry of existing) {
          if (!entry.relatedOrderSn) continue;
          postedByOrder.set(
            entry.relatedOrderSn,
            roundMoney((postedByOrder.get(entry.relatedOrderSn) || 0) + Number(entry.amount)),
          );
        }
        let runningBalance = Number(currentWallet.balance);
        const rows: Prisma.ShopeeWalletEntryCreateManyInput[] = [];
        let notFinal = 0;
        let currency = 0;

        for (const settlement of chunk) {
          if (!settlementIsFinal({
            orderStatus: settlement.order.status,
            orderUpdatedAt: settlement.order.updateTime,
            settlementSyncedAt: settlement.syncedAt,
          })) {
            notFinal += 1;
            continue;
          }
          const settlementCurrency = String(settlement.currency || currentWallet.currency).toUpperCase();
          if (settlementCurrency !== currentWallet.currency.toUpperCase()) {
            currency += 1;
            continue;
          }
          const targetAmount = settlementWalletCreditAmount(settlement.escrowAmountAfterAdjust);
          if (targetAmount <= 0) continue;
          const hasOriginalEntry = originalIds.has(settlement.id);
          const postedAmount = postedByOrder.get(settlement.orderSn) || 0;
          const amount = hasOriginalEntry
            ? settlementWalletAdjustmentAmount(targetAmount, postedAmount)
            : targetAmount;
          if (Math.abs(amount) < 0.005) continue;
          const movement = applySignedWalletAmount(runningBalance, amount);
          runningBalance = movement.balanceAfter;
          rows.push({
            walletId: wallet.id,
            entryType: hasOriginalEntry ? "SETTLEMENT_ADJUSTMENT" : "SETTLEMENT_IN",
            amount: new Prisma.Decimal(movement.amount),
            balanceBefore: new Prisma.Decimal(movement.balanceBefore),
            balanceAfter: new Prisma.Decimal(movement.balanceAfter),
            sourceType: hasOriginalEntry ? SHOPEE_SETTLEMENT_ADJUSTMENT_SOURCE : SHOPEE_SETTLEMENT_WALLET_SOURCE,
            sourceId: hasOriginalEntry
              ? settlementWalletAdjustmentSourceId(settlement.id, settlement.syncedAt, targetAmount)
              : settlement.id,
            relatedOrderSn: settlement.orderSn,
            occurredAt: hasOriginalEntry ? settlement.syncedAt : settlement.order.updateTime || settlement.syncedAt,
            notes: hasOriginalEntry
              ? `Shopee 订单 ${settlement.orderSn} 结算金额修正：${postedAmount.toFixed(2)} → ${targetAmount.toFixed(2)}`
              : `Shopee 订单 ${settlement.orderSn} 结算自动入账`,
            details: {
              settlementId: settlement.id,
              orderSn: settlement.orderSn,
              amountField: "escrowAmountAfterAdjust",
              source: "Shopee Open API",
              ...(hasOriginalEntry ? { postedAmount, targetAmount, adjustmentAmount: movement.amount } : {}),
            },
            createdBy: hasOriginalEntry ? "Shopee 结算差额自动同步" : "Shopee 结算自动同步",
          });
          postedByOrder.set(settlement.orderSn, targetAmount);
        }

        if (rows.length > 0) {
          await tx.shopeeWalletEntry.createMany({ data: rows });
          await tx.shopeeWalletAccount.update({
            where: { id: wallet.id },
            data: { balance: new Prisma.Decimal(runningBalance) },
          });
        }
        return {
          credited: rows.filter((row) => row.entryType === "SETTLEMENT_IN").length,
          amount: roundMoney(rows.filter((row) => row.entryType === "SETTLEMENT_IN").reduce((sum, row) => sum + Number(row.amount), 0)),
          adjusted: rows.filter((row) => row.entryType === "SETTLEMENT_ADJUSTMENT").length,
          adjustmentAmount: roundMoney(rows.filter((row) => row.entryType === "SETTLEMENT_ADJUSTMENT").reduce((sum, row) => sum + Number(row.amount), 0)),
          existing: originalIds.size,
          notFinal,
          currency,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

      credited += outcome.credited;
      creditedAmount = roundMoney(creditedAmount + outcome.amount);
      adjusted += outcome.adjusted;
      adjustmentAmount = roundMoney(adjustmentAmount + outcome.adjustmentAmount);
      skippedExisting += outcome.existing;
      skippedNotFinal += outcome.notFinal;
      skippedCurrency += outcome.currency;
    }

    results.push({
      shopId: wallet.shopSetting.shopId,
      shopName: wallet.shopSetting.shopName || wallet.shopSetting.shopId,
      walletId: wallet.id,
      scanned: settlements.length,
      credited,
      creditedAmount,
      adjusted,
      adjustmentAmount,
      skippedExisting,
      skippedNotFinal,
      skippedCurrency,
      historyMode: hasManualBaseline ? "from_wallet_creation" : "all",
      pendingBalance: 0,
    });
  }

  return {
    wallets: wallets.length,
    credited: results.reduce((sum, item) => sum + item.credited, 0),
    creditedAmount: roundMoney(results.reduce((sum, item) => sum + item.creditedAmount, 0)),
    adjusted: results.reduce((sum, item) => sum + item.adjusted, 0),
    adjustmentAmount: roundMoney(results.reduce((sum, item) => sum + item.adjustmentAmount, 0)),
    results,
  };
}
