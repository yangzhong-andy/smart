"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { BarChart3, CircleAlert, Coins, Loader2, RefreshCw, ShoppingBag, Store, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PlatformSkuDetails from "./PlatformSkuDetails";

const fetcher = (url: string) => fetch(url).then(async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "多平台利润汇总加载失败");
  return body;
});

type Amounts = { orders: number; units: number; actualUnits: number; gmvCny: number; costsCny: number; profitCny: number; margin: number; completeOrders: number; partialOrders: number; originalAmounts: Record<string, number> };
type PlatformRow = Amounts & { platform: string; label: string; connected: boolean; coverage: number; status: string };
type ShopRow = Amounts & { platform: string; label: string; shopId: string; shopName: string; region: string };
type ShopPeriodRow = ShopRow & { date: string };
type SummaryData = { summary: Amounts; platforms: PlatformRow[]; shops: ShopRow[]; periods: Array<{ date: string; [key: string]: string | Amounts }>; shopPeriods: ShopPeriodRow[]; filters: { startDate: string; endDate: string; relativeDay?: "today" | "yesterday" | null; dateBasis?: string } };

const PLATFORM_LABELS: Record<string, string> = { TIKTOK: "TikTok Shop", SHOPEE: "Shopee", AMAZON: "Amazon", MERCADO_LIVRE: "Mercado Livre" };
const PLATFORM_DISPLAY_ORDER = ["TIKTOK", "SHOPEE", "MERCADO_LIVRE", "AMAZON"];
const DATE_FILTER_STORAGE_KEY = "platform-profit-summary-date-filter";
const DATE_VALUE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORM_ACCENTS: Record<string, { panel: string; label: string; country: string }> = {
  SHOPEE: {
    panel: "border-orange-500/30 bg-orange-950/20",
    label: "text-orange-300",
    country: "border-orange-500/15",
  },
  TIKTOK: {
    panel: "border-cyan-400/30 bg-cyan-950/20",
    label: "text-cyan-200",
    country: "border-cyan-400/15",
  },
  MERCADO_LIVRE: {
    panel: "border-yellow-400/30 bg-yellow-950/15",
    label: "text-yellow-200",
    country: "border-yellow-400/15",
  },
};

function dateOffset(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 }).format(value || 0);
}

