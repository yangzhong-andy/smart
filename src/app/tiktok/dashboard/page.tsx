"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShoppingBag, DollarSign, Banknote, Package, TrendingUp } from "lucide-react";
import { Pagination } from "@/components/Pagination";

type Summary = {
  counts: { orders: number; statements: number; payments: number; products: number };
  finance: {
    totalNetSales: string;
    totalFees: string;
    totalSettlement: string;
    totalPaid: string;
    totalProcessing: string;
    currency: string;
  };
  orderStatuses: { status: string; count: number }[];
};

type TabType = "orders" | "statements" | "payments" | "products";

const STATUS_LABELS: Record<string, string> = {
  UNPAID: "未付款",
  ON_HOLD: "暂停",
  IN_TRANSIT: "运输中",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  PAID: "已付款",
  PROCESSING: "处理中",
  FAILED: "失败",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "text-emerald-400 bg-emerald-500/10",
  PAID: "text-emerald-400 bg-emerald-500/10",
  CANCELLED: "text-rose-400 bg-rose-500/10",
  FAILED: "text-rose-400 bg-rose-500/10",
  PROCESSING: "text-amber-400 bg-amber-500/10",
  UNPAID: "text-amber-400 bg-amber-500/10",
  ON_HOLD: "text-amber-400 bg-amber-500/10",
  IN_TRANSIT: "text-blue-400 bg-blue-500/10",
  DELIVERED: "text-blue-400 bg-blue-500/10",
};

