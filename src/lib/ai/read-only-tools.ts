import { prisma } from "@/lib/prisma";
import { addBusinessDays, businessDateUtcRange, relativeBusinessDate } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";

export type AiToolName = "finance_overview" | "sales_overview" | "inventory_overview" | "profit_overview" | "wallet_reconciliation" | "sync_diagnostics";

function asNumber(value: unknown) { return Number(value || 0); }

type PagoOfficialAccount = {
  id: string; userId: string; nickname: string | null; storeId: string | null; currency: string;
  officialBalance: number; officialAsOf: Date | null; lastSyncAt: Date | null;
};
type PagoSystemAccount = {
  id: string; name: string; parentId: string | null; storeId: string | null; platformAccount: string | null;
  currency: string; accountCategory: string; balance: number; parentName: string | null;
};

export function resolvePagoReconciliationGroups(officialAccounts: PagoOfficialAccount[], systemAccounts: PagoSystemAccount[]) {
  const groups = new Map<string, {
    id: string; name: string; currency: string; officialAccounts: PagoOfficialAccount[]; systemAccounts: PagoSystemAccount[];
  }>();
  const unmappedOfficialAccounts: PagoOfficialAccount[] = [];
  for (const official of officialAccounts) {
    const exactPlatform = systemAccounts.filter((account) => account.platformAccount === official.userId);
    const exactStore = systemAccounts.filter((account) => official.storeId && account.storeId === official.storeId);
    const anchor = exactPlatform.length === 1 ? exactPlatform[0] : exactStore.length === 1 ? exactStore[0] : null;
    if (!anchor) { unmappedOfficialAccounts.push(official); continue; }
    const groupId = anchor.parentId || anchor.id;
    const members = anchor.parentId
      ? systemAccounts.filter((account) => account.parentId === anchor.parentId && account.currency === official.currency)
      : [anchor];
    const current = groups.get(groupId) || {
      id: groupId,
      name: anchor.parentName || anchor.name,
      currency: official.currency,
      officialAccounts: [],
      systemAccounts: members,
    };
    current.officialAccounts.push(official);
    groups.set(groupId, current);
  }
  const mappedSystemIds = new Set([...groups.values()].flatMap((group) => group.systemAccounts.map((account) => account.id)));
  return {
    groups: [...groups.values()].map((group) => {
      const officialBalance = group.officialAccounts.reduce((sum, account) => sum + account.officialBalance, 0);
      const systemBalance = group.systemAccounts.reduce((sum, account) => sum + account.balance, 0);
      return { ...group, officialBalance: Number(officialBalance.toFixed(2)), systemBalance: Number(systemBalance.toFixed(2)), difference: Number((systemBalance - officialBalance).toFixed(2)) };
    }),
    unmappedOfficialAccounts,
    mappedSystemIds,
  };
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function shanghaiStartOfDay(now: Date) {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SHANGHAI_OFFSET_MS);
}

function formatShanghaiDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function resolveAiTimeRange(question: string, fallbackDays = 15, now = new Date()) {
  const text = question.trim();
  const today = shanghaiStartOfDay(now);
  const explicitDays = text.match(/(?:最近|近|过去)\s*(\d{1,3})\s*(?:天|日)/)?.[1];
  if (/前天/.test(text)) {
    const from = new Date(today.getTime() - 2 * DAY_MS);
    const to = new Date(today.getTime() - DAY_MS);
    return { from, to, days: 1, scope: `前天（${formatShanghaiDate(from)}）` };
  }
  if (/昨天|昨日/.test(text)) {
    const from = new Date(today.getTime() - DAY_MS);
    return { from, to: today, days: 1, scope: `昨天（${formatShanghaiDate(from)}）` };
  }
  if (/今天|今日/.test(text)) {
    return { from: today, to: new Date(today.getTime() + DAY_MS), days: 1, scope: `今天（${formatShanghaiDate(today)}）` };
  }
  const days = Math.min(90, Math.max(1, Math.trunc(Number(explicitDays || fallbackDays || 15))));
  const from = new Date(today.getTime() - (days - 1) * DAY_MS);
  return { from, to: new Date(today.getTime() + DAY_MS), days, scope: `最近 ${days} 个自然日` };
}

