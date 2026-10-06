"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, BadgeDollarSign, Boxes, CircleDollarSign, Eye, GripVertical, Minus, MousePointerClick, Percent, RefreshCw, RotateCcw, Save, ShoppingBag, Store, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type Shop = { shopId: string; shopName: string | null; region: string; currency: string | null };
type DailyComparableValues = { orders: number; units: number; gmv: number; adExpense: number; adGmv: number; adOrders: number; adItemSold: number; impressions: number; clicks: number; ctr: number; roas: number; profitCny?: number; profitMargin?: number };
type Trend = DailyComparableValues & { date: string; canceledOrders: number; operationAction: string; previousDay: DailyComparableValues | null };
type Totals = { orders: number; units: number; gmv: number; canceledOrders: number; adExpense: number; adGmv: number; adOrders: number; adItemSold: number; impressions: number; clicks: number; averageOrderValue: number; adRoas: number; ctr: number; profitCny?: number; profitMargin?: number };
type AnalyticsResponse = { startDate: string; endDate: string; trend: Trend[]; totals: Totals; adsBalance: Record<string, unknown>; shop: Shop; shops: Shop[]; fetchedAt: string; warnings?: string[] };
type ProfitPeriod = { startDate: string; gmvCny: number; profitCny: number; margin: number };
type ProfitResponse = { periods?: ProfitPeriod[]; warnings?: string[]; error?: string };
type MetricKey = "impressions" | "clicks" | "ctr" | "adOrders" | "adItemSold" | "adGmv" | "adExpense" | "roas" | "profitCny" | "profitMargin";
type MetricFormat = "count" | "money" | "cnyMoney" | "percent" | "ratio";
type TimeMode = "today" | "yesterday" | "last7" | "last30" | "all" | "custom";
type DailyColumnKey = keyof DailyComparableValues;

const timeModeLabels: Record<TimeMode, string> = {
  today: "今天",
  yesterday: "昨天",
  last7: "过去7天",
  last30: "过去30天",
  all: "全部时间",
  custom: "自定义",
};

const metricDefinitions: Array<{ key: MetricKey; label: string; icon: typeof Eye; format: MetricFormat; color: string }> = [
  { key: "impressions", label: "展示次数", icon: Eye, format: "count", color: "#60a5fa" },
  { key: "clicks", label: "点击数", icon: MousePointerClick, format: "count", color: "#38bdf8" },
  { key: "ctr", label: "点击率", icon: Percent, format: "percent", color: "#a78bfa" },
  { key: "adOrders", label: "订单量", icon: ShoppingBag, format: "count", color: "#34d399" },
  { key: "adItemSold", label: "商品已出售", icon: Boxes, format: "count", color: "#2dd4bf" },
  { key: "adGmv", label: "销售额", icon: BadgeDollarSign, format: "money", color: "#fbbf24" },
  { key: "adExpense", label: "花费", icon: Wallet, format: "money", color: "#fb7185" },
  { key: "roas", label: "广告支出回报率", icon: Activity, format: "ratio", color: "#f97316" },
  { key: "profitCny", label: "利润", icon: CircleDollarSign, format: "cnyMoney", color: "#4ade80" },
  { key: "profitMargin", label: "利润率", icon: Percent, format: "percent", color: "#22c55e" },
];

