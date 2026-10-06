"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Download,
  History,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import ImageUploader from "@/components/ImageUploader";

type Shop = {
  id: string;
  shopId: string;
  shopName: string | null;
  region: string;
  currency: string | null;
  store: { id: string; name: string } | null;
};

type AdAccount = {
  id: string;
  accountName: string;
  currency: string;
  currentBalance: number;
  agencyName: string | null;
};

type ShopeeWallet = {
  id: string;
  shopSettingId: string;
  walletType: "STORE" | "ADVERTISING";
  name: string;
  externalAccountId: string | null;
  currency: string;
  balance: number;
  pendingBalance: number;
  autoTopupRatePercent: number;
  adAccountId: string | null;
  defaultPayoutBankAccountId: string | null;
  defaultPayoutBankAccount: { id: string; name: string; accountNumber: string; currency: string } | null;
  isOfficialTopupTarget: boolean;
  enabled: boolean;
  officialBalanceMode: boolean;
  officialBalanceCursorAt: string | null;
  officialBalanceCursorTransactionId: string | null;
  officialBalanceLastSyncAt: string | null;
  latestOfficialBalance: number | null;
  latestOfficialBalanceAt: string | null;
  latestOfficialTransactionId: string | null;
  officialBalanceDifference: number | null;
  notes: string | null;
  updatedAt: string;
  shopSetting: { shopId: string; shopName: string | null; region: string };
  adAccount: { id: string; accountName: string; currency: string } | null;
};

type WalletEntry = {
  id: string;
  walletId: string;
  entryType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  sourceType: string;
  sourceId: string;
  counterpartyWalletId: string | null;
  relatedOrderSn: string | null;
  occurredAt: string;
  notes: string | null;
  createdBy: string | null;
  bankAccount?: { id: string; name: string; accountNumber: string; currency: string } | null;
  cashFlow?: { id: string; summary: string; amount: number; currency: string } | null;
  wallet: {
    name: string;
    walletType: "STORE" | "ADVERTISING";
    currency: string;
    shopSetting: { shopId: string; shopName: string | null };
  };
};

type OfficialWalletTransaction = {
  id: string;
  transactionId: string;
  status: string | null;
  transactionType: string;
  transactionTabType: string | null;
  moneyFlow: "MONEY_IN" | "MONEY_OUT";
  amount: number;
  currentBalance: number | null;
  transactionFee: number | null;
  currency: string;
  orderSn: string | null;
  description: string | null;
  reason: string | null;
  matchStatus: string;
  occurredAt: string;
  shopSetting: { shopId: string; shopName: string | null };
  wallet: { id: string; name: string; currency: string } | null;
  matchedEntry: { id: string; wallet: { id: string; name: string; walletType: string } } | null;
};

type Withdrawal = {
  id: string;
  walletId: string;
  amount: number;
  currency: string;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  payoutReference: string | null;
  officialTransactionId: string | null;
  officialWithdrawalId: string | null;
  platformCompletedAt: string | null;
  actualReceivedAmount: number | null;
  requestedAt: string;
  expectedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  cashFlowId: string | null;
  wallet: { name: string };
  shopSetting: { shopId: string; shopName: string | null };
  destinationAccount: { id: string; name: string; accountNumber: string | null } | null;
  cashFlow: { id: string; date: string; summary: string; amount: number; currency: string; accountName: string } | null;
};

type CashFlowCandidate = {
  id: string;
  date: string;
  summary: string;
  amount: number;
  currency: string;
  accountId: string;
  accountName: string;
  businessNumber: string | null;
  remark: string;
  account: { id: string; name: string; accountNumber: string; currency: string };
};

type BankAccountOption = {
  id: string;
  name: string;
  accountNumber: string;
  currency: string;
  exchangeRate: number;
  currentBalance: number;
};

type AdvertisingFundingWalletSummary = {
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
};

type WalletResponse = {
  shops: Shop[];
  wallets: ShopeeWallet[];
  entries: OfficialWalletTransaction[];
  entryPagination: { page: number; pageSize: number; total: number; totalPages: number };
  advertisingEntries: WalletEntry[];
  advertisingEntryPagination: { page: number; pageSize: number; total: number; totalPages: number };
  advertisingFundingSummary: { wallets: AdvertisingFundingWalletSummary[]; spendDataConnected: boolean };
  officialTransactions: OfficialWalletTransaction[];
  officialPagination: { page: number; pageSize: number; total: number; totalPages: number };
  officialSummary: { inflow: number; outflow: number; matched: number; review: number };
  withdrawals: Withdrawal[];
  adAccounts: AdAccount[];
  cashFlowCandidates: CashFlowCandidate[];
  bankAccounts: BankAccountOption[];
  policy: { isolatedFromFinance: boolean; description: string };
};

type ActionKind = "create_store" | "create_ad" | "transfer" | "bank_fund" | "adjust" | "withdraw" | "edit" | "reconcile";
type ActionContext = { kind: ActionKind; shop: Shop; wallet?: ShopeeWallet; withdrawal?: Withdrawal };
type FormState = {
  name: string;
  currency: string;
  openingBalance: string;
  externalAccountId: string;
  autoTopupRatePercent: string;
  adAccountId: string;
  isOfficialTopupTarget: boolean;
  toWalletId: string;
  amount: string;
  payoutReference: string;
  expectedAt: string;
  cashFlowId: string;
  bankAccountId: string;
  defaultPayoutBankAccountId: string;
  occurredAt: string;
  transferVoucher: string | string[];
  notes: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  currency: "BRL",
  openingBalance: "0",
  externalAccountId: "",
  autoTopupRatePercent: "0",
  adAccountId: "",
  isOfficialTopupTarget: false,
  toWalletId: "",
  amount: "",
  payoutReference: "",
  expectedAt: "",
  cashFlowId: "",
  bankAccountId: "",
  defaultPayoutBankAccountId: "",
  occurredAt: "",
  transferVoucher: "",
  notes: "",
  enabled: true,
};

const ENTRY_LABELS: Record<string, string> = {
  OPENING_BALANCE: "期初建账",
  SETTLEMENT_IN: "订单结算入账",
  SETTLEMENT_ADJUSTMENT: "订单结算差额调整",
  INTERNAL_TRANSFER_OUT: "划转至广告钱包",
  INTERNAL_TRANSFER_IN: "收到店铺钱包划转",
  WITHDRAWAL_OUT: "发起提现",
  WITHDRAWAL_RETURN: "取消提现退回",
  MANUAL_ADJUSTMENT: "手工余额调整",
  ORDER_SETTLEMENT: "订单结算入账",
  AUTO_TOPUP: "订单自动充值",
  OFFICIAL_BALANCE_BASELINE: "官方余额校准",
  OFFICIAL_WALLET_IN: "官方钱包收入",
  OFFICIAL_WITHDRAWAL_OUT: "官方提现支出",
  OFFICIAL_WALLET_PAYMENT_OUT: "官方钱包划出",
  OFFICIAL_AD_TOPUP_IN: "官方广告充值入账",
  OFFICIAL_ORDER_ADJUSTMENT_OUT: "官方订单冲减",
  OFFICIAL_AD_SPEND_OUT: "官方广告扣费",
  OFFICIAL_AD_SPEND_ADJUSTMENT: "广告扣费差额调整",
  ORDER_AUTO_TOPUP_IN: "订单比例自动充值",
  ORDER_AUTO_TOPUP_ADJUSTMENT: "订单比例充值调整",
  OFFICIAL_AD_CREDIT_IN: "平台免费广告额度",
  OFFICIAL_WALLET_OUT: "官方钱包支出",
  BANK_FUNDING_IN: "公司账户充值",
};

const AD_ENTRY_SOURCE_LABELS: Record<string, string> = {
  OFFICIAL_AD_TOPUP_IN: "店铺钱包官方充值",
  AUTO_TOPUP: "订单结算比例自动充值",
  INTERNAL_TRANSFER_IN: "店铺钱包人工划拨",
  BANK_FUNDING_IN: "公司账户人工充值",
  OFFICIAL_AD_SPEND_OUT: "Shopee 广告扣费明细",
  OFFICIAL_AD_SPEND_ADJUSTMENT: "Shopee 广告扣费修正",
  ORDER_AUTO_TOPUP_IN: "订单结算比例自动充值",
  ORDER_AUTO_TOPUP_ADJUSTMENT: "订单结算比例充值修正",
  OFFICIAL_AD_CREDIT_IN: "平台免费广告额度",
  OPENING_BALANCE: "广告钱包期初余额",
  MANUAL_ADJUSTMENT: "人工余额调整",
};

const OFFICIAL_WALLET_TYPE_LABELS: Record<string, string> = {
  ESCROW_VERIFIED_ADD: "订单结算回款",
  ESCROW_VERIFIED_MINUS: "订单结算冲减",
  SPM_DEDUCT: "广告充值支出",
  WITHDRAWAL_CREATED: "钱包提现转出",
  WITHDRAWAL_COMPLETED: "提现完成",
};

