"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Download,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ProfitGroupBy,
  ProfitMetricRow,
  ProfitReportResponse,
  ProfitSkuRow,
} from "@/lib/profit-report-types";

type DetailTab = "period" | "store" | "sku" | "coverage";

const fetcher = async (url: string): Promise<ProfitReportResponse> => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "利润报表加载失败");
  return body;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `¥${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 10_000) return `¥${(value / 10_000).toFixed(1)}w`;
  return `¥${Math.round(value).toLocaleString("zh-CN")}`;
}

function percent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

function coverageTone(value: number) {
  if (value >= 95) return "text-emerald-300";
  if (value >= 70) return "text-amber-300";
  return "text-rose-300";
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "text-slate-100",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-slate-500" />
      </div>
      <div className={`mt-2 truncate text-xl font-semibold tabular-nums ${tone}`} title={value}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

function CoverageBar({ label, value, detail }: { label: string; value: number; detail: string }) {
  const safeValue = Math.max(0, Math.min(value, 100));
  const barColor = safeValue >= 95 ? "bg-emerald-500" : safeValue >= 70 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="grid gap-2 border-b border-slate-800 py-3 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)_90px] md:items-center">
      <div>
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <div className="mt-0.5 text-xs text-slate-500">{detail}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${barColor}`} style={{ width: `${safeValue}%` }} />
      </div>
      <div className={`text-right text-sm font-semibold tabular-nums ${coverageTone(value)}`}>{percent(value)}</div>
    </div>
  );
}

