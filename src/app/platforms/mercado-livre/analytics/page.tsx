"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  CircleDollarSign,
  Eye,
  Gauge,
  GripVertical,
  Minus,
  PackageSearch,
  Percent,
  RefreshCw,
  RotateCcw,
  Save,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

type TimeMode = "today" | "yesterday" | "last7" | "last30" | "all" | "custom";
type CoreMetricKey = "orders" | "units" | "gmv" | "visits" | "conversionRate" | "averageOrderValue";
type AdMetricKey = "adSpend" | "adImpressions" | "adClicks" | "adCtr" | "adSales" | "adOrders" | "adUnits" | "adRoas";
type ProfitMetricKey = "profitCny" | "profitMargin";
type MetricKey = CoreMetricKey | AdMetricKey | ProfitMetricKey;
type DailyColumnKey = CoreMetricKey | ProfitMetricKey | "adSpend" | "adImpressions" | "adClicks" | "adCtr" | "adSales" | "adRoas" | "canceledOrders";
type MetricFormat = "count" | "money" | "percent" | "nullableCount" | "nullableMoney" | "nullableCnyMoney" | "nullablePercent";
type ComparableValues = Record<CoreMetricKey, number> & Partial<Record<AdMetricKey | ProfitMetricKey, number | null>>;
type DailyRow = ComparableValues & {
  date: string;
  canceledOrders: number;
  operationAction: string;
  previousDay: ComparableValues | null;
  adSpend: number | null;
  adImpressions: number | null;
  adClicks: number | null;
  adCtr: number | null;
  adSales: number | null;
  adOrders: number | null;
  adUnits: number | null;
  adRoas: number | null;
  adAcos: number | null;
  profitCny: number | null;
  profitMargin: number | null;
};
type Account = {
  id: string;
  userId: string;
  nickname: string | null;
  country: string;
  currency: string;
  lastOrderSyncAt?: string | null;
  lastProductSyncAt?: string | null;
};
type ProductPerformance = {
  itemId: string;
  title: string;
  thumbnail: string | null;
  orders: number;
  units: number;
  gmv: number;
  visits: number;
  conversionRate: number;
};
type Totals = ComparableValues & {
  canceledOrders: number;
  activeListings: number;
  availableStock: number;
  adSpend: number | null;
  adImpressions: number | null;
  adClicks: number | null;
  adSales: number | null;
  adOrders: number | null;
  adUnits: number | null;
  adCtr: number | null;
  adRoas: number | null;
  profitCny: number | null;
  profitMargin: number | null;
};
type AnalyticsResponse = {
  startDate: string;
  endDate: string;
  trend: DailyRow[];
  totals: Totals;
  productPerformance: ProductPerformance[];
  account: Account;
  accounts: Account[];
  dataAvailability: {
    orders: boolean;
    visits: boolean;
    advertising: boolean;
    advertisingReason: string;
  };
  warnings: string[];
  fetchedAt: string;
};
type ProfitPeriod = {
  startDate: string;
  gmvCny: number;
  contributionProfitCny: number;
  margin: number;
};
type ProfitResponse = {
  periods?: ProfitPeriod[];
  warnings?: string[];
  error?: string;
};

const timeModeLabels: Record<TimeMode, string> = {
  today: "今天",
  yesterday: "昨天",
  last7: "过去7天",
  last30: "过去30天",
  all: "全部时间",
  custom: "自定义",
};

