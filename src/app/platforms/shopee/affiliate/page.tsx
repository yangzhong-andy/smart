"use client";

import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, RefreshCw, ShieldCheck, Store, Users } from "lucide-react";
import { toast } from "sonner";

type Shop = { shopId: string; shopName: string | null; region: string };
type AffiliateResponse = { enabled: boolean; reason?: string; message?: string; marker?: Record<string, unknown>; shop: Shop; shops: Shop[] };

export default function ShopeeAffiliatePage() {
  const [data, setData] = useState<AffiliateResponse | null>(null); const [shopId, setShopId] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const params = new URLSearchParams(); if (shopId) params.set("shopId", shopId); const response = await fetch(`/api/shopee/affiliate?${params}`); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Shopee 达人权限读取失败"); setData(payload); if (!shopId && payload.shop?.shopId) setShopId(payload.shop.shopId); } catch (error) { toast.error(error instanceof Error ? error.message : "Shopee 达人权限读取失败"); } finally { setLoading(false); } }, [shopId]);
  useEffect(() => { void load(); }, [load]);
  return <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6"><div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4"><div><h1 className="text-xl font-semibold">Shopee 达人合作</h1><p className="mt-1 flex items-center gap-2 text-sm text-slate-400"><Store className="h-4 w-4" />{data?.shop.shopName || data?.shop.shopId || "已授权店铺"}</p></div><div className="flex gap-2"><select value={shopId} onChange={(event) => setShopId(event.target.value)} className="h-9 min-w-48 rounded border border-slate-700 bg-slate-900 px-3 text-sm">{(data?.shops || []).map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName || shop.shopId}</option>)}</select><button onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</button></div></div>
    <div className={`rounded border p-6 ${data?.enabled ? "border-emerald-800 bg-emerald-950/40" : "border-amber-800 bg-amber-950/30"}`}><div className="flex items-start gap-4">{data?.enabled ? <ShieldCheck className="mt-1 h-7 w-7 text-emerald-400" /> : <LockKeyhole className="mt-1 h-7 w-7 text-amber-400" />}<div><div className="text-lg font-semibold">{loading ? "正在检测官方接口权限" : data?.enabled ? "达人联盟接口已开通" : "达人联盟接口尚未开通"}</div><div className="mt-2 text-sm text-slate-300">{data?.enabled ? "Affiliate Marketing Solution Management" : data?.message || "等待 Shopee 开放对应应用权限"}</div>{data?.reason && <div className="mt-3 inline-flex rounded border border-amber-800 bg-slate-950 px-2 py-1 font-mono text-xs text-amber-300">{data.reason}</div>}</div></div></div>
    <div className="grid gap-3 md:grid-cols-3">{[[Users, "达人表现", data?.enabled ? "可用" : "未授权"], [Store, "内容与商品", data?.enabled ? "可用" : "未授权"], [ShieldCheck, "官方权限检测", data ? "已完成" : "检测中"]].map(([Icon, label, value]) => <div key={String(label)} className="rounded border border-slate-800 bg-slate-900 p-4"><Icon className="h-5 w-5 text-orange-400" /><div className="mt-3 text-sm text-slate-400">{String(label)}</div><div className="mt-1 text-lg font-semibold">{String(value)}</div></div>)}</div>
    {data?.enabled && data.marker && <div className="rounded border border-slate-800 bg-slate-900 p-5"><h2 className="text-sm font-semibold">数据更新时间标记</h2><div className="mt-4 grid gap-2 md:grid-cols-2">{Object.entries(data.marker).map(([key, value]) => <div key={key} className="flex justify-between border-b border-slate-800 py-2 text-sm"><span className="font-mono text-slate-500">{key}</span><span>{String(value)}</span></div>)}</div></div>}
  </div></div>;
}
