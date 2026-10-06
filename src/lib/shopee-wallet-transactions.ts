import type { ShopeeWalletTransactionRaw } from "@/lib/shopee-open-api";

export const SHOPEE_WALLET_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export type NormalizedShopeeWalletTransaction = {
  transactionId: string;
  status: string | null;
  walletType: string | null;
  transactionType: string;
  transactionTabType: string | null;
  moneyFlow: "MONEY_IN" | "MONEY_OUT";
  amount: number;
  currentBalance: number | null;
  transactionFee: number | null;
  currency: string;
  orderSn: string | null;
  refundSn: string | null;
  withdrawalType: string | null;
  withdrawalId: string | null;
  rootWithdrawalId: string | null;
  description: string | null;
  reason: string | null;
  buyerName: string | null;
  occurredAt: Date;
};

function text(value: unknown, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

export function splitShopeeWalletWindows(timeFrom: number, timeTo: number) {
  const from = Math.trunc(timeFrom);
  const to = Math.trunc(timeTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new Error("Shopee 钱包流水时间范围无效");
  }
  const windows: Array<{ timeFrom: number; timeTo: number }> = [];
  for (let cursor = from; cursor <= to;) {
    const end = Math.min(to, cursor + SHOPEE_WALLET_WINDOW_SECONDS - 1);
    windows.push({ timeFrom: cursor, timeTo: end });
    cursor = end + 1;
  }
  return windows;
}

export function normalizeShopeeWalletTransaction(
  raw: ShopeeWalletTransactionRaw,
  currency = "BRL",
): NormalizedShopeeWalletTransaction {
  const transactionId = text(raw.transaction_id, 100);
  if (!transactionId || transactionId === "0") throw new Error("Shopee 钱包流水缺少 transaction_id");
  const timestamp = Number(raw.create_time);
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error(`Shopee 钱包流水 ${transactionId} 缺少有效发生时间`);
  const rawAmount = money(raw.amount);
  if (rawAmount == null) throw new Error(`Shopee 钱包流水 ${transactionId} 金额无效`);
  const rawFlow = String(raw.money_flow || "").trim().toUpperCase();
  const moneyFlow: "MONEY_IN" | "MONEY_OUT" = rawFlow === "MONEY_OUT" || rawAmount < 0
    ? "MONEY_OUT"
    : "MONEY_IN";
  const amount = moneyFlow === "MONEY_OUT" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  return {
    transactionId,
    status: text(raw.status, 40)?.toUpperCase() || null,
    walletType: text(raw.wallet_type, 80),
    transactionType: text(raw.transaction_type, 120)?.toUpperCase() || "UNKNOWN",
    transactionTabType: text(raw.transaction_tab_type, 120),
    moneyFlow,
    amount,
    currentBalance: money(raw.current_balance),
    transactionFee: money(raw.transaction_fee),
    currency: String(currency || "BRL").trim().toUpperCase().slice(0, 3),
    orderSn: text(raw.order_sn, 100),
    refundSn: text(raw.refund_sn, 100),
    withdrawalType: text(raw.withdrawal_type, 100),
    withdrawalId: text(raw.withdrawal_id, 100),
    rootWithdrawalId: text(raw.root_withdrawal_id, 100),
    description: text(raw.description, 1000),
    reason: text(raw.reason, 1000),
    buyerName: text(raw.buyer_name, 300),
    occurredAt: new Date(timestamp * 1000),
  };
}

export function classifyShopeeWalletTransaction(input: {
  status: string | null;
  moneyFlow: string;
  amount: number;
  orderSn: string | null;
  settlementEntries: Array<{ id: string; amount: unknown }>;
}) {
  if (input.status && input.status !== "COMPLETED") {
    return { matchStatus: "IGNORED_STATUS", matchedEntryId: null };
  }
  if (input.moneyFlow === "MONEY_OUT") {
    return { matchStatus: "REVIEW_OUTFLOW", matchedEntryId: null };
  }
  if (!input.orderSn) {
    return { matchStatus: "REVIEW_INFLOW", matchedEntryId: null };
  }
  const exact = input.settlementEntries.find((entry) => Math.abs(Number(entry.amount) - input.amount) < 0.005);
  if (exact) return { matchStatus: "MATCHED_SETTLEMENT", matchedEntryId: exact.id };
  const combinedAmount = input.settlementEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  if (input.settlementEntries.length > 1 && Math.abs(combinedAmount - input.amount) < 0.005) {
    return { matchStatus: "MATCHED_SETTLEMENT", matchedEntryId: input.settlementEntries[0].id };
  }
  return {
    matchStatus: input.settlementEntries.length > 0 ? "AMOUNT_MISMATCH" : "UNMATCHED_SETTLEMENT",
    matchedEntryId: null,
  };
}

export function shopeeWalletMatchLabel(status: string) {
  return ({
    MATCHED_SETTLEMENT: "已匹配订单结算",
    UNMATCHED_SETTLEMENT: "待匹配结算",
    AMOUNT_MISMATCH: "结算金额不一致",
    REVIEW_INFLOW: "收入待核对",
    REVIEW_OUTFLOW: "支出待核对",
    IGNORED_STATUS: "未完成",
    NO_STORE_WALLET: "未建立店铺钱包",
  } as Record<string, string>)[status] || status;
}