function currencyMoney(value: number, currency: string) {
  const code = String(currency || "CNY").trim().toUpperCase();
  try {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${code} ${(value || 0).toFixed(2)}`;
  }
}

function originalEntries(amounts?: Pick<Amounts, "originalAmounts">) {
  return Object.entries(amounts?.originalAmounts || {})
    .filter(([, value]) => Number(value) > 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

function originalCurrencyLabel(amounts?: Pick<Amounts, "originalAmounts">, fallback = "CNY") {
  const entries = originalEntries(amounts);
  return entries.length === 1 ? entries[0][0] : entries.length > 1 ? "多币种" : fallback;
}

function originalMoney(amounts?: Pick<Amounts, "originalAmounts">, fallback = "CNY") {
  const entries = originalEntries(amounts);
  if (entries.length === 0) return currencyMoney(0, fallback);
  if (entries.length === 1) return currencyMoney(entries[0][1], entries[0][0]);
  return entries.map(([currency, value]) => currencyMoney(value, currency)).join(" · ");
}

function mergeOriginalAmounts(rows: Array<Pick<Amounts, "originalAmounts">>) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    for (const [currency, value] of Object.entries(row.originalAmounts || {})) {
      result[currency] = (result[currency] || 0) + Number(value || 0);
    }
  }
  return result;
}

function comparableGmv(amounts?: Pick<Amounts, "originalAmounts" | "gmvCny">) {
  const entries = originalEntries(amounts);
  return entries.length === 1 ? entries[0][1] : Number(amounts?.gmvCny || 0);
}

function number(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0);
}

function percent(value: number) {
  return `${(value || 0).toFixed(2)}%`;
}

function profitRate(profit: number, gmv: number) {
  return gmv ? percent((profit / gmv) * 100) : "0.00%";
}

function compactAmount(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function ProfitChartTooltip({ active, payload, label }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  return <div className="min-w-40 rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2.5 shadow-xl shadow-black/30 backdrop-blur-sm">
    <div className="mb-2 text-xs font-medium text-slate-300">{label}</div>
    <div className="space-y-1.5">{payload.map((item: any) => <div key={item.dataKey} className="flex items-center justify-between gap-5 text-xs">
      <span className="inline-flex items-center gap-2 text-slate-400"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />{item.name}</span>
      <span className="font-mono font-medium text-slate-100">{money(Number(item.value || 0))}</span>
    </div>)}</div>
  </div>;
}

function changePercent(current: number, previous: number) {
  if (!previous) return current ? "新增" : "0.00%";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}

function PlatformLogo({ platform }: { platform: string }) {
  if (platform === "TIKTOK") {
    const path = "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z";
    return <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true"><path d={path} fill="#25F4EE" transform="translate(-0.65 0.45)" /><path d={path} fill="#FE2C55" transform="translate(0.65 -0.25)" /><path d={path} fill="#F8FAFC" /></svg>;
  }
  if (platform === "MERCADO_LIVRE") {
    return <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-blue-700 ring-1 ring-yellow-200/60" aria-hidden="true"><svg className="h-5 w-6" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25"><ellipse cx="24" cy="24" rx="19.5" ry="12.978" /><path d="M9.704 15.53a20.8 20.8 0 0 0 6.386 1.866 23 23 0 0 0 4.546-.773M38.882 15.614a8.6 8.6 0 0 1-5.165 1.485c-3.335 0-6.225-2.199-9.215-2.199-2.668 0-7.189 4.373-7.189 5.164s1.31 1.26 2.372.74c.621-.303 3.31-2.914 5.484-2.914s9.219 7.136 9.857 7.806c.989 1.038-.926 3.274-2.149 2.05s-3.41-3.162-3.41-3.162M43.4 22.683a24 24 0 0 0-8.547 2.692m-2.273 2.081c.989 1.037-.926 3.273-2.149 2.05s-2.581-2.513-2.581-2.513m2.285 2.222c.988 1.037-.927 3.273-2.15 2.05s-2.025-1.962-2.025-1.962m-1.758 2.013a2.31 2.31 0 0 0 3.648-.186m-3.648.186c.53-.697.49-3.182-2.244-2.688.642-1.219.066-3.146-2.388-2.01a1.69 1.69 0 0 0-3.146-.658 1.455 1.455 0 0 0-2.8-.28c-.544 1.104.296 3.096 2.092 1.976-.182 1.944.84 2.537 2.684 1.78.099 1.91 1.367 1.745 2.273 1.3a1.938 1.938 0 0 0 3.529.58M4.67 22.279a18.3 18.3 0 0 1 9.064 3.214" /></svg></span>;
  }
  if (platform === "SHOPEE") {
    return <svg className="h-5 w-5 shrink-0 text-orange-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.9414 17.9633c.229-1.879-.981-3.077-4.1758-4.0969-1.548-.528-2.277-1.22-2.26-2.1719.065-1.056 1.048-1.825 2.352-1.85a5.2898 5.2898 0 0 1 2.8838.89c.116.072.197.06.263-.039.09-.145.315-.494.39-.62.051-.081.061-.187-.068-.281-.185-.1369-.704-.4149-.983-.5319a6.4697 6.4697 0 0 0-2.5118-.514c-1.909.008-3.4129 1.215-3.5389 2.826-.082 1.1629.494 2.1078 1.73 2.8278.262.152 1.6799.716 2.2438.892 1.774.552 2.695 1.5419 2.478 2.6969-.197 1.047-1.299 1.7239-2.818 1.7439-1.2039-.046-2.2878-.537-3.1278-1.19l-.141-.11c-.104-.08-.218-.075-.287.03-.05.077-.376.547-.458.67-.077.108-.035.168.045.234.35.293.817.613 1.134.775a6.7097 6.7097 0 0 0 2.8289.727 4.9048 4.9048 0 0 0 2.0759-.354c1.095-.465 1.8029-1.394 1.9449-2.554zM11.9986 1.4009c-2.068 0-3.7539 1.95-3.8329 4.3899h7.6657c-.08-2.44-1.765-4.3899-3.8328-4.3899zm7.8516 22.5981-.08.001-15.7843-.002c-1.074-.04-1.863-.91-1.971-1.991l-.01-.195L1.298 6.2858a.459.459 0 0 1 .45-.494h4.9748C6.8448 2.568 9.1607 0 11.9996 0c2.8388 0 5.1537 2.5689 5.2757 5.7898h4.9678a.459.459 0 0 1 .458.483l-.773 15.5883-.007.131c-.094 1.094-.979 1.9769-2.0709 2.0059z" /></svg>;
  }
  return <span className="h-4 w-4 shrink-0 rounded-sm bg-slate-500" aria-hidden="true" />;
}

export default function PlatformProfitSummaryPage() {
  const [platform, setPlatform] = useState("all");
  const [shopId, setShopId] = useState("all");
  const [startDate, setStartDate] = useState(() => dateOffset(29));
  const [endDate, setEndDate] = useState(() => dateOffset(0));
  const [comparisonDate, setComparisonDate] = useState(() => dateOffset(1));
  const [dateMemoryReady, setDateMemoryReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DATE_FILTER_STORAGE_KEY);
      if (saved) {
        const value = JSON.parse(saved) as { startDate?: unknown; endDate?: unknown };
        if (
          typeof value.startDate === "string"
          && typeof value.endDate === "string"
          && DATE_VALUE_RE.test(value.startDate)
          && DATE_VALUE_RE.test(value.endDate)
          && value.startDate <= value.endDate
        ) {
          setStartDate(value.startDate);
          setEndDate(value.endDate);
        }
      }
    } catch {
      // Ignore unavailable or malformed browser storage and retain defaults.
    } finally {
      setDateMemoryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!dateMemoryReady || startDate > endDate) return;
    try {
      window.localStorage.setItem(DATE_FILTER_STORAGE_KEY, JSON.stringify({ startDate, endDate }));
    } catch {
      // The filter remains usable when browser storage is unavailable.
    }
  }, [dateMemoryReady, endDate, startDate]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ platform, startDate, endDate });
    if (shopId !== "all") params.set("shopId", shopId);
    return `/api/platform-profit-summary?${params.toString()}`;
  }, [endDate, platform, shopId, startDate]);
  const { data, error, isLoading, isValidating, mutate } = useSWR<SummaryData>(query, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const todayQuery = useMemo(() => {
    const params = new URLSearchParams({ platform, relativeDay: "today" });
    if (shopId !== "all") params.set("shopId", shopId);
    return `/api/platform-profit-summary?${params.toString()}`;
  }, [platform, shopId]);
  const comparisonQuery = useMemo(() => {
    const params = new URLSearchParams({ platform, startDate: comparisonDate, endDate: comparisonDate });
    if (shopId !== "all") params.set("shopId", shopId);
    return `/api/platform-profit-summary?${params.toString()}`;
  }, [comparisonDate, platform, shopId]);
  const { data: todayData, error: todayError, isLoading: isTodayLoading, isValidating: isTodayValidating, mutate: mutateToday } = useSWR<SummaryData>(todayQuery, fetcher, { revalidateOnFocus: false, keepPreviousData: false });
  const { data: comparisonData, error: comparisonError, isLoading: isComparisonLoading, isValidating: isComparisonValidating, mutate: mutateComparison } = useSWR<SummaryData>(comparisonQuery, fetcher, { revalidateOnFocus: false, keepPreviousData: false });

  const shops = useMemo(() => (data?.shops || []).filter((shop) => platform === "all" || shop.platform === platform), [data?.shops, platform]);
  const chartData = useMemo(() => (data?.periods || []).map((period) => {
    const rows = Object.entries(period).filter(([key]) => key !== "date").map(([, value]) => value as Amounts);
    return { date: period.date.slice(5), GMV: rows.reduce((sum, row) => sum + (row?.gmvCny || 0), 0), 利润: rows.reduce((sum, row) => sum + (row?.profitCny || 0), 0) };
  }), [data?.periods]);
  const todayAmounts = todayData?.summary;
  const comparisonAmounts = comparisonData?.summary;
  const dayCardsLoading = isTodayLoading || isComparisonLoading || isTodayValidating || isComparisonValidating;
  const dailyPlatformLayout = useMemo(() => {
    const datasets = [todayData?.shopPeriods || [], comparisonData?.shopPeriods || []];
    const platforms = new Set(datasets.flatMap((rows) => rows.map((row) => row.platform)));
    return [...platforms]
      .sort((left, right) => {
        const leftIndex = PLATFORM_DISPLAY_ORDER.indexOf(left);
        const rightIndex = PLATFORM_DISPLAY_ORDER.indexOf(right);
        return (leftIndex < 0 ? PLATFORM_DISPLAY_ORDER.length : leftIndex)
          - (rightIndex < 0 ? PLATFORM_DISPLAY_ORDER.length : rightIndex)
          || left.localeCompare(right);
      })
      .map((entryPlatform) => {
        const regions = new Set(datasets.flatMap((rows) => rows
          .filter((row) => row.platform === entryPlatform)
          .map((row) => row.region)));
        return {
          platform: entryPlatform,
          countries: [...regions].sort().map((region) => ({
            region,
            rowCount: Math.max(...datasets.map((rows) => rows.filter((row) => row.platform === entryPlatform && row.region === region).length)),
          })),
        };
      });
  }, [comparisonData?.shopPeriods, todayData?.shopPeriods]);

  if (error) return <div className="min-h-screen bg-slate-950 p-6 text-slate-100"><div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-5"><h1 className="text-lg font-semibold text-rose-200">多平台利润汇总加载失败</h1><p className="mt-2 text-sm text-rose-300">{error.message}</p></div></div>;

  return <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="flex items-center gap-2"><BarChart3 className="h-6 w-6 text-emerald-400" /><h1 className="text-2xl font-semibold">多平台订单利润汇总</h1></div><p className="mt-1 text-sm text-slate-400">按平台、店铺和日期统一查看订单规模、成本与利润覆盖情况</p></div>
      <button type="button" onClick={() => void Promise.all([mutate(), mutateToday(), mutateComparison()])} disabled={isValidating || isTodayValidating || isComparisonValidating} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm text-slate-200 hover:border-emerald-500 disabled:opacity-50"><RefreshCw className={isValidating || isTodayValidating || isComparisonValidating ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</button>
    </header>

    <section className="grid gap-3 rounded-md border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-4">
      <label className="text-xs text-slate-400">平台<select value={platform} onChange={(event) => { setPlatform(event.target.value); setShopId("all"); }} className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"><option value="all">全部平台</option>{Object.entries(PLATFORM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs text-slate-400">店铺<select value={shopId} onChange={(event) => setShopId(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"><option value="all">全部店铺</option>{shops.map((shop) => <option key={`${shop.platform}-${shop.shopId}`} value={shop.shopId}>{shop.shopName} · {shop.label}</option>)}</select></label>
      <label className="text-xs text-slate-400">开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200" /></label>
      <label className="text-xs text-slate-400">结束日期<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200" /></label>
    </section>

    {isLoading && !data ? <div className="flex h-72 items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />正在汇总平台订单利润...</div> : <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="订单数" value={number(data?.summary.orders || 0)} detail={`${number(data?.summary.units || 0)} 销售件 · ${number(data?.summary.actualUnits || 0)} 实际件`} icon={ShoppingBag} />
        <Metric label={`GMV（${originalCurrencyLabel(data?.summary)}）`} value={originalMoney(data?.summary)} detail={`折合人民币 ${money(data?.summary.gmvCny || 0)}`} icon={Coins} />
        <Metric label="已知成本" value={money(data?.summary.costsCny || 0)} detail="平台/履约等已入账成本" icon={Store} />
        <Metric label="贡献利润" value={money(data?.summary.profitCny || 0)} detail={`利润率 ${percent(data?.summary.margin || 0)}`} icon={TrendingUp} tone={(data?.summary.profitCny || 0) >= 0 ? "text-emerald-300" : "text-rose-300"} />
        <Metric label="利润台账覆盖" value={percent(data?.summary.orders ? (data.summary.completeOrders / data.summary.orders) * 100 : 0)} detail={`${number(data?.summary.partialOrders || 0)} 单部分核算`} icon={CircleAlert} tone="text-amber-300" />
      </section>

      <section className="rounded-md border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold">今日与指定日期销售</h2><p className="mt-1 text-xs text-slate-500">每个店铺按目的国当地日期统计，GMV 按订单原币展示，贡献利润以 CNY 展示</p></div>
          {dayCardsLoading && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />更新中</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DailySalesCard label="今日销售" date="按各店铺目的国当地日期" amounts={todayAmounts} shops={todayData?.shopPeriods} platformLayout={dailyPlatformLayout} tone="today" shopId={shopId} loading={isTodayLoading} error={todayError?.message} />
          <DailySalesCard label="指定日期销售" date={`目的国当地日期：${comparisonDate}`} amounts={comparisonAmounts} shops={comparisonData?.shopPeriods} platformLayout={dailyPlatformLayout} tone="comparison" shopId={shopId} selectedDate={comparisonDate} onDateChange={setComparisonDate} loading={isComparisonLoading} error={comparisonError?.message} />
        </div>
        <div className="mt-3 grid gap-3 border-t border-slate-800 pt-3 sm:grid-cols-3">
          <Metric label="销售额变化" value={changePercent(comparableGmv(todayAmounts), comparableGmv(comparisonAmounts))} detail={`今日对比 ${comparisonDate}`} icon={TrendingUp} tone={comparableGmv(todayAmounts) >= comparableGmv(comparisonAmounts) ? "text-emerald-300" : "text-rose-300"} />
          <Metric label="订单量变化" value={changePercent(todayAmounts?.orders || 0, comparisonAmounts?.orders || 0)} detail={`今日对比 ${comparisonDate}`} icon={ShoppingBag} tone={(todayAmounts?.orders || 0) >= (comparisonAmounts?.orders || 0) ? "text-emerald-300" : "text-rose-300"} />
          <Metric label="历史订单" value={number(data?.summary.orders || 0)} detail={`${data?.filters.startDate || startDate} 至 ${data?.filters.endDate || endDate}`} icon={BarChart3} />
        </div>
      </section>

      <section className="rounded-md border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200"><span className="font-medium">口径提示：</span>订单日期均按店铺目的国当地时间计算；订单数排除取消、未付款和达人免费寄样；实际件数按组合 SKU 映射展开；利润数据直接来自对应平台的精细利润核算。</section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-md border border-slate-800 bg-[#0d1726] p-4 shadow-sm shadow-black/20">
          <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-sky-400" /><h2 className="text-sm font-semibold text-slate-100">平台利润对比</h2></div><span className="text-xs text-slate-500">CNY</span></div>
          <div className="h-72">{(data?.platforms || []).some((row) => row.orders > 0) ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.platforms || []} margin={{ top: 4, right: 8, left: -4, bottom: 0 }} barCategoryGap="32%" barGap={6}>
              <CartesianGrid stroke="#243247" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="label" axisLine={{ stroke: "#334155" }} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value) => compactAmount(Number(value))} width={58} />
              <Tooltip cursor={{ fill: "#172033", opacity: 0.7 }} content={<ProfitChartTooltip />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ color: "#94a3b8", fontSize: 12, paddingTop: 12 }} />
              <Bar dataKey="gmvCny" name="GMV" fill="#38bdf8" maxBarSize={54} radius={[3, 3, 0, 0]} />
              <Bar dataKey="profitCny" name="利润" fill="#34d399" maxBarSize={54} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer> : <Empty text="当前日期范围没有订单数据" />}</div>
        </div>
        <div className="rounded-md border border-slate-800 bg-[#0d1726] p-4 shadow-sm shadow-black/20">
          <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /><h2 className="text-sm font-semibold text-slate-100">利润趋势</h2></div><span className="text-xs text-slate-500">按下单日期</span></div>
          <div className="h-72">{chartData.length ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="#243247" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="date" axisLine={{ stroke: "#334155" }} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(value) => compactAmount(Number(value))} width={58} />
              <Tooltip cursor={{ stroke: "#475569", strokeDasharray: "4 4" }} content={<ProfitChartTooltip />} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ color: "#94a3b8", fontSize: 12, paddingTop: 12 }} />
              <Line type="monotone" dataKey="GMV" stroke="#38bdf8" strokeWidth={2.25} dot={false} activeDot={{ r: 4, fill: "#38bdf8", stroke: "#0d1726", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="利润" stroke="#34d399" strokeWidth={2.25} dot={false} activeDot={{ r: 4, fill: "#34d399", stroke: "#0d1726", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer> : <Empty text="当前日期范围没有趋势数据" />}</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">历史订单情况</h2><p className="mt-1 text-xs text-slate-500">按下单日期统计当前筛选范围内的订单、实际件数、销售额和利润</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-400"><tr><th className="px-4 py-3">日期</th><th className="px-4 py-3">国家</th><th className="px-4 py-3">平台</th><th className="px-4 py-3">店铺</th><th className="px-4 py-3 text-right">订单数</th><th className="px-4 py-3 text-right">实际件数</th><th className="px-4 py-3 text-right">GMV</th><th className="px-4 py-3 text-right">贡献利润</th></tr></thead><tbody className="divide-y divide-slate-800">{(data?.shopPeriods || []).length ? (data?.shopPeriods || []).map((row) => <tr key={`${row.date}-${row.platform}-${row.shopId}`} className="hover:bg-slate-800/40"><td className="px-4 py-3 text-slate-300">{row.date}</td><td className="px-4 py-3 text-slate-400">{row.region}</td><td className="px-4 py-3">{row.label}</td><td className="px-4 py-3"><div>{row.shopName}</div><div className="mt-1 text-xs text-slate-500">{row.shopId}</div></td><td className="px-4 py-3 text-right">{number(row.orders)}</td><td className="px-4 py-3 text-right">{number(row.actualUnits)}</td><td className="px-4 py-3 text-right">{money(row.gmvCny)}</td><td className={`px-4 py-3 text-right ${row.profitCny >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(row.profitCny)}</td></tr>) : <tr><td colSpan={8}><Empty text="当前日期范围没有历史订单" /></td></tr>}</tbody></table></div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">平台明细</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-400"><tr><th className="px-4 py-3">平台</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">订单</th><th className="px-4 py-3 text-right">销售件数</th><th className="px-4 py-3 text-right">实际件数</th><th className="px-4 py-3 text-right">GMV</th><th className="px-4 py-3 text-right">已知成本</th><th className="px-4 py-3 text-right">贡献利润</th><th className="px-4 py-3 text-right">覆盖率</th></tr></thead><tbody className="divide-y divide-slate-800">{(data?.platforms || []).map((row) => <tr key={row.platform} className="hover:bg-slate-800/40"><td className="px-4 py-3 font-medium">{row.label}</td><td className="px-4 py-3"><span className={row.status === "完整利润核算" ? "text-emerald-300" : row.status === "部分核算" ? "text-amber-300" : "text-slate-500"}>{row.status}</span></td><td className="px-4 py-3 text-right">{number(row.orders)}</td><td className="px-4 py-3 text-right">{number(row.units)}</td><td className="px-4 py-3 text-right font-medium text-slate-200">{number(row.actualUnits)}</td><td className="px-4 py-3 text-right">{money(row.gmvCny)}</td><td className="px-4 py-3 text-right">{money(row.costsCny)}</td><td className={`px-4 py-3 text-right ${row.profitCny >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(row.profitCny)}</td><td className="px-4 py-3 text-right">{percent(row.coverage)}</td></tr>)}</tbody></table></div></section>

      <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 px-4 py-3"><h2 className="text-sm font-semibold">店铺明细</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-400"><tr><th className="px-4 py-3">平台 / 店铺</th><th className="px-4 py-3">国家</th><th className="px-4 py-3 text-right">订单</th><th className="px-4 py-3 text-right">销售件数</th><th className="px-4 py-3 text-right">实际件数</th><th className="px-4 py-3 text-right">GMV</th><th className="px-4 py-3 text-right">贡献利润</th><th className="px-4 py-3 text-right">利润率</th></tr></thead><tbody className="divide-y divide-slate-800">{shops.length ? shops.map((shop) => <tr key={`${shop.platform}-${shop.shopId}`} className="hover:bg-slate-800/40"><td className="px-4 py-3"><div>{shop.shopName}</div><div className="mt-1 text-xs text-slate-500">{shop.label} · {shop.shopId}</div></td><td className="px-4 py-3 text-slate-400">{shop.region}</td><td className="px-4 py-3 text-right">{number(shop.orders)}</td><td className="px-4 py-3 text-right">{number(shop.units)}</td><td className="px-4 py-3 text-right font-medium text-slate-200">{number(shop.actualUnits)}</td><td className="px-4 py-3 text-right">{money(shop.gmvCny)}</td><td className={`px-4 py-3 text-right ${shop.profitCny >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(shop.profitCny)}</td><td className="px-4 py-3 text-right">{percent(shop.margin)}</td></tr>) : <tr><td colSpan={8}><Empty text="当前筛选没有店铺数据" /></td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}

function DailySalesCard({ label, date, amounts, shops, platformLayout, tone, shopId, selectedDate, onDateChange, loading, error }: { label: string; date: string; amounts?: Amounts; shops?: ShopPeriodRow[]; platformLayout: Array<{ platform: string; countries: Array<{ region: string; rowCount: number }> }>; tone: "today" | "comparison"; shopId: string; selectedDate?: string; onDateChange?: (date: string) => void; loading?: boolean; error?: string }) {
  const accent = tone === "today" ? "border-emerald-500/30 bg-emerald-500/5" : "border-sky-500/30 bg-sky-500/5";
  const platformGroups = new Map<string, ShopPeriodRow[]>();
  for (const shop of shops || []) {
    const rows = platformGroups.get(shop.platform) || [];
    rows.push(shop);
    platformGroups.set(shop.platform, rows);
  }
  return <div className={`rounded-md border p-4 ${accent}`}>
    <div className="relative flex flex-col items-center text-center"><div><div className="text-base font-semibold text-slate-100">{label}</div><div className="mt-1 text-xs font-medium text-slate-500">{date}</div></div>{selectedDate && onDateChange ? <input aria-label="指定历史销售日期" type="date" value={selectedDate} max={dateOffset(0)} onChange={(event) => event.target.value && onDateChange(event.target.value)} className="mt-3 h-9 w-[148px] rounded-md border border-sky-500/30 bg-slate-950 px-2.5 text-xs text-slate-200 outline-none focus:border-sky-400 sm:absolute sm:right-0 sm:top-0 sm:mt-0" /> : <Coins className="absolute right-0 top-0 h-5 w-5 text-slate-400" />}</div>
    {error ? <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div> : loading && !amounts ? <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />正在读取所选日期、店铺的销售数据...</div> : <>
    <div className="mt-3 text-center text-3xl font-bold tabular-nums text-slate-50">{originalMoney(amounts)}</div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-right sm:grid-cols-4"><div><div className="text-sm font-medium text-slate-500">订单</div><div className="mt-1 text-base font-semibold tabular-nums text-slate-100">{number(amounts?.orders || 0)}</div></div><div><div className="text-sm font-medium text-slate-500">销售件数</div><div className="mt-1 text-base font-semibold tabular-nums text-slate-100">{number(amounts?.units || 0)}</div></div><div><div className="text-sm font-medium text-slate-500">实际件数</div><div className="mt-1 text-base font-bold tabular-nums text-slate-50">{number(amounts?.actualUnits || 0)}</div></div><div><div className="text-sm font-medium text-slate-500">贡献利润</div><div className={`mt-1 text-base font-semibold tabular-nums ${(amounts?.profitCny || 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(amounts?.profitCny || 0)}</div><div className="mt-0.5 text-[10px] font-medium tabular-nums text-slate-500">利润率 {profitRate(amounts?.profitCny || 0, amounts?.gmvCny || 0)}</div></div></div>
    <div className="mt-4 space-y-3 border-t border-slate-800/80 pt-3">{platformLayout.length ? platformLayout.map(({ platform, countries }) => {
      const rows = platformGroups.get(platform) || [];
      const platformOrders = rows.reduce((sum, row) => sum + row.orders, 0);
      const platformUnits = rows.reduce((sum, row) => sum + row.units, 0);
      const platformActualUnits = rows.reduce((sum, row) => sum + row.actualUnits, 0);
      const platformGmvCny = rows.reduce((sum, row) => sum + row.gmvCny, 0);
      const platformOriginalAmounts = mergeOriginalAmounts(rows);
      const platformProfit = rows.reduce((sum, row) => sum + row.profitCny, 0);
      const accent = PLATFORM_ACCENTS[platform] || { panel: "border-slate-700 bg-slate-950/35", label: "text-slate-200", country: "border-slate-800/60" };
      return <div key={platform} className="border-b border-slate-800/80 pb-3 last:border-b-0 last:pb-0">
        <PlatformSkuDetails key={`${platform}:${tone}:${selectedDate || "today"}:${shopId}`} platform={platform} platformLabel={rows[0]?.label || PLATFORM_LABELS[platform] || platform} shopId={shopId} date={selectedDate} relativeDay={tone === "today" ? "today" : undefined} expected={{ orders: platformOrders, units: platformUnits, actualUnits: platformActualUnits }} panelClassName={accent.panel}>
          <div className="grid min-w-[720px] grid-cols-[minmax(0,2.5fr)_repeat(4,minmax(0,1fr))] items-center text-[11px]">
            <span className={`inline-flex items-center gap-2 px-2 font-semibold ${accent.label}`}><PlatformLogo platform={platform} />{rows[0]?.label || PLATFORM_LABELS[platform] || platform}</span>
            <div className="px-2 text-right"><div className="text-slate-600">订单</div><div className="mt-0.5 tabular-nums text-slate-300">{number(platformOrders)}</div></div>
            <div className="px-2 text-right"><div className="text-slate-600">实际件数</div><div className="mt-0.5 tabular-nums text-slate-300">{number(platformActualUnits)}</div></div>
            <div className="px-2 text-right"><div className="text-slate-600">GMV</div><div className="mt-0.5 tabular-nums text-slate-300">{originalMoney({ originalAmounts: platformOriginalAmounts })}</div></div>
            <div className={`px-2 text-right ${platformProfit >= 0 ? "text-emerald-300" : "text-rose-300"}`}><div className="text-slate-600">贡献利润</div><div className="mt-0.5 tabular-nums">{money(platformProfit)}</div><div className="mt-0.5 text-[9px] tabular-nums text-slate-500">利润率 {profitRate(platformProfit, platformGmvCny)}</div></div>
          </div>
        </PlatformSkuDetails>
        <div className="space-y-2">{countries.map(({ region, rowCount }) => {
          const countryRows = rows.filter((row) => row.region === region);
          const emptyRows = Math.max(0, rowCount - countryRows.length);
          return <div key={`${platform}-${region}`} className={`rounded-md border bg-slate-950/25 px-3 py-2 ${accent.country}`}>
            <div className="mb-2 flex items-center justify-between gap-3 border-b border-slate-800/70 pb-1.5 text-[11px]"><span className="font-medium text-slate-400">国家：{region}</span><span className="shrink-0 text-slate-600">{countryRows[0]?.date || "暂无订单"}</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] table-fixed text-xs"><colgroup><col className="w-[39%]" /><col className="w-[15.25%]" /><col className="w-[15.25%]" /><col className="w-[15.25%]" /><col className="w-[15.25%]" /></colgroup><thead className="text-slate-600"><tr><th className="px-2 pb-1.5 text-left font-medium">店铺</th><th className="px-2 pb-1.5 text-right font-medium">订单</th><th className="px-2 pb-1.5 text-right font-medium">实际件数</th><th className="px-2 pb-1.5 text-right font-medium">GMV</th><th className="px-2 pb-1.5 text-right font-medium">贡献利润</th></tr></thead><tbody className="divide-y divide-slate-800/70">{countryRows.map((shop) => <tr key={`${shop.platform}-${shop.shopId}`}><td className="truncate px-2 py-1.5 text-slate-300"><div className="truncate">{shop.shopName}</div><div className="mt-0.5 truncate text-[10px] text-slate-600">{shop.shopId}</div></td><td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{number(shop.orders)}</td><td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-200">{number(shop.actualUnits)}</td><td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{originalMoney(shop)}</td><td className={`px-2 py-1.5 text-right tabular-nums ${shop.profitCny >= 0 ? "text-emerald-300" : "text-rose-300"}`}><div>{money(shop.profitCny)}</div><div className="mt-0.5 text-[9px] text-slate-500">利润率 {profitRate(shop.profitCny, shop.gmvCny)}</div></td></tr>)}{Array.from({ length: emptyRows }, (_, index) => <tr key={`empty-${platform}-${region}-${index}`} aria-hidden="true" className="text-transparent"><td className="px-2 py-1.5"><div>&nbsp;</div><div className="mt-0.5 text-[10px]">&nbsp;</div></td><td colSpan={4} className="px-2 py-1.5">&nbsp;</td></tr>)}</tbody></table></div>
          </div>;
        })}</div>
      </div>;
    }) : <div className="py-3 text-center text-xs text-slate-600">暂无订单明细</div>}</div></>}
  </div>;
}

function Metric({ label, value, detail, icon: Icon, tone = "text-slate-100" }: { label: string; value: string; detail: string; icon: typeof ShoppingBag; tone?: string }) {
  return <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-xs text-slate-400"><span>{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div><div className={`mt-2 text-xl font-semibold tabular-nums ${tone}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full min-h-28 items-center justify-center text-sm text-slate-500">{text}</div>;
}
