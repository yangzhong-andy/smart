"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  GripVertical,
  Megaphone,
  Minus,
  PackageCheck,
  Percent,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  Video,
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
import StoreMarketingNav from "@/components/store-marketing/StoreMarketingNav";

type Shop = {
  shopId: string;
  shopName: string | null;
  region: string;
  sellerType: string | null;
  lastSyncAt: string | null;
};

type ComparableDaily = {
  orders: number;
  salesUnits: number;
  physicalUnits: number;
  gmv: number;
  averageOrderValue: number;
  canceledOrders: number;
  cancelRate: number;
  profitCny?: number | null;
  profitMargin?: number | null;
};

type DailyRow = ComparableDaily & {
  date: string;
  unpaidOrders: number;
  sampleOrders: number;
  operationAction: string;
  adSpend: number | null;
  adCurrency: string | null;
  creatorOrders: number;
  creatorUnits: number;
  creatorGmv: number | null;
  creatorCurrency: string | null;
  previousDay: ComparableDaily | null;
};

type Totals = ComparableDaily & {
  unpaidOrders: number;
  sampleOrders: number;
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

type OfficialPerformance = {
  latestAvailableDate: string | null;
  startDate: string;
  endDate: string;
  gmv: number;
  currency: string;
  grossRevenue: number;
  orders: number;
  skuOrders: number;
  itemsSold: number;
  customers: number;
  refunds: number;
  visitors: number;
  pageViews: number;
  conversionRate: number;
  gmvBreakdowns: Array<{ type: string; amount: number }>;
  video: null | {
    gmv: number;
    currency: string;
    skuOrders: number;
    customers: number;
    productClicks: number;
    productImpressions: number;
    clickThroughRate: number;
  };
  content: null | {
    latestAvailableDate: string | null;
    configuredSelfChannels: number;
    summary: Array<{
      channelType: "SELF" | "CREATOR";
      currency: string;
      channels: number;
      videoCount: number;
      views: number;
      likes: number;
      gmv: number;
      itemsSold: number;
      skuOrders: number;
    }>;
    channels: Array<{
      username: string;
      channelType: "SELF" | "CREATOR";
      currency: string;
      videoCount: number;
      views: number;
      likes: number;
      gmv: number;
      itemsSold: number;
      skuOrders: number;
      productClicks: number;
      productImpressions: number;
      clickThroughRate: number | null;
    }>;
    videos: Array<{
      id: string;
      title: string;
      username: string;
      channelType: "SELF" | "CREATOR";
      postTime: string | number | null;
      duration: number;
      views: number;
      likes: number;
      gmv: number;
      currency: string;
      gpm: number;
      itemsSold: number;
      skuOrders: number;
      customers: number;
      productClicks: number;
      productImpressions: number;
      clickThroughRate: number;
      productName: string;
    }>;
  };
};

type Advertising = {
  available: boolean;
  source: string;
  records: number;
  accounts: Array<{ id: string; accountName: string; currency: string; platform: string }>;
  byCurrency: Array<{ currency: string; spend: number; giftConsumption: number; estimatedRebate: number; records: number }>;
  qianchuanAvailable: boolean;
  qianchuanRecords: number;
  qianchuanByCurrency: Array<{ currency: string; spend: number; attributedOrders: number; attributedRevenue: number; roi: number | null; records: number }>;
  impressions: null;
  clicks: null;
  clickThroughRate: null;
  attributedOrders: number | null;
  attributedRevenue: number | null;
  attributedRevenueCurrency: string | null;
  roi: number | null;
};

type CreatorAttribution = {
  available: boolean;
  source: string;
  latestSyncedAt: string | null;
  orders: number;
  units: number;
  orderContributionRate: number | null;
  gmvContributionRate: number | null;
  byCurrency: Array<{ currency: string; orders: number; creators: number; units: number; gmv: number; settledCommission: number }>;
  ranking: Array<{
    username: string;
    nickname: string | null;
    creatorUserId: string | null;
    collaborationType: string | null;
    currency: string;
    orders: number;
    skuLines: number;
    units: number;
    gmv: number;
    settledCommission: number;
    followerCount: number | null;
    avatarUrl: string | null;
  }>;
};

type AnalyticsResponse = {
  startDate: string;
  endDate: string;
  countryCode: string;
  timeZone: string;
  currency: string;
  trend: DailyRow[];
  totals: Totals;
  today: Omit<DailyRow, "operationAction" | "previousDay">;
  yesterday: Omit<DailyRow, "operationAction" | "previousDay">;
  official: OfficialPerformance | null;
  advertising: Advertising;
  creatorAttribution: CreatorAttribution;
  reconciliation: null | { orderGmv: number; platformGmv: number; difference: number };
  productRanking: Array<{ sku: string; name: string; salesUnits: number; physicalUnits: number; sales: number; image: string | null }>;
  statusDistribution: Array<{ status: string; count: number }>;
  cancelReasons: Array<{ reason: string; count: number }>;
  shop: Shop;
  shops: Shop[];
  dataStatus: { orders: boolean; officialPerformance: boolean; videoPerformance: boolean; videoRanking: boolean; advertising: boolean; creatorAttribution: boolean };
  warnings: string[];
  fetchedAt: string;
};

type MetricKey = "gmv" | "orders" | "salesUnits" | "physicalUnits" | "averageOrderValue" | "cancelRate" | "profitCny" | "profitMargin";
type MetricFormat = "money" | "cnyMoney" | "count" | "percent";
type TimeMode = "today" | "yesterday" | "last7" | "last30" | "all" | "custom";

const STORAGE_KEY = "tiktok-operations-analytics-filters-v1";
const timeModeLabels: Record<TimeMode, string> = {
  today: "今天",
  yesterday: "昨天",
  last7: "过去7天",
  last30: "过去30天",
  all: "全部时间",
  custom: "自定义",
};

const metricDefinitions: Array<{
  key: MetricKey;
  label: string;
  icon: typeof Activity;
  format: MetricFormat;
  color: string;
  increaseIsNegative?: boolean;
}> = [
  { key: "gmv", label: "订单 GMV", icon: BadgeDollarSign, format: "money", color: "#25f4ee" },
  { key: "orders", label: "有效订单", icon: ShoppingBag, format: "count", color: "#60a5fa" },
  { key: "salesUnits", label: "售出件数", icon: Boxes, format: "count", color: "#34d399" },
  { key: "physicalUnits", label: "实际件数", icon: PackageCheck, format: "count", color: "#fbbf24" },
  { key: "averageOrderValue", label: "客单价", icon: CircleDollarSign, format: "money", color: "#a78bfa" },
  { key: "cancelRate", label: "取消率", icon: Percent, format: "percent", color: "#fe2c55", increaseIsNegative: true },
  { key: "profitCny", label: "利润", icon: CircleDollarSign, format: "cnyMoney", color: "#4ade80" },
  { key: "profitMargin", label: "利润率", icon: Percent, format: "percent", color: "#22c55e" },
];

const DAILY_COLUMN_STORAGE_KEY = "tiktok-operations-analytics-daily-column-order-v1";
type DailyColumnKey = "orders" | "salesUnits" | "physicalUnits" | "gmv" | "profitCny" | "profitMargin" | "averageOrderValue" | "canceledOrders" | "cancelRate" | "unpaidOrders" | "sampleOrders" | "adSpend" | "creatorOrders" | "creatorUnits" | "creatorGmv";
const dailyColumnDefinitions: Array<{ key: DailyColumnKey; label: string; format: MetricFormat; group: "销售与订单" | "广告" | "达人归因"; increaseIsNegative?: boolean; compare?: boolean }> = [
  { key: "orders", label: "有效订单", format: "count", group: "销售与订单" },
  { key: "salesUnits", label: "售出件数", format: "count", group: "销售与订单" },
  { key: "physicalUnits", label: "实际件数", format: "count", group: "销售与订单" },
  { key: "gmv", label: "订单 GMV", format: "money", group: "销售与订单" },
  { key: "profitCny", label: "利润（CNY）", format: "cnyMoney", group: "销售与订单" },
  { key: "profitMargin", label: "利润率", format: "percent", group: "销售与订单" },
  { key: "averageOrderValue", label: "客单价", format: "money", group: "销售与订单" },
  { key: "canceledOrders", label: "取消订单", format: "count", group: "销售与订单", increaseIsNegative: true },
  { key: "cancelRate", label: "取消率", format: "percent", group: "销售与订单", increaseIsNegative: true },
  { key: "unpaidOrders", label: "未付款", format: "count", group: "销售与订单", compare: false },
  { key: "sampleOrders", label: "免费样品", format: "count", group: "销售与订单", compare: false },
  { key: "adSpend", label: "广告消耗", format: "money", group: "广告", compare: false },
  { key: "creatorOrders", label: "归因订单", format: "count", group: "达人归因", compare: false },
  { key: "creatorUnits", label: "归因件数", format: "count", group: "达人归因", compare: false },
  { key: "creatorGmv", label: "归因 GMV", format: "money", group: "达人归因", compare: false },
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
  const requiredDates = [analytics.startDate, analytics.endDate, analytics.today.date, analytics.yesterday.date].sort();
  const comparisonStartDate = addIsoDays(requiredDates[0], -1);
  const ranges = splitDateRange(comparisonStartDate, requiredDates[requiredDates.length - 1]);
  const results = await Promise.allSettled(ranges.map(async (range) => {
    const params = new URLSearchParams({
      platform: "TIKTOK",
      shopId: analytics.shop.shopId,
      startDate: range.startDate,
      endDate: range.endDate,
      groupBy: "day",
    });
    const response = await fetch(`/api/profit-report?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json() as ProfitResponse;
    if (!response.ok) throw new Error(payload.error || "TikTok 利润核算数据加载失败");
    if (!Array.isArray(payload.periods)) throw new Error("TikTok 利润核算返回格式异常");
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
    if (!covered) return { profitCny: undefined, profitMargin: undefined, gmvCny: undefined };
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
  const todayProfit = profitForDate(analytics.today.date);
  const yesterdayProfit = profitForDate(analytics.yesterday.date);

  return {
    ...analytics,
    trend,
    today: { ...analytics.today, profitCny: todayProfit.profitCny, profitMargin: todayProfit.profitMargin },
    yesterday: { ...analytics.yesterday, profitCny: yesterdayProfit.profitCny, profitMargin: yesterdayProfit.profitMargin },
    totals: {
      ...analytics.totals,
      profitCny: profitComplete ? profitTotals.profitCny : undefined,
      profitMargin: profitComplete && profitTotals.gmvCny > 0 ? profitTotals.profitCny / profitTotals.gmvCny : profitComplete ? 0 : undefined,
    },
    warnings: [...new Set([
      ...(analytics.warnings || []),
      ...profitWarnings,
      ...(failedRanges > 0 ? [`利润核算有 ${failedRanges} 个日期区间读取失败，未取得的利润显示为 --，请稍后刷新`] : []),
    ])],
  } satisfies AnalyticsResponse;
}

const statusLabels: Record<string, string> = {
  COMPLETED: "已完成",
  DELIVERED: "已送达",
  IN_TRANSIT: "运输中",
  AWAITING_COLLECTION: "待揽收",
  AWAITING_SHIPMENT: "待发货",
  CANCELLED: "已取消",
  UNPAID: "未付款",
  ON_HOLD: "暂停",
  IN_REVIEW: "审核中",
};

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, currency = "BRL") {
  try {
    return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

function compact(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatMetric(value: unknown, format: MetricFormat, currency: string) {
  if ((format === "cnyMoney" || format === "percent") && (value === null || value === undefined || value === "")) return "--";
  const parsed = number(value);
  if (format === "money") return money(parsed, currency);
  if (format === "cnyMoney") return money(parsed, "CNY");
  if (format === "percent") return `${(parsed * 100).toFixed(2)}%`;
  return parsed.toLocaleString("zh-CN");
}

function currencyAmounts<T extends { currency: string }>(rows: T[], key: keyof T) {
  if (!rows.length) return "--";
  return rows.map((row) => money(number(row[key]), row.currency)).join(" · ");
}

function percentOrDash(value: number | null | undefined) {
  return value == null ? "--" : `${(value * 100).toFixed(2)}%`;
}

function channelTypeLabel(value: "SELF" | "CREATOR") {
  return value === "SELF" ? "自营" : "达人/其他";
}

function ChannelBadge({ type }: { type: "SELF" | "CREATOR" }) {
  return <span className={`inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium ${type === "SELF" ? "bg-cyan-500/10 text-cyan-300" : "bg-rose-500/10 text-rose-300"}`}>{channelTypeLabel(type)}</span>;
}

function DailyChange({ current, previous, increaseIsNegative = false }: { current: number | null | undefined; previous: number | null | undefined; increaseIsNegative?: boolean }) {
  const base = "mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium tabular-nums";
  if (previous == null || current == null) return <span className={`${base} text-slate-600`}>--</span>;
  if (previous === 0 && current > 0) {
    return <span title="较前一日" className={`${base} ${increaseIsNegative ? "text-rose-400" : "text-emerald-400"}`}><TrendingUp className="h-3 w-3" />新增</span>;
  }
  const rate = previous === 0 ? 0 : ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(rate) < 0.005) return <span title="较前一日" className={`${base} text-slate-500`}><Minus className="h-3 w-3" />0.00%</span>;
  const increased = rate > 0;
  const positive = increaseIsNegative ? !increased : increased;
  const Icon = increased ? TrendingUp : TrendingDown;
  return <span title="较前一日" className={`${base} ${positive ? "text-emerald-400" : "text-rose-400"}`}><Icon className="h-3 w-3" />{Math.abs(rate).toFixed(2)}%</span>;
}

function DailyMetricCell({ children, current, previous, increaseIsNegative }: { children: ReactNode; current: number | null | undefined; previous: number | null | undefined; increaseIsNegative?: boolean }) {
  return <td className="whitespace-nowrap px-3 py-3"><div className="font-medium text-slate-200">{children}</div><DailyChange current={current} previous={previous} increaseIsNegative={increaseIsNegative} /></td>;
}

function MetricCell({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0 border-b border-r border-slate-800 px-4 py-3 last:border-r-0"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 truncate text-base font-semibold text-slate-100">{value}</div></div>;
}

function ValueCell({ children }: { children: ReactNode }) {
  return <div className="border-b border-r border-slate-800 px-4 py-3 font-medium text-slate-100">{children}</div>;
}

export default function TikTokOperationsAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [shopId, setShopId] = useState("");
  const [country, setCountry] = useState("");
  const [timeMode, setTimeMode] = useState<TimeMode>("last7");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(["gmv"]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});
  const [savingActionDate, setSavingActionDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const dirtyActionDates = useRef(new Set<string>());
  const [dailyColumnOrder, setDailyColumnOrder] = useState<DailyColumnKey[]>(defaultDailyColumnOrder);
  const [draggedColumn, setDraggedColumn] = useState<DailyColumnKey | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<DailyColumnKey | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.shopId) setShopId(String(saved.shopId));
      if (saved?.country) setCountry(String(saved.country));
      if (saved?.timeMode && timeModeLabels[saved.timeMode as TimeMode]) setTimeMode(saved.timeMode as TimeMode);
      if (saved?.startDate) setStartDate(String(saved.startDate));
      if (saved?.endDate) setEndDate(String(saved.endDate));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!initialized) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ shopId, country, timeMode, startDate, endDate }));
  }, [country, endDate, initialized, shopId, startDate, timeMode]);

  const load = useCallback(async () => {
    if (!initialized || (timeMode === "custom" && (!startDate || !endDate))) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ period: timeMode });
      if (shopId) params.set("shopId", shopId);
      if (timeMode === "custom") {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      const response = await fetch(`/api/tiktok/analytics?${params}`, { cache: "no-store" });
      const rawPayload = await response.json();
      if (!response.ok) throw new Error(rawPayload.error || "TikTok 运营数据加载失败");
      const payload = await loadProfitData(rawPayload as AnalyticsResponse);
      setData(payload);
      setShopId(payload.shop.shopId);
      setCountry(payload.shop.region || payload.countryCode);
      setActionDrafts((current) => Object.fromEntries((payload.trend || []).map((row: DailyRow) => [
        row.date,
        dirtyActionDates.current.has(row.date) ? current[row.date] || "" : row.operationAction || "",
      ])));
      if (timeMode === "custom") {
        setStartDate((current) => current || payload.startDate);
        setEndDate((current) => current || payload.endDate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "TikTok 运营数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [endDate, initialized, shopId, startDate, timeMode]);

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
    if (!initialized || !["today", "last7", "last30"].includes(timeMode)) return;
    const timer = window.setInterval(() => { void load(); }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [initialized, load, timeMode]);

  const countries = useMemo(() => [...new Set((data?.shops || []).map((shop) => shop.region).filter(Boolean))], [data?.shops]);
  const filteredShops = useMemo(() => (data?.shops || []).filter((shop) => !country || shop.region === country), [country, data?.shops]);
  const currency = data?.currency || "BRL";
  const trend = data?.trend || [];
  const detailRows = [...trend].sort((left, right) => right.date.localeCompare(left.date));
  const activeMetrics = metricDefinitions.filter((metric) => selectedMetrics.includes(metric.key));
  const primaryMetric = activeMetrics[0] || metricDefinitions[0];

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
      if (current.length >= 4) {
        toast.info("走势图最多同时显示4项指标");
        return current;
      }
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

  async function saveOperationAction(row: DailyRow) {
    if (!data?.shop.shopId) return;
    setSavingActionDate(row.date);
    try {
      const response = await fetch("/api/tiktok/analytics/operation-action", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: data.shop.shopId, date: row.date, operationAction: actionDrafts[row.date] || "" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "运营动作保存失败");
      dirtyActionDates.current.delete(row.date);
      setActionDrafts((current) => ({ ...current, [row.date]: payload.operationAction || "" }));
      setData((current) => current ? {
        ...current,
        trend: current.trend.map((item) => item.date === row.date ? { ...item, operationAction: payload.operationAction || "" } : item),
      } : current);
      toast.success(payload.operationAction ? "运营动作已保存" : "运营动作已清空");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "运营动作保存失败");
    } finally {
      setSavingActionDate(null);
    }
  }

  const official = data?.official;
  const advertising = data?.advertising;
  const creatorAttribution = data?.creatorAttribution;
  const contentPerformance = official?.content;
  const officialRefundRate = official?.gmv ? official.refunds / official.gmv : 0;

  return <div className="min-h-screen bg-[#080b10] p-4 text-slate-100 md:p-6"><div className="w-full min-w-0 max-w-none space-y-5">
    <StoreMarketingNav />

    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded bg-black ring-1 ring-slate-700"><Activity className="h-5 w-5 text-[#25f4ee]" /><span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-[#fe2c55]" /></div>
        <div className="min-w-0"><h1 className="text-xl font-semibold text-white">TikTok 运营数据分析</h1><p className="mt-1 flex items-center gap-2 truncate text-sm text-slate-400"><Store className="h-4 w-4" />{data?.shop.shopName || data?.shop.shopId || "已授权店铺"}{data?.timeZone ? ` · ${data.timeZone}` : ""}</p></div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {countries.length > 1 && <select value={country} onChange={(event) => { const next = event.target.value; const firstShop = data?.shops.find((shop) => shop.region === next); setCountry(next); setShopId(firstShop?.shopId || ""); setSelectedDate(null); }} className="h-9 min-w-28 rounded border border-slate-700 bg-slate-900 px-3 text-sm">{countries.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
        <select value={shopId} onChange={(event) => { const next = event.target.value; const selected = data?.shops.find((shop) => shop.shopId === next); setShopId(next); setCountry(selected?.region || country); setSelectedDate(null); dirtyActionDates.current.clear(); }} className="h-9 min-w-48 rounded border border-slate-700 bg-slate-900 px-3 text-sm">{filteredShops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName || shop.shopId}</option>)}</select>
        <div role="group" aria-label="时间范围" className="inline-flex min-h-9 flex-wrap items-center gap-0.5 rounded border border-slate-700 bg-slate-900 p-0.5 text-xs">{(Object.entries(timeModeLabels) as Array<[TimeMode, string]>).map(([value, label]) => <button key={value} type="button" aria-pressed={timeMode === value} onClick={() => selectTimeMode(value)} className={`h-8 whitespace-nowrap rounded px-3 transition-colors ${timeMode === value ? "bg-[#fe2c55] text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{label}</button>)}</div>
        {timeMode === "custom" && <><input type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setSelectedDate(null); }} className="h-9 rounded border border-slate-700 bg-slate-900 px-3 text-sm" /><span className="text-slate-600">至</span><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setSelectedDate(null); }} className="h-9 rounded border border-slate-700 bg-slate-900 px-3 text-sm" /></>}
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</button>
      </div>
    </header>

    {(data?.warnings || []).length > 0 && <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="space-y-1">{data?.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><h2 className="text-sm font-semibold">今日与昨日</h2><p className="mt-1 text-xs text-slate-500">目的国当地日期</p></div><CalendarDays className="h-4 w-4 text-[#25f4ee]" /></div>
      <div className="grid grid-cols-[100px_repeat(7,minmax(110px,1fr))] overflow-x-auto text-sm">
        <div className="border-b border-r border-slate-800 px-4 py-3 text-xs text-slate-500">日期</div>{["订单 GMV", "有效订单", "售出件数", "实际件数", "客单价", "利润（CNY）", "利润率"].map((label) => <div key={label} className="border-b border-r border-slate-800 px-4 py-3 text-xs text-slate-500">{label}</div>)}
        <div className="border-b border-r border-slate-800 px-4 py-3 font-medium">今日</div><ValueCell>{money(data?.today.gmv || 0, currency)}</ValueCell><ValueCell>{(data?.today.orders || 0).toLocaleString("zh-CN")}</ValueCell><ValueCell>{(data?.today.salesUnits || 0).toLocaleString("zh-CN")}</ValueCell><ValueCell>{(data?.today.physicalUnits || 0).toLocaleString("zh-CN")}</ValueCell><ValueCell>{money(data?.today.averageOrderValue || 0, currency)}</ValueCell><ValueCell>{formatMetric(data?.today.profitCny, "cnyMoney", currency)}</ValueCell><ValueCell>{formatMetric(data?.today.profitMargin, "percent", currency)}</ValueCell>
        <div className="border-r border-t border-slate-800 px-4 py-3 font-medium text-slate-400">昨日</div>{[money(data?.yesterday.gmv || 0, currency), (data?.yesterday.orders || 0).toLocaleString("zh-CN"), (data?.yesterday.salesUnits || 0).toLocaleString("zh-CN"), (data?.yesterday.physicalUnits || 0).toLocaleString("zh-CN"), money(data?.yesterday.averageOrderValue || 0, currency), formatMetric(data?.yesterday.profitCny, "cnyMoney", currency), formatMetric(data?.yesterday.profitMargin, "percent", currency)].map((value, index) => <div key={index} className="border-r border-t border-slate-800 px-4 py-3 text-slate-400">{value}</div>)}
      </div>
    </section>

    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {metricDefinitions.map((metric) => { const Icon = metric.icon; const active = selectedMetrics.includes(metric.key); const value = data?.totals?.[metric.key]; return <button type="button" key={metric.key} aria-pressed={active} onClick={() => toggleMetric(metric.key)} className={`min-h-[108px] rounded border p-4 text-left transition-colors ${active ? "border-[#25f4ee] bg-slate-800 ring-1 ring-[#25f4ee]/30" : "border-slate-800 bg-slate-900/70 hover:border-slate-600"}`}><div className="flex items-center justify-between text-xs text-slate-400"><span>{metric.label}</span><Icon className="h-4 w-4" style={{ color: metric.color }} /></div><div className="mt-3 whitespace-nowrap text-xl font-semibold text-white">{formatMetric(value, metric.format, currency)}</div>{metric.key === "physicalUnits" && <div className="mt-1 text-[11px] text-slate-500">按系统 SKU 组合映射</div>}</button>; })}
    </section>

    <section className="rounded border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">{activeMetrics.length > 1 ? `${activeMetrics.length}项经营指标趋势` : `${primaryMetric.label}趋势`}</h2><p className="mt-1 text-xs text-slate-500">{data ? `${data.startDate} 至 ${data.endDate}` : "--"}</p></div>{selectedDate && <div className="text-sm text-slate-400">已选日期 <span className="ml-1 font-medium text-white">{selectedDate}</span></div>}</div>
      <div className="mt-4 h-80">{loading && !data ? <div className="flex h-full items-center justify-center text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />正在读取运营数据</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 18, left: 8, bottom: 4 }}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => String(value).slice(5)} />{activeMetrics.map((metric) => metric.key === primaryMetric.key ? <YAxis key={metric.key} yAxisId={metric.key} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(value) => (metric.format === "money" || metric.format === "cnyMoney") ? compact(number(value)) : metric.format === "percent" ? `${(number(value) * 100).toFixed(0)}%` : compact(number(value))} /> : <YAxis key={metric.key} yAxisId={metric.key} hide domain={["auto", "auto"]} />)}<Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 4 }} formatter={(value, name) => { const metric = metricDefinitions.find((item) => item.label === name) || primaryMetric; return [formatMetric(value, metric.format, currency), metric.label]; }} labelFormatter={(label) => `日期 ${label}`} /><Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />{activeMetrics.map((metric) => <Line key={metric.key} yAxisId={metric.key} type="monotone" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={2.5} connectNulls={false} dot={{ r: 2, fill: metric.color }} activeDot={{ r: 5 }} />)}{selectedDate && <ReferenceLine x={selectedDate} stroke="#f8fafc" strokeDasharray="4 4" />}</LineChart></ResponsiveContainer>}</div>
    </section>

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3"><div><h2 className="text-sm font-semibold">TikTok 平台经营口径</h2><p className="mt-1 text-xs text-slate-500">{official?.latestAvailableDate ? `平台最新可用日期 ${official.latestAvailableDate}` : "平台数据暂不可用"}</p></div><span className={`rounded-full px-2 py-1 text-[11px] ${official ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>{official ? "已连接" : "未返回"}</span></div>
      {official ? <><div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8"><MetricCell label="平台 GMV" value={money(official.gmv, official.currency)} /><MetricCell label="平台订单" value={official.orders.toLocaleString("zh-CN")} /><MetricCell label="平台销量" value={official.itemsSold.toLocaleString("zh-CN")} /><MetricCell label="客户数" value={official.customers.toLocaleString("zh-CN")} /><MetricCell label="访客数" value={official.visitors.toLocaleString("zh-CN")} /><MetricCell label="页面浏览" value={official.pageViews.toLocaleString("zh-CN")} /><MetricCell label="转化率" value={`${(official.conversionRate * 100).toFixed(2)}%`} /><MetricCell label="退款率" value={`${(officialRefundRate * 100).toFixed(2)}%`} /></div>{data?.reconciliation && <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-800 px-4 py-3 text-xs"><span className="text-slate-500">订单 GMV <b className="ml-1 font-medium text-slate-300">{money(data.reconciliation.orderGmv, currency)}</b></span><span className="text-slate-500">平台 GMV <b className="ml-1 font-medium text-slate-300">{money(data.reconciliation.platformGmv, official.currency)}</b></span><span className={Math.abs(data.reconciliation.difference) < 0.01 ? "text-emerald-400" : "text-amber-300"}>差额 {money(data.reconciliation.difference, official.currency)}</span></div>}</> : <div className="px-4 py-10 text-center text-sm text-slate-500">订单经营数据已正常显示</div>}
    </section>

    {official?.video && <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70"><div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><Video className="h-4 w-4 text-[#fe2c55]" /><h2 className="text-sm font-semibold">视频经营表现</h2></div><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"><MetricCell label="视频 GMV" value={money(official.video.gmv, official.video.currency)} /><MetricCell label="SKU 订单" value={official.video.skuOrders.toLocaleString("zh-CN")} /><MetricCell label="客户数" value={official.video.customers.toLocaleString("zh-CN")} /><MetricCell label="商品曝光" value={official.video.productImpressions.toLocaleString("zh-CN")} /><MetricCell label="商品点击" value={official.video.productClicks.toLocaleString("zh-CN")} /><MetricCell label="点击率" value={`${(official.video.clickThroughRate * 100).toFixed(2)}%`} /></div></section>}

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3"><div className="flex items-start gap-2"><Megaphone className="mt-0.5 h-4 w-4 text-amber-300" /><div><h2 className="text-sm font-semibold">广告表现</h2><p className="mt-1 text-xs text-slate-500">{advertising?.accounts.length ? `已关联 ${advertising.accounts.length} 个广告账户，读取 ${advertising.records} 条消耗记录${advertising.qianchuanAvailable ? ` · 千川 ${advertising.qianchuanRecords} 条日报` : ""}` : "尚未匹配到本店广告账户"}</p></div></div><span className={`rounded-full px-2 py-1 text-[11px] ${advertising?.available ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>{advertising?.available ? "已连接" : "未连接"}</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8"><MetricCell label="广告消耗" value={currencyAmounts(advertising?.byCurrency || [], "spend")} /><MetricCell label="赠款消耗" value={currencyAmounts(advertising?.byCurrency || [], "giftConsumption")} /><MetricCell label="预估返点" value={currencyAmounts(advertising?.byCurrency || [], "estimatedRebate")} /><MetricCell label="广告曝光" value="--" /><MetricCell label="广告点击" value="--" /><MetricCell label="广告 CTR" value="--" /><MetricCell label="广告成交" value={currencyAmounts(advertising?.qianchuanByCurrency || [], "attributedRevenue")} /><MetricCell label="广告 ROI" value={advertising?.roi == null ? "--" : advertising.roi.toFixed(2)} /></div>
      <div className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">广告消耗进入现有广告流水并参与利润核算；千川已提供归因成交与 ROI。当前这组接口没有全账户曝光、点击和 CTR，相关字段继续显示 --。</div>
    </section>

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3"><div className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 text-[#25f4ee]" /><div><h2 className="text-sm font-semibold">达人归因贡献</h2><p className="mt-1 text-xs text-slate-500">{creatorAttribution?.latestSyncedAt ? `联盟订单最近同步 ${new Date(creatorAttribution.latestSyncedAt).toLocaleString("zh-CN")}` : "尚未同步联盟达人订单"}</p></div></div><span className={`rounded-full px-2 py-1 text-[11px] ${creatorAttribution?.available ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>{creatorAttribution?.available ? "已同步" : "无数据"}</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"><MetricCell label="归因订单" value={creatorAttribution?.available ? creatorAttribution.orders.toLocaleString("zh-CN") : "--"} /><MetricCell label="订单贡献率" value={creatorAttribution?.available ? percentOrDash(creatorAttribution.orderContributionRate) : "--"} /><MetricCell label="归因件数" value={creatorAttribution?.available ? creatorAttribution.units.toLocaleString("zh-CN") : "--"} /><MetricCell label="归因 GMV" value={creatorAttribution?.available ? currencyAmounts(creatorAttribution.byCurrency, "gmv") : "--"} /><MetricCell label="GMV 贡献率" value={creatorAttribution?.available ? percentOrDash(creatorAttribution.gmvContributionRate) : "--"} /><MetricCell label="已结算达人佣金" value={creatorAttribution?.available ? currencyAmounts(creatorAttribution.byCurrency, "settledCommission") : "--"} /></div>
    </section>

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3"><div className="flex items-start gap-2"><BarChart3 className="mt-0.5 h-4 w-4 text-[#fe2c55]" /><div><h2 className="text-sm font-semibold">内容渠道贡献</h2><p className="mt-1 text-xs text-slate-500">自营账号按系统渠道配置识别，其余视频归为达人/其他；视频口径不能直接映射到逐笔订单。</p></div></div><span className="text-xs text-slate-500">已配置 {contentPerformance?.configuredSelfChannels || 0} 个自营账号</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-500"><tr><th className="px-4 py-3">内容类型</th><th className="px-4 py-3 text-right">账号数</th><th className="px-4 py-3 text-right">视频数</th><th className="px-4 py-3 text-right">播放</th><th className="px-4 py-3 text-right">内容 GMV</th><th className="px-4 py-3 text-right">GMV 占比</th><th className="px-4 py-3 text-right">SKU 订单</th><th className="px-4 py-3 text-right">售出件数</th></tr></thead><tbody className="divide-y divide-slate-800">{(contentPerformance?.summary || []).map((row) => { const sameCurrencyTotal = (contentPerformance?.summary || []).filter((item) => item.currency === row.currency).reduce((sum, item) => sum + item.gmv, 0); return <tr key={`${row.channelType}-${row.currency}`}><td className="px-4 py-3"><ChannelBadge type={row.channelType} /></td><td className="px-4 py-3 text-right">{row.channels}</td><td className="px-4 py-3 text-right">{row.videoCount}</td><td className="px-4 py-3 text-right">{row.views.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right text-emerald-300">{money(row.gmv, row.currency)}</td><td className="px-4 py-3 text-right">{sameCurrencyTotal > 0 ? `${(row.gmv / sameCurrencyTotal * 100).toFixed(2)}%` : "--"}</td><td className="px-4 py-3 text-right">{row.skuOrders.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right">{row.itemsSold.toLocaleString("zh-CN")}</td></tr>; })}{!contentPerformance?.summary.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">当前时间范围没有返回内容渠道数据</td></tr>}</tbody></table></div>
    </section>

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70"><div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><UserRound className="h-4 w-4 text-[#25f4ee]" /><h2 className="text-sm font-semibold">达人归因排行</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-500"><tr><th className="px-4 py-3">达人</th><th className="px-4 py-3 text-right">订单</th><th className="px-4 py-3 text-right">件数</th><th className="px-4 py-3 text-right">归因 GMV</th><th className="px-4 py-3 text-right">已结算佣金</th></tr></thead><tbody className="divide-y divide-slate-800">{(creatorAttribution?.ranking || []).slice(0, 12).map((row) => <tr key={`${row.username}-${row.currency}`}><td className="px-4 py-3"><div className="font-medium text-slate-200">{row.nickname || row.username}</div><div className="mt-1 text-xs text-slate-500">@{row.username}{row.followerCount != null ? ` · ${row.followerCount.toLocaleString("zh-CN")} 粉丝` : ""}</div></td><td className="px-4 py-3 text-right">{row.orders}</td><td className="px-4 py-3 text-right">{row.units}</td><td className="px-4 py-3 text-right text-emerald-300">{money(row.gmv, row.currency)}</td><td className="px-4 py-3 text-right text-cyan-300">{money(row.settledCommission, row.currency)}</td></tr>)}{!creatorAttribution?.ranking.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">暂无达人归因数据</td></tr>}</tbody></table></div></section>
      <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70"><div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><Users className="h-4 w-4 text-[#fe2c55]" /><h2 className="text-sm font-semibold">渠道账号排行</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-500"><tr><th className="px-4 py-3">账号</th><th className="px-4 py-3 text-right">视频</th><th className="px-4 py-3 text-right">播放</th><th className="px-4 py-3 text-right">内容 GMV</th><th className="px-4 py-3 text-right">SKU 订单</th></tr></thead><tbody className="divide-y divide-slate-800">{(contentPerformance?.channels || []).slice(0, 12).map((row) => <tr key={`${row.channelType}-${row.username}-${row.currency}`}><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="font-medium text-slate-200">@{row.username}</span><ChannelBadge type={row.channelType} /></div></td><td className="px-4 py-3 text-right">{row.videoCount}</td><td className="px-4 py-3 text-right">{row.views.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right text-emerald-300">{money(row.gmv, row.currency)}</td><td className="px-4 py-3 text-right">{row.skuOrders.toLocaleString("zh-CN")}</td></tr>)}{!contentPerformance?.channels.length && <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">暂无渠道账号数据</td></tr>}</tbody></table></div></section>
    </div>

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70"><div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><Play className="h-4 w-4 text-[#fe2c55]" /><h2 className="text-sm font-semibold">视频排行</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-500"><tr><th className="px-4 py-3">视频 / 账号</th><th className="px-4 py-3 text-right">播放</th><th className="px-4 py-3 text-right">点赞</th><th className="px-4 py-3 text-right">商品曝光</th><th className="px-4 py-3 text-right">商品点击</th><th className="px-4 py-3 text-right">点击率</th><th className="px-4 py-3 text-right">内容 GMV</th><th className="px-4 py-3 text-right">SKU 订单</th><th className="px-4 py-3 text-right">售出件数</th></tr></thead><tbody className="divide-y divide-slate-800">{(contentPerformance?.videos || []).slice(0, 20).map((row) => <tr key={row.id}><td className="px-4 py-3"><div className="max-w-[360px] truncate font-medium text-slate-200" title={row.title || row.productName}>{row.title || row.productName || `视频 ${row.id}`}</div><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span>@{row.username || "未识别"}</span><ChannelBadge type={row.channelType} /></div></td><td className="px-4 py-3 text-right">{row.views.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right">{row.likes.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right">{row.productImpressions.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right">{row.productClicks.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right">{`${(row.clickThroughRate * 100).toFixed(2)}%`}</td><td className="px-4 py-3 text-right text-emerald-300">{money(row.gmv, row.currency)}</td><td className="px-4 py-3 text-right">{row.skuOrders.toLocaleString("zh-CN")}</td><td className="px-4 py-3 text-right">{row.itemsSold.toLocaleString("zh-CN")}</td></tr>)}{!contentPerformance?.videos.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">当前时间范围没有返回视频排行</td></tr>}</tbody></table></div></section>

    <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70">
      <div className="border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">每日明细</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[2100px] text-left text-sm"><thead className="bg-slate-800/80 text-xs text-slate-400"><tr><th className="sticky left-0 z-20 w-32 bg-slate-800 px-3 py-3">日期</th><th className="sticky left-32 z-20 min-w-[300px] bg-slate-800 px-3 py-3">运营动作</th>{dailyColumnOrder.map((key) => { const column = dailyColumnDefinitions.find((item) => item.key === key)!; return <th key={column.key} draggable aria-grabbed={draggedColumn === column.key} title="拖拽调整字段顺序" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.key); setDraggedColumn(column.key); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverColumn(column.key); }} onDrop={(event) => { event.preventDefault(); const source = draggedColumn || event.dataTransfer.getData("text/plain") as DailyColumnKey; if (dailyColumnKeys.has(source)) moveDailyColumn(source, column.key); setDraggedColumn(null); setDragOverColumn(null); }} onDragEnd={() => { setDraggedColumn(null); setDragOverColumn(null); }} className={`select-none whitespace-nowrap px-3 py-3 transition-colors ${draggedColumn === column.key ? "opacity-40" : ""} ${dragOverColumn === column.key && draggedColumn !== column.key ? "bg-cyan-400/10 text-cyan-300" : ""}`}><span className="inline-flex cursor-grab items-center gap-1.5 active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5 text-slate-600" />{column.label}</span></th>; })}<th className="sticky right-0 z-20 bg-slate-800 px-2 py-3"><button type="button" title="恢复默认字段顺序" aria-label="恢复默认字段顺序" onClick={resetDailyColumnOrder} className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 text-slate-400 transition-colors hover:border-[#25f4ee] hover:text-[#25f4ee]"><RotateCcw className="h-3.5 w-3.5" /></button></th></tr></thead><tbody className="divide-y divide-slate-800">{loading && detailRows.length === 0 ? <tr><td colSpan={dailyColumnOrder.length + 3} className="px-3 py-14 text-center text-slate-500">正在读取运营数据</td></tr> : detailRows.length === 0 ? <tr><td colSpan={dailyColumnOrder.length + 3} className="px-3 py-14 text-center text-slate-500">暂无数据</td></tr> : detailRows.map((row) => { const active = selectedDate === row.date; const draft = actionDrafts[row.date] || ""; const dirty = draft !== row.operationAction; return <tr key={row.date} onClick={() => setSelectedDate(row.date)} className={`cursor-pointer transition-colors ${active ? "bg-cyan-950/30" : "hover:bg-slate-800/40"}`}><td className={`sticky left-0 z-10 whitespace-nowrap px-3 py-3 font-medium ${active ? "bg-[#0c2630]" : "bg-slate-900"}`}>{row.date}</td><td className={`sticky left-32 z-10 px-3 py-2 ${active ? "bg-[#0c2630]" : "bg-slate-900"}`} onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-2"><input value={draft} maxLength={1000} onChange={(event) => { dirtyActionDates.current.add(row.date); setActionDrafts((current) => ({ ...current, [row.date]: event.target.value })); }} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="运营动作" className="h-9 min-w-0 flex-1 rounded border border-slate-700 bg-slate-800/60 px-3 text-sm outline-none placeholder:text-slate-600 focus:border-[#25f4ee]" /><button type="button" title="保存运营动作" aria-label={`保存 ${row.date} 运营动作`} disabled={!dirty || savingActionDate === row.date} onClick={() => void saveOperationAction(row)} className="grid h-9 w-9 shrink-0 place-items-center rounded border border-slate-700 bg-slate-800 text-slate-400 hover:border-[#25f4ee] hover:text-[#25f4ee] disabled:opacity-30"><Save className={`h-4 w-4 ${savingActionDate === row.date ? "animate-pulse" : ""}`} /></button></div></td>{dailyColumnOrder.map((key) => { const column = dailyColumnDefinitions.find((item) => item.key === key)!; const unavailable = ["creatorOrders", "creatorUnits", "creatorGmv"].includes(key) && !creatorAttribution?.available; const value = row[key]; const previous = row.previousDay?.[key as keyof ComparableDaily] as number | null | undefined; const displayValue = unavailable ? "--" : key === "adSpend" ? (row.adSpend == null || !row.adCurrency ? "--" : money(row.adSpend, row.adCurrency)) : key === "creatorGmv" ? (row.creatorGmv == null || !row.creatorCurrency ? "--" : money(row.creatorGmv, row.creatorCurrency)) : formatMetric(value, column.format, currency); if (column.compare === false || unavailable) return <td key={key} className="whitespace-nowrap px-3 py-3 text-slate-400">{displayValue}</td>; return <DailyMetricCell key={key} current={value as number | null | undefined} previous={previous} increaseIsNegative={column.increaseIsNegative}>{displayValue}</DailyMetricCell>; })}<td className="px-3 py-3" onClick={(event) => event.stopPropagation()}><Link href={`/tiktok/orders?shopId=${encodeURIComponent(data?.shop.shopId || "")}&orderStartDate=${row.date}&orderEndDate=${row.date}`} title={`查看 ${row.date} 订单`} aria-label={`查看 ${row.date} 订单`} className="grid h-8 w-8 place-items-center rounded text-slate-500 hover:bg-slate-800 hover:text-[#25f4ee]"><ExternalLink className="h-4 w-4" /></Link></td></tr>; })}</tbody></table></div>
    </section>

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70"><div className="border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">商品表现</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-500"><tr><th className="px-4 py-3">商品 SKU</th><th className="px-4 py-3 text-right">售出件数</th><th className="px-4 py-3 text-right">实际件数</th><th className="px-4 py-3 text-right">商品销售额</th></tr></thead><tbody className="divide-y divide-slate-800">{(data?.productRanking || []).slice(0, 12).map((product) => <tr key={product.sku}><td className="px-4 py-3"><div className="font-mono text-xs text-slate-200">{product.sku}</div><div className="mt-1 max-w-[520px] truncate text-xs text-slate-500">{product.name}</div></td><td className="px-4 py-3 text-right">{product.salesUnits}</td><td className="px-4 py-3 text-right text-amber-300">{product.physicalUnits}</td><td className="px-4 py-3 text-right text-emerald-300">{money(product.sales, currency)}</td></tr>)}{!data?.productRanking.length && <tr><td colSpan={4} className="px-4 py-12 text-center text-slate-500">暂无商品数据</td></tr>}</tbody></table></div></section>
      <section className="overflow-hidden rounded border border-slate-800 bg-slate-900/70"><div className="border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">订单状态</h2></div><div className="divide-y divide-slate-800">{(data?.statusDistribution || []).map((item) => { const total = data?.statusDistribution.reduce((sum, row) => sum + row.count, 0) || 0; const rate = total > 0 ? item.count / total : 0; return <div key={item.status} className="px-4 py-3"><div className="flex items-center justify-between text-sm"><span className="text-slate-300">{statusLabels[item.status] || item.status}</span><span className="tabular-nums text-slate-400">{item.count} · {(rate * 100).toFixed(1)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-[#25f4ee] to-[#fe2c55]" style={{ width: `${rate * 100}%` }} /></div></div>; })}{!data?.statusDistribution.length && <div className="px-4 py-12 text-center text-sm text-slate-500">暂无状态数据</div>}</div></section>
    </div>
  </div></div>;
}