export function resolveAiBusinessDateRange(question: string, fallbackDays: number, countryCode: string, now = new Date()) {
  const text = question.trim();
  const country = normalizeCountryCode(countryCode);
  const absolute = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (absolute) return { startDate: absolute, endDate: absolute, days: 1, label: `指定日期 ${absolute}` };
  const offset = /前天/.test(text) ? -2 : /昨天|昨日/.test(text) ? -1 : /今天|今日/.test(text) ? 0 : null;
  if (offset != null) {
    const date = relativeBusinessDate(country, offset, now);
    return { startDate: date, endDate: date, days: 1, label: offset === 0 ? `今天（${date}）` : offset === -1 ? `昨天（${date}）` : `前天（${date}）` };
  }
  const explicitDays = Number(text.match(/(?:最近|近|过去)\s*(\d{1,3})\s*(?:天|日)/)?.[1] || fallbackDays || 15);
  const days = Math.min(90, Math.max(1, Math.trunc(explicitDays)));
  const endDate = relativeBusinessDate(country, 0, now);
  return { startDate: addBusinessDays(endDate, -days + 1), endDate, days, label: `最近 ${days} 个目的国自然日` };
}
export function chooseAiTool(question: string): AiToolName {
  const text = question.toLowerCase();
  if (/同步|更新一次|多久更新|同步失败|任务失败|数据延迟|没更新/.test(text)) return "sync_diagnostics";
  if (/对账|差额|对不上|不一致|钱包余额|余额.*(差|对)|缺失流水|重复流水|异常流水|待关联提款|未关联|未匹配/.test(text)) return "wallet_reconciliation";
  if (/库存|备货|断货|在途|仓库/.test(text)) return "inventory_overview";
  if (/利润|毛利|成本|广告费|佣金|物流费/.test(text)) return "profit_overview";
  if (/订单|销量|卖了|销售|sku|规格/.test(text)) return "sales_overview";
  return "finance_overview";
}

