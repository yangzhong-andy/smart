"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Wallet, Banknote, TrendingUp, Receipt, ChevronDown, ChevronRight, FileText, Clock, LayoutDashboard } from "lucide-react";
import { Pagination } from "@/components/Pagination";

type TabType = "overview" | "payments" | "statements" | "unsettled" | "invoice";

type Statement = {
  id: string; statementId: string;
  statementTime: string | null; paymentId: string | null;
  paymentStatus: string | null; paymentTime: string | null;
  netSalesAmount: string | null; feeAmount: string | null;
  adjustmentAmount: string | null; shippingCost: string | null;
  settlementAmount: string | null; revenueAmount: string | null;
  currency: string | null;
};

type Payment = {
  id: string; paymentId: string; amount: string | null; currency: string | null;
  settlementAmount: string | null; reserveAmount: string | null;
  exchangeRate: string | null; status: string | null; bankAccount: string | null;
  createTime: string | null; paidTime: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  PAID: "已到账", PENDING: "待处理", PROCESSING: "处理中", FAILED: "失败",
  SETTLED: "已结算", UNSETTLED: "未结算",
};
const STATUS_COLORS: Record<string, string> = {
  PAID: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  PENDING: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  PROCESSING: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  FAILED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  SETTLED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  UNSETTLED: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

const fmtMoney = (v: string | number | null, currency = "BRL") => {
  if (v === null || v === undefined) return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};
const fmtDate = (d: string | Date | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};
const fmtDateOnly = (d: string | Date | null) => {
  if (!d) return "-";
  const date = new Date(d);
  const y = date.toLocaleString("en-US", { year: "numeric", timeZone: "UTC" });
  const m = date.toLocaleString("en-US", { month: "2-digit", timeZone: "UTC" });
  const day = date.toLocaleString("en-US", { day: "2-digit", timeZone: "UTC" });
  return `${y}/${m}/${day}`;
};

export default function TikTokFinancePage() {
  const [tab, setTab] = useState<TabType>("overview");
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [shopFilter, setShopFilter] = useState("");
  const [shops, setShops] = useState<{shopId:string;shopName:string}[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [dateOrders, setDateOrders] = useState<any[]>([]);
  const [dateOrdersLoading, setDateOrdersLoading] = useState(false);
  const [statementView, setStatementView] = useState<"statement" | "order">("statement");
  const [paymentStatus, setPaymentStatus] = useState<string>(""); // ""=全部, PAID, FAILED, PROCESSING, RETURNED

  useEffect(() => {
    fetch("/api/tiktok/data?type=shops").then(r => r.json()).then(d => {
      const list = d.shops || [];
      setShops(list);
      if (list.length > 1 && !shopFilter) setShopFilter(list[0].shopId);
    }).catch(() => {});
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const url = shopFilter ? `/api/tiktok/data?type=summary&shopId=${shopFilter}` : "/api/tiktok/data?type=summary";
      const res = await fetch(url);
      const d = await res.json();
      setSummary(d);
    } catch {}
  }, [shopFilter]);

  const fetchData = useCallback(async () => {
    if (tab === "overview" || tab === "invoice" || tab === "unsettled") { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: tab, page: String(page), pageSize: String(pageSize) });
      if (shopFilter) params.set("shopId", shopFilter);
      if (tab === "payments" && paymentStatus) params.set("status", paymentStatus);
      const res = await fetch(`/api/tiktok/data?${params}`);
      const d = await res.json();
      setData(d.data || []);
      setTotal(d.total || 0);
    } catch { toast.error("加载失败"); }
    setLoading(false);
  }, [tab, page, pageSize, shopFilter, paymentStatus]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // 页面打开时自动从TikTok同步最新财务数据（静默执行，不弹提示）
  const autoSyncOnLoad = useCallback(async () => {
    try {
      fetch("/api/tiktok/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataType: "all", days: 1 }),
      });
      fetchSummary(); fetchData();
    } catch {}
  }, [shopFilter]);

  useEffect(() => {
    autoSyncOnLoad();
  }, [autoSyncOnLoad]);

  const handleSync = async () => {
    setSyncing(true);
    toast.info("同步财务数据中...");
    try {
      const res = fetch("/api/tiktok/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataType: "all", days: 30 }),
      });
      const d = await res.json();
      if (d.success) {
        for (const r of d.results) toast.success(`${r.shopName}: 结算${r.statements || 0} / 回款${r.payments || 0}`);
        fetchSummary(); fetchData();
      }
    } catch { toast.error("同步失败"); }
    setSyncing(false);
  };

  const handleExpandDate = async (statement: any) => {
    if (!statement.statementId) return;
    const dateKey = statement.id;
    if (expandedDate === dateKey) { setExpandedDate(null); return; }
    setExpandedDate(dateKey);
    setDateOrdersLoading(true);
    try {
      const currentShopId = shopFilter || (shops[0]?.shopId || "");
      const params = new URLSearchParams({ statementId: statement.statementId, shopId: currentShopId });
      const res = await fetch(`/api/tiktok/statement-transactions?${params}`);
      const result = await res.json();
      setDateOrders(result.success ? (result.transactions || []) : []);
    } catch { setDateOrders([]); }
    setDateOrdersLoading(false);
  };

  const finance = summary?.finance || {};

  const TABS = [
    { key: "overview" as TabType, label: "财务概览", icon: LayoutDashboard },
    { key: "payments" as TabType, label: "付款", icon: Banknote },
    { key: "statements" as TabType, label: "结算单", icon: Receipt },
    { key: "unsettled" as TabType, label: "未结算", icon: Clock },
    { key: "invoice" as TabType, label: "发票", icon: FileText },
  ];

  return (
    <div className="space-y-4 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      {/* 标题 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-400" />
            TikTok 财务回款
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {shops.length > 1 ? `${shops.length} 个店铺` : shops[0]?.shopName || "巴西店铺"} · {finance.currency || "BRL"}
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "同步中..." : "同步财务"}
        </button>
      </div>

      {/* 店铺筛选 */}
      {shops.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {shops.map(s => (
            <button key={s.shopId} onClick={() => { setShopFilter(s.shopId); setPage(1); }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                shopFilter === s.shopId ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}>
              {s.shopName}
            </button>
          ))}
          <button onClick={() => { setShopFilter(""); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              shopFilter === "" ? "bg-slate-600 text-white" : "bg-slate-800/50 text-slate-400 hover:bg-slate-700"
            }`}>全部</button>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex border-b border-slate-800 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setPage(1); setExpandedDate(null); }}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                  tab === t.key ? "border-emerald-500 text-emerald-400" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {/* ===== 财务概览 ===== */}
          {tab === "overview" && (
            <OverviewTab summary={summary} finance={finance} shops={shops} shopFilter={shopFilter} onGoPayments={() => setTab("payments")} />
          )}

          {/* ===== 付款 ===== */}
          {tab === "payments" && (
            <PaymentsTab loading={loading} data={data} paymentStatus={paymentStatus} setPaymentStatus={setPaymentStatus} setPage={setPage} />
          )}

          {/* ===== 结算单 ===== */}
          {tab === "statements" && (
            <StatementsTab
              loading={loading} data={data}
              statementView={statementView} setStatementView={setStatementView}
              expandedDate={expandedDate} setExpandedDate={setExpandedDate}
              handleExpandDate={handleExpandDate}
              dateOrders={dateOrders} dateOrdersLoading={dateOrdersLoading}
              shopFilter={shopFilter} shops={shops}
            />
          )}

          {/* ===== 未结算 ===== */}
          {tab === "unsettled" && (
            <UnsettledTab shopFilter={shopFilter} shops={shops} />
          )}

          {/* ===== 发票 ===== */}
          {tab === "invoice" && (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg font-medium mb-2">发票</p>
              <p className="text-slate-500 text-sm">该功能正在开发中，即将上线</p>
              <p className="text-slate-600 text-xs mt-2">TikTok API 发票接口即将开放</p>
            </div>
          )}

          {/* 分页 */}
          {(tab === "payments" || tab === "statements") && total > pageSize && (
            <div className="mt-4">
              <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color} mb-3`}>{icon}</div>
      <div className="text-xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function LoadingState() {
  return <div className="text-center py-12 text-slate-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />加载中...</div>;
}
function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-12 text-slate-500">{text}</div>;
}

