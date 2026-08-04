"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import type { Store } from "@/lib/store-store";
import type { BankAccount } from "@/lib/finance-store";
import type { CashFlow } from "@/lib/cash-flow-store";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const arrayFetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.data ?? []);
};

const SWR_OPT = { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 600000, keepPreviousData: true };

export default function StoreReportPage() {
  const { data: stores = [] } = useSWR<Store[]>("/api/stores", arrayFetcher, SWR_OPT);
  const { data: accounts = [] } = useSWR<BankAccount[]>("/api/accounts?page=1&pageSize=500", arrayFetcher, SWR_OPT);
  const { data: cashFlow = [] } = useSWR<CashFlow[]>("/api/cash-flow?page=1&pageSize=5000", arrayFetcher, SWR_OPT);

  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [quickFilter, setQuickFilter] = useState<string>("");

  // 根据时间筛选条件过滤流水记录
  const filteredCashFlow = useMemo(() => {
    let filtered = Array.isArray(cashFlow) ? [...cashFlow] : [];
    
    // 快速筛选（优先级最高）
    if (quickFilter) {
      const today = new Date();
      let fromDate = "";
      let toDate = "";
      
      switch (quickFilter) {
        case "today":
          fromDate = toDate = today.toISOString().slice(0, 10);
          break;
        case "yesterday": {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          fromDate = toDate = yesterday.toISOString().slice(0, 10);
          break;
        }
        case "thisWeek": {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          fromDate = weekStart.toISOString().slice(0, 10);
          toDate = today.toISOString().slice(0, 10);
          break;
        }
        case "lastWeek": {
          const lastWeekEnd = new Date(today);
          lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
          const lastWeekStart = new Date(lastWeekEnd);
          lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
          fromDate = lastWeekStart.toISOString().slice(0, 10);
          toDate = lastWeekEnd.toISOString().slice(0, 10);
          break;
        }
        case "thisMonth": {
          fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
          toDate = today.toISOString().slice(0, 10);
          break;
        }
        case "lastMonth": {
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
          fromDate = lastMonth.toISOString().slice(0, 10);
          toDate = lastMonthEnd.toISOString().slice(0, 10);
          break;
        }
        case "thisQuarter": {
          const quarter = Math.floor(today.getMonth() / 3);
          fromDate = `${today.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
          toDate = today.toISOString().slice(0, 10);
          break;
        }
        case "thisYear":
          fromDate = `${today.getFullYear()}-01-01`;
          toDate = today.toISOString().slice(0, 10);
          break;
        case "lastYear": {
          const lastYear = today.getFullYear() - 1;
          fromDate = `${lastYear}-01-01`;
          toDate = `${lastYear}-12-31`;
          break;
        }
      }
      
      // API 返回的 date 为 ISO 字符串（含时间），比较时取日期部分 YYYY-MM-DD
      const toDateOnly = (d: string) => d.slice(0, 10);
      if (fromDate) filtered = filtered.filter((f) => toDateOnly(f.date) >= fromDate);
      if (toDate) filtered = filtered.filter((f) => toDateOnly(f.date) <= toDate);
    } else {
      // 按年筛选
      if (filterYear) {
        filtered = filtered.filter((f) => {
          const year = new Date(f.date).getFullYear();
          return year === parseInt(filterYear);
        });
      }
      
      // 按月筛选
      if (filterMonth) {
        filtered = filtered.filter((f) => {
          const date = new Date(f.date);
          const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          return monthStr === filterMonth;
        });
      }
      
      // 日期范围筛选（API 返回的 date 可能含时间，取日期部分比较）
      const toDateOnly = (d: string) => d.slice(0, 10);
      if (filterDateFrom) {
        filtered = filtered.filter((f) => toDateOnly(f.date) >= filterDateFrom);
      }
      if (filterDateTo) {
        filtered = filtered.filter((f) => toDateOnly(f.date) <= filterDateTo);
      }
    }
    
    return filtered;
  }, [cashFlow, filterDateFrom, filterDateTo, filterYear, filterMonth, quickFilter]);

  // 计算每个店铺的统计数据
  const storeStats = useMemo(() => {
    if (stores.length === 0 || cashFlow.length === 0) {
      return []; // 如果没有店铺或流水数据，返回空数组
    }
    
    return stores.map((store) => {
      // 筛选该店铺的收入记录（通过账户ID匹配）
      // 注意：店铺回款统计的数据来源是 cashFlow，通过 flow.accountId === store.accountId 匹配
      const storeIncomes = filteredCashFlow.filter(
        (flow) =>
          (flow.type === "income" || flow.type === "INCOME") &&
          flow.accountId &&
          flow.accountId === store.accountId &&
          !(flow.isReversal) &&
          (flow.status === "confirmed" || !flow.status)
      );

      // 累计回款额（原币）
      const totalIncome = storeIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);

      // 累计回款额（折算RMB）
      const accountsList = Array.isArray(accounts) ? accounts : [];
      const account = accountsList.find((a) => a.id === store.accountId);
      const exchangeRate = account?.exchangeRate || 1;
      const totalIncomeRMB = store.currency === "RMB" ? totalIncome : totalIncome * exchangeRate;

      // 筛选期间回款：如果用户选择了筛选条件则用筛选结果，否则默认显示本月
      const filteredIncomes = quickFilter || filterYear || filterMonth || filterDateFrom || filterDateTo
        ? storeIncomes  // 有筛选条件：用筛选后的数据
        : storeIncomes.filter((flow) => {
            // 无筛选条件：默认显示本月
            if (!flow.date) return false;
            const d = new Date(flow.date);
            if (isNaN(d.getTime())) return false;
            return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
          });
      const filteredIncome = filteredIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);
      const filteredIncomeRMB = store.currency === "RMB" ? filteredIncome : filteredIncome * exchangeRate;

      // 本月回款（基于全量数据，不受筛选影响）
      const now = new Date();
      const thisMonthIncomes = (Array.isArray(cashFlow) ? cashFlow : []).filter((flow) => {
        if (!flow.date) return false;
        if ((flow.type !== "income" && flow.type !== "INCOME")) return false;
        if (!flow.accountId || flow.accountId !== store.accountId) return false;
        if (flow.isReversal) return false;
        if (flow.status === "pending") return false;
        const d = new Date(flow.date);
        if (isNaN(d.getTime())) return false;
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      const thisMonthIncome = thisMonthIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);
      const thisMonthIncomeRMB = store.currency === "RMB" ? thisMonthIncome : thisMonthIncome * exchangeRate;

      // 待结算金额（如果有未确认的记录）
      const pendingIncomes = filteredCashFlow.filter(
        (flow) =>
          (flow.type === "income" || flow.type === "INCOME") &&
          flow.accountId === store.accountId &&
          !flow.isReversal &&
          flow.status === "pending"
      );
      const pendingAmount = pendingIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);
      const pendingAmountRMB = store.currency === "RMB" ? pendingAmount : pendingAmount * exchangeRate;

      // 回款趋势（最近6个月）
      const trend = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.getMonth();
        const year = date.getFullYear();
        const monthIncomes = storeIncomes.filter((flow) => {
          const d = new Date(flow.date);
          return d.getMonth() === month && d.getFullYear() === year;
        });
        const monthTotal = monthIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);
        trend.push({
          month: `${year}-${String(month + 1).padStart(2, "0")}`,
          displayMonth: `${month + 1}月`,
          amount: monthTotal,
          amountRMB: store.currency === "RMB" ? monthTotal : monthTotal * exchangeRate
        });
      }

      return {
        store,
        totalIncome,
        totalIncomeRMB,
        filteredIncome,
        filteredIncomeRMB,
        thisMonthIncome,
        thisMonthIncomeRMB,
        pendingAmount,
        pendingAmountRMB,
        trend,
        account
      };
    });
  }, [stores, filteredCashFlow, accounts, cashFlow]);

  // 判断当前是否有活跃筛选
  const hasFilter = !!(quickFilter || filterYear || filterMonth || filterDateFrom || filterDateTo);

  // 按累计回款额排序
  const sortedStats = useMemo(() => {
    return [...(Array.isArray(storeStats) ? storeStats : [])].sort((a, b) => b.totalIncomeRMB - a.totalIncomeRMB);
  }, [storeStats]);

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">店铺回款统计</h1>
          <p className="mt-1 text-sm text-slate-400">展示每个店铺的累计回款、待结算金额和回款趋势。</p>
        </div>
      </header>

      {stores.length === 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          暂无店铺数据，请先前往"系统设置 - 店铺管理"创建店铺。
        </div>
      )}

      {stores.length > 0 && cashFlow.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="font-medium text-slate-300 mb-1">📊 数据说明</p>
          <p className="text-xs text-slate-400">店铺回款统计基于"流水明细"中的收入记录（type === "income"）。</p>
          <p className="text-xs mt-1 text-slate-400">统计已确认收入，匹配规则："流水中的 accountId = 店铺对应银行账户的 accountId"。</p>
          <p className="text-xs mt-2 text-slate-500">当前没有流水数据，所有店铺的累计回款额均为 0。</p>
        </div>
      )}

      {/* 筛选器 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-6">
        {/* 快速筛选 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-200">快速筛选</label>
            {quickFilter && (
              <button
                onClick={() => setQuickFilter("")}
                className="text-xs text-slate-400 hover:text-primary-400 transition-colors"
              >
                清除
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "today", label: "今天" },
              { value: "yesterday", label: "昨天" },
              { value: "thisWeek", label: "本周" },
              { value: "lastWeek", label: "上周" },
              { value: "thisMonth", label: "本月" },
              { value: "lastMonth", label: "上月" },
              { value: "thisQuarter", label: "本季度" },
              { value: "thisYear", label: "本年" },
              { value: "lastYear", label: "去年" }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setQuickFilter(option.value);
                  setFilterYear("");
                  setFilterMonth("");
                  setFilterDateFrom("");
                  setFilterDateTo("");
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  quickFilter === option.value
                    ? "bg-primary-500 text-white shadow-md"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* 多维度时间筛选 */}
        {!quickFilter && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <label className="text-sm font-medium text-slate-200">自定义时间筛选</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">按年筛选</label>
                <select
                  value={filterYear}
                  onChange={(e) => {
                    setFilterYear(e.target.value);
                    if (e.target.value) {
                      setFilterMonth("");
                      setFilterDateFrom("");
                      setFilterDateTo("");
                    }
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="">全部年份</option>
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option key={year} value={year}>
                        {year}年
                      </option>
                    );
                  })}
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs text-slate-400">按月筛选</label>
                <select
                  value={filterMonth}
                  onChange={(e) => {
                    setFilterMonth(e.target.value);
                    if (e.target.value) {
                      setFilterDateFrom("");
                      setFilterDateTo("");
                    }
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!filterYear}
                >
                  <option value="">全部月份</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1;
                    const monthStr = filterYear ? `${filterYear}-${String(month).padStart(2, "0")}` : "";
                    return (
                      <option key={month} value={monthStr}>
                        {month}月
                      </option>
                    );
                  })}
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs text-slate-400">开始日期</label>
                <input
                  type="date"
                  lang="zh-CN"
                  value={filterDateFrom}
                  onChange={(e) => {
                    setFilterDateFrom(e.target.value);
                    setFilterYear("");
                    setFilterMonth("");
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs text-slate-400">结束日期</label>
                <input
                  type="date"
                  lang="zh-CN"
                  value={filterDateTo}
                  onChange={(e) => {
                    setFilterDateTo(e.target.value);
                    setFilterYear("");
                    setFilterMonth("");
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
            </div>
            {(filterYear || filterMonth || filterDateFrom || filterDateTo) && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setFilterYear("");
                    setFilterMonth("");
                    setFilterDateFrom("");
                    setFilterDateTo("");
                  }}
                  className="text-xs text-slate-400 hover:text-primary-400 transition-colors underline"
                >
                  清除时间筛选
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section
        className="grid gap-6"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "24px" }}
      >
        {sortedStats.map((stat, idx) => {
          // 不同店铺不同渐变色
          const gradients = [
            "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
            "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)",
            "linear-gradient(135deg, #b45309 0%, #0f172a 100%)",
            "linear-gradient(135deg, #be123c 0%, #0f172a 100%)",
            "linear-gradient(135deg, #0e7490 0%, #0f172a 100%)",
          ];
          const gradient = gradients[idx % gradients.length];

          return (
          <div
            key={stat.store.id}
            className="group relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-xl"
            style={{
              background: gradient,
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            {/* 装饰光晕 */}
            <div className="absolute top-0 right-0 -mt-6 -mr-6 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
            <div className="relative z-10">
              {/* 头部：店铺名 + 币种徽章 */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{stat.store.name}</h3>
                  <p className="text-xs text-white/50 mt-1">
                    {stat.store.platform} · {stat.store.currency}
                  </p>
                </div>
                <div className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
                  {stat.store.currency}
                </div>
              </div>

              {/* 累计回款 */}
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-white/60">累计回款额</div>
                  <div className="text-3xl font-bold text-white drop-shadow-lg mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {currency(stat.totalIncome, stat.store.currency)}
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">
                    ≈ {currency(stat.totalIncomeRMB, "CNY")}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs font-medium text-white/60">
                    {hasFilter ? "筛选期间回款" : "本月回款"}
                  </div>
                  <div className="text-xl font-semibold text-white/90 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {currency(hasFilter ? stat.filteredIncome : stat.thisMonthIncome, stat.store.currency)}
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">
                    ≈ {currency(hasFilter ? stat.filteredIncomeRMB : stat.thisMonthIncomeRMB, "CNY")}
                  </div>
                </div>

                {stat.pendingAmount > 0 && (
                  <div className="pt-3 border-t border-white/10">
                    <div className="text-xs font-medium text-amber-300/80">待结算金额</div>
                    <div className="text-lg font-semibold text-amber-300 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {currency(stat.pendingAmountRMB, "CNY")}
                    </div>
                  </div>
                )}

                {/* 回款趋势图 */}
                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs font-medium text-white/50 mb-2">回款趋势（近6个月）</div>
                  {stat.trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height={100}>
                      <AreaChart data={stat.trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`grad-${stat.store.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Tooltip
                          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px", color: "#e2e8f0" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0]?.payload;
                            return (
                              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "8px 12px", fontSize: "12px", color: "#e2e8f0" }}>
                                <div style={{ marginBottom: "4px", color: "#94a3b8" }}>{data?.displayMonth}</div>
                                <div style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {currency(data?.amount || 0, stat.store.currency)}
                                </div>
                                <div style={{ color: "#94a3b8", fontSize: "10px" }}>
                                  ≈ {currency(data?.amountRMB || 0, "CNY")}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="amountRMB"
                          stroke="#34d399"
                          strokeWidth={2}
                          fill={`url(#grad-${stat.store.id})`}
                          dot={{ r: 3, fill: "#34d399" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-20 flex items-center justify-center text-xs text-white/30">暂无趋势数据</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
        })}
      </section>
    </div>
  );
}