const OFFICIAL_MATCH_LABELS: Record<string, string> = {
  MATCHED_SETTLEMENT: "已匹配结算",
  UNMATCHED_SETTLEMENT: "待匹配结算",
  AMOUNT_MISMATCH: "金额不一致",
  REVIEW_INFLOW: "收入待核对",
  REVIEW_OUTFLOW: "支出待核对",
  IGNORED_STATUS: "未完成",
  NO_STORE_WALLET: "未建立钱包",
  MATCHED_AD_WALLET: "已进入广告钱包",
  AD_TOPUP_UNASSIGNED: "待指定广告钱包",
  WITHDRAWAL_PENDING: "提现待到账核销",
  WITHDRAWAL_PLATFORM_COMPLETED: "平台已出款",
  WITHDRAWAL_RECONCILED: "已核销公司到账",
};

const ACTION_TITLES: Record<ActionKind, string> = {
  create_store: "初始化店铺钱包",
  create_ad: "新增广告钱包",
  transfer: "划转到广告钱包",
  bank_fund: "公司账户充值广告钱包",
  adjust: "调整钱包余额",
  withdraw: "发起店铺钱包提现",
  edit: "编辑钱包设置",
  reconcile: "核销公司到账流水",
};

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
}

function dateTime(value: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "America/Sao_Paulo" });
}

function brazilDateTimeInputValue(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function aggregateCurrency(items: Array<{ amount: number; currency: string }>) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.currency, (totals.get(item.currency) || 0) + item.amount);
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function AmountList({ values, empty = "--" }: { values: Array<[string, number]>; empty?: string }) {
  if (!values.length) return <span>{empty}</span>;
  return <>{values.map(([currency, value]) => <div key={currency}>{money(value, currency)}</div>)}</>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
    <button aria-label="关闭" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
    <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5 py-4 backdrop-blur">
        <div><h2 className="text-lg font-semibold text-slate-100">{title}</h2><p className="mt-0.5 text-xs text-slate-500">Shopee 平台内部账本</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      {children}
    </div>
  </div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}

const inputClass = "h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-orange-400 focus:ring-1 focus:ring-orange-400/30 disabled:cursor-not-allowed disabled:opacity-60";

