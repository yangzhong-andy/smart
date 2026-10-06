"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Building2, CheckCircle2, Clock3, Loader2, RefreshCw, Search, Wallet } from "lucide-react";
import { toast } from "sonner";

type Account = {
  id: string;
  userId: string;
  nickname: string | null;
  currency: string;
  store: { id: string; name: string } | null;
  transactionCount: number;
};

type WalletTransaction = {
  id: string;
  sourceId: string | null;
  externalReference: string | null;
  recordType: string;
  businessType: string;
  moneyFlow: string;
  netCreditAmount: number;
  netDebitAmount: number;
  grossAmount: number | null;
  balanceAmount: number | null;
  payoutBankAccount: string | null;
  paymentMethodType: string | null;
  externalOrderId: string | null;
  orderMp: string | null;
  packId: string | null;
  occurredAt: string;
  matchStatus: string;
  syncedAt: string;
  account: Account;
  report: { fileName: string; beginAt: string | null; endAt: string | null; generatedAt: string | null } | null;
  cashFlow: { id: string; date: string; summary: string; amount: number; currency: string; accountName: string } | null;
};

type FinanceResponse = {
  data: WalletTransaction[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  accounts: Account[];
  reports: Array<{ id: string; fileName: string; status: string; beginAt: string | null; endAt: string | null; generatedAt: string | null; rowCount: number; syncedAt: string }>;
  summary: { transactionCount: number; businessEventCount: number; inflow: number; outflow: number; currentBalance: number; balanceAsOf: string | null; payoutCount: number; payoutAmount: number; payoutMatched: number; payoutPending: number };
  orderRelease: { paidOrderCount: number; paidOrderAmount: number; releasedOrderCount: number; releasedOrderGrossAmount: number; unreleasedOrderCount: number; unreleasedOrderGrossAmount: number; releasedNetAmount: number; pendingBalanceAvailable: boolean };
  policy: { platformWalletSeparated: boolean; companyCashFlowCreatedAutomatically: boolean; description: string };
};

const EMPTY_DATA: FinanceResponse = {
  data: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
  accounts: [],
  reports: [],
  summary: { transactionCount: 0, businessEventCount: 0, inflow: 0, outflow: 0, currentBalance: 0, balanceAsOf: null, payoutCount: 0, payoutAmount: 0, payoutMatched: 0, payoutPending: 0 },
  orderRelease: { paidOrderCount: 0, paidOrderAmount: 0, releasedOrderCount: 0, releasedOrderGrossAmount: 0, unreleasedOrderCount: 0, unreleasedOrderGrossAmount: 0, releasedNetAmount: 0, pendingBalanceAvailable: false },
  policy: { platformWalletSeparated: true, companyCashFlowCreatedAutomatically: false, description: "" },
};

const BUSINESS_LABELS: Record<string, string> = {
  ORDER_RELEASE: "系统订单资金",
  BANK_PAYOUT: "银行提款",
  BILL_PAYMENT: "平台账单扣款",
  OTHER_INFLOW: "其他钱包收入",
  OTHER_OUTFLOW: "其他钱包支出",
  OTHER: "其他资金活动",
};

const MATCH_LABELS: Record<string, string> = {
  MATCHED_EXISTING_CASH_FLOW: "已匹配公司流水",
  PENDING_CASH_FLOW: "待匹配公司流水",
  ORDER_LINKED: "已关联系统订单",
  WALLET_POSTED: "已记入美克多钱包",
  WALLET_POSTED_REVIEW: "已扣钱包·费用待核对",
  NOT_APPLICABLE: "无需核销",
};

function money(value: number, currency = "BRL") {
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

function StatCard({ icon, label, value, note, tone = "slate" }: { icon: React.ReactNode; label: string; value: string; note: string; tone?: "slate" | "emerald" | "rose" | "amber" }) {
  const tones = {
    slate: "border-slate-800 bg-slate-900/70 text-slate-300",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    rose: "border-rose-500/20 bg-rose-500/5 text-rose-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-300",
  };
  return <div className={`rounded-xl border p-4 ${tones[tone]}`}>
    <div className="flex items-center justify-between text-sm"><span>{label}</span>{icon}</div>
    <div className="mt-3 text-2xl font-semibold text-slate-100">{value}</div>
    <div className="mt-1 text-xs text-slate-500">{note}</div>
  </div>;
}

export default function MercadoLivreFinancePage() {
  const [data, setData] = useState<FinanceResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<"wallet" | "payouts">("wallet");
  const [accountId, setAccountId] = useState("");
  const [moneyFlow, setMoneyFlow] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [matchStatus, setMatchStatus] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(keywordInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  useEffect(() => setPage(1), [accountId, moneyFlow, businessType, matchStatus, keyword, pageSize, tab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (accountId) params.set("accountId", accountId);
      if (moneyFlow) params.set("moneyFlow", moneyFlow);
      if (tab === "payouts") params.set("businessType", "BANK_PAYOUT");
      else if (businessType) params.set("businessType", businessType);
      if (matchStatus) params.set("matchStatus", matchStatus);
      if (keyword) params.set("keyword", keyword);
      const response = await fetch(`/api/mercado-livre/finance?${params.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "美克多财务数据加载失败");
      setData(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "美克多财务数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [accountId, businessType, keyword, matchStatus, moneyFlow, page, pageSize, tab]);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/mercado-livre/finance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: accountId || undefined, generate: true, days: 60, waitMs: 50_000 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.errors?.[0]?.error || "官方财务同步失败");
      const saved = (result.results || []).reduce((sum: number, item: any) => sum + (item.reports || []).reduce((inner: number, report: any) => inner + Number(report.saved || 0), 0), 0);
      toast.success(saved ? `已同步 ${saved} 条官方钱包流水` : "官方报告已刷新，暂无新增流水");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "官方财务同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const currency = useMemo(() => data.accounts.find((account) => account.id === accountId)?.currency || data.accounts[0]?.currency || "BRL", [accountId, data.accounts]);
  const latestReport = data.reports[0];

  return <div className="min-h-screen space-y-6 bg-slate-950 p-6 text-slate-100">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Mercado Livre 结算财务</h1>
        <p className="mt-1 text-sm text-slate-400">官方 Mercado Pago 钱包账本、资金释放与银行提款核销。</p>
      </div>
      <button onClick={() => void sync()} disabled={syncing} className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50">
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {syncing ? "等待官方报告..." : "同步官方财务"}
      </button>
    </header>

    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-100">
      <div className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" /><div><div>{data.policy.description}</div><div className="mt-1 text-xs text-blue-300/70">最新报告：{latestReport ? `${dateTime(latestReport.generatedAt)} · ${latestReport.rowCount} 条` : "尚未同步"}</div></div></div>
    </div>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <StatCard icon={<ArrowDownToLine className="h-5 w-5" />} label="实际钱包流入" value={money(data.summary.inflow, currency)} note={`按资金编号合并 · ${data.summary.businessEventCount} 笔业务`} tone="emerald" />
      <StatCard icon={<ArrowUpFromLine className="h-5 w-5" />} label="实际钱包流出" value={money(data.summary.outflow, currency)} note="已抵消提款过程中的技术冲正" tone="rose" />
      <StatCard icon={<Wallet className="h-5 w-5" />} label="当前可用余额" value={money(data.summary.currentBalance, currency)} note={`官方最新流水 · ${dateTime(data.summary.balanceAsOf)}`} tone="emerald" />
      <StatCard icon={<Building2 className="h-5 w-5" />} label="银行提款" value={money(data.summary.payoutAmount, currency)} note={`${data.summary.payoutCount} 笔真实银行转出`} tone="amber" />
      <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="提款核销" value={`${data.summary.payoutMatched}/${data.summary.payoutCount}`} note={`已匹配 ${data.summary.payoutMatched} 笔，待匹配 ${data.summary.payoutPending} 笔`} />
    </section>

    <section className="space-y-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <div>
        <h2 className="font-medium text-sky-100">美克多订单资金</h2>
        <p className="mt-1 text-xs text-sky-200/60">只统计美克多订单，不包含 TikTok、Shopee 等转入 Mercado Pago 钱包的资金。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={<Wallet className="h-5 w-5" />} label="订单成交总额" value={money(data.orderRelease.paidOrderAmount, currency)} note={`${data.orderRelease.paidOrderCount} 单已付款订单`} tone="slate" />
        <StatCard icon={<ArrowDownToLine className="h-5 w-5" />} label="已释放净额" value={money(data.orderRelease.releasedNetAmount, currency)} note="官方释放流水按资金编号合并" tone="emerald" />
        <StatCard icon={<Clock3 className="h-5 w-5" />} label="未释放订单成交额" value={money(data.orderRelease.unreleasedOrderGrossAmount, currency)} note="订单成交额估算，不等同平台待释放余额" tone="amber" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="已释放订单" value={`${data.orderRelease.releasedOrderCount} 单`} note={`对应成交额 ${money(data.orderRelease.releasedOrderGrossAmount, currency)}`} tone="emerald" />
        <StatCard icon={<Clock3 className="h-5 w-5" />} label="未释放订单" value={`${data.orderRelease.unreleasedOrderCount} 单`} note="尚未在官方释放报告找到资金记录" tone="amber" />
      </div>
    </section>

    <section className="rounded-xl border border-slate-800 bg-slate-900/70">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-4">
        <button onClick={() => setTab("wallet")} className={`rounded-lg px-3 py-2 text-sm ${tab === "wallet" ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:bg-slate-800"}`}>钱包流水</button>
        <button onClick={() => setTab("payouts")} className={`rounded-lg px-3 py-2 text-sm ${tab === "payouts" ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:bg-slate-800"}`}>银行提款</button>
        <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 md:max-w-sm"><Search className="h-4 w-4 text-slate-500" /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="搜索订单号、资金编号、银行卡尾号" className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-600" /></div>
      </div>

      <div className="grid gap-2 border-b border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">全部美克多账号</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.store?.name || account.nickname || account.userId}</option>)}</select>
        <select value={moneyFlow} onChange={(event) => setMoneyFlow(event.target.value)} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">收入/支出全部</option><option value="MONEY_IN">收入</option><option value="MONEY_OUT">支出</option></select>
        {tab === "wallet" && <select value={businessType} onChange={(event) => setBusinessType(event.target.value)} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">全部业务类型</option>{Object.entries(BUSINESS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        {tab === "payouts" && <select value={matchStatus} onChange={(event) => setMatchStatus(event.target.value)} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"><option value="">全部核销状态</option><option value="MATCHED_EXISTING_CASH_FLOW">已匹配公司流水</option><option value="PENDING_CASH_FLOW">待匹配公司流水</option></select>}
        <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"><option value={20}>20 条/页</option><option value={50}>50 条/页</option><option value={100}>100 条/页</option></select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-950/80 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">发生时间</th><th className="px-4 py-3">店铺 / 业务</th><th className="px-4 py-3">资金编号 / 订单</th><th className="px-4 py-3 text-right">收入</th><th className="px-4 py-3 text-right">支出</th><th className="px-4 py-3">银行账户</th><th className="px-4 py-3">核销状态</th></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" /></td></tr> : data.data.length === 0 ? <tr><td colSpan={7} className="py-16 text-center text-slate-500">暂无官方钱包流水，请点击“同步官方财务”</td></tr> : data.data.map((row) => <tr key={row.id} className="hover:bg-slate-800/35">
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">{dateTime(row.occurredAt)}</td>
              <td className="px-4 py-3"><div className="font-medium text-slate-200">{row.account.store?.name || row.account.nickname || row.account.userId}</div><div className="mt-1 text-xs text-slate-500">{BUSINESS_LABELS[row.businessType] || row.businessType}</div></td>
              <td className="px-4 py-3"><div className="font-mono text-xs text-slate-300">{row.sourceId || "--"}</div><div className="mt-1 text-xs text-slate-500">{row.externalOrderId || row.orderMp || row.packId || row.externalReference || "--"}</div></td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-300">{row.netCreditAmount > 0 ? money(row.netCreditAmount, row.account.currency) : "--"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-rose-300">{row.netDebitAmount > 0 ? money(row.netDebitAmount, row.account.currency) : "--"}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.payoutBankAccount || "--"}</td>
              <td className="px-4 py-3"><div className={`inline-flex rounded-full px-2 py-1 text-xs ${row.matchStatus === "MATCHED_EXISTING_CASH_FLOW" ? "bg-emerald-500/10 text-emerald-300" : row.matchStatus === "PENDING_CASH_FLOW" ? "bg-amber-500/10 text-amber-300" : "bg-slate-800 text-slate-400"}`}>{MATCH_LABELS[row.matchStatus] || row.matchStatus}</div>{row.cashFlow && <div className="mt-1 max-w-[240px] truncate text-xs text-slate-500" title={row.cashFlow.summary}>{row.cashFlow.accountName} · {row.cashFlow.summary}</div>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-sm text-slate-400">
        <span>共 {data.pagination.total} 条官方原始明细 · 第 {data.pagination.page}/{data.pagination.totalPages} 页</span>
        <div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md border border-slate-700 px-3 py-1.5 disabled:opacity-40">上一页</button><button disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-slate-700 px-3 py-1.5 disabled:opacity-40">下一页</button></div>
      </div>
    </section>

    {data.summary.payoutPending > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><div>还有 {data.summary.payoutPending} 笔银行提款未找到公司财务流水。系统目前只标记待核对，不会自动补录，避免与旧的人工流水重复。</div></div>}
  </div>;
}
