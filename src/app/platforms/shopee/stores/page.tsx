"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Store as StoreIcon, Unplug } from "lucide-react";
import { toast } from "sonner";

type AppConfig = { id: string; appName: string; partnerId: string; environment: string; shopCount: number };
type Shop = { id: string; shopId: string; shopName: string | null; region: string; currency: string | null; status: string; tokenExpireAt: string | null; tokenRefreshedAt: string | null; tokenRefreshFailedAt: string | null; tokenRefreshFailureCount: number; tokenRefreshError: string | null; store: { id: string; name: string; country: string; currency: string } | null; app: { appName: string; partnerId: string; environment: string } };

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
}

export default function ShopeeStoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apps, setApps] = useState<AppConfig[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ appName: "", partnerId: "", partnerKey: "", environment: "sandbox" });

  const load = async () => {
    setLoading(true);
    try {
      const [appsRes, shopsRes] = await Promise.all([fetch("/api/shopee/apps"), fetch("/api/shopee/status")]);
      const appsData = await appsRes.json(); const shopsData = await shopsRes.json();
      if (!appsRes.ok) throw new Error(appsData.error || "应用加载失败");
      setApps(appsData.apps || []); setShops(shopsData.shops || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "加载失败"); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success) toast.success(`Shopee 店铺授权成功${searchParams.get("shopId") ? `（Shop ID: ${searchParams.get("shopId")}）` : ""}`);
    if (error) toast.error(`Shopee 授权失败：${error}`);
    if (success || error) router.replace("/platforms/shopee/stores");
    void load();
  }, [router, searchParams]);

  const saveApp = async () => {
    if (!form.appName.trim() || !form.partnerId.trim() || !form.partnerKey.trim()) { toast.error("请完整填写应用名称、Partner ID 和 Partner Key"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/shopee/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "保存失败");
      toast.success("Shopee App 已保存"); setForm({ appName: "", partnerId: "", partnerKey: "", environment: "sandbox" }); setShowForm(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const authorize = async (appId: string) => {
    setAuthorizing(appId);
    try {
      const res = await fetch(`/api/shopee/auth?appId=${encodeURIComponent(appId)}`); const data = await res.json();
      if (!res.ok || !data.authUrl) throw new Error(data.error || "无法生成授权链接");
      window.location.assign(data.authUrl);
    } catch (error) { toast.error(error instanceof Error ? error.message : "授权跳转失败"); setAuthorizing(null); }
  };

  const disconnect = async (shopId: string) => {
    if (!window.confirm("确定断开该 Shopee 店铺授权吗？断开后将停止同步数据。")) return;
    const res = await fetch(`/api/shopee/status?shopId=${encodeURIComponent(shopId)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "断开失败"); return; }
    toast.success("已断开 Shopee 店铺授权"); await load();
  };

  const refreshToken = async (shopId: string) => {
    setRefreshing(shopId);
    try {
      const res = await fetch("/api/shopee/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Token 续期失败");
      toast.success("Shopee Token 已续期");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Token 续期失败"); }
    finally { setRefreshing(null); }
  };

  return <div className="min-h-screen space-y-6 bg-slate-950 p-6 text-slate-100">
    <div><h1 className="text-2xl font-semibold">Shopee 店铺与授权</h1><p className="mt-1 text-sm text-slate-400">配置 Open Platform App，并授权巴西 Shopee 店铺。</p></div>
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-medium"><KeyRound className="h-5 w-5 text-amber-400" />Shopee App 配置</h2><button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm hover:bg-amber-500"><Plus className="h-4 w-4" />添加 App</button></div>
      {showForm && <div className="mt-4 grid gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4 md:grid-cols-2">
        {([['appName','应用名称'],['partnerId','Partner ID'],['partnerKey','Partner Key']] as const).map(([key,label]) => <label key={key} className="text-sm text-slate-300">{label}<input type={key === 'partnerKey' ? 'password' : 'text'} value={form[key]} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-amber-400" /></label>)}
        <label className="text-sm text-slate-300">环境<select value={form.environment} onChange={(e) => setForm((v) => ({ ...v, environment: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"><option value="sandbox">Sandbox 测试</option><option value="live">Live 正式</option></select></label>
        <div className="md:col-span-2 flex gap-2"><button disabled={saving} onClick={() => void saveApp()} className="rounded-md bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50">{saving ? "保存中..." : "保存配置"}</button><button onClick={() => setShowForm(false)} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300">取消</button></div>
      </div>}
      {apps.length === 0 && !loading ? <p className="py-6 text-center text-sm text-slate-500">尚未配置 Shopee App，请先添加 Partner ID 和 Partner Key。</p> : <div className="mt-4 space-y-2">{apps.map((app) => <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div><div className="font-medium">{app.appName}</div><div className="text-xs text-slate-400">Partner ID: {app.partnerId} · {app.environment === 'live' ? '正式环境' : 'Sandbox'} · 已授权 {app.shopCount} 个店铺</div></div><button onClick={() => void authorize(app.id)} disabled={authorizing === app.id} className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500 disabled:opacity-50">{authorizing === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}授权店铺</button></div>)}</div>}
    </div>
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="flex items-center gap-2 text-lg font-medium"><StoreIcon className="h-5 w-5 text-blue-400" />已授权店铺</h2>{loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : shops.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">还没有授权店铺</p> : <div className="mt-4 space-y-2">{shops.map((shop) => <div key={shop.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4"><div><div className="flex items-center gap-2 font-medium">{shop.shopName || `Shopee-${shop.shopId}`}<CheckCircle2 className={`h-4 w-4 ${shop.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}`} /></div><div className="text-xs text-slate-400">Shop ID: {shop.shopId} · {shop.region} · {shop.currency || 'BRL'} · {shop.app.appName}</div>{shop.store && <div className="mt-1 text-xs text-slate-500">系统店铺：{shop.store.name}</div>}<div className="mt-1 text-xs text-slate-500">Token 有效至：{formatDateTime(shop.tokenExpireAt)} · 最近续期：{formatDateTime(shop.tokenRefreshedAt)}</div>{shop.tokenRefreshFailureCount > 0 && <div className="mt-1 text-xs text-rose-300">续期失败 {shop.tokenRefreshFailureCount} 次：{shop.tokenRefreshError || "请重新授权"}</div>}</div><div className="flex items-center gap-3"><span className={`text-xs ${shop.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}`}>{shop.status === 'active' ? '已连接' : shop.status === 'expired' ? '授权已过期' : '已断开'}</span>{shop.status === 'active' && <button onClick={() => void refreshToken(shop.shopId)} disabled={refreshing === shop.shopId} className="rounded-md border border-blue-500/40 p-2 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50" title="立即续期 Token">{refreshing === shop.shopId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>}{shop.status === 'active' && <button onClick={() => void disconnect(shop.shopId)} className="rounded-md border border-rose-500/40 p-2 text-rose-300 hover:bg-rose-500/10" title="断开授权"><Unplug className="h-4 w-4" /></button>}</div></div>)}</div>}</div>
  </div>;
}
