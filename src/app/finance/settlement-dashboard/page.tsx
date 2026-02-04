"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, ShoppingBag, DollarSign, Store, Package } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type StoreItem = { id: string; name: string };
type DashboardData = {
  summary: { totalRecords: number; totalSettlementAmount: number; totalNetSales: number };
  byStatementDate: { date: string; count: number; settlement: number; netSales: number }[];
  byStore: { storeId: string; count: number; settlement: number; netSales: number }[];
  topProducts: {
    productName: string;
    skuName: string | null;
    quantity: number;
    settlement: number;
    netSales: number;
  }[];
};

function formatMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** 根据 YYYY-MM 返回该月最后一天 YYYY-MM-DD */
function lastDayOfMonth(ym: string): string {
  if (!ym || ym.length < 7) return "";
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

const CURRENT_YEAR = new Date().getFullYear();
/** 年月选项：最近 3 年 × 12 月，倒序（新在前），用于单个下拉框 */
const MONTH_OPTIONS = (() => {
  const list: { value: string; label: string }[] = [{ value: "", label: "全部" }];
  for (let y = CURRENT_YEAR; y >= CURRENT_YEAR - 2; y--) {
    for (let m = 12; m >= 1; m--) {
      list.push({
        value: `${y}-${String(m).padStart(2, "0")}`,
        label: `${y}年${m}月`,
      });
    }
  }
  return list;
})();

export default function SettlementDashboardPage() {
  const [storeId, setStoreId] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleMonthChange = (ym: string) => {
    setMonthFilter(ym);
    if (ym) {
      setStartDate(`${ym}-01`);
      setEndDate(lastDayOfMonth(ym));
    } else {
      setStartDate("");
      setEndDate("");
    }
  };

  const params = new URLSearchParams();
  if (storeId) params.set("storeId", storeId);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const apiUrl = `/api/store-order-settlement/dashboard?${params.toString()}`;

  const { data, error, isLoading } = useSWR<DashboardData>(apiUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: storesData } = useSWR<StoreItem[] | unknown>("/api/stores", fetcher);
  const stores = Array.isArray(storesData) ? storesData : [];

  const storeNameMap = useMemo(() => {
    const m: Record<string, string> = { _unknown_: "未关联店铺" };
    stores.forEach((s) => (m[s.id] = s.name));
    return m;
  }, [stores]);

  const chartData = useMemo(() => {
    if (!data?.byStatementDate?.length) return [];
    return data.byStatementDate.map((d) => ({
      date: d.date,
      订单数: d.count,
      结算金额: Math.round(d.settlement * 100) / 100,
      净销售: Math.round(d.netSales * 100) / 100,
    }));
  }, [data?.byStatementDate]);

  const byStoreWithName = useMemo(() => {
    if (!data?.byStore?.length) return [];
    return data.byStore.map((s) => ({
      ...s,
      storeName: storeNameMap[s.storeId] ?? (s.storeId || "未关联店铺"),
    }));
  }, [data?.byStore, storeNameMap]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <nav className="text-xs text-slate-400 mb-1">
            <Link href="/settings/stores" className="hover:text-slate-300">
              营销与店铺
            </Link>
            <span className="mx-1">/</span>
            <span className="text-slate-300">店铺订单看板</span>
          </nav>
          <h1 className="text-2xl font-semibold text-slate-100">店铺订单看板</h1>
          <p className="mt-1 text-sm text-slate-400">
            基于导入的店铺订单结算数据：按日期、店铺与商品维度汇总
          </p>
        </div>
      </header>

      {/* 筛选 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">店铺</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-emerald-500"
            >
              <option value="">全部店铺</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setMonthFilter("");
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setMonthFilter("");
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">月份</label>
            <select
              value={monthFilter}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-emerald-500"
            >
              {MONTH_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-900/20 p-4 text-rose-300 text-sm">
          加载失败：{error.message || "请稍后重试"}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <div className="animate-pulse flex flex-col items-center gap-2">
            <TrendingUp className="h-10 w-10 opacity-50" />
            <span className="text-sm">加载看板数据...</span>
          </div>
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          {/* 汇总卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">订单笔数</p>
                  <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {(data.summary?.totalRecords ?? 0).toLocaleString("zh-CN")}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-2">仅统计类型为 Order 的记录</p>
                </div>
                <ShoppingBag className="h-8 w-8 text-emerald-300 opacity-50" />
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">总结算金额</p>
                  <p className="text-2xl font-bold text-blue-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatMoney(data.summary?.totalSettlementAmount ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-2">Total Settlement Amount</p>
                </div>
                <DollarSign className="h-8 w-8 text-blue-300 opacity-50" />
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">总净销售</p>
                  <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatMoney(data.summary?.totalNetSales ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-2">Net Sales</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-300 opacity-50" />
              </div>
            </div>
          </div>

          {/* 按结算日期趋势 */}
          {chartData.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-medium text-slate-100 mb-4">按结算日期</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                      labelStyle={{ color: "#e2e8f0" }}
                      formatter={(value, name) => [
                        name === "结算金额" || name === "净销售" ? formatMoney(Number(value ?? 0)) : (value ?? 0),
                        name,
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="订单数" fill="#10b981" radius={[4, 4, 0, 0]} name="订单数" />
                    <Bar dataKey="结算金额" fill="#3b82f6" radius={[4, 4, 0, 0]} name="结算金额(USD)" />
                    <Bar dataKey="净销售" fill="#a855f7" radius={[4, 4, 0, 0]} name="净销售(USD)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* 按店铺 */}
          {byStoreWithName.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-medium text-slate-100 mb-4 flex items-center gap-2">
                <Store className="h-4 w-4" /> 按店铺
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">店铺</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">订单数</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">结算金额</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">净销售</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {byStoreWithName.map((s) => (
                      <tr key={s.storeId} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2 text-slate-200">{s.storeName}</td>
                        <td className="px-4 py-2 text-right text-slate-300">{s.count.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-2 text-right text-emerald-300">{formatMoney(s.settlement)}</td>
                        <td className="px-4 py-2 text-right text-blue-300">{formatMoney(s.netSales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 商品 TOP */}
          {(data.topProducts?.length ?? 0) > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-medium text-slate-100 mb-4 flex items-center gap-2">
                <Package className="h-4 w-4" /> 商品结算 TOP20
              </h2>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">商品 / 规格</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">销量</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">结算金额</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">净销售</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(data.topProducts ?? []).map((p, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2">
                          <div className="text-slate-200 max-w-xs truncate" title={p.productName}>
                            {p.productName}
                          </div>
                          {p.skuName && <div className="text-xs text-slate-500">{p.skuName}</div>}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-300">{p.quantity.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-2 text-right text-emerald-300">{formatMoney(p.settlement)}</td>
                        <td className="px-4 py-2 text-right text-blue-300">{formatMoney(p.netSales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(data.summary?.totalRecords ?? 0) === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center text-slate-500">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">当前筛选下暂无订单数据</p>
              <p className="text-xs mt-2">
                请先在 <Link href="/finance/import" className="text-emerald-400 hover:underline">数据导入</Link> 上传店铺结算表
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