export default function TikTokDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState<TabType>("orders");
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/tiktok/data?type=summary");
      const d = await res.json();
      setSummary(d);
    } catch {
      toast.error("加载汇总失败");
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tiktok/data?type=${tab}&page=${page}&pageSize=${pageSize}`);
      const d = await res.json();
      setData(d.data || []);
      setTotal(d.total || 0);
    } catch {
      toast.error("加载数据失败");
    }
    setLoading(false);
  }, [tab, page, pageSize]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    toast.info("开始同步最近 7 天数据...");
    try {
      const res = await fetch("/api/tiktok/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataType: "all", days: 7 }),
      });
      const d = await res.json();
      if (d.success) {
        for (const r of d.results) {
          const parts: string[] = [];
          if (r.orders !== undefined) parts.push(`订单${r.orders}`);
          if (r.statements !== undefined) parts.push(`结算${r.statements}`);
          if (r.payments !== undefined) parts.push(`回款${r.payments}`);
          if (r.products !== undefined) parts.push(`产品${r.products}`);
          toast.success(`${r.shopName}: ${parts.join(" / ") || "无新数据"}`);
        }
        fetchSummary();
        fetchData();
      } else {
        toast.error(d.error || "同步失败");
      }
    } catch (e: any) {
      toast.error("同步失败: " + e.message);
    }
    setSyncing(false);
  };

  const fmtMoney = (v: string | number, currency = "BRL") => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(n)) return "-";
    return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  };

  const fmtDate = (d: string | Date | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || "text-slate-400 bg-slate-500/10"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      {/* 标题 + 同步按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">TikTok 数据看板</h1>
          <p className="text-sm text-slate-400 mt-1">查看已同步的 TikTok 店铺数据</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "同步中..." : "同步最新数据"}
        </button>
      </div>

      {/* 统计卡片 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<ShoppingBag className="h-5 w-5" />}
            label="订单总数"
            value={summary.counts.orders.toString()}
            color="text-blue-400 bg-blue-500/10"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="净销售额"
            value={fmtMoney(summary.finance.totalNetSales, summary.finance.currency)}
            color="text-emerald-400 bg-emerald-500/10"
          />
          <StatCard
            icon={<Banknote className="h-5 w-5" />}
            label="已回款"
            value={fmtMoney(summary.finance.totalPaid, summary.finance.currency)}
            color="text-amber-400 bg-amber-500/10"
          />
          <StatCard
            icon={<Package className="h-5 w-5" />}
            label="产品数"
            value={summary.counts.products.toString()}
            color="text-purple-400 bg-purple-500/10"
          />
        </div>
      )}

      {/* 财务汇总 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FinanceCard label="净销售额" value={fmtMoney(summary.finance.totalNetSales, summary.finance.currency)} />
          <FinanceCard label="平台手续费" value={`-${fmtMoney(summary.finance.totalFees, summary.finance.currency)}`} />
          <FinanceCard label="结算金额" value={fmtMoney(summary.finance.totalSettlement, summary.finance.currency)} />
          <FinanceCard label="待处理回款" value={fmtMoney(summary.finance.totalProcessing, summary.finance.currency)} />
        </div>
      )}

      {/* 标签页 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex border-b border-slate-800">
          {([
            { key: "orders", label: `订单 (${summary?.counts.orders || 0})` },
            { key: "statements", label: `结算 (${summary?.counts.statements || 0})` },
            { key: "payments", label: `回款 (${summary?.counts.payments || 0})` },
            { key: "products", label: `产品 (${summary?.counts.products || 0})` },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-primary-500 text-primary-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 数据表格 */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              加载中...
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>暂无数据</p>
              <p className="text-xs mt-1">点击右上角「同步最新数据」按钮获取</p>
            </div>
          ) : (
            <>
              {/* 订单表格 */}
              {tab === "orders" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                        <th className="pb-2 pr-4">订单ID</th>
                        <th className="pb-2 pr-4">状态</th>
                        <th className="pb-2 pr-4 text-right">金额</th>
                        <th className="pb-2 pr-4">下单时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((o) => (
                        <tr key={o.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 pr-4 font-mono text-xs text-slate-300">{o.orderId}</td>
                          <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                          <td className="py-2 pr-4 text-right text-slate-200">{fmtMoney(o.totalAmount, o.currency || "")}</td>
                          <td className="py-2 pr-4 text-xs text-slate-400">{fmtDate(o.createTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 结算表格 */}
              {tab === "statements" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                        <th className="pb-2 pr-4">结算日期</th>
                        <th className="pb-2 pr-4 text-right">净销售</th>
                        <th className="pb-2 pr-4 text-right">手续费</th>
                        <th className="pb-2 pr-4 text-right">结算金额</th>
                        <th className="pb-2 pr-4">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((s) => (
                        <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 pr-4 text-xs text-slate-300">{fmtDate(s.statementTime)}</td>
                          <td className="py-2 pr-4 text-right text-emerald-400">{fmtMoney(s.netSalesAmount, s.currency)}</td>
                          <td className="py-2 pr-4 text-right text-rose-400">{fmtMoney(s.feeAmount, s.currency)}</td>
                          <td className="py-2 pr-4 text-right text-slate-200 font-medium">{fmtMoney(s.settlementAmount, s.currency)}</td>
                          <td className="py-2 pr-4"><StatusBadge status={s.paymentStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 回款表格 */}
              {tab === "payments" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                        <th className="pb-2 pr-4">回款ID</th>
                        <th className="pb-2 pr-4 text-right">金额</th>
                        <th className="pb-2 pr-4">状态</th>
                        <th className="pb-2 pr-4">创建时间</th>
                        <th className="pb-2 pr-4">到账时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((p) => (
                        <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 pr-4 font-mono text-xs text-slate-300">{p.paymentId.substring(0, 20)}...</td>
                          <td className="py-2 pr-4 text-right text-emerald-400 font-medium">{fmtMoney(p.amount, p.currency)}</td>
                          <td className="py-2 pr-4"><StatusBadge status={p.status} /></td>
                          <td className="py-2 pr-4 text-xs text-slate-400">{fmtDate(p.createTime)}</td>
                          <td className="py-2 pr-4 text-xs text-slate-400">{fmtDate(p.paidTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 产品表格 */}
              {tab === "products" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                        <th className="pb-2 pr-4">图片</th>
                        <th className="pb-2 pr-4">产品标题</th>
                        <th className="pb-2 pr-4">状态</th>
                        <th className="pb-2 pr-4">创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((p) => (
                        <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2 pr-4">
                            {p.mainImage ? (
                              <img src={p.mainImage} alt="" className="h-10 w-10 rounded object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-slate-700/50" />
                            )}
                          </td>
                          <td className="py-2 pr-4 text-slate-200 max-w-xs truncate">{p.title}</td>
                          <td className="py-2 pr-4"><StatusBadge status={p.status} /></td>
                          <td className="py-2 pr-4 text-xs text-slate-400">{fmtDate(p.createTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 分页 */}
              {total > pageSize && (
                <div className="mt-4">
                  <Pagination
                    total={total}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={() => {}}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color} mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function FinanceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}
