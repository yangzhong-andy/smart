import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getShopeeDailyAdPerformance } from "@/lib/shopee-ads";
import { settlementIsFinal, settlementWalletCreditAmount } from "@/lib/shopee-wallet-settlement-sync";

export const SHOPEE_ORDER_AD_TOPUP_SOURCE = "SHOPEE_ORDER_AD_TOPUP";
export const SHOPEE_ORDER_AD_TOPUP_ADJUSTMENT_SOURCE = "SHOPEE_ORDER_AD_TOPUP_ADJUSTMENT";
export const SHOPEE_AD_DAILY_SPEND_SOURCE = "SHOPEE_AD_DAILY_SPEND";
export const SHOPEE_AD_DAILY_SPEND_ADJUSTMENT_SOURCE = "SHOPEE_AD_DAILY_SPEND_ADJUSTMENT";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function advertisingWalletAdjustment(targetValue: unknown, postedValue: unknown) {
  const target = roundMoney(Number(targetValue) || 0);
  const posted = roundMoney(Number(postedValue) || 0);
  return roundMoney(target - posted);
}

export function advertisingSpendDateRange(daysValue: unknown, now = new Date()) {
  // Shopee Ads rejects a start date earlier than six months. Keep a small
  // safety margin because calendar months have different lengths.
  const days = Math.min(180, Math.max(2, Math.trunc(Number(daysValue) || 7)));
  const brazilToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const end = new Date(`${brazilToday}T12:00:00.000Z`);
  // The current Shopee day can still be revised. Ending yesterday gives a
  // stable daily debit; the rolling window revisits recent dates every run.
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function spendOccurredAt(date: string) {
  return new Date(`${date}T12:00:00-03:00`);
}

function adjustmentSourceId(key: string, syncedAt: Date, target: number) {
  return `${key}:${syncedAt.toISOString()}:${target.toFixed(2)}`;
}

type AdWallet = {
  id: string;
  shopSettingId: string;
  currency: string;
  balance: Prisma.Decimal;
  isOfficialTopupTarget: boolean;
  shopSetting: { shopId: string; shopName: string | null };
};

function selectAdvertisingWallet(wallets: AdWallet[]) {
  const selected = wallets.filter((wallet) => wallet.isOfficialTopupTarget);
  if (selected.length === 1) return selected[0];
  if (selected.length === 0 && wallets.length === 1) return wallets[0];
  return null;
}

export async function syncShopeeOrderAdvertisingFunding(input: {
  shopId?: string;
  days?: number;
} = {}) {
  const days = Math.min(3650, Math.max(1, Math.trunc(input.days || 730)));
  const earliest = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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
      walletAccounts: {
        where: { walletType: "ADVERTISING", enabled: true },
        select: {
          id: true,
          shopSettingId: true,
          currency: true,
          balance: true,
          isOfficialTopupTarget: true,
          shopSetting: { select: { shopId: true, shopName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ shopId: string; error: string }> = [];
  for (const shop of shops) {
    const wallet = selectAdvertisingWallet(shop.walletAccounts as AdWallet[]);
    if (!wallet) {
      if (shop.walletAccounts.length > 0) errors.push({ shopId: shop.shopId, error: "请为该店铺指定唯一的官方广告充值目标钱包" });
      continue;
    }
    const settlements = await prisma.shopeeSettlement.findMany({
      where: {
        shopSettingId: shop.id,
        adsEscrowFee: { not: null },
        order: { status: { in: ["COMPLETED", "CANCELLED"] }, updateTime: { gte: earliest } },
      },
      select: {
        id: true,
        orderSn: true,
        currency: true,
        adsEscrowFee: true,
        syncedAt: true,
        order: { select: { status: true, updateTime: true } },
      },
      orderBy: [{ order: { updateTime: "asc" } }, { orderSn: "asc" }],
    });
    let credited = 0;
    let creditedAmount = 0;
    let adjusted = 0;
    let adjustmentAmount = 0;
    let skippedNotFinal = 0;
    let skippedCurrency = 0;

    for (let offset = 0; offset < settlements.length; offset += 250) {
      const chunk = settlements.slice(offset, offset + 250);
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${wallet.id}`}))`;
        const current = await tx.shopeeWalletAccount.findUnique({
          where: { id: wallet.id },
          select: { balance: true, currency: true, enabled: true },
        });
        if (!current?.enabled) return { credited: 0, creditedAmount: 0, adjusted: 0, adjustmentAmount: 0, notFinal: 0, currency: 0 };
        const entries = await tx.shopeeWalletEntry.findMany({
          where: {
            walletId: wallet.id,
            sourceType: { in: [SHOPEE_ORDER_AD_TOPUP_SOURCE, SHOPEE_ORDER_AD_TOPUP_ADJUSTMENT_SOURCE] },
            relatedOrderSn: { in: chunk.map((row) => row.orderSn) },
          },
          select: { sourceType: true, sourceId: true, relatedOrderSn: true, amount: true },
        });
        const originalIds = new Set(entries.filter((row) => row.sourceType === SHOPEE_ORDER_AD_TOPUP_SOURCE).map((row) => row.sourceId));
        const postedByOrder = new Map<string, number>();
        for (const entry of entries) {
          if (!entry.relatedOrderSn) continue;
          postedByOrder.set(entry.relatedOrderSn, roundMoney((postedByOrder.get(entry.relatedOrderSn) || 0) + Number(entry.amount)));
        }
        let runningBalance = Number(current.balance);
        const rows: Prisma.ShopeeWalletEntryCreateManyInput[] = [];
        let notFinal = 0;
        let currency = 0;
        for (const settlement of chunk) {
          const orderStatus = String(settlement.order.status || "").toUpperCase();
          const cancelled = orderStatus === "CANCELLED";
          if (!cancelled && !settlementIsFinal({
            orderStatus: settlement.order.status,
            orderUpdatedAt: settlement.order.updateTime,
            settlementSyncedAt: settlement.syncedAt,
          })) {
            notFinal += 1;
            continue;
          }
          if (String(settlement.currency || current.currency).toUpperCase() !== current.currency.toUpperCase()) {
            currency += 1;
            continue;
          }
          const hasOriginal = originalIds.has(settlement.id);
          const posted = postedByOrder.get(settlement.orderSn) || 0;
          const target = cancelled ? 0 : settlementWalletCreditAmount(settlement.adsEscrowFee);
          if (target <= 0 && !hasOriginal) continue;
          const amount = hasOriginal ? advertisingWalletAdjustment(target, posted) : target;
          if (Math.abs(amount) < 0.005) continue;
          const balanceBefore = runningBalance;
          runningBalance = roundMoney(runningBalance + amount);
          rows.push({
            walletId: wallet.id,
            entryType: hasOriginal ? "ORDER_AUTO_TOPUP_ADJUSTMENT" : "ORDER_AUTO_TOPUP_IN",
            amount: new Prisma.Decimal(amount),
            balanceBefore: new Prisma.Decimal(balanceBefore),
            balanceAfter: new Prisma.Decimal(runningBalance),
            sourceType: hasOriginal ? SHOPEE_ORDER_AD_TOPUP_ADJUSTMENT_SOURCE : SHOPEE_ORDER_AD_TOPUP_SOURCE,
            sourceId: hasOriginal ? adjustmentSourceId(settlement.id, settlement.syncedAt, target) : settlement.id,
            relatedOrderSn: settlement.orderSn,
            occurredAt: hasOriginal ? settlement.syncedAt : settlement.order.updateTime || settlement.syncedAt,
            notes: hasOriginal
              ? `Shopee 订单 ${settlement.orderSn} 广告比例充值修正：${posted.toFixed(2)} → ${target.toFixed(2)}`
              : `Shopee 订单 ${settlement.orderSn} 结算比例自动充值广告钱包`,
            details: {
              settlementId: settlement.id,
              amountField: "ads_escrow_top_up_fee_or_technical_support_fee",
              postedAmount: posted,
              targetAmount: target,
              source: "Shopee Open API",
            },
            createdBy: "Shopee 订单广告充值自动同步",
          });
          postedByOrder.set(settlement.orderSn, target);
        }
        if (rows.length > 0) {
          await tx.shopeeWalletEntry.createMany({ data: rows });
          await tx.shopeeWalletAccount.update({ where: { id: wallet.id }, data: { balance: new Prisma.Decimal(runningBalance) } });
        }
        const newRows = rows.filter((row) => row.entryType === "ORDER_AUTO_TOPUP_IN");
        const adjustmentRows = rows.filter((row) => row.entryType === "ORDER_AUTO_TOPUP_ADJUSTMENT");
        return {
          credited: newRows.length,
          creditedAmount: roundMoney(newRows.reduce((sum, row) => sum + Number(row.amount), 0)),
          adjusted: adjustmentRows.length,
          adjustmentAmount: roundMoney(adjustmentRows.reduce((sum, row) => sum + Number(row.amount), 0)),
          notFinal,
          currency,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
      credited += outcome.credited;
      creditedAmount = roundMoney(creditedAmount + outcome.creditedAmount);
      adjusted += outcome.adjusted;
      adjustmentAmount = roundMoney(adjustmentAmount + outcome.adjustmentAmount);
      skippedNotFinal += outcome.notFinal;
      skippedCurrency += outcome.currency;
    }
    results.push({
      shopId: shop.shopId,
      shopName: shop.shopName || shop.shopId,
      walletId: wallet.id,
      scanned: settlements.length,
      credited,
      creditedAmount,
      adjusted,
      adjustmentAmount,
      skippedNotFinal,
      skippedCurrency,
    });
  }
  return {
    wallets: results.length,
    credited: results.reduce((sum, row) => sum + Number(row.credited), 0),
    creditedAmount: roundMoney(results.reduce((sum, row) => sum + Number(row.creditedAmount), 0)),
    adjusted: results.reduce((sum, row) => sum + Number(row.adjusted), 0),
    adjustmentAmount: roundMoney(results.reduce((sum, row) => sum + Number(row.adjustmentAmount), 0)),
    results,
    errors,
  };
}

export async function syncShopeeAdvertisingSpend(input: { shopId?: string; days?: number } = {}) {
  const range = advertisingSpendDateRange(input.days);
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
      walletAccounts: {
        where: { walletType: "ADVERTISING", enabled: true },
        select: {
          id: true,
          shopSettingId: true,
          currency: true,
          balance: true,
          isOfficialTopupTarget: true,
          shopSetting: { select: { shopId: true, shopName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ shopId: string; error: string }> = [];
  for (const shop of shops) {
    const wallet = selectAdvertisingWallet(shop.walletAccounts as AdWallet[]);
    if (!wallet) continue;
    try {
      const performance = await getShopeeDailyAdPerformance(shop.id, range.startDate, range.endDate);
      const syncedAt = new Date();
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${wallet.id}`}))`;
        const current = await tx.shopeeWalletAccount.findUnique({ where: { id: wallet.id }, select: { balance: true, enabled: true } });
        if (!current?.enabled) return { created: 0, spent: 0, adjusted: 0, adjustmentAmount: 0 };
        const entries = await tx.shopeeWalletEntry.findMany({
          where: {
            walletId: wallet.id,
            sourceType: { in: [SHOPEE_AD_DAILY_SPEND_SOURCE, SHOPEE_AD_DAILY_SPEND_ADJUSTMENT_SOURCE] },
            occurredAt: { gte: spendOccurredAt(range.startDate), lte: spendOccurredAt(range.endDate) },
          },
          select: { sourceType: true, sourceId: true, amount: true },
        });
        const originalDates = new Set(entries.filter((row) => row.sourceType === SHOPEE_AD_DAILY_SPEND_SOURCE).map((row) => row.sourceId));
        const postedByDate = new Map<string, number>();
        for (const entry of entries) {
          const date = entry.sourceId.slice(0, 10);
          // Spend entries are negative; a positive adjustment is a reversal.
          // Negating the signed ledger sum gives the current official spend.
          postedByDate.set(date, roundMoney((postedByDate.get(date) || 0) - Number(entry.amount)));
        }
        let runningBalance = Number(current.balance);
        const rows: Prisma.ShopeeWalletEntryCreateManyInput[] = [];
        for (const daily of performance) {
          const target = roundMoney(Math.max(0, Number(daily.expense) || 0));
          if (target <= 0) continue;
          const hasOriginal = originalDates.has(daily.date);
          const posted = postedByDate.get(daily.date) || 0;
          const difference = hasOriginal ? advertisingWalletAdjustment(target, posted) : target;
          if (Math.abs(difference) < 0.005) continue;
          // Positive difference means more spend and therefore a debit. A
          // negative difference reverses a previously over-reported debit.
          const amount = roundMoney(-difference);
          const balanceBefore = runningBalance;
          runningBalance = roundMoney(runningBalance + amount);
          rows.push({
            walletId: wallet.id,
            entryType: hasOriginal ? "OFFICIAL_AD_SPEND_ADJUSTMENT" : "OFFICIAL_AD_SPEND_OUT",
            amount: new Prisma.Decimal(amount),
            balanceBefore: new Prisma.Decimal(balanceBefore),
            balanceAfter: new Prisma.Decimal(runningBalance),
            sourceType: hasOriginal ? SHOPEE_AD_DAILY_SPEND_ADJUSTMENT_SOURCE : SHOPEE_AD_DAILY_SPEND_SOURCE,
            sourceId: hasOriginal ? adjustmentSourceId(daily.date, syncedAt, target) : daily.date,
            occurredAt: spendOccurredAt(daily.date),
            notes: hasOriginal
              ? `Shopee ${daily.date} 广告消耗修正：${posted.toFixed(2)} → ${target.toFixed(2)}`
              : `Shopee ${daily.date} 官方广告消耗`,
            details: { ...daily, postedAmount: posted, targetAmount: target, source: "Shopee Ads Open API" },
            createdBy: "Shopee 广告消耗自动同步",
          });
          postedByDate.set(daily.date, target);
        }
        if (rows.length > 0) {
          await tx.shopeeWalletEntry.createMany({ data: rows });
          await tx.shopeeWalletAccount.update({ where: { id: wallet.id }, data: { balance: new Prisma.Decimal(runningBalance) } });
        }
        const createdRows = rows.filter((row) => row.entryType === "OFFICIAL_AD_SPEND_OUT");
        const adjustedRows = rows.filter((row) => row.entryType === "OFFICIAL_AD_SPEND_ADJUSTMENT");
        return {
          created: createdRows.length,
          spent: roundMoney(Math.abs(createdRows.reduce((sum, row) => sum + Number(row.amount), 0))),
          adjusted: adjustedRows.length,
          adjustmentAmount: roundMoney(adjustedRows.reduce((sum, row) => sum + Number(row.amount), 0)),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
      results.push({ shopId: shop.shopId, shopName: shop.shopName || shop.shopId, walletId: wallet.id, fetchedDays: performance.length, ...range, ...outcome });
    } catch (error) {
      errors.push({ shopId: shop.shopId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    wallets: results.length,
    spent: roundMoney(results.reduce((sum, row) => sum + Number(row.spent), 0)),
    adjusted: results.reduce((sum, row) => sum + Number(row.adjusted), 0),
    adjustmentAmount: roundMoney(results.reduce((sum, row) => sum + Number(row.adjustmentAmount), 0)),
    results,
    errors,
  };
}

export async function syncShopeeAdvertisingWallet(input: { shopId?: string; settlementDays?: number; adDays?: number } = {}) {
  // Both stages update the same wallet balance. Keep them sequential so the
  // second transaction always sees the balance committed by the first.
  const orderFunding = await syncShopeeOrderAdvertisingFunding({ shopId: input.shopId, days: input.settlementDays || 730 });
  const advertisingSpend = await syncShopeeAdvertisingSpend({ shopId: input.shopId, days: input.adDays || 7 });
  return {
    success: orderFunding.errors.length === 0 && advertisingSpend.errors.length === 0,
    orderFunding,
    advertisingSpend,
  };
}