function DataTable({ loading, data, emptyText, headers, renderRow }: {
  loading: boolean; data: any[]; emptyText: string;
  headers: string[]; renderRow: (item: any) => React.ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (data.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
            {headers.map((h, i) => <th key={i} className="pb-2 pr-4">{h}</th>)}
          </tr>
        </thead>
        <tbody>{data.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

// ===== 财务概览组件 =====
function OverviewTab({ summary, finance, shops, shopFilter, onGoPayments }: {
  summary: any; finance: any;
  shops: {shopId:string;shopName:string}[];
  shopFilter: string;
  onGoPayments: () => void;
}) {
  const [dateRange, setDateRange] = useState<"week" | "lastWeek" | "month">("week");
  const [recentPayments, setRecentPayments] = useState<any[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ type: "payments", page: "1", pageSize: "5" });
    if (shopFilter) params.set("shopId", shopFilter);
    fetch(`/api/tiktok/data?${params}`).then(r => r.json()).then(d => setRecentPayments(d.data || [])).catch(() => {});
  }, [shopFilter]);

  const netIncome = parseFloat(finance.totalNetSales || "0") - parseFloat(finance.totalFees || "0");
  const lastPayment = recentPayments[0];
  const dateLabels = { week: "本周", lastWeek: "上周", month: "上个月" };

  return (
    <div className="space-y-6">
      {/* 日期筛选 */}
      <div className="flex gap-1 rounded-lg bg-slate-800 p-1 w-fit">
        {(["week", "lastWeek", "month"] as const).map(r => (
          <button key={r} onClick={() => setDateRange(r)}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
              dateRange === r ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}>{dateLabels[r]}</button>
        ))}
      </div>

      {/* 4个统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-900/20 p-5">
          <div className="text-xs text-slate-400 mb-1">净收益</div>
          <div className="text-xs text-slate-500 mb-3">付款频次：每天</div>
          <div className="text-2xl font-bold text-emerald-300">{fmtMoney(netIncome.toFixed(2), finance.currency)}</div>
          <div className="text-xs text-slate-500 mt-2">{dateLabels[dateRange]}</div>
        </div>
        <div className="rounded-xl border border-blue-800/50 bg-blue-900/20 p-5">
          <div className="text-xs text-blue-400 mb-1">已到账</div>
          <div className="text-xs text-slate-500 mb-3">{dateLabels[dateRange]}</div>
          <div className="text-2xl font-bold text-blue-300">{fmtMoney(finance.totalPaid, finance.currency)}</div>
          <div className="text-xs text-slate-500 mt-2">已到银行账户</div>
        </div>
        <div className="rounded-xl border border-amber-800/50 bg-amber-900/20 p-5">
          <div className="text-xs text-amber-400 mb-1">正在处理</div>
          <div className="text-xs text-slate-500 mb-3">预计 1-3 个工作日</div>
          <div className="text-2xl font-bold text-amber-300">{fmtMoney(finance.totalProcessing, finance.currency)}</div>
          <div className="text-xs text-slate-500 mt-2">等待银行确认</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5">
          <div className="text-xs text-slate-400 mb-1">未结算</div>
          <div className="text-xs text-slate-500 mb-3">迄今</div>
          <div className="text-2xl font-bold text-slate-200">
            {fmtMoney((parseFloat(finance.totalSettlement || "0") - parseFloat(finance.totalPaid || "0") - parseFloat(finance.totalProcessing || "0")).toFixed(2), finance.currency)}
          </div>
          <div className="text-xs text-slate-500 mt-2">待纳入结算单</div>
        </div>
      </div>

      {/* 最近出款 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-200">最近出款</h3>
          <button onClick={onGoPayments} className="text-xs text-emerald-400 hover:text-emerald-300">
            查看全部 {recentPayments.length}
          </button>
        </div>

        {recentPayments.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">暂无出款记录</div>
        ) : (
          <>
            {lastPayment && (
              <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/10 p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">最新出款金额</div>
                    <div className="text-2xl font-bold text-emerald-300">{fmtMoney(lastPayment.amount, lastPayment.currency)}</div>
                    <div className="text-xs text-slate-500 mt-1">{fmtDate(lastPayment.createTime)}</div>
                  </div>
                  <div className="flex-1 ml-8">
                    <div className="space-y-2">
                      <TimelineItem label="已发起发款" date={lastPayment.createTime} done={true} />
                      <TimelineItem label="处理中" date={(lastPayment.status === "PROCESSING" || lastPayment.status === "PAID") ? lastPayment.createTime : null} done={lastPayment.status === "PROCESSING" || lastPayment.status === "PAID"} />
                      <TimelineItem label="银行已确认" date={lastPayment.paidTime} done={lastPayment.status === "PAID"} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-700/30 flex items-center justify-between text-xs">
                  <span className="text-slate-500">付款单 ID: <span className="font-mono text-slate-400">{lastPayment.paymentId}</span></span>
                  <span className={`inline-block rounded border px-2 py-0.5 font-medium ${STATUS_COLORS[lastPayment.status || ""] || "text-slate-400 bg-slate-500/10 border-slate-500/30"}`}>
                    {STATUS_LABELS[lastPayment.status || ""] || lastPayment.status}
                  </span>
                </div>
              </div>
            )}

            {recentPayments.length > 1 && (
              <div className="space-y-2">
                {recentPayments.slice(1).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                    <div className="flex items-center gap-3">
                      <Banknote className="h-5 w-5 text-slate-500" />
                      <div>
                        <div className="text-sm text-slate-200 font-medium">{fmtMoney(p.amount, p.currency)}</div>
                        <div className="text-xs text-slate-500 font-mono">{p.paymentId ? p.paymentId.substring(0, 20) : "-"}...</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{fmtDate(p.createTime)}</span>
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status || ""] || "text-slate-400 bg-slate-500/10 border-slate-500/30"}`}>
                        {STATUS_LABELS[p.status || ""] || p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TimelineItem({ label, date, done }: { label: string; date: string | null; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : "bg-slate-600"}`} />
      <span className={`text-xs ${done ? "text-slate-300" : "text-slate-500"}`}>{label}</span>
      {date && <span className="text-xs text-slate-500">{fmtDate(date)}</span>}
    </div>
  );
}

// ===== 未结算交易组件 =====
function UnsettledTab({ shopFilter, shops }: { shopFilter: string; shops: {shopId:string;shopName:string}[] }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const currentShopId = shopFilter || shops[0]?.shopId || "";
      if (!currentShopId) { setLoading(false); return; }
      const res = await fetch(`/api/tiktok/unsettled?shopId=${currentShopId}`);
      const d = await res.json();
      setData(d);
    } catch { toast.error("加载未结算数据失败"); }
    setLoading(false);
  }, [shopFilter, shops]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingState />;

  if (!data?.success) {
    return <EmptyState text="暂无未结算数据" />;
  }

  const s = data.summary;
  const txns = data.transactions || [];

  return (
    <div className="space-y-4">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
          <div className="text-xs text-slate-400">未结算交易</div>
          <div className="text-xl font-bold text-slate-200 mt-1">{s?.totalCount || 0} <span className="text-xs font-normal text-slate-500">笔</span></div>
        </div>
        <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
          <div className="text-xs text-emerald-400">预计收入</div>
          <div className="text-xl font-bold text-emerald-300 mt-1">{fmtMoney(s?.sumRevenue)}</div>
        </div>
        <div className="rounded-lg border border-rose-800/50 bg-rose-900/20 p-4">
          <div className="text-xs text-rose-400">预计手续费</div>
          <div className="text-xl font-bold text-rose-300 mt-1">{fmtMoney(s?.sumFee)}</div>
        </div>
        <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 p-4">
          <div className="text-xs text-amber-400">预计调整</div>
          <div className="text-xl font-bold text-amber-300 mt-1">{fmtMoney(s?.sumAdjustment)}</div>
        </div>
        <div className="rounded-lg border border-blue-800/50 bg-blue-900/20 p-4">
          <div className="text-xs text-blue-400">预计结算</div>
          <div className="text-xl font-bold text-blue-300 mt-1">{fmtMoney(s?.sumSettlement)}</div>
        </div>
      </div>

      {/* 交易明细表 */}
      {txns.length === 0 ? (
        <EmptyState text="暂无未结算交易" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                <th className="pb-2 pr-4 whitespace-nowrap">订单/调整单ID</th>
                <th className="pb-2 pr-4 whitespace-nowrap">订单创建日期</th>
                <th className="pb-2 pr-4 whitespace-nowrap">预计结算时间</th>
                <th className="pb-2 pr-4 whitespace-nowrap">未结算原因</th>
                <th className="pb-2 pr-4 text-right whitespace-nowrap">预计结算金额</th>
                <th className="pb-2 pr-4 text-right whitespace-nowrap">结算明细</th>
                <th className="pb-2 pr-4 text-right whitespace-nowrap">预计运费</th>
                <th className="pb-2 pr-4 text-right whitespace-nowrap">预计费用</th>
              </tr>
            </thead>
            <tbody>
              {txns.slice(0, 100).map((t: any, i: number) => (
                <tr key={t.orderId || i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-400 whitespace-nowrap">{t.orderId || "-"}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400 whitespace-nowrap">{fmtDateOnly(t.orderCreateTime)}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500 whitespace-nowrap">{t.estimatedSettlement}</td>
                  <td className="py-2 pr-4 text-xs text-amber-400 whitespace-nowrap">{t.unsettledReason}</td>
                  <td className="py-2 pr-4 text-right text-slate-200 font-medium whitespace-nowrap">{parseFloat(t.settlementAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 pr-4 text-right text-emerald-400 whitespace-nowrap">{parseFloat(t.revenueAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 pr-4 text-right text-slate-400 whitespace-nowrap">{parseFloat(t.shippingCostAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 pr-4 text-right text-rose-400 whitespace-nowrap">{parseFloat(t.feeTaxAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {txns.length > 50 && (
            <div className="text-center py-3 text-xs text-slate-500">显示前50笔，共 {txns.length} 笔</div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 付款组件（5个子Tab + 卡片式列表）=====
function PaymentsTab({ loading, data, paymentStatus, setPaymentStatus, setPage }: {
  loading: boolean; data: any[];
  paymentStatus: string; setPaymentStatus: (s: string) => void;
  setPage: (p: number) => void;
}) {
  const SUB_TABS = [
    { key: "", label: "全部" },
    { key: "PAID", label: "已付款" },
    { key: "FAILED", label: "失败" },
    { key: "PROCESSING", label: "处理中" },
    { key: "RETURNED", label: "已退回" },
  ];

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      {/* 子Tab */}
      <div className="flex gap-1 rounded-lg bg-slate-800 p-1 w-fit">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => { setPaymentStatus(t.key); setPage(1); }}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
              paymentStatus === t.key ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}>{t.label}</button>
        ))}
      </div>

      {/* 卡片列表 */}
      {data.length === 0 ? (
        <EmptyState text="暂无付款记录" />
      ) : (
        <div className="space-y-3">
          {data.map((p: Payment) => {
            const isPaid = p.status === "PAID";
            const isProcessing = p.status === "PROCESSING";
            return (
              <div key={p.id} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
                {/* 上半部分：金额 + 状态 */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-2xl font-bold text-emerald-300">{fmtMoney(p.amount, p.currency)}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">{p.bankAccount || (p.paymentId ? p.paymentId.substring(0, 20) : "-")}...</div>
                  </div>
                  <span className={`inline-block rounded border px-3 py-1 text-xs font-medium ${STATUS_COLORS[p.status || ""] || "text-slate-400 bg-slate-500/10 border-slate-500/30"}`}>
                    {STATUS_LABELS[p.status || ""] || p.status}
                  </span>
                </div>

                {/* 中间：订单信息（时间线）*/}
                <div className="border-t border-slate-700/30 pt-3">
                  <div className="text-xs text-slate-500 mb-2">订单信息</div>
                  <div className="space-y-2">
                    <TimelineItem label="已发起发款" date={p.createTime} done={true} />
                    <TimelineItem label="处理中" date={isProcessing || isPaid ? p.createTime : null} done={isProcessing || isPaid} />
                    <TimelineItem label="银行已确认" date={p.paidTime} done={isPaid} />
                  </div>
                </div>

                {/* 底部：付款单信息 */}
                <div className="border-t border-slate-700/30 pt-3 mt-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500">付款单 ID: </span>
                    <span className="font-mono text-slate-400">{p.paymentId}</span>
                  </div>
                  {p.exchangeRate && (
                    <span className="text-slate-500">汇率: {p.exchangeRate}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== 结算单组件（按结算单查看 + 按订单查看）=====
function StatementsTab({ loading, data, statementView, setStatementView, expandedDate, setExpandedDate, handleExpandDate, dateOrders, dateOrdersLoading, shopFilter, shops }: {
  loading: boolean; data: any[];
  statementView: "statement" | "order"; setStatementView: (v: "statement" | "order") => void;
  expandedDate: string | null; setExpandedDate: (v: string | null) => void;
  handleExpandDate: (s: any) => void;
  dateOrders: any[]; dateOrdersLoading: boolean;
  shopFilter: string; shops: {shopId:string;shopName:string}[];
}) {
  if (loading) return <LoadingState />;
  if (data.length === 0) return <EmptyState text="暂无结算数据" />;

  return (
    <div className="space-y-4">
      {/* 说明 + 子Tab */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-slate-500">每日报告将详细列出每笔已结算订单的明细，包括收入、退款、费用和调整金额。</p>
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          <button onClick={() => setStatementView("statement")}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${statementView === "statement" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            按结算单查看
          </button>
          <button onClick={() => setStatementView("order")}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${statementView === "order" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            按订单查看
          </button>
        </div>
      </div>

      {/* 按结算单查看 */}
      {statementView === "statement" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                <th className="pb-2 pr-2 w-8"></th>
                <th className="pb-2 pr-4">结算日期</th>
                <th className="pb-2 pr-4">结算单ID</th>
                <th className="pb-2 pr-4">状态</th>
                <th className="pb-2 pr-4 text-right">结算金额</th>
                <th className="pb-2 pr-4 text-right">结算明细</th>
                <th className="pb-2 pr-4 text-right">运费</th>
                <th className="pb-2 pr-4 text-right">费用</th>
                <th className="pb-2 pr-4 text-right">调整</th>
                <th className="pb-2 pr-4">付款单ID</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s: Statement) => (
                <StatementRow key={s.id} s={s} expandedDate={expandedDate} handleExpandDate={handleExpandDate} dateOrders={dateOrders} dateOrdersLoading={dateOrdersLoading} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 按订单查看 */}
      {statementView === "order" && (
        <OrderByStatement
          data={data}
          shops={shops}
          shopFilter={shopFilter}
        />
      )}
    </div>
  );
}

// 按订单查看组件：所有结算单的订单交易汇总
function OrderByStatement({ data, shops, shopFilter }: {
  data: any[];
  shops: {shopId:string;shopName:string}[];
  shopFilter: string;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(20);

  useEffect(() => {
    // 必须选择一个具体店铺
    const currentShopId = shopFilter || (shops.length === 1 ? shops[0]?.shopId : "");
    if (!currentShopId) { setLoading(false); return; }
    setLoading(true);
    setOrderPage(1);
    fetch(`/api/tiktok/all-transactions?shopId=${currentShopId}&days=30`)
      .then(r => r.json())
      .then(d => {
        setOrders(d.success ? (d.orders || []) : []);
        setLoading(false);
      })
      .catch(() => { setOrders([]); setLoading(false); });
  }, [shopFilter, shops]);

  if (loading) {
    return <div className="text-center py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />加载所有订单交易...</div>;
  }

  if (!shopFilter && shops.length > 1) {
    return <div className="text-center py-8 text-slate-500 text-sm">请先在上方选择一个店铺</div>;
  }

  if (orders.length === 0) {
    return <EmptyState text="暂无订单交易数据" />;
  }

  // 前端分页
  const totalPages = Math.ceil(orders.length / orderPageSize);
  const pagedOrders = orders.slice((orderPage - 1) * orderPageSize, orderPage * orderPageSize);

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        共 <span className="text-slate-200 font-medium">{orders.length}</span> 笔订单 ·
        收入 <span className="text-emerald-400">{orders.reduce((s, o) => s + parseFloat(o.revenueAmount || "0"), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> ·
        费用 <span className="text-rose-400">{orders.reduce((s, o) => s + parseFloat(o.feeTaxAmount || "0"), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> ·
        结算 <span className="text-slate-200 font-medium">{orders.reduce((s, o) => s + parseFloat(o.settlementAmount || "0"), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} {orders[0]?.currency || "BRL"}</span>
      </div>
      <div className="rounded-lg border border-slate-700/50 overflow-hidden">
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-800 z-10">
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="px-3 py-2 whitespace-nowrap">订单/调整单ID</th>
                <th className="px-3 py-2 whitespace-nowrap">订单创建日期</th>
                <th className="px-3 py-2 whitespace-nowrap">结算单ID</th>
                <th className="px-3 py-2 whitespace-nowrap">结算日期</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">结算金额</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">结算明细</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">运费</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">费用</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((o, i) => (
                <tr key={o.orderId || i} className="border-t border-slate-700/30 hover:bg-slate-700/20">
                  <td className="px-3 py-2 font-mono text-slate-400 whitespace-nowrap">{o.orderId || "-"}</td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmtDateOnly(o.orderCreateTime)}</td>
                  <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{o.statementId}</td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmtDateOnly(o.statementDate)}</td>
                  <td className="px-3 py-2 text-right text-slate-200 font-medium whitespace-nowrap">{parseFloat(o.settlementAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right text-emerald-400 whitespace-nowrap">{parseFloat(o.revenueAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right text-slate-400 whitespace-nowrap">{parseFloat(o.shippingCostAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right text-rose-400 whitespace-nowrap">{parseFloat(o.feeTaxAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="mt-2">
          <Pagination
            total={orders.length}
            page={orderPage}
            pageSize={orderPageSize}
            onPageChange={setOrderPage}
            onPageSizeChange={(size) => { setOrderPageSize(size); setOrderPage(1); }}
          />
        </div>
      )}
    </div>
  );
}

function StatementRow({ s, expandedDate, handleExpandDate, dateOrders, dateOrdersLoading }: {
  s: Statement; expandedDate: string | null; handleExpandDate: (s: any) => void;
  dateOrders: any[]; dateOrdersLoading: boolean;
}) {
  return (
    <>
      <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer" onClick={() => handleExpandDate(s)}>
        <td className="py-2 pr-2">
          {expandedDate === s.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </td>
        <td className="py-2 pr-4 text-xs text-slate-300">{fmtDateOnly(s.statementTime)}</td>
        <td className="py-2 pr-4 font-mono text-xs text-slate-400">{s.statementId}</td>
        <td className="py-2 pr-4">
          <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.paymentStatus || ""] || "text-slate-400 bg-slate-500/10 border-slate-500/30"}`}>
            {STATUS_LABELS[s.paymentStatus || ""] || s.paymentStatus}
          </span>
        </td>
        <td className="py-2 pr-4 text-right text-slate-100 font-medium">{fmtMoney(s.settlementAmount, s.currency)}</td>
        <td className="py-2 pr-4 text-right text-emerald-400">{fmtMoney(s.netSalesAmount, s.currency)}</td>
        <td className="py-2 pr-4 text-right text-slate-400">{fmtMoney(s.shippingCost, s.currency)}</td>
        <td className="py-2 pr-4 text-right text-rose-400">{fmtMoney(s.feeAmount, s.currency)}</td>
        <td className="py-2 pr-4 text-right text-slate-400">{fmtMoney(s.adjustmentAmount, s.currency)}</td>
        <td className="py-2 pr-4 font-mono text-xs text-slate-500">{s.paymentId || "-"}</td>
      </tr>
      {expandedDate === s.id && (
        <tr className="bg-slate-800/20">
          <td colSpan={10} className="px-8 py-4">
            {dateOrdersLoading ? (
              <div className="text-center text-slate-500 text-sm py-4"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />加载结算单交易明细...</div>
            ) : dateOrders.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-4">该结算单暂无交易明细</div>
            ) : (
              <div>
                <div className="text-xs text-slate-400 mb-2">
                  本结算单共 <span className="text-slate-200 font-medium">{dateOrders.length}</span> 笔交易 ·
                  收入 <span className="text-emerald-400">{dateOrders.reduce((sum, o) => sum + parseFloat(o.revenueAmount || "0"), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> ·
                  手续费 <span className="text-rose-400">{dateOrders.reduce((sum, o) => sum + parseFloat(o.feeTaxAmount || "0"), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> ·
                  结算 <span className="text-slate-200 font-medium">{dateOrders.reduce((sum, o) => sum + parseFloat(o.settlementAmount || "0"), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} {s.currency || "BRL"}</span>
                </div>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-700/50">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-800">
                      <tr className="text-left text-slate-400">
                        <th className="px-3 py-2">订单号</th>
                        <th className="px-3 py-2 text-right">收入</th>
                        <th className="px-3 py-2 text-right">手续费</th>
                        <th className="px-3 py-2 text-right">运费</th>
                        <th className="px-3 py-2 text-right">调整</th>
                        <th className="px-3 py-2 text-right">结算金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateOrders.map((o, i) => (
                        <tr key={o.orderId || i} className="border-t border-slate-700/30 hover:bg-slate-700/20">
                          <td className="px-3 py-2 font-mono text-slate-400">{o.orderId ? o.orderId.substring(0, 18) : "-"}</td>
                          <td className="px-3 py-2 text-right text-emerald-400">{parseFloat(o.revenueAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right text-rose-400">{parseFloat(o.feeTaxAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{parseFloat(o.shippingCostAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right text-slate-400">{parseFloat(o.adjustmentAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right text-slate-200 font-medium">{parseFloat(o.settlementAmount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