function MetricCells({ row }: { row: ProfitMetricRow }) {
  return (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{money(row.gmvCny)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{money(row.platformCostCny)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{money(row.productCostCny)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{money(row.logisticsCostCny)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{money(row.netAdCostCny)}</td>
      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${row.contributionProfitCny >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
        {money(row.contributionProfitCny)}
      </td>
      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${row.margin >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{percent(row.margin)}</td>
    </>
  );
}

export default function ProfitPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startDate, setStartDate] = useState(() => addDays(new Date().toISOString().slice(0, 10), -29));
  const [endDate, setEndDate] = useState(today);
  const [groupBy, setGroupBy] = useState<ProfitGroupBy>("day");
  const [shopId, setShopId] = useState("all");
  const [tab, setTab] = useState<DetailTab>("period");
  const [skuSearch, setSkuSearch] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ startDate, endDate, groupBy });
    if (shopId !== "all") params.set("shopId", shopId);
    return `/api/profit-report?${params.toString()}`;
  }, [startDate, endDate, groupBy, shopId]);
  const { data, error, isLoading, isValidating, mutate } = useSWR<ProfitReportResponse>(query, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const filteredSkus = useMemo(() => {
    const keyword = skuSearch.trim().toLowerCase();
    if (!keyword) return data?.skus || [];
    return (data?.skus || []).filter((sku) =>
      [sku.sellerSku, sku.internalSku, sku.productName, sku.storeName].some((value) => value?.toLowerCase().includes(keyword)),
    );
  }, [data?.skus, skuSearch]);

  const costRows = useMemo(() => {
    if (!data) return [];
    return [
      { label: "平台及履约费", value: data.summary.platformCostCny, color: "bg-sky-500" },
      { label: "采购成本", value: data.summary.productCostCny, color: "bg-amber-500" },
      { label: "物流分摊", value: data.summary.logisticsCostCny, color: "bg-cyan-500" },
      { label: "广告净消耗", value: data.summary.netAdCostCny, color: "bg-rose-500" },
    ];
  }, [data]);

  const setPreset = (days: number) => {
    setEndDate(today);
    setStartDate(addDays(today, 1 - days));
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = tab === "store" ? data.stores : tab === "sku" ? filteredSkus : data.periods;
    const headers = tab === "store"
      ? ["店铺", "订单", "销量", "GMV(CNY)", "平台费", "采购成本", "物流成本", "广告净消耗", "贡献利润", "利润率"]
      : tab === "sku"
        ? ["店铺", "Seller SKU", "内部SKU", "商品", "销量", "GMV(CNY)", "平台费", "采购成本", "物流成本", "广告分摊", "贡献利润", "利润率"]
        : ["周期", "订单", "取消", "销量", "GMV(CNY)", "平台费", "采购成本", "物流成本", "广告净消耗", "贡献利润", "利润率"];
    const values = rows.map((row: any) => tab === "store"
      ? [row.label, row.orderCount, row.units, row.gmvCny, row.platformCostCny, row.productCostCny, row.logisticsCostCny, row.netAdCostCny, row.contributionProfitCny, row.margin]
      : tab === "sku"
        ? [row.storeName, row.sellerSku, row.internalSku || "", row.productName, row.units, row.gmvCny, row.platformCostCny, row.productCostCny, row.logisticsCostCny, row.netAdCostCny, row.contributionProfitCny, row.margin]
        : [row.label, row.orderCount, row.cancelledOrders, row.units, row.gmvCny, row.platformCostCny, row.productCostCny, row.logisticsCostCny, row.netAdCostCny, row.contributionProfitCny, row.margin]);
    const csv = [headers, ...values].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `利润核算_${startDate}_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">精细利润核算</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>CNY 核算</span>
            {data?.generatedAt && <span>更新 {new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isValidating}
            title="刷新报表"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || tab === "coverage"}
            title="导出当前明细"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid gap-4 border-b border-slate-800 py-5 xl:grid-cols-[auto_auto_1fr_auto] xl:items-end">
        <div>
          <label className="mb-1.5 block text-xs text-slate-500">报表周期</label>
          <div className="inline-flex h-9 rounded-md border border-slate-700 bg-slate-900 p-0.5">
            {(["day", "week", "month"] as ProfitGroupBy[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGroupBy(value)}
                className={`min-w-16 rounded px-3 text-sm ${groupBy === value ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {value === "day" ? "日报" : value === "week" ? "周报" : "月报"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-slate-500">快捷范围</label>
          <div className="flex h-9 items-center gap-1">
            {[7, 30, 90].map((days) => (
              <button key={days} type="button" onClick={() => setPreset(days)} className="h-9 rounded-md border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800">
                {days} 天
              </button>
            ))}
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-xs text-slate-500">
            <span className="mb-1.5 block">开始日期</span>
            <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-emerald-500" />
          </label>
          <label className="min-w-0 text-xs text-slate-500">
            <span className="mb-1.5 block">结束日期</span>
            <input type="date" value={endDate} min={startDate} max={today} onChange={(event) => setEndDate(event.target.value)} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-emerald-500" />
          </label>
          <label className="min-w-0 text-xs text-slate-500">
            <span className="mb-1.5 block">店铺</span>
            <select value={shopId} onChange={(event) => setShopId(event.target.value)} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-emerald-500">
              <option value="all">全部店铺</option>
              {(data?.shops || []).map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex h-9 items-center gap-2 text-xs text-slate-500">
          <CalendarDays className="h-4 w-4" />
          <span>{startDate} 至 {endDate}</span>
        </div>
      </section>

      {error && (
        <div className="mt-5 flex items-center gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}

      {isLoading && !data ? (
        <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />正在核算利润数据...
        </div>
      ) : data ? (
        <>
          {data.warnings.length > 0 && (
            <div className="mt-5 flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-amber-100">
                {data.warnings.map((warning) => <span key={warning}>{warning}</span>)}
              </div>
            </div>
          )}

          <section className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="订单 GMV" value={money(data.summary.gmvCny)} detail={`${data.summary.orderCount.toLocaleString()} 单 / ${data.summary.units.toLocaleString()} 件`} icon={ShoppingCart} />
            <MetricCard label="预估贡献利润" value={money(data.summary.contributionProfitCny)} detail={`利润率 ${percent(data.summary.margin)}`} icon={data.summary.contributionProfitCny >= 0 ? TrendingUp : TrendingDown} tone={data.summary.contributionProfitCny >= 0 ? "text-emerald-300" : "text-rose-300"} />
            <MetricCard label="平台及履约费" value={money(data.summary.platformCostCny)} detail={`逐单覆盖 ${percent(data.coverage.orderSettlement)}`} icon={WalletCards} />
            <MetricCard label="采购 + 物流" value={money(data.summary.productCostCny + data.summary.logisticsCostCny)} detail={`采购 ${percent(data.coverage.productCost)} / 物流 ${percent(data.coverage.logisticsCost)}`} icon={PackageCheck} />
            <MetricCard label="广告净消耗" value={money(data.summary.netAdCostCny)} detail={`消耗 ${money(data.summary.adSpendCny)} / 返点 ${money(data.summary.rebateCny)}`} icon={BarChart3} />
            <MetricCard label="核算完整度" value={percent(data.coverage.score)} detail={`${data.coverage.mappedSkuCount}/${data.coverage.totalSkuCount} 个 SKU 已映射`} icon={PackageCheck} tone={coverageTone(data.coverage.score)} />
          </section>

          <section className="grid gap-6 border-y border-slate-800 py-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
            <div className="min-w-0">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-200">利润趋势</h2>
                <span className="text-xs text-slate-500">GMV / 贡献利润</span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.periods} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactMoney} width={64} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 6 }} formatter={(value: any, name: any) => [money(Number(value) || 0), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="gmvCny" name="GMV" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={38} />
                    <Line type="monotone" dataKey="contributionProfitCny" name="贡献利润" stroke="#34d399" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="min-w-0 xl:border-l xl:border-slate-800 xl:pl-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">成本结构</h2>
              <div className="space-y-4">
                {costRows.map((item) => {
                  const ratio = data.summary.gmvCny > 0 ? (item.value / data.summary.gmvCny) * 100 : 0;
                  return (
                    <div key={item.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-300">{item.label}</span>
                        <span className="tabular-nums text-slate-200">{money(item.value)} <span className="ml-1 text-xs text-slate-500">{percent(ratio)}</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full ${item.color}`} style={{ width: `${Math.min(Math.max(ratio, 0), 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="pt-5">
            <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-max gap-1 overflow-x-auto">
                {([
                  ["period", groupBy === "day" ? "日报明细" : groupBy === "week" ? "周报明细" : "月报明细"],
                  ["store", "店铺利润"],
                  ["sku", "SKU 利润"],
                  ["coverage", "数据完整度"],
                ] as Array<[DetailTab, string]>).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setTab(value)} className={`h-9 rounded-md px-3 text-sm ${tab === value ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {tab === "sku" && (
                <label className="relative block w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} placeholder="搜索 SKU、商品或店铺" className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-500" />
                </label>
              )}
            </div>

            {tab === "period" && (
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr className="border-b border-slate-800">
                      <th className="px-3 py-3 text-left font-medium">周期</th>
                      <th className="px-3 py-3 text-right font-medium">订单 / 销量</th>
                      <th className="px-3 py-3 text-right font-medium">GMV</th>
                      <th className="px-3 py-3 text-right font-medium">平台及履约</th>
                      <th className="px-3 py-3 text-right font-medium">采购成本</th>
                      <th className="px-3 py-3 text-right font-medium">物流分摊</th>
                      <th className="px-3 py-3 text-right font-medium">广告净消耗</th>
                      <th className="px-3 py-3 text-right font-medium">贡献利润</th>
                      <th className="px-3 py-3 text-right font-medium">利润率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.periods.map((row) => (
                      <tr key={row.id} className="border-b border-slate-900 hover:bg-slate-900/60">
                        <td className="px-3 py-2.5 text-slate-200"><div>{row.label}</div><div className="text-xs text-slate-600">取消 {row.cancelledOrders}</div></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{row.orderCount.toLocaleString()} / {row.units.toLocaleString()}</td>
                        <MetricCells row={row} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "store" && (
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="text-xs text-slate-500"><tr className="border-b border-slate-800">
                    <th className="px-3 py-3 text-left font-medium">店铺</th><th className="px-3 py-3 text-right font-medium">订单 / 销量</th><th className="px-3 py-3 text-right font-medium">GMV</th><th className="px-3 py-3 text-right font-medium">平台及履约</th><th className="px-3 py-3 text-right font-medium">采购成本</th><th className="px-3 py-3 text-right font-medium">物流分摊</th><th className="px-3 py-3 text-right font-medium">广告净消耗</th><th className="px-3 py-3 text-right font-medium">贡献利润</th><th className="px-3 py-3 text-right font-medium">利润率</th>
                  </tr></thead>
                  <tbody>{data.stores.map((row) => <tr key={row.shopId} className="border-b border-slate-900 hover:bg-slate-900/60"><td className="px-3 py-2.5"><div className="font-medium text-slate-200">{row.label}</div><div className="text-xs text-slate-600">{row.currency}</div></td><td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{row.orderCount.toLocaleString()} / {row.units.toLocaleString()}</td><MetricCells row={row} /></tr>)}</tbody>
                </table>
              </div>
            )}

            {tab === "sku" && (
              <div className="overflow-x-auto">
                <table className="min-w-[1240px] w-full text-sm">
                  <thead className="text-xs text-slate-500"><tr className="border-b border-slate-800">
                    <th className="px-3 py-3 text-left font-medium">SKU / 商品</th><th className="px-3 py-3 text-left font-medium">店铺</th><th className="px-3 py-3 text-right font-medium">销量</th><th className="px-3 py-3 text-right font-medium">GMV</th><th className="px-3 py-3 text-right font-medium">平台及履约</th><th className="px-3 py-3 text-right font-medium">采购成本</th><th className="px-3 py-3 text-right font-medium">物流分摊</th><th className="px-3 py-3 text-right font-medium">广告分摊</th><th className="px-3 py-3 text-right font-medium">贡献利润</th><th className="px-3 py-3 text-right font-medium">利润率</th>
                  </tr></thead>
                  <tbody>{filteredSkus.map((row: ProfitSkuRow) => <tr key={row.id} className="border-b border-slate-900 hover:bg-slate-900/60">
                    <td className="max-w-[300px] px-3 py-2.5"><div className="flex items-center gap-2"><span className="font-medium text-slate-200">{row.sellerSku}</span><span className={`rounded px-1.5 py-0.5 text-[11px] ${row.mappingStatus === "unmapped" ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`}>{row.mappingStatus === "unmapped" ? "待映射" : "已映射"}</span></div><div className="mt-0.5 truncate text-xs text-slate-500" title={row.productName}>{row.productName}</div>{row.internalSku && <div className="text-[11px] text-slate-600">内部 {row.internalSku}</div>}</td>
                    <td className="px-3 py-2.5 text-slate-400">{row.storeName}</td><td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{row.units.toLocaleString()}</td><MetricCells row={row} />
                  </tr>)}</tbody>
                </table>
                {filteredSkus.length === 0 && <div className="py-12 text-center text-sm text-slate-500">没有匹配的 SKU</div>}
              </div>
            )}

            {tab === "coverage" && (
              <div className="grid gap-6 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div>
                  <CoverageBar label="采购成本覆盖" value={data.coverage.productCost} detail={`${data.coverage.missingCostSkuCount} 个 SKU 待补成本`} />
                  <CoverageBar label="物流成本覆盖" value={data.coverage.logisticsCost} detail={`${data.coverage.missingLogisticsSkuCount} 个 SKU 待分摊`} />
                  <CoverageBar label="逐单结算覆盖" value={data.coverage.orderSettlement} detail={`${data.coverage.exactSettlementOrders.toLocaleString()} / ${data.coverage.validOrders.toLocaleString()} 单`} />
                  <CoverageBar label="广告店铺覆盖" value={data.coverage.adStore} detail="按广告消耗金额计算" />
                </div>
                <div className="border-t border-slate-800 pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
                  <h3 className="text-sm font-semibold text-slate-200">本次核算汇率</h3>
                  <div className="mt-3 divide-y divide-slate-800">
                    {Object.entries(data.rates).map(([currency, rate]) => (
                      <div key={currency} className="flex items-center justify-between py-2.5 text-sm"><span className="text-slate-400">1 {currency}</span><span className="tabular-nums text-slate-200">{rate.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} CNY</span></div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
