"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Database, Loader2, Megaphone, RefreshCw, Table2 } from "lucide-react";

type AdvertisingRow = {
  id: string;
  date: string;
  advertiserId: string;
  advertiserName: string;
  currency: string;
  cost: number;
  orders: number;
  grossRevenue: number;
  costPerOrder: number;
  roi: number;
  productImpressions: number;
  productClicks: number;
  adConversion: number;
  adConversionRate: number;
  itemNum: number;
  relationName: string | null;
  syncedAt: string;
};

type ApiResponse = {
  data: AdvertisingRow[];
  summary: {
    cost: number;
    orders: number;
    grossRevenue: number;
    productImpressions: number;
    productClicks: number;
    adConversion: number;
  };
};

function dateText(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialDates() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { startDate: dateText(start), endDate: dateText(end) };
}

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function number(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0);
}

export default function YytAdvertisingPage() {
  const initial = useMemo(initialDates, []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [payload, setPayload] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/yyt/advertising?startDate=${startDate}&endDate=${endDate}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "读取 YYT 广告数据失败");
      setPayload(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取 YYT 广告数据失败");
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/yyt/advertising", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(result.errors) && result.errors[0]?.error ? `：${result.errors[0].error}` : "";
        throw new Error((result.error || "同步 YYT 广告数据失败") + detail);
      }
      setNotice(`同步完成：${result.syncedDays} 天、${result.syncedRows} 条广告户日报`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "同步 YYT 广告数据失败");
    } finally {
      setSyncing(false);
    }
  };

  const rows = payload?.data || [];
  const summary = payload?.summary || { cost: 0, orders: 0, grossRevenue: 0, productImpressions: 0, productClicks: 0, adConversion: 0 };
  const currency = rows.find((row) => row.currency)?.currency || "USD";
  const roi = summary.cost > 0 ? summary.grossRevenue / summary.cost : 0;
  const ctr = summary.productImpressions > 0 ? summary.productClicks / summary.productImpressions * 100 : 0;
  const costPerOrder = summary.orders > 0 ? summary.cost / summary.orders : 0;
  const latestSyncAt = rows.reduce<string | null>((latest, row) => !latest || row.syncedAt > latest ? row.syncedAt : latest, null);
  const metrics = [
    { label: "广告消耗", value: money(summary.cost, currency) },
    { label: "广告 GMV", value: money(summary.grossRevenue, currency) },
    { label: "广告订单", value: number(summary.orders) },
    { label: "广告 ROI", value: roi.toFixed(2) },
    { label: "广告曝光", value: number(summary.productImpressions) },
    { label: "广告点击", value: number(summary.productClicks) },
    { label: "广告 CTR", value: `${ctr.toFixed(2)}%` },
    { label: "下单成本", value: money(costPerOrder, currency) },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-6 text-slate-100 sm:px-7 lg:px-9">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-cyan-400">
              <Database className="h-4 w-4" />
              平台中心 / TikTok Shop / YYT广告数据
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">YYT 广告数据</h1>
            <p className="mt-2 text-sm text-slate-400">YYT 广告户真实日报；当前阶段仅同步并保存原始数据。</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">开始日期
              <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200" />
            </label>
            <label className="text-xs text-slate-400">结束日期
              <input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200" />
            </label>
            <button type="button" onClick={() => void sync()} disabled={syncing || loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? "正在同步" : "同步数据"}
            </button>
          </div>
        </header>

        {(error || notice) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>
            {error || notice}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 shadow-sm shadow-black/10">
              <p className="text-xs font-medium text-slate-500">{metric.label}</p>
              <p className="mt-3 truncate text-2xl font-semibold text-slate-100">{loading ? "--" : metric.value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-300"><Table2 className="h-5 w-5" /></div>
              <div>
                <h2 className="font-semibold text-white">广告户日报</h2>
                <p className="mt-1 text-xs text-slate-500">按日期和广告主覆盖更新，不重复累计。</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              {latestSyncAt ? `最近同步：${new Date(latestSyncAt).toLocaleString("zh-CN")}` : "尚未同步"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px] text-left text-sm">
              <thead className="bg-slate-950/60 text-xs text-slate-500">
                <tr>
                  {["日期", "广告主", "消耗", "广告 GMV", "广告订单", "ROI", "曝光", "点击", "CTR", "转化", "转化率", "下单成本", "在投素材"].map((column) => (
                    <th key={column} className="whitespace-nowrap px-4 py-3 font-medium">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {loading ? (
                  <tr><td colSpan={13} className="px-6 py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />正在读取数据</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={13} className="px-6 py-16 text-center text-slate-500"><Megaphone className="mx-auto mb-3 h-8 w-8 text-slate-700" />该时间范围尚无同步数据</td></tr>
                ) : rows.map((row) => {
                  const rowCtr = row.productImpressions > 0 ? row.productClicks / row.productImpressions * 100 : 0;
                  return (
                    <tr key={row.id} className="hover:bg-slate-800/35">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300">{row.date}</td>
                      <td className="max-w-[300px] px-4 py-3"><p className="truncate font-medium text-slate-200" title={row.advertiserName}>{row.advertiserName}</p><p className="mt-0.5 font-mono text-[10px] text-slate-600">{row.advertiserId}</p></td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-cyan-300">{money(row.cost, row.currency)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{money(row.grossRevenue, row.currency)}</td>
                      <td className="px-4 py-3">{number(row.orders)}</td>
                      <td className="px-4 py-3">{row.roi.toFixed(2)}</td>
                      <td className="px-4 py-3">{number(row.productImpressions)}</td>
                      <td className="px-4 py-3">{number(row.productClicks)}</td>
                      <td className="px-4 py-3">{rowCtr.toFixed(2)}%</td>
                      <td className="px-4 py-3">{number(row.adConversion)}</td>
                      <td className="px-4 py-3">{row.adConversionRate.toFixed(2)}%</td>
                      <td className="whitespace-nowrap px-4 py-3">{money(row.costPerOrder, row.currency)}</td>
                      <td className="px-4 py-3">{number(row.itemNum)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
