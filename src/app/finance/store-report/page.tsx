"use client";

import { useEffect, useMemo, useState } from "react";
import { type Store, getStores } from "@/lib/store-store";
import { type BankAccount, getAccounts } from "@/lib/finance-store";
import type { CashFlow } from "../cash-flow/page";

const CASH_FLOW_KEY = "cashFlow";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export default function StoreReportPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [quickFilter, setQuickFilter] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadedStores = getStores();
    setStores(loadedStores);
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);
    const stored = window.localStorage.getItem(CASH_FLOW_KEY);
    if (stored) {
      try {
        const parsed: CashFlow[] = JSON.parse(stored);
        setCashFlow(parsed);
      } catch (e) {
        console.error("Failed to parse cash flow", e);
      }
    }
  }, []);

  // 根据时间筛选条件过滤流水记录
  const filteredCashFlow = useMemo(() => {
    let filtered = [...cashFlow];
    
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
      
      if (fromDate) filtered = filtered.filter((f) => f.date >= fromDate);
      if (toDate) filtered = filtered.filter((f) => f.date <= toDate);
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
      
      // 日期范围筛选
      if (filterDateFrom) {
        filtered = filtered.filter((f) => f.date >= filterDateFrom);
      }
      if (filterDateTo) {
        filtered = filtered.filter((f) => f.date <= filterDateTo);
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
          flow.type === "income" &&
          flow.accountId &&
          flow.accountId === store.accountId &&
          !(flow.isReversal) &&
          (flow.status === "confirmed" || !flow.status)
      );

      // 累计回款额（原币）
      const totalIncome = storeIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);

      // 累计回款额（折算RMB）
      const account = accounts.find((a) => a.id === store.accountId);
      const exchangeRate = account?.exchangeRate || 1;
      const totalIncomeRMB = store.currency === "RMB" ? totalIncome : totalIncome * exchangeRate;

      // 筛选期间回款（根据筛选条件计算）
      const filteredIncomes = storeIncomes; // 已经是筛选后的数据
      const filteredIncome = filteredIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount), 0);
      const filteredIncomeRMB = store.currency === "RMB" ? filteredIncome : filteredIncome * exchangeRate;

      // 待结算金额（如果有未确认的记录）
      const pendingIncomes = filteredCashFlow.filter(
        (flow) =>
          flow.type === "income" &&
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
        pendingAmount,
        pendingAmountRMB,
        trend,
        account
      };
    });
  }, [stores, filteredCashFlow, accounts]);

  // 按累计回款额排序
  const sortedStats = useMemo(() => {
    return [...storeStats].sort((a, b) => b.totalIncomeRMB - a.totalIncomeRMB);
  }, [storeStats]);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">店铺回款统计</h1>
          <p className="mt-1 text-sm text-slate-400">展示每个店铺的累计回款、待结算金额和回款趋势。</p>
        </div>
      </header>

      {stores.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          暂无店铺数据，请先前往"系统设置 - 店铺管理"创建店铺。
        </div>
      )}

      {stores.length > 0 && cashFlow.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          <p className="font-medium text-slate-300 mb-1">📊 数据说明</p>
          <p className="text-xs">店铺回款统计基于"流水明细"中的收入记录（type === "income"）。</p>
          <p className="text-xs mt-1">当前没有流水数据，所有店铺的累计回款额均为 0。</p>
          <p className="text-xs mt-2 text-slate-500">
            匹配规则：流水记录的 accountId 需要与店铺的 accountId 完全匹配才会统计。
          </p>
        </div>
      )}

      {/* 筛选器 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
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

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedStats.map((stat) => (
          <div key={stat.store.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{stat.store.name}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {stat.store.platform} · {stat.store.currency}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-xs text-slate-400">累计回款额</div>
                <div className="text-xl font-semibold text-emerald-300 mt-1">
                  {currency(stat.totalIncomeRMB, "CNY")}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {stat.totalIncome.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  {stat.store.currency}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  {quickFilter || filterYear || filterMonth || filterDateFrom || filterDateTo
                    ? "筛选期间回款"
                    : "本月回款"}
                </div>
                <div className="text-lg font-medium text-slate-200 mt-1">
                  {currency(stat.filteredIncomeRMB, "CNY")}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {stat.filteredIncome.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  {stat.store.currency}
                </div>
              </div>

              {stat.pendingAmount > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="text-xs text-amber-400">待结算金额</div>
                  <div className="text-lg font-medium text-amber-300 mt-1">
                    {currency(stat.pendingAmountRMB, "CNY")}
                  </div>
                </div>
              )}

              {/* 简单的趋势图 */}
              <div className="pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-400 mb-2">回款趋势（近6个月）</div>
                <div className="flex items-end gap-1 h-20">
                  {stat.trend.map((item, idx) => {
                    const maxAmount = Math.max(...stat.trend.map((t) => t.amountRMB), 1);
                    const height = (item.amountRMB / maxAmount) * 100;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-emerald-500/60 rounded-t hover:bg-emerald-500/80 transition"
                          style={{ height: `${height}%` }}
                          title={`${item.month}: ${currency(item.amountRMB, "CNY")}`}
                        />
                        <div className="text-[10px] text-slate-500 mt-1 transform -rotate-45 origin-top-left">
                          {item.month.slice(5)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
