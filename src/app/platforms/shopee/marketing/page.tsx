"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, CalendarClock, RefreshCw, Search, Store, TicketPercent } from "lucide-react";
import { toast } from "sonner";

type Shop = { shopId: string; shopName: string | null; region: string; currency?: string | null };
type Promotion = Record<string, unknown>;
type MarketingResponse = { discounts: Promotion[]; vouchers: Promotion[]; shop: Shop; shops: Shop[]; fetchedAt: string };
type PromotionState = "active" | "upcoming" | "ended" | "other";

function text(value: unknown) { return value === null || value === undefined || value === "" ? "--" : String(value); }
function epoch(value: unknown) { const seconds = Number(value); return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null; }
function dateTime(value: unknown) { const date = epoch(value); return date ? date.toLocaleString("zh-CN", { hour12: false, timeZone: "America/Sao_Paulo" }) : "--"; }
function promotionState(row: Promotion): PromotionState {
  const raw = String(row.status || "").toUpperCase();
  const now = Date.now(); const start = epoch(row.start_time)?.getTime() || 0; const end = epoch(row.end_time)?.getTime() || 0;
  if (raw.includes("ONGOING") || raw.includes("ACTIVE") || (start <= now && (!end || end >= now))) return "active";
  if (raw.includes("UPCOMING") || raw.includes("SCHEDULED") || start > now) return "upcoming";
  if (raw.includes("ENDED") || raw.includes("EXPIRED") || (end > 0 && end < now)) return "ended";
  return "other";
}
const STATE_LABEL: Record<string, string> = { active: "进行中", upcoming: "待开始", ended: "已结束", other: "其他" };
const STATE_STYLE: Record<string, string> = { active: "border-emerald-700 bg-emerald-950 text-emerald-300", upcoming: "border-amber-700 bg-amber-950 text-amber-300", ended: "border-slate-700 bg-slate-900 text-slate-400", other: "border-slate-700 bg-slate-900 text-slate-300" };

export default function ShopeeMarketingPage() {
  const [data, setData] = useState<MarketingResponse | null>(null);
  const [shopId, setShopId] = useState("");
  const [tab, setTab] = useState<"discounts" | "vouchers">("discounts");
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (shopId) params.set("shopId", shopId);
      const response = await fetch(`/api/shopee/marketing?${params}`);
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Shopee 营销数据加载失败");
      setData(payload); if (!shopId && payload.shop?.shopId) setShopId(payload.shop.shopId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Shopee 营销数据加载失败"); }
    finally { setLoading(false); }
  }, [shopId]);
  useEffect(() => { void load(); }, [load]);

  const source = useMemo(() => data?.[tab] || [], [data, tab]);
  const summary = useMemo(() => source.reduce<Record<PromotionState, number>>((result, row) => { result[promotionState(row)] += 1; return result; }, { active: 0, upcoming: 0, ended: 0, other: 0 }), [source]);
  const rows = useMemo(() => source.filter((row) => {
    const rowStatus = promotionState(row); if (status && rowStatus !== status) return false;
    const haystack = Object.values(row).filter((value) => typeof value === "string" || typeof value === "number").join(" ").toLowerCase();
    return !keyword.trim() || haystack.includes(keyword.trim().toLowerCase());
  }), [keyword, source, status]);

  const cards = [["活动总数", source.length, BadgePercent], ["进行中", summary.active, BadgePercent], ["待开始", summary.upcoming, CalendarClock], ["已结束", summary.ended, TicketPercent]] as const;
  return <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div><h1 className="text-xl font-semibold">Shopee 营销推广</h1><p className="mt-1 text-sm text-slate-400">{data?.shop.shopName || data?.shop.shopId || "已授权店铺"}</p></div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value, Icon]) => <div key={label} className="rounded border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-sm text-slate-400"><span>{label}</span><Icon className="h-4 w-4" /></div><div className="mt-2 text-2xl font-semibold text-white">{value.toLocaleString()}</div></div>)}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-y border-slate-800 py-3">
        <div className="flex rounded border border-slate-700 bg-slate-900 p-1"><button onClick={() => setTab("discounts")} className={`h-8 px-3 text-sm ${tab === "discounts" ? "bg-orange-600 text-white" : "text-slate-400 hover:text-white"}`}>折扣活动</button><button onClick={() => setTab("vouchers")} className={`h-8 px-3 text-sm ${tab === "vouchers" ? "bg-orange-600 text-white" : "text-slate-400 hover:text-white"}`}>优惠券</button></div>
        <label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="名称、编码或活动 ID" className="h-9 w-full rounded border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm outline-none focus:border-orange-500" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部状态</option><option value="active">进行中</option><option value="upcoming">待开始</option><option value="ended">已结束</option><option value="other">其他</option></select>
        <select value={shopId} onChange={(event) => setShopId(event.target.value)} className="h-9 min-w-48 rounded border border-slate-700 bg-slate-900 px-3 text-sm">{(data?.shops || []).map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName || shop.shopId}</option>)}</select>
      </div>
      <div className="overflow-hidden rounded border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-400"><tr><th className="px-4 py-3">活动</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">开始时间</th><th className="px-4 py-3">结束时间</th><th className="px-4 py-3">优惠规则</th><th className="px-4 py-3">使用情况</th></tr></thead>
          <tbody className="divide-y divide-slate-800">{loading ? <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-400">正在读取 Shopee 营销数据...</td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-14 text-center text-slate-500">当前筛选条件下没有活动</td></tr> : rows.map((row, index) => { const rowStatus = promotionState(row); const isVoucher = tab === "vouchers"; return <tr key={String(row.discount_id || row.voucher_id || index)} className="hover:bg-slate-800/40"><td className="px-4 py-3"><div className="flex items-center gap-2 font-medium text-slate-100"><Store className="h-4 w-4 text-orange-400" />{text(row.discount_name || row.voucher_name)}</div><div className="mt-1 font-mono text-xs text-slate-500">{isVoucher ? text(row.voucher_code || row.voucher_id) : text(row.discount_id)}</div></td><td className="px-4 py-3"><span className={`inline-flex rounded border px-2 py-1 text-xs ${STATE_STYLE[rowStatus]}`}>{STATE_LABEL[rowStatus]}</span></td><td className="whitespace-nowrap px-4 py-3 text-slate-300">{dateTime(row.start_time)}</td><td className="whitespace-nowrap px-4 py-3 text-slate-300">{dateTime(row.end_time)}</td><td className="px-4 py-3 text-slate-300">{isVoucher ? `${text(row.reward_type)} · ${text(row.discount_amount)}` : text(row.source)}</td><td className="px-4 py-3 text-slate-300">{isVoucher ? `${Number(row.current_usage || 0).toLocaleString()} / ${Number(row.usage_quantity || 0).toLocaleString()}` : "--"}</td></tr>; })}</tbody></table></div>
      </div>
    </div>
  </div>;
}