const DAILY_COLUMN_STORAGE_KEY = "shopee-analytics-daily-column-order-v1";
const dailyColumnDefinitions: Array<{ key: DailyColumnKey; label: string; format: MetricFormat }> = [
  { key: "orders", label: "店铺有效订单", format: "count" },
  { key: "units", label: "店铺销量", format: "count" },
  { key: "gmv", label: "店铺 GMV", format: "money" },
  { key: "profitCny", label: "利润（CNY）", format: "cnyMoney" },
  { key: "profitMargin", label: "利润率", format: "percent" },
  { key: "adOrders", label: "广告订单量", format: "count" },
  { key: "adItemSold", label: "广告商品已出售", format: "count" },
  { key: "adGmv", label: "广告销售额", format: "money" },
  { key: "impressions", label: "展示次数", format: "count" },
  { key: "clicks", label: "点击数", format: "count" },
  { key: "ctr", label: "点击率", format: "percent" },
  { key: "adExpense", label: "花费", format: "money" },
  { key: "roas", label: "广告 ROAS", format: "ratio" },
];
const defaultDailyColumnOrder = dailyColumnDefinitions.map((column) => column.key);
const dailyColumnKeys = new Set<DailyColumnKey>(defaultDailyColumnOrder);

function normalizeDailyColumnOrder(value: unknown): DailyColumnKey[] {
  if (!Array.isArray(value)) return [...defaultDailyColumnOrder];
  const seen = new Set<DailyColumnKey>();
  const persisted = value.filter((key): key is DailyColumnKey => {
    if (typeof key !== "string" || !dailyColumnKeys.has(key as DailyColumnKey) || seen.has(key as DailyColumnKey)) return false;
    seen.add(key as DailyColumnKey);
    return true;
  });
  return [...persisted, ...defaultDailyColumnOrder.filter((key) => !seen.has(key))];
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

function compact(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatMetric(value: unknown, format: MetricFormat, currency: string) {
  if (value === undefined || value === null) return "--";
  const parsed = number(value);
  if (format === "money") return money(parsed, currency);
  if (format === "cnyMoney") return money(parsed, "CNY");
  if (format === "percent") return `${(parsed * 100).toFixed(2)}%`;
  if (format === "ratio") return parsed.toFixed(2);
  return parsed.toLocaleString("zh-CN");
}

function metricTotal(metric: { key: MetricKey }, totals: Totals | undefined) {
  if (!totals) return undefined;
  return metric.key === "roas" ? totals.adRoas : totals[metric.key];
}

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function splitDateRange(startDate: string, endDate: string) {
  const ranges: Array<{ startDate: string; endDate: string }> = [];
  for (let cursor = startDate; cursor <= endDate;) {
    const chunkEnd = addIsoDays(cursor, 365);
    const boundedEnd = chunkEnd < endDate ? chunkEnd : endDate;
    ranges.push({ startDate: cursor, endDate: boundedEnd });
    cursor = addIsoDays(boundedEnd, 1);
  }
  return ranges;
}

async function loadProfitData(analytics: AnalyticsResponse) {
  const comparisonStartDate = addIsoDays(analytics.startDate, -1);
  const ranges = splitDateRange(comparisonStartDate, analytics.endDate);
  const results = await Promise.allSettled(ranges.map(async (range) => {
    const params = new URLSearchParams({
      shopId: analytics.shop.shopId,
      startDate: range.startDate,
      endDate: range.endDate,
      groupBy: "day",
      page: "1",
      pageSize: "10",
    });
    const response = await fetch(`/api/shopee/profit?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json() as ProfitResponse;
    if (!response.ok) throw new Error(payload.error || "利润核算数据加载失败");
    return { range, payload };
  }));

  const profitByDate = new Map<string, ProfitPeriod>();
  const successfulRanges: Array<{ startDate: string; endDate: string }> = [];
  const profitWarnings = new Set<string>();
  let failedRanges = 0;

  results.forEach((result) => {
    if (result.status === "rejected") {
      failedRanges += 1;
      return;
    }
    successfulRanges.push(result.value.range);
    (result.value.payload.periods || []).forEach((period) => profitByDate.set(period.startDate, period));
    (result.value.payload.warnings || []).forEach((warning) => profitWarnings.add(`利润核算：${warning}`));
  });

  const profitForDate = (date: string) => {
    const covered = successfulRanges.some((range) => date >= range.startDate && date <= range.endDate);
    if (!covered) return { profitCny: undefined, profitMargin: undefined, gmvCny: undefined };
    const period = profitByDate.get(date);
    return {
      profitCny: number(period?.profitCny),
      profitMargin: period ? number(period.margin) / 100 : 0,
      gmvCny: number(period?.gmvCny),
    };
  };

  const trend = analytics.trend.map((row) => {
    const currentProfit = profitForDate(row.date);
    const previousProfit = profitForDate(addIsoDays(row.date, -1));
    return {
      ...row,
      profitCny: currentProfit.profitCny,
      profitMargin: currentProfit.profitMargin,
      previousDay: row.previousDay ? {
        ...row.previousDay,
        profitCny: previousProfit.profitCny,
        profitMargin: previousProfit.profitMargin,
      } : null,
    };
  });

  const profitComplete = failedRanges === 0;
  const profitTotals = trend.reduce((sum, row) => {
    const profit = profitForDate(row.date);
    return {
      profitCny: sum.profitCny + number(profit.profitCny),
      gmvCny: sum.gmvCny + number(profit.gmvCny),
    };
  }, { profitCny: 0, gmvCny: 0 });

  return {
    ...analytics,
    trend,
    totals: {
      ...analytics.totals,
      profitCny: profitComplete ? profitTotals.profitCny : undefined,
      profitMargin: profitComplete && profitTotals.gmvCny > 0 ? profitTotals.profitCny / profitTotals.gmvCny : profitComplete ? 0 : undefined,
    },
    warnings: [
      ...(analytics.warnings || []),
      ...profitWarnings,
      ...(failedRanges > 0 ? [`利润核算有 ${failedRanges} 个日期区间读取失败，未取得的利润显示为 --，请稍后刷新`] : []),
    ],
  } satisfies AnalyticsResponse;
}

function DailyChange({ current, previous }: { current: number | undefined; previous: number | undefined }) {
  const changeClassName = "mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium tabular-nums";
  if (current === undefined || previous === undefined) return <span className={`${changeClassName} text-slate-600`}>--</span>;
  if (previous === 0 && current > 0) {
    return <span title="较前一日" className={`${changeClassName} text-emerald-400/90`}><TrendingUp className="h-3 w-3 shrink-0" />新增</span>;
  }
  const rate = previous === 0 ? 0 : ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(rate) < 0.005) {
    return <span title="较前一日" className={`${changeClassName} text-slate-500`}><Minus className="h-3 w-3 shrink-0" />0.00%</span>;
  }
  const increased = rate > 0;
  const Icon = increased ? TrendingUp : TrendingDown;
  return <span title="较前一日" className={`${changeClassName} ${increased ? "text-emerald-400/90" : "text-rose-400/90"}`}><Icon className="h-3 w-3 shrink-0" />{Math.abs(rate).toFixed(2)}%</span>;
}

function DailyMetricCell({ children, current, previous }: { children: ReactNode; current: number | undefined; previous: number | undefined }) {
  return <td className="whitespace-nowrap px-3 py-3"><div>{children}</div><DailyChange current={current} previous={previous} /></td>;
}

export default function ShopeeAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [shopId, setShopId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeMode, setTimeMode] = useState<TimeMode>("last7");
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["impressions"]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});
  const [savingActionDate, setSavingActionDate] = useState<string | null>(null);
  const dirtyActionDates = useRef(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [dailyColumnOrder, setDailyColumnOrder] = useState<DailyColumnKey[]>(defaultDailyColumnOrder);
  const [draggedColumn, setDraggedColumn] = useState<DailyColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<DailyColumnKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (["today", "yesterday", "last7", "last30"].includes(timeMode)) {
        params.set("period", timeMode);
      } else if (timeMode === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      if (shopId) params.set("shopId", shopId);
      const response = await fetch(`/api/shopee/analytics?${params}`, { cache: "no-store" });
      const rawPayload = await response.json();
      if (!response.ok) throw new Error(rawPayload.error || "Shopee 数据分析加载失败");
      const payload = await loadProfitData(rawPayload as AnalyticsResponse);
      setData(payload);
      setActionDrafts((current) => Object.fromEntries((payload.trend || []).map((row: Trend) => [
        row.date,
        dirtyActionDates.current.has(row.date) ? current[row.date] || "" : row.operationAction || "",
      ])));
      if (!shopId && payload.shop?.shopId) setShopId(payload.shop.shopId);
      if (timeMode === "custom") {
        if (!startDate) setStartDate(payload.startDate);
        if (!endDate) setEndDate(payload.endDate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shopee 数据分析加载失败");
    } finally {
      setLoading(false);
    }
  }, [endDate, shopId, startDate, timeMode]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try {
      const savedOrder = window.localStorage.getItem(DAILY_COLUMN_STORAGE_KEY);
      if (savedOrder) setDailyColumnOrder(normalizeDailyColumnOrder(JSON.parse(savedOrder)));
    } catch {
      window.localStorage.removeItem(DAILY_COLUMN_STORAGE_KEY);
    }
  }, []);
  useEffect(() => {
    if (!["today", "last7", "last30"].includes(timeMode)) return;
    const timer = window.setInterval(() => { void load(); }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load, timeMode]);

  const currency = data?.shop.currency || "BRL";
  const totals = data?.totals;
  const activeMetrics = metricDefinitions.filter((metric) => selectedMetrics.includes(metric.key));
  const primaryMetric = activeMetrics[0] || metricDefinitions[0];
  const trend = data?.trend || [];
  const detailRows = [...trend].sort((left, right) => right.date.localeCompare(left.date));

  function selectTimeMode(nextMode: TimeMode) {
    setTimeMode(nextMode);
    setSelectedDate(null);
    if (nextMode === "custom") {
      setStartDate((current) => current || data?.startDate || "");
      setEndDate((current) => current || data?.endDate || "");
    } else {
      setStartDate("");
      setEndDate("");
    }
  }

  function toggleMetric(key: MetricKey) {
    setSelectedMetrics((current) => {
      if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
      return [...current, key];
    });
  }

  function moveDailyColumn(source: DailyColumnKey, target: DailyColumnKey) {
    if (source === target) return;
    setDailyColumnOrder((current) => {
      const sourceIndex = current.indexOf(source);
      const targetIndex = current.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      window.localStorage.setItem(DAILY_COLUMN_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function resetDailyColumnOrder() {
    const next = [...defaultDailyColumnOrder];
    setDailyColumnOrder(next);
    window.localStorage.setItem(DAILY_COLUMN_STORAGE_KEY, JSON.stringify(next));
    setDraggedColumn(null);
    setDragOverColumn(null);
  }

  async function saveOperationAction(row: Trend) {
    if (!data?.shop.shopId) return;
    const operationAction = actionDrafts[row.date] || "";
    setSavingActionDate(row.date);
    try {
      const response = await fetch("/api/shopee/analytics/operation-action", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: data.shop.shopId, date: row.date, operationAction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "运营动作保存失败");
      dirtyActionDates.current.delete(row.date);
      setActionDrafts((current) => ({ ...current, [row.date]: payload.operationAction || "" }));
      setData((current) => current ? {
        ...current,
        trend: current.trend.map((item) => item.date === row.date
          ? { ...item, operationAction: payload.operationAction || "" }
          : item),
      } : current);
      toast.success(payload.operationAction ? "运营动作已保存" : "运营动作已清空");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "运营动作保存失败");
    } finally {
      setSavingActionDate(null);
    }
  }

  return <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6"><div className="w-full min-w-0 max-w-none space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
      <div><h1 className="text-xl font-semibold">Shopee 数据分析</h1><p className="mt-1 flex items-center gap-2 text-sm text-slate-400"><Store className="h-4 w-4" />{data?.shop.shopName || data?.shop.shopId || "已授权店铺"}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={shopId}
          onChange={(event) => {
            dirtyActionDates.current.clear();
            setActionDrafts({});
            setShopId(event.target.value);
            setStartDate("");
            setEndDate("");
            setTimeMode("last7");
            setSelectedDate(null);
          }}
          className="h-9 min-w-48 rounded border border-slate-700 bg-slate-900 px-3 text-sm"
        >
          {(data?.shops || []).map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName || shop.shopId}</option>)}
        </select>
        <div
          role="group"
          aria-label="时间范围"
          className="inline-flex h-9 overflow-hidden rounded border border-slate-700 bg-slate-900 p-0.5 text-xs"
        >
          {(Object.entries(timeModeLabels) as Array<[TimeMode, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={timeMode === value}
              onClick={() => selectTimeMode(value)}
              className={`h-8 whitespace-nowrap rounded px-3 transition-colors ${timeMode === value ? "bg-sky-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {timeMode === "custom" && <>
          <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setSelectedDate(null); }} className="h-9 rounded border border-slate-700 bg-slate-900 px-3 text-sm" />
          <span className="text-slate-600">至</span>
          <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setSelectedDate(null); }} className="h-9 rounded border border-slate-700 bg-slate-900 px-3 text-sm" />
        </>}
        <button onClick={() => { setSelectedDate(null); void load(); }} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />查询</button>
      </div>
    </div>

    {(data?.warnings || []).length > 0 && <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="space-y-1">{data?.warnings?.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
      {metricDefinitions.map((metric) => { const Icon = metric.icon; const active = selectedMetrics.includes(metric.key); return <button type="button" key={metric.key} aria-pressed={active} onClick={() => toggleMetric(metric.key)} className={`rounded border p-4 text-left transition-colors ${active ? "border-sky-500 bg-slate-800 ring-1 ring-sky-500/40" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}><div className="flex items-center justify-between text-xs text-slate-400"><span>{metric.label}</span><Icon className="h-4 w-4" style={{ color: metric.color }} /></div><div className="mt-2 text-xl font-semibold text-white">{formatMetric(metricTotal(metric, totals), metric.format, currency)}</div></button>; })}
    </div>

    <section className="rounded border border-slate-800 bg-slate-900 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold">{activeMetrics.length > 1 ? `${activeMetrics.length} 项指标趋势` : `${primaryMetric.label}趋势`}</h2><p className="mt-1 text-xs text-slate-500">{data ? `${data.startDate} 至 ${data.endDate}` : "--"}{` · ${timeModeLabels[timeMode]}`}</p></div>{selectedDate && <div className="text-sm text-slate-400">已选日期 <span className="ml-1 font-semibold text-white">{selectedDate}</span></div>}</div><div className="mt-4 h-80">{trend.length === 0 && loading ? <div className="flex h-full items-center justify-center text-sm text-slate-500">正在读取 Shopee 数据...</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => String(value).slice(5)} />{activeMetrics.map((metric) => metric.key === primaryMetric.key ? <YAxis key={metric.key} yAxisId={metric.key} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => primaryMetric.format === "money" || primaryMetric.format === "cnyMoney" ? compact(number(value)) : primaryMetric.format === "percent" ? `${(number(value) * 100).toFixed(0)}%` : compact(number(value))} /> : <YAxis key={metric.key} yAxisId={metric.key} hide domain={["auto", "auto"]} />)}<Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 4 }} formatter={(value, name) => { const metric = metricDefinitions.find((item) => item.label === name || item.key === name) || primaryMetric; return [formatMetric(value, metric.format, currency), metric.label]; }} labelFormatter={(label) => `日期 ${label}`} /><Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />{activeMetrics.map((metric) => <Line key={metric.key} yAxisId={metric.key} type="monotone" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2.5} dot={{ r: 2, fill: metric.color }} activeDot={{ r: 5 }} connectNulls={false} />)}{selectedDate && <ReferenceLine x={selectedDate} stroke="#f8fafc" strokeDasharray="4 4" />}</LineChart></ResponsiveContainer>}</div></section>

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold">每日明细</h2>
        <button type="button" title="恢复默认字段顺序" aria-label="恢复默认字段顺序" onClick={resetDailyColumnOrder} className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 text-slate-400 transition-colors hover:border-sky-500 hover:text-sky-300"><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1950px] text-left text-sm">
          <thead className="bg-slate-800/70 text-xs text-slate-400">
            <tr>
              <th className="px-3 py-3">日期</th>
              <th className="min-w-[300px] px-3 py-3">运营动作</th>
              {dailyColumnOrder.map((key) => {
                const column = dailyColumnDefinitions.find((item) => item.key === key)!;
                return <th
                  key={column.key}
                  draggable
                  aria-grabbed={draggedColumn === column.key}
                  title="拖拽调整字段顺序"
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", column.key);
                    setDraggedColumn(column.key);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverColumn(column.key);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const source = draggedColumn || event.dataTransfer.getData("text/plain") as DailyColumnKey;
                    if (dailyColumnKeys.has(source)) moveDailyColumn(source, column.key);
                    setDraggedColumn(null);
                    setDragOverColumn(null);
                  }}
                  onDragEnd={() => {
                    setDraggedColumn(null);
                    setDragOverColumn(null);
                  }}
                  className={`select-none whitespace-nowrap px-3 py-3 transition-colors ${draggedColumn === column.key ? "opacity-40" : ""} ${dragOverColumn === column.key && draggedColumn !== column.key ? "bg-sky-500/15 text-sky-300" : ""}`}
                >
                  <span className="inline-flex cursor-grab items-center gap-1.5 active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5 text-slate-600" />{column.label}</span>
                </th>;
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && detailRows.length === 0 ? <tr><td colSpan={dailyColumnOrder.length + 2} className="px-3 py-14 text-center text-sm text-slate-500">正在读取 Shopee 数据...</td></tr> : detailRows.length === 0 ? <tr><td colSpan={dailyColumnOrder.length + 2} className="px-3 py-14 text-center text-sm text-slate-500">暂无数据</td></tr> : detailRows.map((row) => {
              const active = selectedDate === row.date;
              const actionDraft = actionDrafts[row.date] || "";
              const actionDirty = actionDraft !== row.operationAction;
              return <tr key={row.date} role="button" tabIndex={0} onClick={() => setSelectedDate(row.date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDate(row.date); } }} className={`cursor-pointer transition-colors ${active ? "bg-sky-950/50" : "hover:bg-slate-800/40"}`}>
                <td className="px-3 py-3 font-medium text-slate-200">{row.date}</td>
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><div className="flex items-center gap-2"><input type="text" value={actionDraft} maxLength={1000} onChange={(event) => { dirtyActionDates.current.add(row.date); setActionDrafts((current) => ({ ...current, [row.date]: event.target.value })); }} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="输入当天运营操作信息" className="h-9 min-w-0 flex-1 rounded border border-slate-600/80 bg-slate-800/70 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-sky-500 focus:bg-slate-800" /><button type="button" title="保存运营动作" aria-label={`保存 ${row.date} 运营动作`} disabled={!actionDirty || savingActionDate === row.date} onClick={() => void saveOperationAction(row)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-600/70 bg-slate-800/70 text-slate-400 transition-colors hover:border-sky-500 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-35"><Save className={`h-4 w-4 ${savingActionDate === row.date ? "animate-pulse" : ""}`} /></button></div></td>
                {dailyColumnOrder.map((key) => {
                  const column = dailyColumnDefinitions.find((item) => item.key === key)!;
                  return <DailyMetricCell key={key} current={row[key]} previous={row.previousDay?.[key]}>{formatMetric(row[key], column.format, currency)}</DailyMetricCell>;
                })}
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  </div></div>;
}
