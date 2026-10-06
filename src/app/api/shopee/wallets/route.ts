import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  applySignedWalletAmount,
  normalizeAutoTopupRate,
  normalizeCurrency,
  normalizeMoney,
  normalizeWalletKind,
  validateInternalTransfer,
} from "@/lib/shopee-wallets";
import { enableShopeeOfficialBalanceMode } from "@/lib/shopee-wallet-official-ledger";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const operatorName = (auth: any) => auth.user?.name || auth.user?.email || "管理员";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function positiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function parseBrazilDateTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw)) {
    throw new Error("请选择有效的充值发生时间");
  }
  const occurredAt = new Date(`${raw.length === 16 ? `${raw}:00` : raw}-03:00`);
  if (!Number.isFinite(occurredAt.getTime())) throw new Error("请选择有效的充值发生时间");
  return occurredAt;
}

function serializeTransferVoucher(value: unknown) {
  const items = (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) throw new Error("请上传转账凭证");
  if (items.length > 5) throw new Error("转账凭证最多上传 5 张");
  const validPrefix = /^(data:image\/[a-z0-9.+-]+;base64,|https?:\/\/)/i;
  if (items.some((item) => !validPrefix.test(item))) throw new Error("转账凭证格式无效，请重新上传图片");
  if (items.some((item) => item.length > 1_500_000) || items.reduce((sum, item) => sum + item.length, 0) > 5_000_000) {
    throw new Error("转账凭证图片过大，请压缩后重新上传");
  }
  return items.length === 1 ? items[0] : JSON.stringify(items);
}

function walletJson(wallet: any) {
  const { officialTransactions, ...rest } = wallet;
  const latestOfficial = officialTransactions?.[0] || null;
  return {
    ...rest,
    balance: Number(wallet.balance),
    pendingBalance: Number(wallet.pendingBalance),
    autoTopupRatePercent: Number(wallet.autoTopupRate) * 100,
    latestOfficialBalance: latestOfficial?.currentBalance == null ? null : Number(latestOfficial.currentBalance),
    latestOfficialBalanceAt: latestOfficial?.occurredAt || null,
    latestOfficialTransactionId: latestOfficial?.transactionId || null,
    officialBalanceDifference: latestOfficial?.currentBalance == null
      ? null
      : Math.round((Number(wallet.balance) - Number(latestOfficial.currentBalance)) * 100) / 100,
  };
}

function entryJson(entry: any) {
  return {
    ...entry,
    amount: Number(entry.amount),
    balanceBefore: Number(entry.balanceBefore),
    balanceAfter: Number(entry.balanceAfter),
  };
}

function officialTransactionJson(transaction: any) {
  return {
    ...transaction,
    amount: Number(transaction.amount),
    currentBalance: transaction.currentBalance == null ? null : Number(transaction.currentBalance),
    transactionFee: transaction.transactionFee == null ? null : Number(transaction.transactionFee),
  };
}

function withdrawalJson(withdrawal: any) {
  return {
    ...withdrawal,
    amount: Number(withdrawal.amount),
    actualReceivedAmount: withdrawal.actualReceivedAmount == null ? null : Number(withdrawal.actualReceivedAmount),
  };
}

function cashFlowCandidateJson(flow: any) {
  return {
    id: flow.id,
    date: flow.date,
    summary: flow.summary,
    amount: Number(flow.amount),
    currency: flow.currency,
    accountId: flow.accountId,
    accountName: flow.accountName,
    businessNumber: flow.businessNumber,
    remark: flow.remark,
    account: flow.account,
  };
}