export async function runReadOnlyAiTool(tool: AiToolName, input: number | { days?: number; question?: string } = 15) {
  const days = typeof input === "number" ? input : input.days ?? 15;
  const question = typeof input === "number" ? "" : input.question ?? "";
  const window = resolveAiTimeRange(question, days);
  const occurredAt = { gte: window.from, lt: window.to };
  if (tool === "sync_diagnostics") {
    const [shopeeShops, mercadoAccounts, tiktokShops, latest] = await Promise.all([
      prisma.shopeeShopSetting.findMany({ select: { shopId: true, shopName: true, status: true, lastSyncAt: true, tokenExpireAt: true, tokenRefreshError: true, tokenRefreshFailureCount: true }, orderBy: { shopName: "asc" } }),
      prisma.mercadoLivreAccount.findMany({ select: { userId: true, nickname: true, status: true, lastSyncAt: true, tokenExpireAt: true, tokenRefreshError: true, tokenRefreshFailureCount: true }, orderBy: { nickname: "asc" } }),
      prisma.tikTokShopSetting.findMany({ select: { shopId: true, shopName: true, status: true, lastSyncAt: true, tokenExpireAt: true }, orderBy: { shopName: "asc" } }),
      Promise.all([
        prisma.shopeeOrder.findFirst({ select: { syncedAt: true }, orderBy: { syncedAt: "desc" } }),
        prisma.mercadoLivreOrder.findFirst({ select: { syncedAt: true }, orderBy: { syncedAt: "desc" } }),
        prisma.tikTokOrder.findFirst({ select: { syncedAt: true }, orderBy: { syncedAt: "desc" } }),
        prisma.shopeeWalletTransaction.findFirst({ select: { syncedAt: true }, orderBy: { syncedAt: "desc" } }),
        prisma.mercadoLivreWalletTransaction.findFirst({ select: { syncedAt: true }, orderBy: { syncedAt: "desc" } }),
      ]),
    ]);
    const now = Date.now();
    const row = (platform: string, id: string, name: string | null, status: string, lastSyncAt: Date | null, tokenExpireAt: Date | null, error?: string | null, failures?: number) => ({
      platform, id, name: name || id, status, lastSyncAt, minutesSinceSync: lastSyncAt ? Math.round((now - lastSyncAt.getTime()) / 60000) : null,
      tokenExpireAt, tokenExpired: tokenExpireAt ? tokenExpireAt.getTime() <= now : null, error: error || null, consecutiveTokenFailures: failures || 0,
    });
    const shops = [
      ...shopeeShops.map((shop) => row("Shopee", shop.shopId, shop.shopName, shop.status, shop.lastSyncAt, shop.tokenExpireAt, shop.tokenRefreshError, shop.tokenRefreshFailureCount)),
      ...mercadoAccounts.map((account) => row("Mercado Livre", account.userId, account.nickname, account.status, account.lastSyncAt, account.tokenExpireAt, account.tokenRefreshError, account.tokenRefreshFailureCount)),
      ...tiktokShops.map((shop) => row("TikTok", shop.shopId, shop.shopName, shop.status, shop.lastSyncAt, shop.tokenExpireAt)),
    ];
    return {
      tool, scope: "当前平台接入与同步状态", source: ["ShopeeShopSetting", "MercadoLivreAccount", "TikTokShopSetting", "各平台订单及钱包表"],
      summary: {
        shopCount: shops.length, activeCount: shops.filter((item) => item.status === "active").length,
        disconnectedCount: shops.filter((item) => item.status !== "active").length,
        errorCount: shops.filter((item) => item.error || item.tokenExpired).length,
        latestOrderSync: { shopee: latest[0]?.syncedAt || null, mercadoLivre: latest[1]?.syncedAt || null, tiktok: latest[2]?.syncedAt || null },
        latestWalletSync: { shopee: latest[3]?.syncedAt || null, mercadoPago: latest[4]?.syncedAt || null },
      },
      detail: shops,
      note: "lastSyncAt 是平台账号级同步标记；同时列出订单表和钱包表最新落库时间。这里只诊断，不会触发补同步。",
    };
  }
  if (tool === "wallet_reconciliation") {
    const wantsExceptionDetails = /明细|具体|逐笔|分别|哪些|哪几|提款|未关联|未匹配|异常流水|金额不符|16\s*条|325\s*条/i.test(question);
    const shopeeReviewStatuses = ["UNMATCHED_SETTLEMENT", "AMOUNT_MISMATCH", "REVIEW_INFLOW", "REVIEW_OUTFLOW", "NO_STORE_WALLET", "AD_TOPUP_UNASSIGNED", "WITHDRAWAL_PENDING", "WITHDRAWAL_PLATFORM_COMPLETED"];
    const [shopeeWallets, mercadoAccounts, bankAccounts, pagoFlows, shopeeReviewGroups, pendingPagoPayouts, pagoReviewRows] = await Promise.all([
      prisma.shopeeWalletAccount.findMany({
        where: { enabled: true, walletType: "STORE" },
        select: {
          id: true, name: true, balance: true, currency: true, officialBalanceLastSyncAt: true,
          shopSetting: { select: { shopId: true, shopName: true } },
          officialTransactions: { where: { currentBalance: { not: null } }, select: { currentBalance: true, occurredAt: true, transactionId: true }, orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }], take: 1 },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.mercadoLivreAccount.findMany({
        where: { status: "active" },
        select: {
          id: true, userId: true, nickname: true, storeId: true, currency: true, lastSyncAt: true,
          walletTransactions: { where: { balanceAmount: { not: null } }, select: { balanceAmount: true, occurredAt: true }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 1 },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.bankAccount.findMany({
        select: { id: true, name: true, currency: true, initialCapital: true, parentId: true, storeId: true, platformAccount: true, accountPurpose: true, accountCategory: true, parent: { select: { name: true } } },
      }),
      prisma.cashFlow.groupBy({ by: ["accountId"], where: { type: { in: ["INCOME", "EXPENSE"] } }, _sum: { amount: true } }),
      prisma.shopeeWalletTransaction.groupBy({
        by: ["walletId", "matchStatus"], where: { walletId: { not: null }, matchStatus: { in: shopeeReviewStatuses } },
        _count: { _all: true }, _sum: { amount: true },
      }),
      prisma.mercadoLivreWalletTransaction.groupBy({
        by: ["accountId"], where: { businessType: "BANK_PAYOUT", cashFlowId: null },
        _count: { _all: true }, _sum: { netDebitAmount: true },
      }),
      prisma.mercadoLivreWalletTransaction.groupBy({
        by: ["accountId"], where: { matchStatus: "WALLET_POSTED_REVIEW" },
        _count: { _all: true }, _sum: { netDebitAmount: true },
      }),
    ]);
    const shopeeExceptionRows = wantsExceptionDetails ? await prisma.shopeeWalletTransaction.findMany({
        where: { matchStatus: { in: shopeeReviewStatuses } },
        select: {
          transactionId: true, matchStatus: true, transactionType: true, moneyFlow: true, amount: true, currentBalance: true,
          orderSn: true, description: true, reason: true, occurredAt: true,
          shopSetting: { select: { shopId: true, shopName: true } },
        },
        orderBy: [{ occurredAt: "desc" }, { transactionId: "desc" }], take: 30,
      }) : [];
    const pagoExceptionRows = wantsExceptionDetails ? await prisma.mercadoLivreWalletTransaction.findMany({
        where: { OR: [{ businessType: "BANK_PAYOUT", cashFlowId: null }, { matchStatus: "WALLET_POSTED_REVIEW" }] },
        select: {
          transactionKey: true, sourceId: true, businessType: true, matchStatus: true, moneyFlow: true,
          netCreditAmount: true, netDebitAmount: true, payoutBankAccount: true, occurredAt: true,
          account: { select: { userId: true, nickname: true } },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 30,
      }) : [];
    const reviewByWallet = new Map<string, { count: number; amount: number; statuses: Record<string, number> }>();
    for (const row of shopeeReviewGroups) {
      if (!row.walletId) continue;
      const current = reviewByWallet.get(row.walletId) || { count: 0, amount: 0, statuses: {} };
      current.count += row._count._all;
      current.amount += asNumber(row._sum.amount);
      current.statuses[row.matchStatus] = row._count._all;
      reviewByWallet.set(row.walletId, current);
    }
    const nowMs = Date.now();
    const shopee = shopeeWallets.map((wallet) => {
      const official = wallet.officialTransactions[0];
      const systemBalance = asNumber(wallet.balance);
      const officialBalance = official?.currentBalance == null ? null : asNumber(official.currentBalance);
      const difference = officialBalance == null ? null : Number((systemBalance - officialBalance).toFixed(2));
      const review = reviewByWallet.get(wallet.id) || { count: 0, amount: 0, statuses: {} };
      const minutesSinceSync = wallet.officialBalanceLastSyncAt ? Math.round((nowMs - wallet.officialBalanceLastSyncAt.getTime()) / 60000) : null;
      return {
        shopId: wallet.shopSetting.shopId, shopName: wallet.shopSetting.shopName || wallet.shopSetting.shopId, walletName: wallet.name,
        currency: wallet.currency, systemBalance, officialBalance, difference,
        status: officialBalance == null ? "NO_OFFICIAL_BALANCE" : Math.abs(difference || 0) < 0.01 ? "MATCHED" : "MISMATCH",
        officialAsOf: official?.occurredAt || null, lastSyncAt: wallet.officialBalanceLastSyncAt, minutesSinceSync,
        reviewTransactionCount: review.count, reviewTransactionAmount: Number(review.amount.toFixed(2)), reviewStatuses: review.statuses,
      };
    });
    const flowMap = new Map(pagoFlows.map((item) => [item.accountId, asNumber(item._sum.amount)]));
    const systemAccounts: PagoSystemAccount[] = bankAccounts.map((account) => ({
      id: account.id, name: account.name, parentId: account.parentId, storeId: account.storeId, platformAccount: account.platformAccount,
      currency: account.currency, accountCategory: account.accountCategory, parentName: account.parent?.name || null,
      balance: Number((asNumber(account.initialCapital) + (flowMap.get(account.id) || 0)).toFixed(2)),
    }));
    const officialAccounts: PagoOfficialAccount[] = mercadoAccounts.map((account) => ({
      id: account.id, userId: account.userId, nickname: account.nickname, storeId: account.storeId, currency: account.currency,
      officialBalance: asNumber(account.walletTransactions[0]?.balanceAmount), officialAsOf: account.walletTransactions[0]?.occurredAt || null, lastSyncAt: account.lastSyncAt,
    }));
    const pagoResolved = resolvePagoReconciliationGroups(officialAccounts, systemAccounts);
    const officialPagoTotal = pagoResolved.groups.reduce((sum, group) => sum + group.officialBalance, 0);
    const systemPagoTotal = pagoResolved.groups.reduce((sum, group) => sum + group.systemBalance, 0);
    const pagoLike = bankAccounts.filter((account) => account.accountCategory !== "PRIMARY" && /pago|mercado\s*pago/i.test(`${account.name} ${account.accountPurpose} ${account.platformAccount || ""}`));
    const excludedPagoAccounts = pagoLike.filter((account) => !pagoResolved.mappedSystemIds.has(account.id)).map((account) => ({
      id: account.id, name: account.name, currency: account.currency,
      balance: Number((asNumber(account.initialCapital) + (flowMap.get(account.id) || 0)).toFixed(2)),
      reason: "不属于当前已授权 Mercado Pago 账号所在的账户分组，未计入对账",
    }));
    const pendingPayoutByAccount = new Map(pendingPagoPayouts.map((row) => [row.accountId, { count: row._count._all, amount: asNumber(row._sum.netDebitAmount) }]));
    const reviewPagoByAccount = new Map(pagoReviewRows.map((row) => [row.accountId, { count: row._count._all, amount: asNumber(row._sum.netDebitAmount) }]));
    const pagoGroups = pagoResolved.groups.map((group) => {
      const accountIds = group.officialAccounts.map((account) => account.id);
      const pendingPayoutCount = accountIds.reduce((sum, id) => sum + (pendingPayoutByAccount.get(id)?.count || 0), 0);
      const pendingPayoutAmount = accountIds.reduce((sum, id) => sum + (pendingPayoutByAccount.get(id)?.amount || 0), 0);
      const reviewTransactionCount = accountIds.reduce((sum, id) => sum + (reviewPagoByAccount.get(id)?.count || 0), 0);
      const reviewTransactionAmount = accountIds.reduce((sum, id) => sum + (reviewPagoByAccount.get(id)?.amount || 0), 0);
      return {
        id: group.id, name: group.name, currency: group.currency, officialBalance: group.officialBalance, systemBalance: group.systemBalance,
        difference: group.difference, status: Math.abs(group.difference) < 0.01 ? "MATCHED" : "MISMATCH",
        officialAccounts: group.officialAccounts.map((account) => ({ accountId: account.userId, accountName: account.nickname || account.userId, officialBalance: account.officialBalance, officialAsOf: account.officialAsOf, lastSyncAt: account.lastSyncAt })),
        systemAccounts: group.systemAccounts.map((account) => ({ id: account.id, name: account.name, balance: account.balance })),
        pendingPayoutCount, pendingPayoutAmount: Number(pendingPayoutAmount.toFixed(2)),
        reviewTransactionCount, reviewTransactionAmount: Number(reviewTransactionAmount.toFixed(2)),
      };
    });
    const findings = [
      ...shopee.filter((wallet) => wallet.status !== "MATCHED").map((wallet) => ({ severity: wallet.status === "MISMATCH" ? "HIGH" : "MEDIUM", platform: "Shopee", subject: wallet.walletName, issue: wallet.status, difference: wallet.difference, currency: wallet.currency })),
      ...pagoGroups.filter((group) => group.status !== "MATCHED").map((group) => ({ severity: "HIGH", platform: "Mercado Pago", subject: group.name, issue: "BALANCE_MISMATCH", difference: group.difference, currency: group.currency })),
      ...pagoGroups.filter((group) => group.pendingPayoutCount > 0).map((group) => ({ severity: "MEDIUM", platform: "Mercado Pago", subject: group.name, issue: "PAYOUT_NOT_LINKED", count: group.pendingPayoutCount, amount: group.pendingPayoutAmount, currency: group.currency })),
      ...pagoGroups.filter((group) => group.reviewTransactionCount > 0).map((group) => ({ severity: "MEDIUM", platform: "Mercado Pago", subject: group.name, issue: "EXPENSE_REVIEW_REQUIRED", count: group.reviewTransactionCount, amount: group.reviewTransactionAmount, currency: group.currency })),
    ];
    const exceptionDetails = wantsExceptionDetails ? {
      shopee: shopeeExceptionRows.map((row) => ({
        platform: "Shopee", shopId: row.shopSetting.shopId, shopName: row.shopSetting.shopName || row.shopSetting.shopId,
        transactionId: row.transactionId, occurredAt: row.occurredAt, amount: asNumber(row.amount), currentBalance: row.currentBalance == null ? null : asNumber(row.currentBalance),
        moneyFlow: row.moneyFlow, businessType: row.transactionType, matchStatus: row.matchStatus, orderSn: row.orderSn,
        description: row.description || row.reason || null,
      })),
      mercadoPago: pagoExceptionRows.map((row) => ({
        platform: "Mercado Pago", accountId: row.account.userId, accountName: row.account.nickname || row.account.userId,
        transactionKey: row.transactionKey, sourceId: row.sourceId, occurredAt: row.occurredAt,
        amount: Number((asNumber(row.netCreditAmount) - asNumber(row.netDebitAmount)).toFixed(2)), moneyFlow: row.moneyFlow,
        businessType: row.businessType, matchStatus: row.matchStatus, payoutBankAccount: row.payoutBankAccount,
      })),
      limit: 30,
      shopeeTruncated: shopee.reduce((sum, wallet) => sum + wallet.reviewTransactionCount, 0) > shopeeExceptionRows.length,
      mercadoPagoTruncated: pagoGroups.reduce((sum, group) => sum + group.pendingPayoutCount + group.reviewTransactionCount, 0) > pagoExceptionRows.length,
    } : null;
    return {
      tool, scope: "当前钱包对账快照", source: ["ShopeeWalletAccount", "ShopeeWalletTransaction", "MercadoLivreWalletTransaction", "BankAccount", "CashFlow"],
      summary: {
        shopeeWalletCount: shopee.length, shopeeMismatchCount: shopee.filter((wallet) => wallet.difference != null && Math.abs(wallet.difference) >= 0.01).length,
        shopeeReviewTransactionCount: shopee.reduce((sum, wallet) => sum + wallet.reviewTransactionCount, 0),
        mercadoPagoGroupCount: pagoGroups.length, mercadoPagoMismatchCount: pagoGroups.filter((group) => group.status === "MISMATCH").length,
        mercadoPagoOfficialBalance: Number(officialPagoTotal.toFixed(2)), mercadoPagoSystemBalance: Number(systemPagoTotal.toFixed(2)),
        mercadoPagoDifference: Number((systemPagoTotal - officialPagoTotal).toFixed(2)),
        mercadoPagoPendingPayoutCount: pagoGroups.reduce((sum, group) => sum + group.pendingPayoutCount, 0),
        mercadoPagoReviewTransactionCount: pagoGroups.reduce((sum, group) => sum + group.reviewTransactionCount, 0),
        unmappedMercadoAccountCount: pagoResolved.unmappedOfficialAccounts.length, excludedSystemPagoAccountCount: excludedPagoAccounts.length,
        findingCount: findings.length,
      },
      detail: { shopee, mercadoPagoGroups: pagoGroups, excludedSystemPagoAccounts: excludedPagoAccounts, unmappedMercadoAccounts: pagoResolved.unmappedOfficialAccounts, findings, exceptionDetails },
      note: `Shopee 按店铺钱包对比系统余额与官方最新余额。PAGO 先用平台账号或店铺绑定定位系统账户，再按其父级账户分组汇总；其他主体或未绑定账户不会混入。待关联提款和待复核费用只提示，不自动生成或修改流水。${wantsExceptionDetails ? "本次附带最近 30 条异常明细；若总数更多，结果会标记截断。" : "如需逐笔记录，请明确询问提款或异常流水明细。"}TikTok 当前没有官方实时钱包余额接口。`,
    };
  }
  if (tool === "finance_overview") {
    const [mercado, shopee, tiktok] = await Promise.all([
      prisma.mercadoLivreWalletTransaction.groupBy({ by: ["businessType", "moneyFlow"], _count: true, _sum: { netCreditAmount: true, netDebitAmount: true }, where: { occurredAt } }),
      prisma.shopeeWalletEntry.groupBy({ by: ["entryType"], _count: true, _sum: { amount: true }, where: { occurredAt } }),
      prisma.tikTokPayment.findMany({ where: { syncedAt: occurredAt }, select: { amount: true, currency: true, status: true, paidTime: true, syncedAt: true }, orderBy: { syncedAt: "desc" }, take: 500 }),
    ]);
    const mercadoIn = mercado.reduce((sum, row) => sum + asNumber(row._sum.netCreditAmount), 0);
    const mercadoOut = mercado.reduce((sum, row) => sum + asNumber(row._sum.netDebitAmount), 0);
    const shopeeNet = shopee.reduce((sum, row) => sum + asNumber(row._sum.amount), 0);
    const tiktokIn = tiktok.reduce((sum, row) => sum + asNumber(row.amount), 0);
    return { tool, scope: `${window.scope}（系统时间）`, source: ["MercadoLivreWalletTransaction", "ShopeeWalletEntry", "TikTokPayment"], summary: { mercadoIn, mercadoOut, shopeeNet, tiktokPaymentRows: tiktok.length, tiktokIn }, detail: { mercado, shopee, tiktok: tiktok.slice(0, 20) }, note: "金额按平台币种分别理解，未跨币种相加；这是只读快照，不会生成财务流水。" };
  }
  if (tool === "sales_overview") {
    const wantsSku = /sku|规格|产品|商品|卖了什么|销量明细/i.test(question);
    const now = new Date();
    const [shopeeNames, mercadoNames, tiktokNames] = await Promise.all([
      prisma.shopeeShopSetting.findMany({ where: { status: "active" }, select: { id: true, shopId: true, shopName: true, region: true } }),
      prisma.mercadoLivreAccount.findMany({ where: { status: "active" }, select: { id: true, userId: true, nickname: true, country: true } }),
      prisma.tikTokShopSetting.findMany({ select: { shopId: true, shopName: true, region: true } }),
    ]);
    const shopeeRanges = shopeeNames.map((shop) => ({ shop, date: resolveAiBusinessDateRange(question, days, shop.region, now) }));
    const mercadoRanges = mercadoNames.map((account) => ({ account, date: resolveAiBusinessDateRange(question, days, account.country, now) }));
    const tiktokRanges = tiktokNames.map((shop) => ({ shop, date: resolveAiBusinessDateRange(question, days, shop.region, now) }));
    const shopeeWhere = { OR: shopeeRanges.map(({ shop, date }) => ({ shopSettingId: shop.id, createTime: businessDateUtcRange(date.startDate, date.endDate, shop.region) })) };
    const mercadoWhere = { OR: mercadoRanges.map(({ account, date }) => ({ accountId: account.id, dateCreated: businessDateUtcRange(date.startDate, date.endDate, account.country) })) };
    const tiktokWhere = { OR: tiktokRanges.map(({ shop, date }) => ({ shopId: shop.shopId, createTime: businessDateUtcRange(date.startDate, date.endDate, shop.region) })) };
    const shopeeValidWhere = { AND: [shopeeWhere, { NOT: { status: { in: ["UNPAID", "INCOMPLETE", "CANCELLED"] } } }] };
    const mercadoValidWhere = { AND: [mercadoWhere, { NOT: { status: { in: ["cancelled", "canceled", "unpaid", "invalid", "payment_required", "payment_in_process"] } } }] };
    const tiktokValidWhere = { AND: [tiktokWhere, { NOT: [{ status: { in: ["UNPAID", "CANCELLED"] } }, { orderStatus: { in: ["UNPAID", "CANCELLED"] } }, { rawData: { path: ["is_sample_order"], equals: true } }] }] };
    const [shopee, mercado, tiktok, shopeeByShop, mercadoByAccount, tiktokByShop, shopeeStatuses, mercadoStatuses, tiktokStatuses, tiktokSamples, shopeeItems, mercadoItems, tiktokRows] = await Promise.all([
      prisma.shopeeOrder.count({ where: shopeeValidWhere }),
      prisma.mercadoLivreOrder.count({ where: mercadoValidWhere }),
      prisma.tikTokOrder.count({ where: tiktokValidWhere }),
      prisma.shopeeOrder.groupBy({ by: ["shopSettingId"], where: shopeeValidWhere, _count: { _all: true } }),
      prisma.mercadoLivreOrder.groupBy({ by: ["accountId"], where: mercadoValidWhere, _count: { _all: true } }),
      prisma.tikTokOrder.groupBy({ by: ["shopId"], where: tiktokValidWhere, _count: { _all: true } }),
      prisma.shopeeOrder.groupBy({ by: ["status"], where: shopeeWhere, _count: { _all: true } }),
      prisma.mercadoLivreOrder.groupBy({ by: ["status", "substatus"], where: mercadoWhere, _count: { _all: true } }),
      prisma.tikTokOrder.groupBy({ by: ["status", "orderStatus"], where: tiktokWhere, _count: { _all: true } }),
      prisma.tikTokOrder.count({ where: { AND: [tiktokWhere, { rawData: { path: ["is_sample_order"], equals: true } }] } }),
      wantsSku ? prisma.shopeeOrderItem.findMany({ where: { order: shopeeValidWhere }, select: { itemSku: true, modelSku: true, itemName: true, modelName: true, quantity: true, order: { select: { shopSetting: { select: { shopName: true, shopId: true } } } } }, take: 5000 }) : Promise.resolve([]),
      wantsSku ? prisma.mercadoLivreOrderItem.findMany({ where: { order: mercadoValidWhere }, select: { sellerSku: true, title: true, quantity: true, order: { select: { account: { select: { nickname: true, userId: true } } } } }, take: 5000 }) : Promise.resolve([]),
      wantsSku ? prisma.tikTokOrder.findMany({ where: tiktokValidWhere, select: { shopId: true, rawData: true, itemCount: true }, take: 5000 }) : Promise.resolve([]),
    ]);
    const shopeeNameMap = new Map(shopeeNames.map((row) => [row.id, row.shopName || row.shopId]));
    const mercadoNameMap = new Map(mercadoNames.map((row) => [row.id, row.nickname || row.userId]));
    const tiktokNameMap = new Map(tiktokNames.map((row) => [row.shopId, row.shopName]));
    const byStore = [
      ...shopeeByShop.map((row) => ({ platform: "Shopee", store: shopeeNameMap.get(row.shopSettingId) || row.shopSettingId, orders: row._count._all })),
      ...mercadoByAccount.map((row) => ({ platform: "Mercado Livre", store: mercadoNameMap.get(row.accountId) || row.accountId, orders: row._count._all })),
      ...tiktokByShop.map((row) => ({ platform: "TikTok", store: tiktokNameMap.get(row.shopId) || row.shopId, orders: row._count._all })),
    ].sort((a, b) => b.orders - a.orders);
    const skuMap = new Map<string, { platform: string; store: string; sku: string; name: string; units: number }>();
    const addSku = (platform: string, store: string, sku: unknown, name: unknown, quantity: unknown) => {
      const cleanSku = String(sku || "").trim() || "未识别SKU";
      const key = `${platform}\u0000${store}\u0000${cleanSku}`;
      const current = skuMap.get(key) || { platform, store, sku: cleanSku, name: String(name || cleanSku).slice(0, 120), units: 0 };
      current.units += Math.max(0, Number(quantity) || 0);
      skuMap.set(key, current);
    };
    for (const item of shopeeItems) addSku("Shopee", item.order.shopSetting.shopName || item.order.shopSetting.shopId, item.modelSku || item.itemSku, item.modelName || item.itemName, item.quantity);
    for (const item of mercadoItems) addSku("Mercado Livre", item.order.account.nickname || item.order.account.userId, item.sellerSku, item.title, item.quantity);
    for (const order of tiktokRows) {
      const raw = order.rawData && typeof order.rawData === "object" && !Array.isArray(order.rawData) ? order.rawData as any : {};
      const lines = Array.isArray(raw.line_items) ? raw.line_items : [];
      if (lines.length === 0) addSku("TikTok", tiktokNameMap.get(order.shopId) || order.shopId, "未识别SKU", "订单缺少SKU明细", order.itemCount || 0);
      for (const line of lines) addSku("TikTok", tiktokNameMap.get(order.shopId) || order.shopId, line?.seller_sku || line?.sku_id || line?.product_id, line?.product_name || line?.sku_name, line?.quantity || 1);
    }
    const topSkus = [...skuMap.values()].sort((a, b) => b.units - a.units).slice(0, 50);
    const statusCount = (rows: Array<{ status: string | null; _count: { _all: number } }>, matcher: RegExp) =>
      rows.reduce((sum, row) => sum + (matcher.test(String(row.status || "").toUpperCase()) ? row._count._all : 0), 0);
    const shopeeCancelled = statusCount(shopeeStatuses, /CANCEL/);
    const shopeeUnpaid = statusCount(shopeeStatuses, /UNPAID/);
    const mercadoCancelled = statusCount(mercadoStatuses, /CANCEL/);
    const mercadoUnpaid = statusCount(mercadoStatuses, /UNPAID/);
    const normalizedTikTokStatuses = tiktokStatuses.map((row) => ({ ...row, status: [row.status, row.orderStatus].filter(Boolean).join(" ") }));
    const tiktokCancelled = statusCount(normalizedTikTokStatuses, /CANCEL/);
    const tiktokUnpaid = statusCount(normalizedTikTokStatuses, /UNPAID/);
    const shopeeRaw = shopeeStatuses.reduce((sum, row) => sum + row._count._all, 0);
    const mercadoRaw = mercadoStatuses.reduce((sum, row) => sum + row._count._all, 0);
    const tiktokRaw = tiktokStatuses.reduce((sum, row) => sum + row._count._all, 0);
    // The three counts above already use the same valid-sales filters as the
    // profit dashboard. Do not subtract excluded statuses a second time.
    const shopeeValid = shopee;
    const mercadoValid = mercado;
    const tiktokValid = tiktok;
    const rawOrderRows = shopeeRaw + mercadoRaw + tiktokRaw;
    const cancelledOrders = shopeeCancelled + mercadoCancelled + tiktokCancelled;
    const unpaidOrders = shopeeUnpaid + mercadoUnpaid + tiktokUnpaid;
    const otherExcludedOrders = Math.max(0, rawOrderRows - shopeeValid - mercadoValid - tiktokValid - cancelledOrders - unpaidOrders);
    const ranges = [...shopeeRanges, ...mercadoRanges, ...tiktokRanges].map((row) => row.date);
    const rangeKeys = new Set(ranges.map((date) => `${date.startDate}\u0000${date.endDate}`));
    const rangeLabel = rangeKeys.size === 1 && ranges[0]
      ? `${ranges[0].label}，按店铺目的国自然日`
      : `按各店铺目的国自然日统计的最近 ${days} 天`;
    return {
      tool, scope: `${rangeLabel}（下单时间）`, source: ["ShopeeOrder/ShopeeOrderItem", "MercadoLivreOrder/MercadoLivreOrderItem", "TikTokOrder.rawData.line_items"],
      summary: {
        shopeeOrders: shopeeValid, mercadoOrders: mercadoValid, tiktokOrders: tiktokValid, totalOrders: shopeeValid + mercadoValid + tiktokValid,
        rawOrderRows, cancelledOrders, unpaidOrders, otherExcludedOrders, tiktokSampleOrders: tiktokSamples,
        storeCount: byStore.length, skuRowsReturned: topSkus.length,
      },
      detail: {
        byStore, topSkus,
        statusBreakdown: {
          shopee: { all: shopeeRaw, valid: shopeeValid, cancelled: shopeeCancelled, unpaid: shopeeUnpaid, statuses: shopeeStatuses },
          mercadoLivre: { all: mercadoRaw, valid: mercadoValid, cancelled: mercadoCancelled, unpaid: mercadoUnpaid, statuses: mercadoStatuses },
          tiktok: { all: tiktokRaw, valid: tiktokValid, cancelled: tiktokCancelled, unpaid: tiktokUnpaid, samples: tiktokSamples, statuses: tiktokStatuses },
        },
      },
      note: `订单原始记录共 ${rawOrderRows} 单；利润口径有效销售订单为 ${shopeeValid + mercadoValid + tiktokValid} 单，已排除取消、未支付/未完成、TikTok 样品单及其他非销售状态。SKU 销量使用相同口径；单平台最多扫描 5000 条明细，当前返回销量前 ${topSkus.length} 项。`,
    };
  }
  if (tool === "inventory_overview") {
    const rows = await prisma.productVariant.findMany({ select: { skuId: true, stockQuantity: true, atFactory: true, atDomestic: true, inTransit: true, product: { select: { name: true } } }, orderBy: { stockQuantity: "asc" }, take: 100 });
    return { tool, scope: "当前产品档案库存（只读）", source: ["ProductVariant"], summary: { skuCount: rows.length, stockQuantity: rows.reduce((sum, row) => sum + row.stockQuantity, 0) }, detail: rows.slice(0, 30), note: "这是档案库存快照；备货建议还应结合平台销量、仓库明细和在途数据，不会自动扣库存。" };
  }
  const calculations = await prisma.profitCalculation.findMany({ orderBy: { updatedAt: "desc" }, take: 100, select: { productName: true, salePriceBrl: true, settlementBrl: true, netProfitCny: true, roi: true, adCostCny: true, updatedAt: true } });
  return { tool, scope: "最近维护的利润测算档案", source: ["ProfitCalculation"], summary: { rows: calculations.length, averageProfitCny: calculations.length ? calculations.reduce((sum, row) => sum + asNumber(row.netProfitCny), 0) / calculations.length : 0, averageRoi: calculations.length ? calculations.reduce((sum, row) => sum + asNumber(row.roi), 0) / calculations.length : 0 }, detail: calculations.slice(0, 30), note: "利润结果以系统测算档案为准；AI不会自行修改成本、汇率或利润规则。" };
}
