"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import type { StoreRemittanceReport } from "@/lib/store-remittance-report";
import { resolveStoreReportPeriod, shanghaiToday, type StoreReportQuickPeriod } from "@/lib/store-report-period";

const currency = (value: number | null, curr = "CNY"): string => {
  if (value === null) return "缺少历史汇率，暂不折算";
  const code = curr === "RMB" ? "CNY" : curr;
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
  } catch {
    return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + code;
  }
};

async function reportFetcher(url: string): Promise<StoreRemittanceReport> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error("登录已过期，请重新登录后刷新统计。");
    throw new Error(body?.error || "回款统计加载失败，请稍后重试。");
  }
  if (!body || !Array.isArray(body.data) || !Array.isArray(body.summary?.currencies)) throw new Error("回款统计响应异常，请重试。");
  return body;
}

export default function StoreReportPage() {
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [quickFilter, setQuickFilter] = useState<StoreReportQuickPeriod>("");
  const today = shanghaiToday();
  const period = useMemo(() => resolveStoreReportPeriod({
    quick: quickFilter, year: filterYear, month: filterMonth, startDate: filterDateFrom, endDate: filterDateTo,
  }, new Date(today + "T04:00:00.000Z")), [quickFilter, filterYear, filterMonth, filterDateFrom, filterDateTo, today]);
  const invalidRange = Boolean(period.startDate && period.endDate && period.startDate > period.endDate);
  const hasFilter = Boolean(period.startDate || period.endDate);
  const params = new URLSearchParams();
  if (period.startDate) params.set("startDate", period.startDate);
  if (period.endDate) params.set("endDate", period.endDate);
  const { data, error, isLoading, isValidating, mutate } = useSWR<StoreRemittanceReport>(
    invalidRange ? null : "/api/store-remittance-report?" + params.toString(), reportFetcher,
    { keepPreviousData: false, revalidateOnFocus: false, revalidateOnReconnect: true, revalidateOnMount: true, dedupingInterval: 5000, shouldRetryOnError: false },
  );
  // One card per store/currency; do not add unlike currencies or mix the period into lifetime totals.
  const sortedStats = useMemo(() => (data?.data || []).flatMap((row) => row.currencies.map((amounts) => ({
    ...amounts,
    store: { ...row.store, currency: amounts.currency },
    filteredIncome: amounts.periodIncome,
    filteredIncomeRMB: amounts.periodIncomeRMB,
  }))).sort((a, b) => (b.totalIncomeRMB ?? 0) - (a.totalIncomeRMB ?? 0)), [data]);

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">店铺回款统计</h1>
          <p className="mt-1 text-sm text-slate-400">展示财务已登记的店铺回款、期间金额和近六个月趋势。</p>
        </div>
        <button type="button" disabled={isValidating || invalidRange} onClick={() => void mutate()} className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className={"h-4 w-4 " + (isValidating ? "animate-spin" : "")} />{isValidating ? "更新中…" : "刷新统计"}
        </button>
      </header>

      <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs leading-6 text-slate-300">
        <p>口径：财务已确认且未冲销的“回款”类收入，含平台钱包已释放收入；不等于银行实收或平台结算总额。</p>
        <p>按流水关联的店铺归属；无店铺标记时，仅使用唯一的账户绑定。排除内部划拨、换汇及股东投入，不重复统计。</p>
        <p>累计回款统计全部历史，筛选只影响“期间回款”。人民币按每笔流水登记的历史汇率折算；日期与财务流水明细一致。</p>
      </section>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
        <span>{error.name === "TimeoutError" ? "加载超时，请重试。" : error.message} {data ? "下方保留上次结果，不代表最新数据。" : "未将加载失败当作回款为 0。"}</span>
        <button type="button" disabled={isValidating} onClick={() => void mutate()} className="rounded border border-rose-300/30 px-3 py-1.5 disabled:opacity-50">重新加载</button>
      </div>}
      {!data && (isLoading || isValidating) && <div role="status" className="rounded-xl border border-slate-700 p-8 text-center text-slate-300">正在统计全部历史回款…</div>}
      {data && !invalidRange && <>
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="text-sm text-emerald-200">累计已登记回款 · {data.data.length} 个店铺</div>
            <div className="mt-2 space-y-1">{data.summary.currencies.map((item) => <div key={item.currency} className="text-xl font-semibold text-white">{currency(item.totalIncome, item.currency)}</div>)}</div>
            <div className="mt-2 text-xs text-slate-400">折合人民币：{currency(data.summary.totalCny)}</div>
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="text-sm text-cyan-200">{hasFilter ? "筛选期间回款" : "本月回款"}</div>
            <div className="mt-2 space-y-1">{data.summary.currencies.map((item) => <div key={item.currency} className="text-xl font-semibold text-white">{currency(hasFilter ? item.periodIncome : item.thisMonthIncome, item.currency)}</div>)}</div>
            <div className="mt-2 text-xs text-slate-400">折合人民币：{currency(hasFilter ? data.summary.periodCny : data.summary.thisMonthCny)}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="text-sm text-slate-300">累计回款笔数</div>
            <div className="mt-2 text-2xl font-semibold text-white">{data.summary.currencies.reduce((sum, item) => sum + item.incomeCount, 0).toLocaleString()} 笔</div>
            <div className="mt-2 text-xs text-slate-400">更新时间：{new Date(data.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）</div>
          </div>
        </section>
        {data.diagnostics.unattributedCount > 0 && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p>有 {data.diagnostics.unattributedCount} 笔回款无法唯一确定店铺，未计入上述店铺合计，请核对流水的店铺和账户绑定。</p>
          {data.diagnostics.unattributedCurrencies.map((item) => <p key={item.currency} className="mt-1 text-xs">未归属已确认：{currency(item.amount, item.currency)}；待确认：{currency(item.pendingAmount, item.currency)}</p>)}
        </div>}
        {data.diagnostics.missingExchangeRateCount > 0 && <div role="status" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-200">有 {data.diagnostics.missingExchangeRateCount} 笔回款缺少历史汇率；原币金额正常统计，相关人民币合计暂不显示，避免误算。</div>}
        {data.diagnostics.invalidDateCount + data.diagnostics.invalidAmountCount > 0 && <div role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-200">部分流水日期或金额异常，已暂停计入相关记录，请核查原始流水。</div>}
        {data.data.length === 0 && <div className="rounded-xl border border-slate-700 p-6 text-sm text-slate-300">暂无店铺档案，可前往 <Link href="/settings/stores" className="text-cyan-300 underline">店铺管理</Link> 查看。</div>}
      </>}

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
                  setQuickFilter(option.value as StoreReportQuickPeriod);
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
                    const year = Number(today.slice(0, 4)) - i;
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

      {invalidRange && <div role="alert" className="text-sm text-amber-300">开始日期不能晚于结束日期。</div>}
      {!invalidRange && data && <section
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
            key={`${stat.store.id}-${stat.currency}`}
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
                    {({ TIKTOK: "TikTok", SHOPEE: "Shopee", MERCADO_LIVRE: "Mercado Livre", AMAZON: "Amazon" } as Record<string, string>)[stat.store.platform] || stat.store.platform} · {stat.store.currency}
                  </p>
                </div>
                <div className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
                  {stat.store.currency}
                </div>
              </div>

              {/* 累计回款 */}
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-white/60">累计回款额 · {stat.incomeCount} 笔</div>
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
                    <div className="text-xs font-medium text-amber-300/80">待确认回款（非平台待结算）</div>
                    <div className="text-lg font-semibold text-amber-300 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {currency(stat.pendingAmount, stat.currency)}
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
                          <linearGradient id={`grad-${stat.store.id}-${stat.currency}`} x1="0" y1="0" x2="0" y2="1">
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
                                  ≈ {currency(data?.amountRMB ?? null, "CNY")}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#34d399"
                          strokeWidth={2}
                          fill={`url(#grad-${stat.store.id}-${stat.currency})`}
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
      </section>}
    </div>
  );
}