async function lockWallets(tx: Prisma.TransactionClient, walletIds: string[]) {
  for (const walletId of [...new Set(walletIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee-wallet:${walletId}`}))`;
  }
}

async function addEntry(tx: Prisma.TransactionClient, input: {
  wallet: { id: string; balance: Prisma.Decimal };
  amount: number;
  entryType: string;
  sourceType: string;
  sourceId: string;
  counterpartyWalletId?: string | null;
  bankAccountId?: string | null;
  cashFlowId?: string | null;
  notes?: string | null;
  details?: Prisma.InputJsonValue;
  createdBy: string;
  occurredAt?: Date;
}) {
  const movement = applySignedWalletAmount(input.wallet.balance, input.amount);
  await tx.shopeeWalletAccount.update({
    where: { id: input.wallet.id },
    data: { balance: new Prisma.Decimal(movement.balanceAfter) },
  });
  return tx.shopeeWalletEntry.create({
    data: {
      walletId: input.wallet.id,
      entryType: input.entryType,
      amount: new Prisma.Decimal(movement.amount),
      balanceBefore: new Prisma.Decimal(movement.balanceBefore),
      balanceAfter: new Prisma.Decimal(movement.balanceAfter),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      counterpartyWalletId: input.counterpartyWalletId || null,
      bankAccountId: input.bankAccountId || null,
      cashFlowId: input.cashFlowId || null,
      occurredAt: input.occurredAt || new Date(),
      notes: input.notes || null,
      details: input.details,
      createdBy: input.createdBy,
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "accounts") {
      const [shops, wallets, inTransitWithdrawals] = await Promise.all([
        prisma.shopeeShopSetting.findMany({
          where: { status: "active" },
          select: { id: true, shopId: true, shopName: true, region: true, currency: true, store: { select: { id: true, name: true } } },
          orderBy: [{ createdAt: "asc" }],
        }),
        prisma.shopeeWalletAccount.findMany({
          include: {
            shopSetting: { select: { shopId: true, shopName: true, region: true } },
            adAccount: { select: { id: true, accountName: true, currency: true } },
            defaultPayoutBankAccount: { select: { id: true, name: true, accountNumber: true, currency: true } },
            officialTransactions: {
              where: { currentBalance: { not: null } },
              select: { transactionId: true, currentBalance: true, occurredAt: true },
              orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }],
              take: 1,
            },
          },
          orderBy: [{ shopSettingId: "asc" }, { walletType: "asc" }, { createdAt: "asc" }],
        }),
        prisma.shopeeWalletWithdrawal.findMany({
          where: { status: "IN_TRANSIT" },
          include: {
            wallet: { select: { name: true } },
            shopSetting: { select: { shopId: true, shopName: true } },
            destinationAccount: { select: { id: true, name: true, accountNumber: true } },
            cashFlow: { select: { id: true, date: true, summary: true, amount: true, currency: true, accountName: true } },
          },
          orderBy: { requestedAt: "desc" },
        }),
      ]);
      return NextResponse.json({
        shops,
        wallets: wallets.map(walletJson),
        inTransitWithdrawals: inTransitWithdrawals.map(withdrawalJson),
      }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
    }
    const entryPage = positiveInt(params.get("entryPage"), 1, 100_000);
    const entryPageSize = positiveInt(params.get("entryPageSize"), 50, 100);
    const entryKeyword = params.get("entryKeyword")?.trim().slice(0, 100) || "";
    const entryShopSettingId = params.get("entryShopSettingId")?.trim() || "";
    const entryMoneyFlow = params.get("entryMoneyFlow")?.trim().toUpperCase() || "";
    const requestedEntryTransactionType = params.get("entryTransactionType")?.trim().toUpperCase() || "";
    const entryTransactionType = new Set([
      "ESCROW_VERIFIED_ADD",
      "ESCROW_VERIFIED_MINUS",
      "SPM_DEDUCT",
      "WITHDRAWAL_CREATED",
    ]).has(requestedEntryTransactionType) ? requestedEntryTransactionType : "";
    const advertisingEntryPage = positiveInt(params.get("advertisingEntryPage"), 1, 100_000);
    const advertisingEntryPageSize = positiveInt(params.get("advertisingEntryPageSize"), 50, 100);
    const advertisingEntryMoneyFlow = params.get("advertisingEntryMoneyFlow")?.trim().toUpperCase() || "";
    const requestedAdvertisingEntryType = params.get("advertisingEntryType")?.trim().toUpperCase() || "";
    const advertisingEntryType = new Set([
      "OFFICIAL_AD_TOPUP_IN",
      "AUTO_TOPUP",
      "INTERNAL_TRANSFER_IN",
      "BANK_FUNDING_IN",
      "OFFICIAL_AD_SPEND_OUT",
      "OFFICIAL_AD_SPEND_ADJUSTMENT",
      "ORDER_AUTO_TOPUP_IN",
      "ORDER_AUTO_TOPUP_ADJUSTMENT",
      "OFFICIAL_AD_CREDIT_IN",
      "OPENING_BALANCE",
      "MANUAL_ADJUSTMENT",
    ]).has(requestedAdvertisingEntryType) ? requestedAdvertisingEntryType : "";
    const officialPage = positiveInt(params.get("officialPage"), 1, 100_000);
    const officialPageSize = positiveInt(params.get("officialPageSize"), 50, 100);
    const officialKeyword = params.get("officialKeyword")?.trim().slice(0, 100) || "";
    const officialShopSettingId = params.get("officialShopSettingId")?.trim() || "";
    const officialMoneyFlow = params.get("officialMoneyFlow")?.trim().toUpperCase() || "";
    const officialMatchStatus = params.get("officialMatchStatus")?.trim().toUpperCase() || "";
    // The store-wallet statement is the exact Shopee wallet statement returned
    // by payment/get_wallet_transaction_list. Do not rebuild it from settlement
    // rows or mix in the separate advertising-wallet ledger.
    const entryWhere: Prisma.ShopeeWalletTransactionWhereInput = {
      ...(entryShopSettingId ? { shopSettingId: entryShopSettingId } : {}),
      ...(entryMoneyFlow === "MONEY_IN" || entryMoneyFlow === "MONEY_OUT" ? { moneyFlow: entryMoneyFlow } : {}),
      ...(entryTransactionType ? { transactionType: entryTransactionType } : {}),
      // Seller Centre does not count the zero-value completion notification
      // as a transaction; the monetary withdrawal is WITHDRAWAL_CREATED.
      NOT: { transactionType: "WITHDRAWAL_COMPLETED", amount: 0 },
      ...(entryKeyword ? {
        OR: [
          { transactionId: { contains: entryKeyword, mode: "insensitive" } },
          { orderSn: { contains: entryKeyword, mode: "insensitive" } },
          { description: { contains: entryKeyword, mode: "insensitive" } },
          { reason: { contains: entryKeyword, mode: "insensitive" } },
          { transactionType: { contains: entryKeyword, mode: "insensitive" } },
          { shopSetting: { shopId: { contains: entryKeyword, mode: "insensitive" } } },
          { shopSetting: { shopName: { contains: entryKeyword, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const advertisingEntryWhere: Prisma.ShopeeWalletEntryWhereInput = {
      wallet: {
        walletType: "ADVERTISING",
        ...(entryShopSettingId ? { shopSettingId: entryShopSettingId } : {}),
      },
      ...(advertisingEntryMoneyFlow === "MONEY_IN" ? { amount: { gt: 0 } } : {}),
      ...(advertisingEntryMoneyFlow === "MONEY_OUT" ? { amount: { lt: 0 } } : {}),
      ...(advertisingEntryType ? { entryType: advertisingEntryType } : {}),
      ...(entryKeyword ? {
        OR: [
          { relatedOrderSn: { contains: entryKeyword, mode: "insensitive" } },
          { sourceId: { contains: entryKeyword, mode: "insensitive" } },
          { notes: { contains: entryKeyword, mode: "insensitive" } },
          { createdBy: { contains: entryKeyword, mode: "insensitive" } },
          { bankAccount: { name: { contains: entryKeyword, mode: "insensitive" } } },
          { wallet: { name: { contains: entryKeyword, mode: "insensitive" } } },
          { wallet: { shopSetting: { shopId: { contains: entryKeyword, mode: "insensitive" } } } },
          { wallet: { shopSetting: { shopName: { contains: entryKeyword, mode: "insensitive" } } } },
        ],
      } : {}),
    };
    const officialWhere: Prisma.ShopeeWalletTransactionWhereInput = {
      ...(officialShopSettingId ? { shopSettingId: officialShopSettingId } : {}),
      ...(officialMoneyFlow === "MONEY_IN" || officialMoneyFlow === "MONEY_OUT" ? { moneyFlow: officialMoneyFlow } : {}),
      ...(officialMatchStatus ? { matchStatus: officialMatchStatus } : {}),
      ...(officialKeyword ? {
        OR: [
          { transactionId: { contains: officialKeyword, mode: "insensitive" } },
          { orderSn: { contains: officialKeyword, mode: "insensitive" } },
          { description: { contains: officialKeyword, mode: "insensitive" } },
          { reason: { contains: officialKeyword, mode: "insensitive" } },
          { transactionType: { contains: officialKeyword, mode: "insensitive" } },
          { shopSetting: { shopId: { contains: officialKeyword, mode: "insensitive" } } },
          { shopSetting: { shopName: { contains: officialKeyword, mode: "insensitive" } } },
        ],
      } : {}),
    };
    const officialSummaryWhere: Prisma.ShopeeWalletTransactionWhereInput = {
      ...(officialShopSettingId ? { shopSettingId: officialShopSettingId } : {}),
    };
    const [
      shops,
      wallets,
      entries,
      entryTotal,
      advertisingEntries,
      advertisingEntryTotal,
      officialTransactions,
      officialTotal,
      officialInflow,
      officialOutflow,
      officialMatched,
      officialReview,
      withdrawals,
      inTransitWithdrawals,
      adAccounts,
      cashFlowCandidates,
      bankAccounts,
      bankAccountBalanceGroups,
      advertisingEntryGroups,
      confirmedOrderAdTopups,
      pendingOrderAdTopups,
    ] = await Promise.all([
      prisma.shopeeShopSetting.findMany({
        where: { status: "active" },
        select: { id: true, shopId: true, shopName: true, region: true, currency: true, store: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: "asc" }],
      }),
      prisma.shopeeWalletAccount.findMany({
        include: {
          shopSetting: { select: { shopId: true, shopName: true, region: true } },
          adAccount: { select: { id: true, accountName: true, currency: true } },
          defaultPayoutBankAccount: { select: { id: true, name: true, accountNumber: true, currency: true } },
          officialTransactions: {
            where: { currentBalance: { not: null } },
            select: { transactionId: true, currentBalance: true, occurredAt: true },
            orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }],
            take: 1,
          },
        },
        orderBy: [{ shopSettingId: "asc" }, { walletType: "asc" }, { createdAt: "asc" }],
      }),
      prisma.shopeeWalletTransaction.findMany({
        where: entryWhere,
        include: {
          shopSetting: { select: { shopId: true, shopName: true } },
          wallet: { select: { id: true, name: true, currency: true } },
        },
        orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }],
        skip: (entryPage - 1) * entryPageSize,
        take: entryPageSize,
      }),
      prisma.shopeeWalletTransaction.count({ where: entryWhere }),
      prisma.shopeeWalletEntry.findMany({
        where: advertisingEntryWhere,
        include: {
          wallet: { select: { name: true, walletType: true, currency: true, shopSetting: { select: { shopId: true, shopName: true } } } },
          bankAccount: { select: { id: true, name: true, accountNumber: true, currency: true } },
          cashFlow: { select: { id: true, summary: true, amount: true, currency: true } },
        },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (advertisingEntryPage - 1) * advertisingEntryPageSize,
        take: advertisingEntryPageSize,
      }),
      prisma.shopeeWalletEntry.count({ where: advertisingEntryWhere }),
      prisma.shopeeWalletTransaction.findMany({
        where: officialWhere,
        include: {
          shopSetting: { select: { shopId: true, shopName: true } },
          wallet: { select: { id: true, name: true, currency: true } },
          matchedEntry: { select: { id: true, wallet: { select: { id: true, name: true, walletType: true } } } },
        },
        orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }],
        skip: (officialPage - 1) * officialPageSize,
        take: officialPageSize,
      }),
      prisma.shopeeWalletTransaction.count({ where: officialWhere }),
      prisma.shopeeWalletTransaction.aggregate({
        where: { ...officialSummaryWhere, moneyFlow: "MONEY_IN", status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.shopeeWalletTransaction.aggregate({
        where: { ...officialSummaryWhere, moneyFlow: "MONEY_OUT", status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.shopeeWalletTransaction.count({
        where: { ...officialSummaryWhere, matchStatus: "MATCHED_SETTLEMENT" },
      }),
      prisma.shopeeWalletTransaction.count({
        where: {
          ...officialSummaryWhere,
          matchStatus: { in: ["UNMATCHED_SETTLEMENT", "AMOUNT_MISMATCH", "REVIEW_INFLOW", "REVIEW_OUTFLOW", "NO_STORE_WALLET", "AD_TOPUP_UNASSIGNED", "WITHDRAWAL_PENDING", "WITHDRAWAL_PLATFORM_COMPLETED"] },
        },
      }),
      prisma.shopeeWalletWithdrawal.findMany({
        include: {
          wallet: { select: { name: true } },
          shopSetting: { select: { shopId: true, shopName: true } },
          destinationAccount: { select: { id: true, name: true, accountNumber: true } },
          cashFlow: { select: { id: true, date: true, summary: true, amount: true, currency: true, accountName: true } },
        },
        orderBy: { requestedAt: "desc" },
        take: 300,
      }),
      // 资产汇总不能依赖历史列表的 300 条展示上限，否则店铺增多后会少算在途资金。
      prisma.shopeeWalletWithdrawal.findMany({
        where: { status: "IN_TRANSIT" },
        include: {
          wallet: { select: { name: true } },
          shopSetting: { select: { shopId: true, shopName: true } },
          destinationAccount: { select: { id: true, name: true, accountNumber: true } },
          cashFlow: { select: { id: true, date: true, summary: true, amount: true, currency: true, accountName: true } },
        },
        orderBy: { requestedAt: "desc" },
      }),
      prisma.adAccount.findMany({
        select: { id: true, accountName: true, currency: true, currentBalance: true, agencyName: true },
        orderBy: { accountName: "asc" },
      }),
      prisma.cashFlow.findMany({
        where: {
          type: "INCOME",
          status: "CONFIRMED",
          isReversal: false,
          shopeeWalletWithdrawal: { is: null },
          date: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
        },
        select: {
          id: true,
          date: true,
          summary: true,
          amount: true,
          currency: true,
          accountId: true,
          accountName: true,
          businessNumber: true,
          remark: true,
          account: { select: { id: true, name: true, accountNumber: true, currency: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
      prisma.bankAccount.findMany({
        select: { id: true, name: true, accountNumber: true, currency: true, exchangeRate: true, initialCapital: true },
        orderBy: [{ currency: "asc" }, { name: "asc" }],
      }),
      prisma.cashFlow.groupBy({
        by: ["accountId"],
        where: { type: { in: ["INCOME", "EXPENSE"] } },
        _sum: { amount: true },
      }),
      prisma.shopeeWalletEntry.groupBy({
        by: ["walletId", "entryType"],
        where: {
          wallet: {
            walletType: "ADVERTISING",
            ...(entryShopSettingId ? { shopSettingId: entryShopSettingId } : {}),
          },
          entryType: {
            in: [
              "BANK_FUNDING_IN",
              "OFFICIAL_AD_TOPUP_IN",
              "INTERNAL_TRANSFER_IN",
              "OFFICIAL_AD_SPEND_OUT",
              "OFFICIAL_AD_SPEND_ADJUSTMENT",
              "ORDER_AUTO_TOPUP_IN",
              "ORDER_AUTO_TOPUP_ADJUSTMENT",
            ],
          },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.shopeeSettlement.groupBy({
        by: ["shopSettingId"],
        where: {
          ...(entryShopSettingId ? { shopSettingId: entryShopSettingId } : {}),
          adsEscrowFee: { gt: 0 },
          order: { status: "COMPLETED" },
        },
        _count: { _all: true },
        _sum: { adsEscrowFee: true },
      }),
      prisma.shopeeSettlement.groupBy({
        by: ["shopSettingId"],
        where: {
          ...(entryShopSettingId ? { shopSettingId: entryShopSettingId } : {}),
          adsEscrowFee: { gt: 0 },
          order: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        },
        _count: { _all: true },
        _sum: { adsEscrowFee: true },
      }),
    ]);
    const advertisingFundingByWallet = new Map<string, {
      walletId: string;
      shopSettingId: string;
      currency: string;
      companyFunding: number;
      companyFundingCount: number;
      storeWalletFunding: number;
      storeWalletFundingCount: number;
      confirmedOrderFunding: number;
      confirmedOrderCount: number;
      pendingOrderFunding: number;
      pendingOrderCount: number;
      recordedSpend: number;
      recordedSpendCount: number;
    }>();
    const advertisingWallets = wallets.filter((wallet) => wallet.walletType === "ADVERTISING" && wallet.enabled);
    for (const wallet of advertisingWallets) {
      advertisingFundingByWallet.set(wallet.id, {
        walletId: wallet.id,
        shopSettingId: wallet.shopSettingId,
        currency: wallet.currency,
        companyFunding: 0,
        companyFundingCount: 0,
        storeWalletFunding: 0,
        storeWalletFundingCount: 0,
        confirmedOrderFunding: 0,
        confirmedOrderCount: 0,
        pendingOrderFunding: 0,
        pendingOrderCount: 0,
        recordedSpend: 0,
        recordedSpendCount: 0,
      });
    }
    for (const group of advertisingEntryGroups) {
      const summary = advertisingFundingByWallet.get(group.walletId);
      if (!summary) continue;
      const amount = Number(group._sum.amount || 0);
      const count = group._count._all;
      if (group.entryType === "BANK_FUNDING_IN") {
        summary.companyFunding += amount;
        summary.companyFundingCount += count;
      } else if (group.entryType === "OFFICIAL_AD_TOPUP_IN" || group.entryType === "INTERNAL_TRANSFER_IN") {
        summary.storeWalletFunding += amount;
        summary.storeWalletFundingCount += count;
      } else if (group.entryType === "OFFICIAL_AD_SPEND_OUT") {
        summary.recordedSpend += Math.abs(amount);
        summary.recordedSpendCount += count;
      } else if (group.entryType === "OFFICIAL_AD_SPEND_ADJUSTMENT") {
        summary.recordedSpend -= amount;
      } else if (group.entryType === "ORDER_AUTO_TOPUP_IN" || group.entryType === "ORDER_AUTO_TOPUP_ADJUSTMENT") {
        summary.confirmedOrderFunding += amount;
        if (group.entryType === "ORDER_AUTO_TOPUP_IN") summary.confirmedOrderCount += count;
      }
    }
    const officialTargetByShop = new Map<string, string>();
    for (const wallet of advertisingWallets) {
      if (wallet.isOfficialTopupTarget || !officialTargetByShop.has(wallet.shopSettingId)) {
        officialTargetByShop.set(wallet.shopSettingId, wallet.id);
      }
    }
    for (const group of confirmedOrderAdTopups) {
      const walletId = officialTargetByShop.get(group.shopSettingId);
      const summary = walletId ? advertisingFundingByWallet.get(walletId) : null;
      if (!summary) continue;
      // Before the first ledger backfill, keep showing the official settlement
      // total. Once entries exist, the append-only ledger is authoritative.
      if (summary.confirmedOrderCount === 0) {
        summary.confirmedOrderFunding = Number(group._sum.adsEscrowFee || 0);
        summary.confirmedOrderCount = group._count._all;
      }
    }
    for (const group of pendingOrderAdTopups) {
      const walletId = officialTargetByShop.get(group.shopSettingId);
      const summary = walletId ? advertisingFundingByWallet.get(walletId) : null;
      if (!summary) continue;
      summary.pendingOrderFunding = Number(group._sum.adsEscrowFee || 0);
      summary.pendingOrderCount = group._count._all;
    }
    const advertisingFundingWallets = [...advertisingFundingByWallet.values()];
    return NextResponse.json({
      shops,
      wallets: wallets.map(walletJson),
      entries: entries.map(officialTransactionJson),
      entryPagination: {
        page: entryPage,
        pageSize: entryPageSize,
        total: entryTotal,
        totalPages: Math.max(1, Math.ceil(entryTotal / entryPageSize)),
      },
      advertisingEntries: advertisingEntries.map(entryJson),
      advertisingEntryPagination: {
        page: advertisingEntryPage,
        pageSize: advertisingEntryPageSize,
        total: advertisingEntryTotal,
        totalPages: Math.max(1, Math.ceil(advertisingEntryTotal / advertisingEntryPageSize)),
      },
      advertisingFundingSummary: {
        wallets: advertisingFundingWallets,
        spendDataConnected: advertisingFundingWallets.some((item) => item.recordedSpendCount > 0),
      },
      officialTransactions: officialTransactions.map(officialTransactionJson),
      officialPagination: {
        page: officialPage,
        pageSize: officialPageSize,
        total: officialTotal,
        totalPages: Math.max(1, Math.ceil(officialTotal / officialPageSize)),
      },
      officialSummary: {
        inflow: Number(officialInflow._sum.amount || 0),
        outflow: Math.abs(Number(officialOutflow._sum.amount || 0)),
        matched: officialMatched,
        review: officialReview,
      },
      withdrawals: withdrawals.map(withdrawalJson),
      inTransitWithdrawals: inTransitWithdrawals.map(withdrawalJson),
      adAccounts: adAccounts.map((account) => ({ ...account, currentBalance: Number(account.currentBalance) })),
      cashFlowCandidates: cashFlowCandidates.map(cashFlowCandidateJson),
      bankAccounts: bankAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        accountNumber: account.accountNumber,
        currency: account.currency,
        exchangeRate: Number(account.exchangeRate),
        currentBalance: Number(account.initialCapital || 0) + Number(bankAccountBalanceGroups.find((group) => group.accountId === account.id)?._sum.amount || 0),
      })),
      policy: {
        isolatedFromFinance: true,
        description: "平台内部划拨不写公司财务；公司账户充值会新建支出流水；已配置默认到账账户的 Shopee 提现，在平台确认完成后自动新建收款并核销。",
      },
    }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Shopee 钱包数据加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const action = String(body.action || "").trim().toLowerCase();
    const createdBy = operatorName(auth);

    if (action === "create_wallet") {
      const shopSettingId = String(body.shopSettingId || "").trim();
      const walletType = normalizeWalletKind(body.walletType);
      const name = String(body.name || "").trim();
      const currency = normalizeCurrency(body.currency);
      const openingBalance = normalizeMoney(body.openingBalance || 0, "期初余额", true);
      const autoTopupRate = normalizeAutoTopupRate(body.autoTopupRatePercent);
      if (!shopSettingId || !name) throw new Error("请选择店铺并填写钱包名称");
      if (name.length > 80) throw new Error("钱包名称不能超过 80 个字符");
      const result = await prisma.$transaction(async (tx) => {
        const shop = await tx.shopeeShopSetting.findUnique({ where: { id: shopSettingId }, select: { id: true, status: true } });
        if (!shop || shop.status !== "active") throw new Error("Shopee 店铺不存在或未启用");
        if (walletType === "STORE") {
          const existing = await tx.shopeeWalletAccount.findFirst({ where: { shopSettingId, walletType: "STORE" }, select: { id: true } });
          if (existing) throw new Error("每家店铺只能创建一个店铺钱包");
        }
        if (body.adAccountId) {
          const account = await tx.adAccount.findUnique({ where: { id: String(body.adAccountId) }, select: { id: true, currency: true } });
          if (!account) throw new Error("关联的广告账户无效");
          if (account.currency !== currency) throw new Error("钱包与广告账户币种必须一致");
        }
        let defaultPayoutBankAccountId: string | null = null;
        if (walletType === "STORE" && body.defaultPayoutBankAccountId) {
          const account = await tx.bankAccount.findUnique({
            where: { id: String(body.defaultPayoutBankAccountId) },
            select: { id: true, currency: true },
          });
          if (!account) throw new Error("默认提现到账账户不存在");
          const accountCurrency = account.currency === "RMB" ? "CNY" : account.currency;
          const walletCurrency = currency === "RMB" ? "CNY" : currency;
          if (accountCurrency !== walletCurrency) throw new Error("默认提现到账账户与店铺钱包币种必须一致");
          defaultPayoutBankAccountId = account.id;
        }
        const existingAdvertisingWallets = walletType === "ADVERTISING"
          ? await tx.shopeeWalletAccount.count({ where: { shopSettingId, walletType: "ADVERTISING", enabled: true } })
          : 0;
        const isOfficialTopupTarget = walletType === "ADVERTISING"
          && (Boolean(body.isOfficialTopupTarget) || existingAdvertisingWallets === 0);
        if (isOfficialTopupTarget) {
          await tx.shopeeWalletAccount.updateMany({
            where: { shopSettingId, walletType: "ADVERTISING" },
            data: { isOfficialTopupTarget: false },
          });
        }
        const wallet = await tx.shopeeWalletAccount.create({ data: {
          shopSettingId,
          walletType,
          name,
          externalAccountId: String(body.externalAccountId || "").trim() || null,
          currency,
          balance: new Prisma.Decimal(openingBalance),
          autoTopupRate: new Prisma.Decimal(autoTopupRate),
          adAccountId: walletType === "ADVERTISING" && body.adAccountId ? String(body.adAccountId) : null,
          defaultPayoutBankAccountId,
          isOfficialTopupTarget,
          notes: String(body.notes || "").trim() || null,
        } });
        if (openingBalance > 0) {
          await tx.shopeeWalletEntry.create({ data: {
            walletId: wallet.id,
            entryType: "OPENING_BALANCE",
            amount: new Prisma.Decimal(openingBalance),
            balanceBefore: new Prisma.Decimal(0),
            balanceAfter: new Prisma.Decimal(openingBalance),
            sourceType: "WALLET_OPENING",
            sourceId: wallet.id,
            occurredAt: new Date(),
            notes: "钱包建账期初余额，不进入公司财务流水",
            createdBy,
          } });
        }
        return wallet;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      return NextResponse.json({ success: true, wallet: walletJson(result), financeCashFlowCreated: false });
    }

    if (action === "enable_official_balance") {
      const walletId = String(body.walletId || "").trim();
      if (!walletId) throw new Error("请选择需要启用官方流水同步的店铺钱包");
      const result = await enableShopeeOfficialBalanceMode(walletId, createdBy);
      return NextResponse.json({
        success: true,
        wallet: walletJson(result.wallet),
        balanceBefore: result.balanceBefore,
        officialBalance: result.officialBalance,
        adjustment: result.adjustment,
        financeCashFlowCreated: false,
      });
    }

    if (action === "transfer") {
      const fromWalletId = String(body.fromWalletId || "").trim();
      const toWalletId = String(body.toWalletId || "").trim();
      const result = await prisma.$transaction(async (tx) => {
        await lockWallets(tx, [fromWalletId, toWalletId]);
        const [source, target] = await Promise.all([
          tx.shopeeWalletAccount.findUnique({ where: { id: fromWalletId } }),
          tx.shopeeWalletAccount.findUnique({ where: { id: toWalletId } }),
        ]);
        if (!source || !target || !source.enabled || !target.enabled) throw new Error("转出或转入钱包无效");
        if (source.officialBalanceMode) throw new Error("店铺钱包已启用官方余额同步，请在 Shopee 后台完成划转后等待官方流水同步");
        const checked = validateInternalTransfer(source, target, body.amount);
        const transferId = crypto.randomUUID();
        const notes = String(body.notes || "").trim() || "店铺钱包划转至广告钱包";
        await addEntry(tx, { wallet: source, amount: -checked.amount, entryType: "INTERNAL_TRANSFER_OUT", sourceType: "INTERNAL_TRANSFER", sourceId: transferId, counterpartyWalletId: target.id, notes, createdBy });
        await addEntry(tx, { wallet: target, amount: checked.amount, entryType: "INTERNAL_TRANSFER_IN", sourceType: "INTERNAL_TRANSFER", sourceId: transferId, counterpartyWalletId: source.id, notes, createdBy });
        return { transferId, amount: checked.amount };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      return NextResponse.json({ success: true, ...result, financeCashFlowCreated: false });
    }

    if (action === "bank_fund") {
      const walletId = String(body.walletId || "").trim();
      const bankAccountId = String(body.bankAccountId || "").trim();
      const amount = normalizeMoney(body.amount, "充值金额");
      const occurredAt = parseBrazilDateTime(body.occurredAt);
      const transferVoucher = serializeTransferVoucher(body.transferVoucher);
      if (!walletId || !bankAccountId) throw new Error("请选择广告钱包和付款银行账户");
      const result = await prisma.$transaction(async (tx) => {
        await lockWallets(tx, [walletId]);
        const [wallet, bankAccount] = await Promise.all([
          tx.shopeeWalletAccount.findUnique({
            where: { id: walletId },
            include: { shopSetting: { select: { shopId: true, shopName: true, storeId: true } } },
          }),
          tx.bankAccount.findUnique({ where: { id: bankAccountId } }),
        ]);
        if (!wallet || wallet.walletType !== "ADVERTISING" || !wallet.enabled) throw new Error("请选择有效的 Shopee 广告钱包");
        if (!bankAccount) throw new Error("付款银行账户不存在");
        const walletCurrency = wallet.currency === "RMB" ? "CNY" : wallet.currency;
        const accountCurrency = bankAccount.currency === "RMB" ? "CNY" : bankAccount.currency;
        if (walletCurrency !== accountCurrency) throw new Error("银行账户与广告钱包币种必须一致");
        const fundingId = crypto.randomUUID();
        const notes = String(body.notes || "").trim();
        const cashFlow = await tx.cashFlow.create({
          data: {
            uid: `SHOPEE-WALLET-FUND:${fundingId}`,
            date: occurredAt,
            summary: `Shopee 广告钱包充值 · ${wallet.name}`,
            category: "Shopee广告钱包充值",
            type: "EXPENSE",
            amount: new Prisma.Decimal(-amount),
            accountId: bankAccount.id,
            accountName: bankAccount.name,
            currency: bankAccount.currency,
            remark: notes || `充值至 ${wallet.shopSetting.shopName || wallet.shopSetting.shopId} · ${wallet.name}`,
            relatedId: wallet.id,
            businessNumber: fundingId,
            status: "CONFIRMED",
            exchangeRate: bankAccount.exchangeRate,
            platform: "SHOPEE",
            storeId: wallet.shopSetting.storeId,
            storeName: wallet.shopSetting.shopName,
            voucher: transferVoucher,
            transferVoucher,
          },
        });
        const entry = await addEntry(tx, {
          wallet,
          amount,
          entryType: "BANK_FUNDING_IN",
          sourceType: "BANK_TO_SHOPEE_WALLET",
          sourceId: fundingId,
          bankAccountId: bankAccount.id,
          cashFlowId: cashFlow.id,
          notes: notes || `公司账户 ${bankAccount.name} 充值至 Shopee 广告钱包`,
          details: { bankAccountId: bankAccount.id, cashFlowId: cashFlow.id, transferVoucherStored: true },
          createdBy,
          occurredAt,
        });
        return { fundingId, cashFlow, entry };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      await clearCacheByPrefix("cash-flow");
      await clearCacheByPrefix("accounts");
      return NextResponse.json({
        success: true,
        fundingId: result.fundingId,
        cashFlowId: result.cashFlow.id,
        entry: entryJson(result.entry),
        financeCashFlowCreated: true,
      });
    }

    if (action === "withdraw") {
      const walletId = String(body.walletId || "").trim();
      const result = await prisma.$transaction(async (tx) => {
        await lockWallets(tx, [walletId]);
        const wallet = await tx.shopeeWalletAccount.findUnique({ where: { id: walletId } });
        if (!wallet || wallet.walletType !== "STORE" || !wallet.enabled) throw new Error("请选择有效的店铺钱包");
        if (wallet.officialBalanceMode) throw new Error("店铺钱包已启用官方余额同步，请在 Shopee 后台发起提现后等待官方流水同步");
        const amount = normalizeMoney(body.amount, "提现金额");
        applySignedWalletAmount(wallet.balance, -amount);
        const withdrawalId = crypto.randomUUID();
        const withdrawal = await tx.shopeeWalletWithdrawal.create({ data: {
          id: withdrawalId,
          shopSettingId: wallet.shopSettingId,
          walletId: wallet.id,
          amount: new Prisma.Decimal(amount),
          currency: wallet.currency,
          status: "IN_TRANSIT",
          payoutReference: String(body.payoutReference || "").trim() || null,
          expectedAt: body.expectedAt ? new Date(body.expectedAt) : null,
          notes: String(body.notes || "").trim() || null,
          createdBy,
        } });
        await addEntry(tx, { wallet, amount: -amount, entryType: "WITHDRAWAL_OUT", sourceType: "WITHDRAWAL", sourceId: withdrawalId, notes: "Shopee 提现已发起，等待公司账户实际到账核销", createdBy });
        return withdrawal;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      return NextResponse.json({ success: true, withdrawal: withdrawalJson(result), financeCashFlowCreated: false });
    }

    if (action === "cancel_withdrawal") {
      const withdrawalId = String(body.withdrawalId || "").trim();
      const result = await prisma.$transaction(async (tx) => {
        const before = await tx.shopeeWalletWithdrawal.findUnique({ where: { id: withdrawalId }, select: { walletId: true } });
        if (!before) throw new Error("提现记录不存在");
        await lockWallets(tx, [before.walletId]);
        const withdrawal = await tx.shopeeWalletWithdrawal.findUnique({ where: { id: withdrawalId }, include: { wallet: true } });
        if (!withdrawal || withdrawal.status !== "IN_TRANSIT") throw new Error("只有提现中的记录可以取消");
        if (withdrawal.wallet.officialBalanceMode) throw new Error("店铺钱包已启用官方余额同步，请在 Shopee 后台处理提现状态");
        await addEntry(tx, { wallet: withdrawal.wallet, amount: Number(withdrawal.amount), entryType: "WITHDRAWAL_RETURN", sourceType: "WITHDRAWAL_CANCEL", sourceId: withdrawal.id, notes: "提现取消，款项退回店铺钱包", createdBy });
        return tx.shopeeWalletWithdrawal.update({ where: { id: withdrawal.id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: String(body.notes || withdrawal.notes || "").trim() || null } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      return NextResponse.json({ success: true, withdrawal: withdrawalJson(result), financeCashFlowCreated: false });
    }

    if (action === "match_withdrawal") {
      const withdrawalId = String(body.withdrawalId || "").trim();
      const cashFlowId = String(body.cashFlowId || "").trim();
      if (!withdrawalId || !cashFlowId) throw new Error("请选择提现记录和真实到账流水");
      const result = await prisma.$transaction(async (tx) => {
        const [withdrawal, cashFlow] = await Promise.all([
          tx.shopeeWalletWithdrawal.findUnique({ where: { id: withdrawalId } }),
          tx.cashFlow.findUnique({
            where: { id: cashFlowId },
            include: { account: { select: { id: true, name: true, accountNumber: true, currency: true } }, shopeeWalletWithdrawal: { select: { id: true } } },
          }),
        ]);
        if (!withdrawal || withdrawal.status !== "IN_TRANSIT" || withdrawal.cashFlowId) throw new Error("该提现不是待核销状态");
        if (!cashFlow || cashFlow.type !== "INCOME" || cashFlow.status !== "CONFIRMED" || cashFlow.isReversal) throw new Error("请选择已确认的真实收入流水");
        if (cashFlow.shopeeWalletWithdrawal) throw new Error("这笔公司流水已经核销过其他提现");
        const flowCurrency = cashFlow.currency === "RMB" ? "CNY" : cashFlow.currency;
        const withdrawalCurrency = withdrawal.currency === "RMB" ? "CNY" : withdrawal.currency;
        if (flowCurrency !== withdrawalCurrency) throw new Error("提现与公司到账流水币种不一致");
        const actualReceivedAmount = roundMoney(Math.abs(Number(cashFlow.amount)));
        if (actualReceivedAmount < 0.005) throw new Error("公司到账流水金额必须大于 0");
        const updated = await tx.shopeeWalletWithdrawal.update({
          where: { id: withdrawal.id },
          data: {
            status: "RECEIVED",
            destinationAccountId: cashFlow.accountId,
            cashFlowId: cashFlow.id,
            actualReceivedAmount: new Prisma.Decimal(actualReceivedAmount),
            receivedAt: cashFlow.date,
            notes: [withdrawal.notes, `已人工核销公司流水 ${cashFlow.id}`].filter(Boolean).join(" · ").slice(0, 1000),
          },
          include: { wallet: true, shopSetting: true, destinationAccount: true, cashFlow: true },
        });
        if (withdrawal.officialTransactionId) {
          await tx.shopeeWalletTransaction.updateMany({
            where: { shopSettingId: withdrawal.shopSettingId, transactionId: withdrawal.officialTransactionId },
            data: { matchStatus: "WITHDRAWAL_RECONCILED" },
          });
        }
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      return NextResponse.json({ success: true, withdrawal: withdrawalJson(result), financeCashFlowCreated: false });
    }

    if (action === "adjust") {
      const walletId = String(body.walletId || "").trim();
      const amount = Number(body.amount);
      const notes = String(body.notes || "").trim();
      if (!Number.isFinite(amount) || amount === 0) throw new Error("调整金额不能为 0");
      if (notes.length < 4) throw new Error("请填写至少 4 个字符的调整原因");
      const result = await prisma.$transaction(async (tx) => {
        await lockWallets(tx, [walletId]);
        const wallet = await tx.shopeeWalletAccount.findUnique({ where: { id: walletId } });
        if (!wallet) throw new Error("钱包不存在");
        if (wallet.walletType === "STORE" && wallet.officialBalanceMode) throw new Error("店铺钱包已启用官方余额同步，不能手工调整余额");
        const entry = await addEntry(tx, { wallet, amount, entryType: "MANUAL_ADJUSTMENT", sourceType: "MANUAL_ADJUSTMENT", sourceId: crypto.randomUUID(), notes, createdBy });
        return entry;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
      return NextResponse.json({ success: true, entry: entryJson(result), financeCashFlowCreated: false });
    }

    if (action === "update_wallet") {
      const walletId = String(body.walletId || "").trim();
      const name = String(body.name || "").trim();
      if (!walletId || !name) throw new Error("钱包名称不能为空");
      if (name.length > 80) throw new Error("钱包名称不能超过 80 个字符");
      const result = await prisma.$transaction(async (tx) => {
        const wallet = await tx.shopeeWalletAccount.findUnique({ where: { id: walletId } });
        if (!wallet) throw new Error("钱包不存在");
        let defaultPayoutBankAccountId = wallet.defaultPayoutBankAccountId;
        if (wallet.walletType === "STORE") {
          defaultPayoutBankAccountId = String(body.defaultPayoutBankAccountId || "").trim() || null;
          if (defaultPayoutBankAccountId) {
            const account = await tx.bankAccount.findUnique({
              where: { id: defaultPayoutBankAccountId },
              select: { id: true, currency: true },
            });
            if (!account) throw new Error("默认提现到账账户不存在");
            const accountCurrency = account.currency === "RMB" ? "CNY" : account.currency;
            const walletCurrency = wallet.currency === "RMB" ? "CNY" : wallet.currency;
            if (accountCurrency !== walletCurrency) throw new Error("默认提现到账账户与店铺钱包币种必须一致");
          }
        }
        const isOfficialTopupTarget = wallet.walletType === "ADVERTISING" && body.isOfficialTopupTarget === true;
        if (isOfficialTopupTarget) {
          await tx.shopeeWalletAccount.updateMany({
            where: { shopSettingId: wallet.shopSettingId, walletType: "ADVERTISING", id: { not: wallet.id } },
            data: { isOfficialTopupTarget: false },
          });
        }
        return tx.shopeeWalletAccount.update({ where: { id: walletId }, data: {
          name,
          externalAccountId: String(body.externalAccountId || "").trim() || null,
          autoTopupRate: new Prisma.Decimal(normalizeAutoTopupRate(body.autoTopupRatePercent)),
          defaultPayoutBankAccountId,
          isOfficialTopupTarget,
          notes: String(body.notes || "").trim() || null,
          enabled: body.enabled !== false,
        } });
      });
      return NextResponse.json({ success: true, wallet: walletJson(result), financeCashFlowCreated: false });
    }

    return NextResponse.json({ error: "不支持的钱包操作" }, { status: 400 });
  } catch (error: any) {
    const message = error?.code === "P2002" ? "同一家店铺已存在同名钱包" : error?.message || "Shopee 钱包操作失败";
    const businessError = /钱包|金额|余额|币种|店铺|提现|比例|账户|名称|原因/.test(message);
    return NextResponse.json({ error: message }, { status: businessError ? 400 : 500 });
  }
}