const metrics: Array<{
  key: MetricKey;
  label: string;
  icon: typeof Eye;
  format: MetricFormat;
  color: string;
}> = [
  { key: "orders", label: "有效订单", icon: ShoppingBag, format: "count", color: "#facc15" },
  { key: "units", label: "实际件数", icon: Boxes, format: "count", color: "#2dd4bf" },
  { key: "gmv", label: "店铺 GMV", icon: BadgeDollarSign, format: "money", color: "#34d399" },
  { key: "profitCny", label: "利润", icon: CircleDollarSign, format: "nullableCnyMoney", color: "#4ade80" },
  { key: "profitMargin", label: "利润率", icon: Percent, format: "nullablePercent", color: "#22c55e" },
  { key: "visits", label: "商品访问量", icon: Eye, format: "count", color: "#38bdf8" },
  { key: "conversionRate", label: "订单转化率", icon: Gauge, format: "percent", color: "#fb923c" },
  { key: "averageOrderValue", label: "平均客单价", icon: BadgeDollarSign, format: "money", color: "#f472b6" },
  { key: "adSpend", label: "广告花费", icon: BadgeDollarSign, format: "nullableMoney", color: "#fb7185" },
  { key: "adImpressions", label: "广告展示", icon: Eye, format: "nullableCount", color: "#a78bfa" },
  { key: "adClicks", label: "广告点击", icon: Gauge, format: "nullableCount", color: "#c084fc" },
  { key: "adCtr", label: "广告 CTR", icon: TrendingUp, format: "nullablePercent", color: "#f97316" },
  { key: "adSales", label: "广告归因销售额", icon: BadgeDollarSign, format: "nullableMoney", color: "#4ade80" },
  { key: "adOrders", label: "广告归因件数", icon: ShoppingBag, format: "nullableCount", color: "#22d3ee" },
  { key: "adUnits", label: "广告归因单位", icon: Boxes, format: "nullableCount", color: "#2dd4bf" },
  { key: "adRoas", label: "广告 ROAS", icon: TrendingUp, format: "nullableCount", color: "#facc15" },
];