export default function ShopeeWalletsPage() {
  const [data, setData] = useState<WalletResponse>({ shops: [], wallets: [], entries: [], entryPagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 }, advertisingEntries: [], advertisingEntryPagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 }, advertisingFundingSummary: { wallets: [], spendDataConnected: false }, officialTransactions: [], officialPagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 }, officialSummary: { inflow: 0, outflow: 0, matched: 0, review: 0 }, withdrawals: [], adAccounts: [], cashFlowCandidates: [], bankAccounts: [], policy: { isolatedFromFinance: true, description: "" } });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingOfficial, setSyncingOfficial] = useState(false);
  const [tab, setTab] = useState<"wallets" | "entries" | "advertising" | "official" | "withdrawals">("wallets");
  const [shopFilter, setShopFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [entryKeyword, setEntryKeyword] = useState("");
  const [entryPage, setEntryPage] = useState(1);
  const [entryPageSize, setEntryPageSize] = useState(50);
  const [entryMoneyFlow, setEntryMoneyFlow] = useState("");
  const [entryTransactionType, setEntryTransactionType] = useState("");
  const [advertisingEntryPage, setAdvertisingEntryPage] = useState(1);
  const [advertisingEntryPageSize, setAdvertisingEntryPageSize] = useState(50);
  const [advertisingEntryMoneyFlow, setAdvertisingEntryMoneyFlow] = useState("");
  const [advertisingEntryType, setAdvertisingEntryType] = useState("");
  const [officialPage, setOfficialPage] = useState(1);
  const [officialPageSize, setOfficialPageSize] = useState(50);
  const [officialMoneyFlow, setOfficialMoneyFlow] = useState("");
  const [officialMatchStatus, setOfficialMatchStatus] = useState("");
  const [action, setAction] = useState<ActionContext | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirm, setConfirm] = useState<{ title: string; message: string; confirmText: string; type: "warning" | "danger" | "info" } | null>(null);
  const [specialHandler, setSpecialHandler] = useState<null | (() => Promise<void>)>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntryKeyword(keyword.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => { setEntryPage(1); }, [entryKeyword, entryPageSize, entryMoneyFlow, entryTransactionType, shopFilter]);
  useEffect(() => { setAdvertisingEntryPage(1); }, [entryKeyword, advertisingEntryPageSize, advertisingEntryMoneyFlow, advertisingEntryType, shopFilter]);
  useEffect(() => { setOfficialPage(1); }, [entryKeyword, officialPageSize, shopFilter, officialMoneyFlow, officialMatchStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        entryPage: String(entryPage),
        entryPageSize: String(entryPageSize),
        advertisingEntryPage: String(advertisingEntryPage),
        advertisingEntryPageSize: String(advertisingEntryPageSize),
        officialPage: String(officialPage),
        officialPageSize: String(officialPageSize),
      });
      if (entryKeyword) params.set("entryKeyword", entryKeyword);
      if (entryMoneyFlow) params.set("entryMoneyFlow", entryMoneyFlow);
      if (entryTransactionType) params.set("entryTransactionType", entryTransactionType);
      if (advertisingEntryMoneyFlow) params.set("advertisingEntryMoneyFlow", advertisingEntryMoneyFlow);
      if (advertisingEntryType) params.set("advertisingEntryType", advertisingEntryType);
      if (entryKeyword) params.set("officialKeyword", entryKeyword);
      if (shopFilter) {
        params.set("entryShopSettingId", shopFilter);
        params.set("officialShopSettingId", shopFilter);
      }
      if (officialMoneyFlow) params.set("officialMoneyFlow", officialMoneyFlow);
      if (officialMatchStatus) params.set("officialMatchStatus", officialMatchStatus);
      const response = await fetch(`/api/shopee/wallets?${params.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Shopee 钱包数据加载失败");
      setData(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shopee 钱包数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [advertisingEntryMoneyFlow, advertisingEntryPage, advertisingEntryPageSize, advertisingEntryType, entryKeyword, entryMoneyFlow, entryPage, entryPageSize, entryTransactionType, officialMatchStatus, officialMoneyFlow, officialPage, officialPageSize, shopFilter]);

  useEffect(() => { void load(); }, [load]);

  const walletsByShop = useMemo(() => {
    const map = new Map<string, ShopeeWallet[]>();
    data.wallets.forEach((wallet) => map.set(wallet.shopSettingId, [...(map.get(wallet.shopSettingId) || []), wallet]));
    return map;
  }, [data.wallets]);

  const filteredShops = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return data.shops.filter((shop) => (!shopFilter || shop.id === shopFilter) && (!q || `${shop.shopName || ""} ${shop.shopId} ${shop.store?.name || ""}`.toLowerCase().includes(q)));
  }, [data.shops, keyword, shopFilter]);

  const filteredEntries = data.entries;

  const filteredWithdrawals = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return data.withdrawals.filter((item) => (!shopFilter || data.wallets.find((wallet) => wallet.id === item.walletId)?.shopSettingId === shopFilter) && (!q || `${item.shopSetting.shopName || ""} ${item.shopSetting.shopId} ${item.payoutReference || ""} ${item.notes || ""}`.toLowerCase().includes(q)));
  }, [data.wallets, data.withdrawals, keyword, shopFilter]);

  const storeWallets = data.wallets.filter((wallet) => wallet.walletType === "STORE" && wallet.enabled);
  const adWallets = data.wallets.filter((wallet) => wallet.walletType === "ADVERTISING" && wallet.enabled);
  const inTransit = data.withdrawals.filter((item) => item.status === "IN_TRANSIT");
  const storeTotals = aggregateCurrency(storeWallets.map((wallet) => ({ amount: wallet.balance, currency: wallet.currency })));
  const adTotals = aggregateCurrency(adWallets.map((wallet) => ({ amount: wallet.balance, currency: wallet.currency })));
  const transitTotals = aggregateCurrency(inTransit.map((item) => ({ amount: item.amount, currency: item.currency })));
  const companyFundingTotals = aggregateCurrency(data.advertisingFundingSummary.wallets.map((item) => ({ amount: item.companyFunding, currency: item.currency })));
  const storeWalletFundingTotals = aggregateCurrency(data.advertisingFundingSummary.wallets.map((item) => ({ amount: item.storeWalletFunding, currency: item.currency })));
  const confirmedOrderFundingTotals = aggregateCurrency(data.advertisingFundingSummary.wallets.map((item) => ({ amount: item.confirmedOrderFunding, currency: item.currency })));
  const pendingOrderFundingTotals = aggregateCurrency(data.advertisingFundingSummary.wallets.map((item) => ({ amount: item.pendingOrderFunding, currency: item.currency })));
  const recordedAdSpendTotals = aggregateCurrency(data.advertisingFundingSummary.wallets.map((item) => ({ amount: item.recordedSpend, currency: item.currency })));
  const companyFundingCount = data.advertisingFundingSummary.wallets.reduce((sum, item) => sum + item.companyFundingCount, 0);
  const storeWalletFundingCount = data.advertisingFundingSummary.wallets.reduce((sum, item) => sum + item.storeWalletFundingCount, 0);
  const confirmedOrderFundingCount = data.advertisingFundingSummary.wallets.reduce((sum, item) => sum + item.confirmedOrderCount, 0);
  const pendingOrderFundingCount = data.advertisingFundingSummary.wallets.reduce((sum, item) => sum + item.pendingOrderCount, 0);
  const recordedAdSpendCount = data.advertisingFundingSummary.wallets.reduce((sum, item) => sum + item.recordedSpendCount, 0);

  const openAction = (kind: ActionKind, shop: Shop, wallet?: ShopeeWallet) => {
    const shopWallets = walletsByShop.get(shop.id) || [];
    const defaultCurrency = wallet?.currency || shop.currency || "BRL";
    setForm({
      ...EMPTY_FORM,
      name: wallet?.name || (kind === "create_store" ? `${shop.shopName || shop.shopId} 店铺钱包` : ""),
      currency: defaultCurrency,
      externalAccountId: wallet?.externalAccountId || "",
      autoTopupRatePercent: wallet ? String(wallet.autoTopupRatePercent) : "0",
      adAccountId: wallet?.adAccountId || "",
      isOfficialTopupTarget: wallet?.isOfficialTopupTarget || false,
      defaultPayoutBankAccountId: wallet?.defaultPayoutBankAccountId || "",
      toWalletId: shopWallets.find((item) => item.walletType === "ADVERTISING" && item.enabled)?.id || "",
      notes: wallet?.notes || "",
      enabled: wallet?.enabled ?? true,
      bankAccountId: data.bankAccounts.find((account) => (account.currency === "RMB" ? "CNY" : account.currency) === (defaultCurrency === "RMB" ? "CNY" : defaultCurrency))?.id || "",
      occurredAt: brazilDateTimeInputValue(),
    });
    setAction({ kind, shop, wallet });
  };

  const openReconcile = (withdrawal: Withdrawal) => {
    const shop = data.shops.find((item) => item.id === data.wallets.find((wallet) => wallet.id === withdrawal.walletId)?.shopSettingId);
    if (!shop) return toast.error("没有找到提现对应的店铺");
    const candidates = data.cashFlowCandidates
      .filter((flow) => (flow.currency === "RMB" ? "CNY" : flow.currency) === (withdrawal.currency === "RMB" ? "CNY" : withdrawal.currency))
      .sort((a, b) => Math.abs(Math.abs(a.amount) - withdrawal.amount) - Math.abs(Math.abs(b.amount) - withdrawal.amount));
    setForm({ ...EMPTY_FORM, cashFlowId: candidates[0]?.id || "" });
    setAction({ kind: "reconcile", shop, withdrawal });
  };

  const actionPayload = () => {
    if (!action) throw new Error("未选择操作");
    switch (action.kind) {
      case "create_store": return { action: "create_wallet", shopSettingId: action.shop.id, walletType: "STORE", name: form.name, currency: form.currency, openingBalance: form.openingBalance, defaultPayoutBankAccountId: form.defaultPayoutBankAccountId || null, notes: form.notes };
      case "create_ad": return { action: "create_wallet", shopSettingId: action.shop.id, walletType: "ADVERTISING", name: form.name, currency: form.currency, openingBalance: form.openingBalance, externalAccountId: form.externalAccountId, autoTopupRatePercent: form.autoTopupRatePercent, adAccountId: form.adAccountId || null, isOfficialTopupTarget: form.isOfficialTopupTarget, notes: form.notes };
      case "transfer": return { action: "transfer", fromWalletId: action.wallet?.id, toWalletId: form.toWalletId, amount: form.amount, notes: form.notes };
      case "bank_fund": return { action: "bank_fund", walletId: action.wallet?.id, bankAccountId: form.bankAccountId, amount: form.amount, occurredAt: form.occurredAt, transferVoucher: form.transferVoucher, notes: form.notes };
      case "adjust": return { action: "adjust", walletId: action.wallet?.id, amount: form.amount, notes: form.notes };
      case "withdraw": return { action: "withdraw", walletId: action.wallet?.id, amount: form.amount, payoutReference: form.payoutReference, expectedAt: form.expectedAt || null, notes: form.notes };
      case "edit": return { action: "update_wallet", walletId: action.wallet?.id, name: form.name, externalAccountId: form.externalAccountId, autoTopupRatePercent: form.autoTopupRatePercent, isOfficialTopupTarget: form.isOfficialTopupTarget, defaultPayoutBankAccountId: form.defaultPayoutBankAccountId || null, notes: form.notes, enabled: form.enabled };
      case "reconcile": return { action: "match_withdrawal", withdrawalId: action.withdrawal?.id, cashFlowId: form.cashFlowId };
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!action) return;
    const amount = Number(form.amount);
    const target = data.wallets.find((wallet) => wallet.id === form.toWalletId);
    if (["transfer", "bank_fund", "withdraw"].includes(action.kind) && (!Number.isFinite(amount) || amount <= 0)) return toast.error("请输入大于 0 的金额");
    if (action.kind === "bank_fund" && !form.bankAccountId) return toast.error("请选择付款银行账户");
    if (action.kind === "bank_fund" && !form.occurredAt) return toast.error("请选择充值发生时间");
    if (action.kind === "bank_fund" && (Array.isArray(form.transferVoucher) ? form.transferVoucher.length === 0 : !form.transferVoucher)) return toast.error("请上传转账凭证");
    if (action.kind === "adjust" && (!Number.isFinite(amount) || amount === 0)) return toast.error("调整金额不能为 0");
    if (action.kind === "adjust" && form.notes.trim().length < 4) return toast.error("请填写至少 4 个字符的调整原因");
    if (action.kind === "reconcile" && !form.cashFlowId) return toast.error("请选择真实到账的公司流水");
    if (["create_store", "create_ad", "edit"].includes(action.kind) && !form.name.trim()) return toast.error("请输入钱包名称");
    const walletName = action.wallet?.name || form.name;
    const messages: Record<ActionKind, string> = {
      create_store: `将为「${action.shop.shopName || action.shop.shopId}」建立独立店铺钱包，期初余额 ${money(Number(form.openingBalance) || 0, form.currency)}。`,
      create_ad: `将新增广告钱包「${form.name}」，期初余额 ${money(Number(form.openingBalance) || 0, form.currency)}。`,
      transfer: `将从「${walletName}」划转 ${money(amount, action.wallet?.currency || form.currency)} 到「${target?.name || "所选广告钱包"}」。`,
      bank_fund: `将于巴西时间 ${form.occurredAt.replace("T", " ")} 从公司银行账户「${data.bankAccounts.find((account) => account.id === form.bankAccountId)?.name || "所选账户"}」支出 ${money(amount, action.wallet?.currency || form.currency)}，充值到「${walletName}」。\n已上传 ${Array.isArray(form.transferVoucher) ? form.transferVoucher.length : 1} 份转账凭证，将保存到对应财务流水。`,
      adjust: `将「${walletName}」余额${amount > 0 ? "增加" : "减少"} ${money(Math.abs(amount), action.wallet?.currency || form.currency)}。`,
      withdraw: `将从「${walletName}」发起提现 ${money(amount, action.wallet?.currency || form.currency)}，状态先记为“提现中”。`,
      edit: action.wallet?.walletType === "STORE"
        ? `将保存「${walletName}」的钱包设置；平台确认提现完成后，将自动回款至「${data.bankAccounts.find((account) => account.id === form.defaultPayoutBankAccountId)?.name || "未设置"}」。`
        : `将保存「${walletName}」的钱包名称、自动充值比例及启用状态。`,
      reconcile: (() => {
        const flow = data.cashFlowCandidates.find((item) => item.id === form.cashFlowId);
        return `将提现 ${money(action.withdrawal?.amount || 0, action.withdrawal?.currency || "BRL")} 与公司真实入账「${flow?.summary || "所选流水"}」${flow ? `（${money(Math.abs(flow.amount), flow.currency)}）` : ""}关联核销。`;
      })(),
    };
    const warning = ["transfer", "adjust", "withdraw"].includes(action.kind) ? "\n本次操作只记录在 Shopee 平台账本，不生成公司财务流水。" : action.kind === "bank_fund" ? "\n本次会同时生成一笔公司账户支出和一笔广告钱包收入，请核对账户及金额。" : action.kind === "reconcile" ? "\n只关联现有公司流水，不会新建或修改金额。请确认该流水确实是这笔 Shopee 提现到账。" : "";
    setConfirm({ title: ACTION_TITLES[action.kind], message: messages[action.kind] + warning, confirmText: action.kind === "withdraw" ? "确认发起提现" : "确认保存", type: action.kind === "adjust" && amount < 0 ? "danger" : "warning" });
  };

  const runAction = async () => {
    if (!action) return;
    setSaving(true);
    try {
      const response = await fetch("/api/shopee/wallets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(actionPayload()) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "钱包操作失败");
      toast.success(`${ACTION_TITLES[action.kind]}成功`);
      setConfirm(null);
      setAction(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "钱包操作失败");
    } finally {
      setSaving(false);
    }
  };

  const cancelWithdrawal = (item: Withdrawal) => {
    setConfirm({ title: "取消提现", message: `确认取消 ${money(item.amount, item.currency)} 的提现吗？\n款项将退回「${item.wallet.name}」，仍然不会生成公司财务流水。`, confirmText: "确认取消并退回", type: "warning" });
    const currentAction = action;
    setAction(null);
    const perform = async () => {
      setSaving(true);
      try {
        const response = await fetch("/api/shopee/wallets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel_withdrawal", withdrawalId: item.id }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "取消提现失败");
        toast.success("提现已取消，余额已退回店铺钱包");
        setConfirm(null);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "取消提现失败");
      } finally {
        setSaving(false);
        setAction(currentAction);
      }
    };
    setSpecialHandler(() => perform);
  };

  const enableOfficialBalance = (wallet: ShopeeWallet) => {
    if (wallet.latestOfficialBalance == null || !wallet.latestOfficialTransactionId) {
      toast.error("尚未取得官方余额，请先同步官方流水");
      return;
    }
    setConfirm({
      title: "启用官方余额同步",
      message: `系统将直接使用 Shopee 官方钱包流水和官方余额维护「${wallet.name}」。不从结算单重复生成流水，不生成余额校准流水，也不会生成公司财务流水。`,
      confirmText: "确认启用",
      type: "warning",
    });
    const perform = async () => {
      setSaving(true);
      try {
        const response = await fetch("/api/shopee/wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "enable_official_balance", walletId: wallet.id }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "官方流水同步启用失败");
        toast.success(`已启用官方流水同步，当前余额 ${money(Number(result.officialBalance), wallet.currency)}`);
        setConfirm(null);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "官方流水同步启用失败");
      } finally {
        setSaving(false);
      }
    };
    setSpecialHandler(() => perform);
  };

  const confirmHandler = async () => {
    if (specialHandler) {
      const handler = specialHandler;
      setSpecialHandler(null);
      await handler();
      return;
    }
    await runAction();
  };

  const syncOfficialTransactions = async () => {
    setSyncingOfficial(true);
    try {
      const selectedShop = data.shops.find((shop) => shop.id === shopFilter);
      const response = await fetch("/api/shopee/wallets/official/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7, shopId: selectedShop?.shopId }),
      });
      const result = await response.json();
      if (!response.ok && response.status !== 207) throw new Error(result.error || "官方钱包流水同步失败");
      const message = `同步 ${Number(result.fetched || 0).toLocaleString()} 条，新增 ${Number(result.created || 0).toLocaleString()} 条`;
      if (result.errors?.length) toast.warning(`${message}，部分店铺需要检查`);
      else toast.success(message);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "官方钱包流水同步失败");
    } finally {
      setSyncingOfficial(false);
    }
  };

  const exportAdvertisingEntries = () => {
    const params = new URLSearchParams();
    if (shopFilter) params.set("shopSettingId", shopFilter);
    if (entryKeyword) params.set("keyword", entryKeyword);
    if (advertisingEntryMoneyFlow) params.set("moneyFlow", advertisingEntryMoneyFlow);
    if (advertisingEntryType) params.set("entryType", advertisingEntryType);
    window.location.href = `/api/shopee/wallets/advertising/export?${params.toString()}`;
  };

  return <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Wallet className="h-7 w-7 text-orange-400" />Shopee 钱包管理</h1>
        <p className="mt-1 text-sm text-slate-400">统一管理每家店铺的店铺钱包、多个广告钱包和平台内部资金流向。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void syncOfficialTransactions()} disabled={syncingOfficial} className="flex h-10 items-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${syncingOfficial ? "animate-spin" : ""}`} />同步官方流水
        </button>
        <button onClick={() => void load()} disabled={loading} className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm text-slate-200 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新数据
        </button>
      </div>
    </header>

    <div className="flex gap-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.07] px-4 py-3 text-sm text-orange-100">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
      <div><div className="font-medium">平台账本与公司财务分层联动</div><div className="mt-0.5 text-xs leading-5 text-orange-200/70">订单结算、自动广告充值及广告扣费保留在 Shopee 平台账本；公司账户人工充值会同步生成公司支出；店铺钱包配置默认到账账户后，平台确认提现完成会自动生成公司收款并核销。</div></div>
    </div>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-sm text-slate-400"><span>已接入店铺</span><Store className="h-4 w-4 text-orange-400" /></div><div className="mt-2 text-2xl font-semibold">{data.shops.length}</div><div className="mt-1 text-xs text-slate-500">{storeWallets.length} 家已初始化钱包</div></div>
      <div className="rounded-xl border border-blue-500/20 bg-slate-900 p-4"><div className="flex items-center justify-between text-sm text-blue-300"><span>店铺钱包余额</span><CircleDollarSign className="h-4 w-4" /></div><div className="mt-2 text-xl font-semibold"><AmountList values={storeTotals} empty="尚未建账" /></div><div className="mt-1 text-xs text-slate-500">平台待提现及可分配资金</div></div>
      <div className="rounded-xl border border-violet-500/20 bg-slate-900 p-4"><div className="flex items-center justify-between text-sm text-violet-300"><span>广告钱包账面余额</span><Megaphone className="h-4 w-4" /></div><div className="mt-2 text-xl font-semibold"><AmountList values={adTotals} empty="尚未建账" /></div><div className="mt-1 text-xs text-slate-500">已纳入三类充值来源与 Shopee 每日广告消耗</div></div>
      <div className="rounded-xl border border-amber-500/20 bg-slate-900 p-4"><div className="flex items-center justify-between text-sm text-amber-300"><span>提现中</span><Clock3 className="h-4 w-4" /></div><div className="mt-2 text-xl font-semibold"><AmountList values={transitTotals} empty={money(0, "BRL")} /></div><div className="mt-1 text-xs text-slate-500">{inTransit.length} 笔等待实际到账</div></div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
      <div className="flex gap-1">
        {([
          ["wallets", "钱包概览", Wallet, data.wallets.length],
          ["entries", "钱包流水", History, data.entryPagination.total],
          ["advertising", "广告流水", Megaphone, data.advertisingEntryPagination.total],
          ["withdrawals", "提现与财务核销", ArrowDownToLine, data.withdrawals.length],
        ] as const).map(([value, label, Icon, count]) => <button key={value} onClick={() => setTab(value)} className={`flex h-11 items-center gap-2 border-b-2 px-3 text-sm transition ${tab === value ? "border-orange-400 text-orange-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}><Icon className="h-4 w-4" />{label}<span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{count}</span></button>)}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <select value={shopFilter} onChange={(event) => setShopFilter(event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部店铺</option>{data.shops.map((shop) => <option value={shop.id} key={shop.id}>{shop.shopName || shop.shopId}</option>)}</select>
        {tab === "entries" && <>
          <select value={entryMoneyFlow} onChange={(event) => setEntryMoneyFlow(event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部收支</option><option value="MONEY_IN">收入</option><option value="MONEY_OUT">支出</option></select>
          <select value={entryTransactionType} onChange={(event) => setEntryTransactionType(event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部业务类型</option><option value="ESCROW_VERIFIED_ADD">订单结算回款</option><option value="ESCROW_VERIFIED_MINUS">订单结算冲减</option><option value="SPM_DEDUCT">广告充值支出</option><option value="WITHDRAWAL_CREATED">钱包提现转出</option></select>
        </>}
        {tab === "advertising" && <>
          <select value={advertisingEntryMoneyFlow} onChange={(event) => setAdvertisingEntryMoneyFlow(event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部收支</option><option value="MONEY_IN">收入</option><option value="MONEY_OUT">支出</option></select>
          <select value={advertisingEntryType} onChange={(event) => setAdvertisingEntryType(event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部业务类型</option><option value="OFFICIAL_AD_SPEND_OUT">广告消耗支出</option><option value="OFFICIAL_AD_SPEND_ADJUSTMENT">广告消耗修正</option><option value="OFFICIAL_AD_TOPUP_IN">店铺钱包官方充值</option><option value="INTERNAL_TRANSFER_IN">店铺钱包人工划拨</option><option value="ORDER_AUTO_TOPUP_IN">订单比例自动充值</option><option value="ORDER_AUTO_TOPUP_ADJUSTMENT">订单比例充值修正</option><option value="BANK_FUNDING_IN">公司账户充值</option><option value="OFFICIAL_AD_CREDIT_IN">平台免费广告额度</option><option value="OPENING_BALANCE">期初余额</option><option value="MANUAL_ADJUSTMENT">人工调整</option></select>
          <button type="button" onClick={exportAdvertisingEntries} className="flex h-9 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm text-emerald-200 hover:bg-emerald-500/20"><Download className="h-4 w-4" />导出广告流水</button>
        </>}
        {tab === "official" && <>
          <select value={officialMoneyFlow} onChange={(event) => setOfficialMoneyFlow(event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部收支</option><option value="MONEY_IN">收入</option><option value="MONEY_OUT">支出</option></select>
          <select value={officialMatchStatus} onChange={(event) => setOfficialMatchStatus(event.target.value)} className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部对账状态</option><option value="MATCHED_SETTLEMENT">已匹配结算</option><option value="UNMATCHED_SETTLEMENT">待匹配结算</option><option value="AMOUNT_MISMATCH">金额不一致</option><option value="REVIEW_INFLOW">收入待核对</option><option value="REVIEW_OUTFLOW">支出待核对</option><option value="NO_STORE_WALLET">未建立钱包</option></select>
        </>}
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={tab === "entries" ? "搜索订单号、店铺或备注" : tab === "advertising" ? "搜索广告流水、账户或业务号" : tab === "official" ? "搜索订单号、官方流水号或类型" : "搜索店铺、钱包或备注"} className="h-9 w-72 rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm outline-none focus:border-orange-400" /></div>
      </div>
    </div>

    {loading ? <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800 bg-slate-900"><Loader2 className="h-7 w-7 animate-spin text-orange-400" /></div> : tab === "wallets" ? <div className="space-y-4">
      {filteredShops.length === 0 ? <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 text-slate-500"><Store className="mb-3 h-9 w-9" />没有匹配的 Shopee 店铺</div> : filteredShops.map((shop) => {
        const wallets = walletsByShop.get(shop.id) || [];
        const storeWallet = wallets.find((wallet) => wallet.walletType === "STORE");
        const advertisingWallets = wallets.filter((wallet) => wallet.walletType === "ADVERTISING");
        return <section key={shop.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400"><Store className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate font-semibold">{shop.shopName || shop.shopId}</h2><div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500"><span>Shop ID：{shop.shopId}</span><span>{shop.region}</span>{shop.store && <span>系统店铺：{shop.store.name}</span>}</div></div></div>
            <button onClick={() => openAction("create_ad", shop)} className="flex h-9 items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 text-sm text-violet-200 hover:bg-violet-500/20"><Plus className="h-4 w-4" />新增广告钱包</button>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
            {!storeWallet ? <button onClick={() => openAction("create_store", shop)} className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-blue-500/40 bg-blue-500/[0.04] p-6 text-center hover:bg-blue-500/[0.08]"><Plus className="mb-3 h-8 w-8 text-blue-400" /><div className="font-medium text-blue-200">初始化店铺钱包</div><div className="mt-1 text-xs text-slate-500">每家店铺仅一个，用于承接订单结算和发起提现</div></button> : <div className={`relative overflow-hidden rounded-xl border p-4 ${storeWallet.enabled ? "border-blue-500/25 bg-gradient-to-br from-blue-500/10 to-slate-900" : "border-slate-700 bg-slate-900 opacity-60"}`}>
              <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-blue-500/[0.06]" /><div className="relative flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-medium text-blue-200"><Building2 className="h-4 w-4" />店铺钱包{!storeWallet.enabled && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">已停用</span>}</div><div className="mt-2 text-base font-semibold">{storeWallet.name}</div></div><button onClick={() => openAction("edit", shop, storeWallet)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="钱包设置"><Settings2 className="h-4 w-4" /></button></div>
              <div className="relative mt-5 text-3xl font-semibold tracking-tight">{money(storeWallet.balance, storeWallet.currency)}</div><div className="relative mt-1 text-xs text-slate-500">官方可用余额 · 更新于 {dateTime(storeWallet.updatedAt)}</div>{storeWallet.pendingBalance > 0 && <div className="relative mt-2 rounded-md bg-amber-500/[0.08] px-2.5 py-1.5 text-xs text-amber-200">待进入官方钱包：{money(storeWallet.pendingBalance, storeWallet.currency)}</div>}
              <div className="relative mt-3 flex items-center justify-between gap-3 rounded-lg border border-blue-500/15 bg-slate-950/35 px-3 py-2 text-xs"><div><div className="text-slate-500">Shopee 官方余额</div><div className="mt-0.5 font-medium text-blue-200">{storeWallet.latestOfficialBalance == null ? "尚未同步" : money(storeWallet.latestOfficialBalance, storeWallet.currency)}</div></div>{storeWallet.officialBalanceMode ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300"><ShieldCheck className="h-3 w-3" />自动同步中</span> : <button disabled={storeWallet.latestOfficialBalance == null || saving} onClick={() => enableOfficialBalance(storeWallet)} className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-blue-200 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40">启用官方流水同步</button>}</div>
              <div className={`relative mt-2 rounded-lg border px-3 py-2 text-xs ${storeWallet.defaultPayoutBankAccount ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-200" : "border-amber-500/20 bg-amber-500/[0.05] text-amber-200"}`}><span className="text-slate-500">提现自动回款：</span>{storeWallet.defaultPayoutBankAccount ? `${storeWallet.defaultPayoutBankAccount.name} · ${storeWallet.defaultPayoutBankAccount.currency}` : "未设置，请编辑钱包"}</div>
              <div className="relative mt-5 grid grid-cols-3 gap-2"><button disabled={!storeWallet.enabled || storeWallet.officialBalanceMode || advertisingWallets.filter((item) => item.enabled).length === 0} onClick={() => openAction("transfer", shop, storeWallet)} className="flex h-9 items-center justify-center gap-1 rounded-lg bg-blue-600 text-xs font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"><ArrowRightLeft className="h-3.5 w-3.5" />划转</button><button disabled={!storeWallet.enabled || storeWallet.officialBalanceMode} onClick={() => openAction("withdraw", shop, storeWallet)} className="flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><ArrowDownToLine className="h-3.5 w-3.5" />提现</button><button disabled={storeWallet.officialBalanceMode} onClick={() => openAction("adjust", shop, storeWallet)} className="flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 text-xs hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><Pencil className="h-3.5 w-3.5" />调整</button></div>
              {storeWallet.officialBalanceMode && <div className="relative mt-2 text-center text-[11px] leading-4 text-slate-500">余额由 Shopee 官方流水维护；划转、提现请在平台后台操作。</div>}
            </div>}
            <div className="min-w-0"><div className="mb-2 flex items-center justify-between"><div className="text-xs font-medium uppercase tracking-wider text-slate-500">广告钱包 · {advertisingWallets.length}</div>{advertisingWallets.length > 0 && <div className="text-xs text-slate-600">同店可建立多个</div>}</div>{advertisingWallets.length === 0 ? <button onClick={() => openAction("create_ad", shop)} className="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-violet-500/30 bg-violet-500/[0.03] text-slate-500 hover:bg-violet-500/[0.07]"><Megaphone className="mb-2 h-7 w-7 text-violet-400" /><span className="text-sm text-violet-200">新增第一个广告钱包</span></button> : <div className="grid gap-3 md:grid-cols-2">{advertisingWallets.map((wallet) => <div key={wallet.id} className={`rounded-xl border p-4 ${wallet.enabled ? wallet.balance < 0 ? "border-rose-500/35 bg-rose-500/[0.06]" : "border-violet-500/20 bg-violet-500/[0.06]" : "border-slate-700 bg-slate-950/40 opacity-60"}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-2 text-xs text-violet-300"><Megaphone className="h-3.5 w-3.5" />广告钱包{wallet.isOfficialTopupTarget && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px]">官方充值入口</span>}{!wallet.enabled && <span className="text-slate-500">· 已停用</span>}</div><div className="mt-1.5 truncate font-medium">{wallet.name}</div></div><button onClick={() => openAction("edit", shop, wallet)} className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"><Settings2 className="h-4 w-4" /></button></div><div className={`mt-4 text-2xl font-semibold ${wallet.balance < 0 ? "text-rose-300" : ""}`}>{money(wallet.balance, wallet.currency)}</div>{wallet.balance < 0 && <div className="mt-1 text-xs text-rose-300">历史充值来源尚未补齐，当前显示为账本覆盖差额</div>}<div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>自动充值 {wallet.autoTopupRatePercent.toFixed(2)}%</span><span>{wallet.externalAccountId ? `ID ${wallet.externalAccountId}` : "未填外部 ID"}</span></div>{wallet.adAccount && <div className="mt-2 truncate rounded-md bg-slate-950/50 px-2 py-1.5 text-xs text-slate-400">关联广告户：{wallet.adAccount.accountName}</div>}<div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => { setShopFilter(shop.id); setTab("advertising"); }} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-violet-500/25 text-xs text-violet-300 hover:bg-violet-500/[0.09]"><History className="h-3.5 w-3.5" />流水</button><button onClick={() => openAction("bank_fund", shop, wallet)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] text-xs text-emerald-300 hover:bg-emerald-500/[0.12]"><Building2 className="h-3.5 w-3.5" />银行充值</button><button onClick={() => openAction("adjust", shop, wallet)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"><Pencil className="h-3.5 w-3.5" />调整</button></div></div>)}</div>}</div>
          </div>
        </section>;
      })}
    </div> : tab === "entries" ? <div className="space-y-3">
      <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-3 text-xs leading-5 text-slate-400"><Store className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" /><div><span className="font-medium text-blue-200">店铺钱包官方流水：</span>直接显示 Shopee 店铺钱包接口返回的原始明细，不从结算单重复生成，不包含广告钱包流水，也不存在余额校准流水。</div></div>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      {filteredEntries.length === 0 ? <div className="flex h-56 flex-col items-center justify-center text-slate-500"><History className="mb-3 h-8 w-8" />{entryKeyword ? "没有匹配的店铺钱包流水" : "暂无店铺钱包官方流水"}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="bg-slate-800/70 text-left text-xs text-slate-400"><tr><th className="px-4 py-3">发生时间（巴西）</th><th className="px-4 py-3">店铺钱包</th><th className="px-4 py-3">官方业务类型</th><th className="px-4 py-3 text-right">收入 / 支出</th><th className="px-4 py-3 text-right">官方发生后余额</th><th className="px-4 py-3">订单 / 说明</th><th className="px-4 py-3">官方流水号</th></tr></thead><tbody className="divide-y divide-slate-800">{filteredEntries.map((entry) => <tr key={entry.id} className="hover:bg-slate-800/35"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{dateTime(entry.occurredAt)}</td><td className="px-4 py-3"><div>{entry.shopSetting.shopName || entry.shopSetting.shopId}</div><div className="mt-1 flex items-center gap-1 text-xs text-blue-300"><Store className="h-3 w-3" />{entry.wallet?.name || "店铺钱包"}</div></td><td className="px-4 py-3"><span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs text-blue-200">{OFFICIAL_WALLET_TYPE_LABELS[entry.transactionType] || entry.transactionType}</span><div className="mt-1 text-[11px] text-slate-500">{entry.status || "--"}</div></td><td className={`px-4 py-3 text-right font-semibold ${entry.amount > 0 ? "text-emerald-300" : entry.amount < 0 ? "text-rose-300" : "text-slate-400"}`}>{entry.amount > 0 ? "+" : ""}{money(entry.amount, entry.currency)}</td><td className="px-4 py-3 text-right">{entry.currentBalance == null ? "--" : money(entry.currentBalance, entry.currency)}</td><td className="max-w-sm px-4 py-3"><div className="font-mono text-xs text-slate-300">{entry.orderSn ? `订单 ${entry.orderSn}` : "--"}</div><div className="mt-1 line-clamp-2 text-xs text-slate-500">{entry.description || entry.reason || "无说明"}</div></td><td className="px-4 py-3 font-mono text-xs text-slate-500">{entry.transactionId}</td></tr>)}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
        <div>共 <span className="font-medium text-slate-200">{data.entryPagination.total}</span> 条 · 第 {data.entryPagination.page} / {data.entryPagination.totalPages} 页</div>
        <div className="flex items-center gap-2">
          <span>每页</span>
          <select value={entryPageSize} onChange={(event) => setEntryPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>
          <button disabled={entryPage <= 1 || loading} onClick={() => setEntryPage(1)} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">首页</button>
          <button disabled={entryPage <= 1 || loading} onClick={() => setEntryPage((page) => Math.max(1, page - 1))} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
          <button disabled={entryPage >= data.entryPagination.totalPages || loading} onClick={() => setEntryPage((page) => Math.min(data.entryPagination.totalPages, page + 1))} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
          <button disabled={entryPage >= data.entryPagination.totalPages || loading} onClick={() => setEntryPage(data.entryPagination.totalPages)} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">尾页</button>
        </div>
      </div>
      </div>
    </div> : tab === "advertising" ? <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-emerald-500/20 bg-slate-900 p-4"><div className="text-xs text-emerald-300">公司账户充值</div><div className="mt-2 text-lg font-semibold"><AmountList values={companyFundingTotals} empty={money(0, "BRL")} /></div><div className="mt-1 text-xs text-slate-500">{companyFundingCount} 笔 · 写入公司财务</div></div>
        <div className="rounded-xl border border-blue-500/20 bg-slate-900 p-4"><div className="text-xs text-blue-300">店铺钱包充值</div><div className="mt-2 text-lg font-semibold"><AmountList values={storeWalletFundingTotals} empty={money(0, "BRL")} /></div><div className="mt-1 text-xs text-slate-500">{storeWalletFundingCount} 笔 · 官方钱包划出</div></div>
        <div className="rounded-xl border border-violet-500/20 bg-slate-900 p-4"><div className="text-xs text-violet-300">订单比例充值 · 已结算</div><div className="mt-2 text-lg font-semibold"><AmountList values={confirmedOrderFundingTotals} empty={money(0, "BRL")} /></div><div className="mt-1 text-xs text-slate-500">{confirmedOrderFundingCount.toLocaleString()} 笔订单</div></div>
        <div className="rounded-xl border border-amber-500/20 bg-slate-900 p-4"><div className="text-xs text-amber-300">订单比例充值 · 待结算</div><div className="mt-2 text-lg font-semibold"><AmountList values={pendingOrderFundingTotals} empty={money(0, "BRL")} /></div><div className="mt-1 text-xs text-slate-500">{pendingOrderFundingCount.toLocaleString()} 笔订单</div></div>
        <div className="rounded-xl border border-rose-500/20 bg-slate-900 p-4"><div className="text-xs text-rose-300">已同步广告扣费</div><div className="mt-2 text-lg font-semibold"><AmountList values={recordedAdSpendTotals} empty={money(0, "BRL")} /></div><div className="mt-1 text-xs text-slate-500">{data.advertisingFundingSummary.spendDataConnected ? `${recordedAdSpendCount.toLocaleString()} 笔` : "扣费明细尚未接入"}</div></div>
      </div>
      <div className="flex gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.05] px-4 py-3 text-xs leading-5 text-slate-400"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><div><span className="font-medium text-violet-200">广告资金账本：</span>这里独立展示订单结算比例充值、店铺钱包人工划拨、公司账户人工充值，以及后续从 Shopee 广告端同步的充值与广告扣费明细。公司充值会关联财务流水，平台内部充值不会重复写公司账。</div></div>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {data.advertisingEntries.length === 0 ? <div className="flex h-56 flex-col items-center justify-center text-slate-500"><Megaphone className="mb-3 h-8 w-8" />{entryKeyword ? "没有匹配的广告流水" : "暂无广告钱包流水"}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead className="bg-slate-800/70 text-left text-xs text-slate-400"><tr><th className="px-4 py-3">发生时间（巴西）</th><th className="px-4 py-3">店铺 / 广告钱包</th><th className="px-4 py-3">资金来源 / 类型</th><th className="px-4 py-3 text-right">收入 / 支出</th><th className="px-4 py-3 text-right">变动后余额</th><th className="px-4 py-3">关联账户 / 业务号</th><th className="px-4 py-3">备注</th></tr></thead><tbody className="divide-y divide-slate-800">{data.advertisingEntries.map((entry) => {
          const counterparty = entry.counterpartyWalletId ? data.wallets.find((wallet) => wallet.id === entry.counterpartyWalletId) : null;
          return <tr key={entry.id} className="hover:bg-slate-800/35"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{dateTime(entry.occurredAt)}</td><td className="px-4 py-3"><div>{entry.wallet.shopSetting.shopName || entry.wallet.shopSetting.shopId}</div><div className="mt-1 flex items-center gap-1 text-xs text-violet-300"><Megaphone className="h-3 w-3" />{entry.wallet.name}</div></td><td className="px-4 py-3"><span className="rounded-md bg-violet-500/10 px-2 py-1 text-xs text-violet-200">{AD_ENTRY_SOURCE_LABELS[entry.entryType] || ENTRY_LABELS[entry.entryType] || entry.entryType}</span><div className="mt-1 text-[11px] text-slate-600">{entry.sourceType}</div></td><td className={`px-4 py-3 text-right font-semibold ${entry.amount > 0 ? "text-emerald-300" : "text-rose-300"}`}>{entry.amount > 0 ? "+" : ""}{money(entry.amount, entry.wallet.currency)}</td><td className="px-4 py-3 text-right">{money(entry.balanceAfter, entry.wallet.currency)}</td><td className="max-w-xs px-4 py-3 text-xs"><div className="text-slate-300">{entry.bankAccount ? `公司账户：${entry.bankAccount.name}` : counterparty ? `平台钱包：${counterparty.name}` : entry.cashFlow ? entry.cashFlow.summary : "Shopee 平台"}</div><div className="mt-1 break-all font-mono text-[11px] text-slate-600">{entry.sourceId}</div></td><td className="max-w-xs px-4 py-3 text-xs text-slate-400"><div>{entry.notes || "--"}</div>{entry.createdBy && <div className="mt-1 text-slate-600">记录人：{entry.createdBy}</div>}</td></tr>;
        })}</tbody></table></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-xs text-slate-400"><div>共 <span className="font-medium text-slate-200">{data.advertisingEntryPagination.total}</span> 条 · 第 {data.advertisingEntryPagination.page} / {data.advertisingEntryPagination.totalPages} 页</div><div className="flex items-center gap-2"><span>每页</span><select value={advertisingEntryPageSize} onChange={(event) => setAdvertisingEntryPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select><button disabled={advertisingEntryPage <= 1 || loading} onClick={() => setAdvertisingEntryPage(1)} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">首页</button><button disabled={advertisingEntryPage <= 1 || loading} onClick={() => setAdvertisingEntryPage((page) => Math.max(1, page - 1))} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">上一页</button><button disabled={advertisingEntryPage >= data.advertisingEntryPagination.totalPages || loading} onClick={() => setAdvertisingEntryPage((page) => Math.min(data.advertisingEntryPagination.totalPages, page + 1))} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">下一页</button><button disabled={advertisingEntryPage >= data.advertisingEntryPagination.totalPages || loading} onClick={() => setAdvertisingEntryPage(data.advertisingEntryPagination.totalPages)} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">尾页</button></div></div>
      </div>
    </div> : tab === "official" ? <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/20 bg-slate-900 p-4"><div className="text-xs text-emerald-300">官方钱包收入</div><div className="mt-2 text-xl font-semibold text-emerald-200">{money(data.officialSummary.inflow, "BRL")}</div></div>
        <div className="rounded-xl border border-rose-500/20 bg-slate-900 p-4"><div className="text-xs text-rose-300">官方钱包支出</div><div className="mt-2 text-xl font-semibold text-rose-200">{money(data.officialSummary.outflow, "BRL")}</div></div>
        <div className="rounded-xl border border-blue-500/20 bg-slate-900 p-4"><div className="text-xs text-blue-300">已匹配订单结算</div><div className="mt-2 text-xl font-semibold">{data.officialSummary.matched.toLocaleString()} 笔</div></div>
        <div className="rounded-xl border border-amber-500/20 bg-slate-900 p-4"><div className="text-xs text-amber-300">待核对流水</div><div className="mt-2 text-xl font-semibold">{data.officialSummary.review.toLocaleString()} 笔</div></div>
      </div>
      <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-3 text-xs leading-5 text-slate-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" /><div><span className="font-medium text-blue-200">官方余额规则：</span>`SPM_DEDUCT` 按广告充值处理，店铺钱包发生支出并同步增加指定广告钱包；`WITHDRAWAL_CREATED` 生成待核销提现。二者都不自动写公司财务，只有选择真实到账流水后才建立关联。</div></div>
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        {data.officialTransactions.length === 0 ? <div className="flex h-56 flex-col items-center justify-center text-slate-500"><ShieldCheck className="mb-3 h-8 w-8" />{entryKeyword ? "没有匹配的官方流水" : "暂无官方钱包流水，请先点击同步"}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-sm"><thead className="bg-slate-800/70 text-left text-xs text-slate-400"><tr><th className="px-4 py-3">发生时间（巴西）</th><th className="px-4 py-3">店铺</th><th className="px-4 py-3">收支 / 类型</th><th className="px-4 py-3 text-right">金额</th><th className="px-4 py-3 text-right">官方发生后余额</th><th className="px-4 py-3">订单 / 说明</th><th className="px-4 py-3">对账状态</th><th className="px-4 py-3">官方流水号</th></tr></thead><tbody className="divide-y divide-slate-800">{data.officialTransactions.map((item) => <tr key={item.id} className="hover:bg-slate-800/35"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{dateTime(item.occurredAt)}</td><td className="px-4 py-3"><div>{item.shopSetting.shopName || item.shopSetting.shopId}</div><div className="mt-1 text-xs text-slate-500">{item.wallet?.name || "未关联店铺钱包"}</div></td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs ${item.moneyFlow === "MONEY_IN" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>{item.moneyFlow === "MONEY_IN" ? "收入" : "支出"}</span><div className="mt-1 text-xs text-slate-500">{item.transactionType}</div></td><td className={`px-4 py-3 text-right font-semibold ${item.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{item.amount > 0 ? "+" : ""}{money(item.amount, item.currency)}</td><td className="px-4 py-3 text-right">{item.currentBalance == null ? "--" : money(item.currentBalance, item.currency)}</td><td className="max-w-sm px-4 py-3"><div className="font-mono text-xs text-slate-300">{item.orderSn ? `订单 ${item.orderSn}` : "--"}</div><div className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description || item.reason || "无说明"}</div>{item.matchedEntry?.wallet.walletType === "ADVERTISING" && <div className="mt-1 text-xs text-violet-300">已进入：{item.matchedEntry.wallet.name}</div>}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs ${item.matchStatus.startsWith("MATCHED") || item.matchStatus === "WITHDRAWAL_RECONCILED" ? "bg-blue-500/10 text-blue-300" : item.matchStatus.startsWith("IGNORED") ? "bg-slate-800 text-slate-400" : "bg-amber-500/10 text-amber-300"}`}>{OFFICIAL_MATCH_LABELS[item.matchStatus] || item.matchStatus}</span></td><td className="px-4 py-3 font-mono text-xs text-slate-500">{item.transactionId}</td></tr>)}</tbody></table></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
          <div>共 <span className="font-medium text-slate-200">{data.officialPagination.total}</span> 条 · 第 {data.officialPagination.page} / {data.officialPagination.totalPages} 页</div>
          <div className="flex items-center gap-2"><span>每页</span><select value={officialPageSize} onChange={(event) => setOfficialPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select><button disabled={officialPage <= 1 || loading} onClick={() => setOfficialPage(1)} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">首页</button><button disabled={officialPage <= 1 || loading} onClick={() => setOfficialPage((page) => Math.max(1, page - 1))} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">上一页</button><button disabled={officialPage >= data.officialPagination.totalPages || loading} onClick={() => setOfficialPage((page) => Math.min(data.officialPagination.totalPages, page + 1))} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">下一页</button><button disabled={officialPage >= data.officialPagination.totalPages || loading} onClick={() => setOfficialPage(data.officialPagination.totalPages)} className="h-8 rounded-md border border-slate-700 px-2.5 hover:bg-slate-800 disabled:opacity-40">尾页</button></div>
        </div>
      </div>
    </div> : <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 bg-blue-500/[0.04] px-4 py-3 text-xs leading-5 text-slate-400"><span className="font-medium text-blue-300">当前核销规则：</span>店铺钱包已配置默认到账账户时，Shopee 平台确认提现完成会自动生成公司收款并核销；未配置时仍保留人工选择真实到账流水。</div>
      {filteredWithdrawals.length === 0 ? <div className="flex h-56 flex-col items-center justify-center text-slate-500"><ArrowDownToLine className="mb-3 h-8 w-8" />暂无提现记录</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead className="bg-slate-800/70 text-left text-xs text-slate-400"><tr><th className="px-4 py-3">申请时间（巴西）</th><th className="px-4 py-3">店铺 / 钱包</th><th className="px-4 py-3 text-right">提现金额</th><th className="px-4 py-3">平台出款单号</th><th className="px-4 py-3">平台状态</th><th className="px-4 py-3">核销状态</th><th className="px-4 py-3">公司到账流水</th><th className="px-4 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-800">{filteredWithdrawals.map((item) => <tr key={item.id} className="hover:bg-slate-800/35"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{dateTime(item.requestedAt)}</td><td className="px-4 py-3"><div>{item.shopSetting.shopName || item.shopSetting.shopId}</div><div className="mt-1 text-xs text-slate-500">{item.wallet.name}</div></td><td className="px-4 py-3 text-right font-semibold">{money(item.amount, item.currency)}</td><td className="px-4 py-3 font-mono text-xs">{item.payoutReference || "--"}</td><td className="px-4 py-3 text-xs">{item.platformCompletedAt ? <span className="text-blue-300">平台已出款</span> : <span className="text-amber-300">平台处理中</span>}</td><td className="px-4 py-3">{item.status === "IN_TRANSIT" ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-300"><Clock3 className="h-3 w-3" />待到账核销</span> : item.status === "RECEIVED" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300"><CheckCircle2 className="h-3 w-3" />已到账核销</span> : <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-1 text-xs text-slate-400"><XCircle className="h-3 w-3" />已取消</span>}</td><td className="px-4 py-3 text-xs">{item.cashFlow ? <div><div className="text-emerald-300">{item.cashFlow.summary}</div><div className="mt-1 text-slate-500">{item.cashFlow.accountName} · {money(Math.abs(item.cashFlow.amount), item.cashFlow.currency)}</div></div> : <span className="text-slate-500">尚未关联真实到账</span>}</td><td className="px-4 py-3 text-right">{item.status === "IN_TRANSIT" && (item.officialTransactionId ? <button onClick={() => openReconcile(item)} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20">选择到账流水</button> : <button onClick={() => cancelWithdrawal(item)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-500/40 hover:text-rose-300">取消提现</button>)}</td></tr>)}</tbody></table></div>}
    </div>}

    {action && <Modal title={ACTION_TITLES[action.kind]} onClose={() => !saving && setAction(null)}><form onSubmit={submit} className="space-y-4 p-5">
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">当前店铺：<span className="font-medium text-slate-200">{action.shop.shopName || action.shop.shopId}</span>{action.wallet && <> · 当前钱包：<span className="font-medium text-slate-200">{action.wallet.name}</span></>}{action.withdrawal && <> · 提现：<span className="font-medium text-slate-200">{money(action.withdrawal.amount, action.withdrawal.currency)}</span></>}</div>
      {(action.kind === "create_store" || action.kind === "create_ad" || action.kind === "edit") && <Field label="钱包名称"><input value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} className={inputClass} maxLength={80} required /></Field>}
      {(action.kind === "create_store" || action.kind === "create_ad") && <div className="grid gap-4 sm:grid-cols-2"><Field label="币种"><select value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))} className={inputClass}><option value="BRL">BRL · 巴西雷亚尔</option><option value="USD">USD · 美元</option><option value="CNY">CNY · 人民币</option></select></Field><Field label="期初余额" hint="仅用于首次建账，不生成公司财务流水"><input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(event) => setForm((value) => ({ ...value, openingBalance: event.target.value }))} className={inputClass} /></Field></div>}
      {(action.kind === "create_store" || (action.kind === "edit" && action.wallet?.walletType === "STORE")) && <Field label="默认提现到账财务账户" hint="Shopee 平台确认提现完成后，按官方提现号自动生成一笔已确认收款并核销；仅显示同币种账户"><select value={form.defaultPayoutBankAccountId} onChange={(event) => setForm((value) => ({ ...value, defaultPayoutBankAccountId: event.target.value }))} className={inputClass}><option value="">不自动回款，保留人工核销</option>{data.bankAccounts.filter((account) => (account.currency === "RMB" ? "CNY" : account.currency) === ((action.wallet?.currency || form.currency) === "RMB" ? "CNY" : (action.wallet?.currency || form.currency))).map((account) => <option value={account.id} key={account.id}>{account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ""} · {account.currency}</option>)}</select></Field>}
      {(action.kind === "create_ad" || (action.kind === "edit" && action.wallet?.walletType === "ADVERTISING")) && <><div className="grid gap-4 sm:grid-cols-2"><Field label="Shopee 广告账户 ID" hint="可选，方便与平台充值记录匹配"><input value={form.externalAccountId} onChange={(event) => setForm((value) => ({ ...value, externalAccountId: event.target.value }))} className={inputClass} placeholder="平台广告户 ID" /></Field><Field label="自动充值比例" hint="订单结算后计划自动分配的比例"><div className="relative"><input type="number" min="0" max="100" step="0.01" value={form.autoTopupRatePercent} onChange={(event) => setForm((value) => ({ ...value, autoTopupRatePercent: event.target.value }))} className={`${inputClass} pr-9`} /><span className="absolute right-3 top-2.5 text-sm text-slate-500">%</span></div></Field></div>{action.kind === "create_ad" && <Field label="关联系统广告账户" hint="可选；只建立对应关系，不合并两边余额和流水"><select value={form.adAccountId} onChange={(event) => setForm((value) => ({ ...value, adAccountId: event.target.value }))} className={inputClass}><option value="">暂不关联</option>{data.adAccounts.filter((account) => account.currency === form.currency).map((account) => <option value={account.id} key={account.id}>{account.accountName}{account.agencyName ? ` · ${account.agencyName}` : ""}</option>)}</select></Field>}<label className="flex items-center justify-between rounded-lg border border-violet-500/20 bg-violet-500/[0.05] px-3 py-3"><div><div className="text-sm font-medium text-violet-200">接收官方广告充值</div><div className="mt-0.5 text-xs text-slate-500">`SPM_DEDUCT` 自动进入此广告钱包；同店只能指定一个</div></div><input type="checkbox" checked={form.isOfficialTopupTarget} onChange={(event) => setForm((value) => ({ ...value, isOfficialTopupTarget: event.target.checked }))} className="h-4 w-4 accent-violet-500" /></label></>}
      {action.kind === "transfer" && <><Field label="转入广告钱包"><select value={form.toWalletId} onChange={(event) => setForm((value) => ({ ...value, toWalletId: event.target.value }))} className={inputClass} required>{(walletsByShop.get(action.shop.id) || []).filter((wallet) => wallet.walletType === "ADVERTISING" && wallet.enabled && wallet.currency === action.wallet?.currency).map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name} · {money(wallet.balance, wallet.currency)}</option>)}</select></Field><Field label="划转金额"><input type="number" min="0.01" max={action.wallet?.balance} step="0.01" value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} className={inputClass} placeholder={`最多 ${action.wallet ? money(action.wallet.balance, action.wallet.currency) : ""}`} required /></Field></>}
      {action.kind === "bank_fund" && <>
        <Field label="付款公司账户" hint={`只显示与广告钱包相同币种（${action.wallet?.currency || "--"}）的公司账户`}><select value={form.bankAccountId} onChange={(event) => setForm((value) => ({ ...value, bankAccountId: event.target.value }))} className={inputClass} required><option value="">请选择付款公司账户</option>{data.bankAccounts.filter((account) => (account.currency === "RMB" ? "CNY" : account.currency) === (action.wallet?.currency === "RMB" ? "CNY" : action.wallet?.currency)).map((account) => <option value={account.id} key={account.id}>{account.name}{account.accountNumber ? ` · ${account.accountNumber}` : ""} · 余额 {money(account.currentBalance, account.currency)}</option>)}</select></Field>
        {form.bankAccountId && (() => { const selectedAccount = data.bankAccounts.find((account) => account.id === form.bankAccountId); return selectedAccount ? <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-xs text-slate-400">付款账户当前余额：<span className="ml-1 font-semibold text-emerald-300">{money(selectedAccount.currentBalance, selectedAccount.currency)}</span></div> : null; })()}
        <div className="grid gap-4 sm:grid-cols-2"><Field label="充值金额" hint="保存后公司账户产生一笔支出，广告钱包产生同额收入"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} className={inputClass} placeholder="请输入实际充值金额" required /></Field><Field label="充值发生时间（巴西）" hint="公司支出和广告钱包收入使用同一时间"><input type="datetime-local" step="60" value={form.occurredAt} onChange={(event) => setForm((value) => ({ ...value, occurredAt: event.target.value }))} className={inputClass} required /></Field></div>
        <Field label="转账凭证" hint="必填；支持上传或粘贴图片，凭证会保存在对应的公司支出流水中">
          <ImageUploader value={form.transferVoucher} onChange={(transferVoucher) => setForm((value) => ({ ...value, transferVoucher }))} multiple maxImages={5} maxSizeKB={500} required label="上传转账凭证" placeholder="点击上传，或直接 Ctrl + V 粘贴转账截图" onError={(message) => toast.error(message)} />
        </Field>
      </>}
      {(action.kind === "adjust" || action.kind === "withdraw") && <Field label={action.kind === "adjust" ? "调整金额" : "提现金额"} hint={action.kind === "adjust" ? "正数增加余额，负数减少余额；必须填写原因" : `当前可用余额 ${action.wallet ? money(action.wallet.balance, action.wallet.currency) : "--"}`}><input type="number" step="0.01" min={action.kind === "withdraw" ? "0.01" : undefined} max={action.kind === "withdraw" ? action.wallet?.balance : undefined} value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} className={inputClass} placeholder={action.kind === "adjust" ? "例如 100 或 -100" : "请输入提现金额"} required /></Field>}
      {action.kind === "withdraw" && <div className="grid gap-4 sm:grid-cols-2"><Field label="平台出款单号" hint="可稍后通过核销流程补齐"><input value={form.payoutReference} onChange={(event) => setForm((value) => ({ ...value, payoutReference: event.target.value }))} className={inputClass} placeholder="可选" /></Field><Field label="预计到账日期"><input type="date" value={form.expectedAt} onChange={(event) => setForm((value) => ({ ...value, expectedAt: event.target.value }))} className={inputClass} /></Field></div>}
      {action.kind === "reconcile" && <Field label="选择公司真实到账流水" hint="仅显示同币种、近一年且尚未核销的已确认收入流水"><select value={form.cashFlowId} onChange={(event) => setForm((value) => ({ ...value, cashFlowId: event.target.value }))} className={inputClass} required><option value="">请选择真实到账流水</option>{data.cashFlowCandidates.filter((flow) => (flow.currency === "RMB" ? "CNY" : flow.currency) === (action.withdrawal?.currency === "RMB" ? "CNY" : action.withdrawal?.currency)).map((flow) => <option key={flow.id} value={flow.id}>{new Date(flow.date).toLocaleDateString("zh-CN")} · {flow.accountName} · {money(Math.abs(flow.amount), flow.currency)} · {flow.summary}</option>)}</select></Field>}
      {action.kind === "edit" && <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3"><div><div className="text-sm font-medium text-slate-300">启用钱包</div><div className="mt-0.5 text-xs text-slate-500">停用后不可划转或提现，历史流水仍保留</div></div><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((value) => ({ ...value, enabled: event.target.checked }))} className="h-4 w-4 accent-orange-500" /></label>}
      {action.kind !== "reconcile" && <Field label={action.kind === "adjust" ? "调整原因" : "备注"}><textarea value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder={action.kind === "adjust" ? "必填：说明盘点、补录或差异原因" : "可选"} required={action.kind === "adjust"} /></Field>}
      <div className={`rounded-lg px-3 py-2 text-xs leading-5 ${action.kind === "bank_fund" ? "bg-emerald-500/[0.07] text-emerald-200/80" : "bg-orange-500/[0.06] text-orange-200/70"}`}><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />{action.kind === "bank_fund" ? "本操作会联动公司财务：生成一笔已确认支出，并把同额资金记入广告钱包；不会修改银行账户资料。" : action.kind === "reconcile" ? "本操作只关联已经存在的公司到账流水，不会新建流水或改变原流水金额。" : action.kind === "edit" && action.wallet?.walletType === "STORE" ? "默认到账账户仅用于 Shopee 官方提现完成后的自动回款；固定幂等编号可防止重复入账。" : "本操作只记录 Shopee 平台账本，不会自动生成公司财务流水。"}</div>
      <div className="flex justify-end gap-3 border-t border-slate-800 pt-4"><button type="button" onClick={() => setAction(null)} className="h-10 rounded-lg border border-slate-700 px-4 text-sm text-slate-300 hover:bg-slate-800">取消</button><button type="submit" disabled={saving} className="flex h-10 items-center gap-2 rounded-lg bg-orange-600 px-5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeDollarSign className="h-4 w-4" />}下一步确认</button></div>
    </form></Modal>}

    <ConfirmDialog open={Boolean(confirm)} title={confirm?.title} message={confirm?.message || ""} confirmText={confirm?.confirmText} type={confirm?.type} onCancel={() => { if (!saving) { setConfirm(null); setSpecialHandler(null); } }} onConfirm={() => void confirmHandler()} />
  </div>;
}