const DAILY_COLUMN_STORAGE_KEY = "mercado-livre-analytics-daily-column-order-v1";
const dailyColumnDefinitions: Array<{ key: DailyColumnKey; label: string; format: MetricFormat; compare?: boolean }> = [
  { key: "orders", label: "有效订单", format: "count" },
  { key: "units", label: "实际件数", format: "count" },
  { key: "gmv", label: "店铺 GMV", format: "money" },
  { key: "profitCny", label: "利润（CNY）", format: "nullableCnyMoney" },
  { key: "profitMargin", label: "利润率", format: "nullablePercent" },
  { key: "adSpend", label: "广告花费", format: "nullableMoney" },
  { key: "adImpressions", label: "广告展示", format: "nullableCount" },
  { key: "adClicks", label: "广告点击", format: "nullableCount" },
  { key: "adCtr", label: "广告 CTR", format: "nullablePercent" },
  { key: "adSales", label: "广告归因销售额", format: "nullableMoney" },
  { key: "adRoas", label: "广告 ROAS", format: "nullableCount" },
  { key: "visits", label: "商品访问量", format: "count" },
  { key: "conversionRate", label: "订单转化率", format: "percent" },
  { key: "averageOrderValue", label: "平均客单价", format: "money" },
  { key: "canceledOrders", label: "取消订单", format: "count", compare: false },
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
  if (format.startsWith("nullable") && (value === null || value === undefined || value === "")) return "--";
  const parsed = number(value);
  if (format === "money" || format === "nullableMoney") return money(parsed, currency);
  if (format === "nullableCnyMoney") return money(parsed, "CNY");
  if (format === "percent" || format === "nullablePercent") return `${(parsed * 100).toFixed(2)}%`;
  return parsed.toLocaleString("zh-CN");
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
      platform: "MERCADO_LIVRE",
      shopId: analytics.account.userId,
      startDate: range.startDate,
      endDate: range.endDate,
      groupBy: "day",
    });
    const response = await fetch(`/api/profit-report?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json() as ProfitResponse;
    if (!response.ok) throw new Error(payload.error || "美克多利润核算数据加载失败");
    if (!Array.isArray(payload.periods)) throw new Error("美克多利润核算返回格式异常");
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
    result.value.payload.periods?.forEach((period) => profitByDate.set(period.startDate, period));
    result.value.payload.warnings?.forEach((warning) => profitWarnings.add(`利润核算：${warning}`));
  });

  const profitForDate = (date: string) => {
    const covered = successfulRanges.some((range) => date >= range.startDate && date <= range.endDate);
    if (!covered) return { profitCny: null, profitMargin: null, gmvCny: null };
    const period = profitByDate.get(date);
    return {
      profitCny: number(period?.contributionProfitCny),
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

  const profitTotals = trend.reduce((sum, row) => {
    const profit = profitForDate(row.date);
    return {
      profitCny: sum.profitCny + number(profit.profitCny),
      gmvCny: sum.gmvCny + number(profit.gmvCny),
    };
  }, { profitCny: 0, gmvCny: 0 });
  const profitComplete = failedRanges === 0;

  return {
    ...analytics,
    trend,
    totals: {
      ...analytics.totals,
      profitCny: profitComplete ? profitTotals.profitCny : null,
      profitMargin: profitComplete
        ? (profitTotals.gmvCny > 0 ? profitTotals.profitCny / profitTotals.gmvCny : 0)
        : null,
    },
    warnings: [...new Set([
      ...(analytics.warnings || []),
      ...profitWarnings,
      ...(failedRanges > 0 ? [`利润核算有 ${failedRanges} 个日期区间读取失败，未取得的利润显示为 --，请稍后刷新`] : []),
    ])],
  } satisfies AnalyticsResponse;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "尚未同步";
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
  });
}

function DailyChange({ current, previous }: { current: number | null; previous: number | null | undefined }) {
  const className = "mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium tabular-nums";
  if (previous === undefined || previous === null || current === null) return <span className={`${className} text-slate-600`}>--</span>;
  if (previous === 0 && current > 0) {
    return <span title="较前一日" className={`${className} text-emerald-400`}><TrendingUp className="h-3 w-3" />新增</span>;
  }
  const rate = previous === 0 ? 0 : ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(rate) < 0.005) {
    return <span title="较前一日" className={`${className} text-slate-500`}><Minus className="h-3 w-3" />0.00%</span>;
  }
  const increased = rate > 0;
  const Icon = increased ? TrendingUp : TrendingDown;
  return <span title="较前一日" className={`${className} ${increased ? "text-emerald-400" : "text-rose-400"}`}><Icon className="h-3 w-3" />{Math.abs(rate).toFixed(2)}%</span>;
}

function DailyMetricCell({ children, current, previous }: { children: ReactNode; current: number | null; previous: number | null | undefined }) {
  return <td className="whitespace-nowrap px-3 py-3"><div>{children}</div><DailyChange current={current} previous={previous} /></td>;
}

export default function MercadoLivreAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [accountId, setAccountId] = useState("");
  const [timeMode, setTimeMode] = useState<TimeMode>("last7");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["orders"]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});
  const [savingActionDate, setSavingActionDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const dirtyActionDates = useRef(new Set<string>());
  const [dailyColumnOrder, setDailyColumnOrder] = useState<DailyColumnKey[]>(defaultDailyColumnOrder);
  const [draggedColumn, setDraggedColumn] = useState<DailyColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<DailyColumnKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period: timeMode });
      if (accountId) params.set("accountId", accountId);
      if (timeMode === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      const response = await fetch(`/api/mercado-livre/analytics?${params}`, { cache: "no-store" });
      const rawPayload = await response.json();
      if (!response.ok) throw new Error(rawPayload.error || "Mercado Livre 运营数据加载失败");
      const payload = await loadProfitData(rawPayload as AnalyticsResponse);
      setData(payload);
      if (!accountId && payload.account?.id) setAccountId(payload.account.id);
      setActionDrafts((current) => Object.fromEntries((payload.trend || []).map((row: DailyRow) => [
        row.date,
        dirtyActionDates.current.has(row.date) ? current[row.date] || "" : row.operationAction || "",
      ])));
      if (timeMode === "custom") {
        if (!startDate) setStartDate(payload.startDate);
        if (!endDate) setEndDate(payload.endDate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mercado Livre 运营数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [accountId, endDate, startDate, timeMode]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try {
      const savedOrder = window.localStorage.getItem(DAILY_COLUMN_STORAGE_KEY);
      if (savedOrder) setDailyColumnOrder(normalizeDailyColumnOrder(JSON.parse(savedOrder)));
    } catch {
      window.localStorage.removeItem(DAILY_COLUMN_STORAGE_KEY);
    }
  }, []);

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

  async function syncLatest() {
    setSyncing(true);
    try {
      const requestBody = JSON.stringify({ ...(accountId ? { accountId } : {}), days: 7, visitDays: 90 });
      const [ordersResponse, productsResponse] = await Promise.all([
        fetch("/api/mercado-livre/orders/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        }),
        fetch("/api/mercado-livre/products/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        }),
      ]);
      const advertisingResponse = await fetch("/api/mercado-livre/advertising/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(accountId ? { accountId } : {}), days: 7 }),
      });
      const [orders, products, advertising] = await Promise.all([
        ordersResponse.json(),
        productsResponse.json(),
        advertisingResponse.json(),
      ]);
      if (!ordersResponse.ok) throw new Error(orders.error || "订单同步失败");
      if (!productsResponse.ok) throw new Error(products.error || "商品访问量同步失败");
      if (!advertisingResponse.ok) throw new Error(advertising.error || "广告数据同步失败");
      toast.success("订单、商品、访问量和广告数据已同步");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  }

  async function saveOperationAction(row: DailyRow) {
    if (!data?.account.id) return;
    setSavingActionDate(row.date);
    try {
      const response = await fetch("/api/mercado-livre/analytics/operation-action", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: data.account.id,
          date: row.date,
          operationAction: actionDrafts[row.date] || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "运营动作保存失败");
      dirtyActionDates.current.delete(row.date);
      setData((current) => current ? {
        ...current,
        trend: current.trend.map((item) => item.date === row.date
          ? { ...item, operationAction: payload.operationAction || "" }
          : item),
      } : current);
      setActionDrafts((current) => ({ ...current, [row.date]: payload.operationAction || "" }));
      toast.success(payload.operationAction ? "运营动作已保存" : "运营动作已清空");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "运营动作保存失败");
    } finally {
      setSavingActionDate(null);
    }
  }

  const currency = data?.account.currency || "BRL";
  const trend = data?.trend || [];
  const detailRows = [...trend].sort((left, right) => right.date.localeCompare(left.date));
  const activeMetrics = metrics.filter((metric) => selectedMetrics.includes(metric.key));
  const primaryMetric = activeMetrics[0] || metrics[0];

  return <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
    <div className="w-full min-w-0 max-w-none space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold">Mercado Livre 运营数据</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-400"><Store className="h-4 w-4 text-yellow-400" />{data?.account.nickname || data?.account.userId || "已授权店铺"} · 巴西时间</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={accountId} onChange={(event) => { dirtyActionDates.current.clear(); setActionDrafts({}); setAccountId(event.target.value); setSelectedDate(null); }} className="h-9 min-w-52 rounded border border-slate-700 bg-slate-900 px-3 text-sm">
            {(data?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.nickname || account.userId}</option>)}
          </select>
          <div role="group" aria-label="时间范围" className="inline-flex flex-wrap items-center gap-1">
            {(Object.entries(timeModeLabels) as Array<[TimeMode, string]>).map(([value, label]) => <button key={value} type="button" aria-pressed={timeMode === value} onClick={() => selectTimeMode(value)} className={`h-9 whitespace-nowrap rounded border px-3 text-xs transition-colors ${timeMode === value ? "border-yellow-400 bg-yellow-400 text-slate-950" : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-white"}`}>{label}</button>)}
          </div>
          {timeMode === "custom" && <>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-9 rounded border border-slate-700 bg-slate-900 px-3 text-sm" />
            <span className="text-slate-600">至</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-9 rounded border border-slate-700 bg-slate-900 px-3 text-sm" />
          </>}
          <button type="button" onClick={() => void syncLatest()} disabled={syncing || loading} className="inline-flex h-9 items-center gap-2 rounded bg-yellow-400 px-3 text-sm font-medium text-slate-950 hover:bg-yellow-300 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />同步最新数据</button>
        </div>
      </header>

      {(data?.warnings || []).map((warning) => <div key={warning} className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</div>)}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-9">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const active = selectedMetrics.includes(metric.key);
          return <button type="button" key={metric.key} aria-pressed={active} onClick={() => toggleMetric(metric.key)} className={`rounded border p-4 text-left transition-colors ${active ? "border-yellow-400 bg-slate-800 ring-1 ring-yellow-400/30" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}>
            <div className="flex items-center justify-between text-xs text-slate-400"><span>{metric.label}</span><Icon className="h-4 w-4" style={{ color: metric.color }} /></div>
            <div className="mt-2 text-xl font-semibold text-white">{formatMetric(data?.totals?.[metric.key], metric.format, currency)}</div>
          </button>;
        })}
        <div className="rounded border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-xs text-slate-400"><span>在线刊登</span><PackageSearch className="h-4 w-4 text-yellow-400" /></div><div className="mt-2 text-xl font-semibold">{number(data?.totals.activeListings).toLocaleString("zh-CN")}</div></div>
        <div className="rounded border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-xs text-slate-400"><span>可售库存</span><Boxes className="h-4 w-4 text-cyan-400" /></div><div className="mt-2 text-xl font-semibold">{number(data?.totals.availableStock).toLocaleString("zh-CN")}</div></div>
      </div>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{activeMetrics.length > 1 ? `${activeMetrics.length} 项指标趋势` : `${primaryMetric.label}趋势`}</h2><p className="mt-1 text-xs text-slate-500">{data ? `${data.startDate} 至 ${data.endDate}` : "--"} · {timeModeLabels[timeMode]}</p></div>{selectedDate && <div className="text-sm text-slate-400">已选日期 <b className="ml-1 text-white">{selectedDate}</b></div>}</div>
        <div className="mt-4 h-80">{loading && !trend.length ? <div className="flex h-full items-center justify-center text-sm text-slate-500">正在读取运营数据...</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => String(value).slice(5)} />{activeMetrics.map((metric) => metric.key === primaryMetric.key ? <YAxis key={metric.key} yAxisId={metric.key} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => (metric.format === "money" || metric.format === "nullableMoney" || metric.format === "nullableCnyMoney") ? compact(number(value)) : (metric.format === "percent" || metric.format === "nullablePercent") ? `${(number(value) * 100).toFixed(0)}%` : compact(number(value))} /> : <YAxis key={metric.key} yAxisId={metric.key} hide domain={["auto", "auto"]} />)}<Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 4 }} formatter={(value, name) => { const metric = metrics.find((item) => item.label === name || item.key === name) || primaryMetric; return [formatMetric(value, metric.format, currency), metric.label]; }} labelFormatter={(label) => `日期 ${label}`} /><Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />{activeMetrics.map((metric) => <Line key={metric.key} yAxisId={metric.key} type="monotone" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2.5} connectNulls={false} dot={{ r: 2, fill: metric.color }} activeDot={{ r: 5 }} />)}{selectedDate && <ReferenceLine x={selectedDate} stroke="#f8fafc" strokeDasharray="4 4" />}</LineChart></ResponsiveContainer>}</div>
      </section>

      <section className="overflow-hidden rounded border border-slate-800 bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <div><h2 className="text-sm font-semibold">每日明细</h2><p className="mt-1 text-xs text-slate-500">最新日期优先，变化比例与前一日对比</p></div>
          <div className="flex items-center gap-2"><span className="text-xs text-slate-500">订单同步：{dateTime(data?.account.lastOrderSyncAt)} · 访问量同步：{dateTime(data?.account.lastProductSyncAt)}</span><button type="button" title="恢复默认字段顺序" aria-label="恢复默认字段顺序" onClick={resetDailyColumnOrder} className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 text-slate-400 transition-colors hover:border-yellow-400 hover:text-yellow-300"><RotateCcw className="h-3.5 w-3.5" /></button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[2250px] text-left text-sm">
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
                    className={`select-none whitespace-nowrap px-3 py-3 transition-colors ${draggedColumn === column.key ? "opacity-40" : ""} ${dragOverColumn === column.key && draggedColumn !== column.key ? "bg-yellow-400/10 text-yellow-300" : ""}`}
                  >
                    <span className="inline-flex cursor-grab items-center gap-1.5 active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5 text-slate-600" />{column.label}</span>
                  </th>;
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && !detailRows.length ? <tr><td colSpan={dailyColumnOrder.length + 2} className="px-3 py-14 text-center text-slate-500">正在读取运营数据...</td></tr> : !detailRows.length ? <tr><td colSpan={dailyColumnOrder.length + 2} className="px-3 py-14 text-center text-slate-500">暂无数据</td></tr> : detailRows.map((row) => {
                const active = selectedDate === row.date;
                const draft = actionDrafts[row.date] || "";
                const dirty = draft !== row.operationAction;
                return <tr key={row.date} onClick={() => setSelectedDate(row.date)} className={`cursor-pointer transition-colors ${active ? "bg-yellow-400/5" : "hover:bg-slate-800/40"}`}>
                  <td className="px-3 py-3 font-medium">{row.date}</td>
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-2"><input value={draft} maxLength={1000} onChange={(event) => { dirtyActionDates.current.add(row.date); setActionDrafts((current) => ({ ...current, [row.date]: event.target.value })); }} placeholder="输入当天运营操作信息" className="h-9 min-w-0 flex-1 rounded border border-slate-600 bg-slate-800/70 px-3 text-sm outline-none placeholder:text-slate-500 focus:border-yellow-400" /><button type="button" title="保存运营动作" disabled={!dirty || savingActionDate === row.date} onClick={() => void saveOperationAction(row)} className="grid h-9 w-9 shrink-0 place-items-center rounded border border-slate-600 bg-slate-800 text-slate-400 hover:border-yellow-400 hover:text-yellow-300 disabled:opacity-30"><Save className={`h-4 w-4 ${savingActionDate === row.date ? "animate-pulse" : ""}`} /></button></div></td>
                  {dailyColumnOrder.map((key) => {
                    const column = dailyColumnDefinitions.find((item) => item.key === key)!;
                    if (column.compare === false) return <td key={key} className="whitespace-nowrap px-3 py-3 text-slate-400">{formatMetric(row[key], column.format, currency)}</td>;
                    const previous = row.previousDay?.[key as Exclude<DailyColumnKey, "canceledOrders">];
                    return <DailyMetricCell key={key} current={row[key]} previous={previous}>{formatMetric(row[key], column.format, currency)}</DailyMetricCell>;
                  })}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">商品表现</h2><p className="mt-1 text-xs text-slate-500">按所选日期范围汇总，默认按 GMV 排序</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-400"><tr><th className="px-4 py-3">商品</th><th className="px-3 py-3 text-right">订单</th><th className="px-3 py-3 text-right">件数</th><th className="px-3 py-3 text-right">GMV</th><th className="px-3 py-3 text-right">访问量</th><th className="px-4 py-3 text-right">转化率</th></tr></thead><tbody className="divide-y divide-slate-800">{(data?.productPerformance || []).length ? data?.productPerformance.map((product) => <tr key={product.itemId} className="hover:bg-slate-800/30"><td className="px-4 py-3"><div className="flex items-center gap-3">{product.thumbnail ? <img src={product.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded border border-slate-700 object-cover" /> : <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-slate-700 bg-slate-800"><PackageSearch className="h-4 w-4 text-slate-500" /></div>}<div className="min-w-0"><div className="max-w-xl truncate font-medium text-slate-200" title={product.title}>{product.title}</div><div className="mt-1 font-mono text-xs text-slate-500">{product.itemId}</div></div></div></td><td className="px-3 py-3 text-right">{product.orders}</td><td className="px-3 py-3 text-right">{product.units}</td><td className="px-3 py-3 text-right font-medium">{money(product.gmv, currency)}</td><td className="px-3 py-3 text-right">{product.visits}</td><td className="px-4 py-3 text-right">{formatMetric(product.conversionRate, "percent", currency)}</td></tr>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">暂无商品表现数据</td></tr>}</tbody></table></div>
      </section>

      <div className="flex items-start gap-2 border-t border-slate-800 pt-4 text-xs text-slate-500"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" /><span>{data?.dataAvailability.advertisingReason || "广告报表接口尚未验证，当前面板只展示真实可读取的数据。"}</span></div>
    </div>
  </div>;
}
