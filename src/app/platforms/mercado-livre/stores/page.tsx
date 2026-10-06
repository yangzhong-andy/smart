"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Store as StoreIcon, Unplug } from "lucide-react";
import { toast } from "sonner";

type AppConfig = { id: string; appName: string; clientId: string; redirectUri: string; pkceEnabled: boolean; accountCount: number };
type Account = {
  id: string; userId: string; nickname: string | null; siteId: string; country: string; currency: string;
  status: string; tokenExpireAt: string | null; tokenRefreshedAt: string | null; tokenRefreshFailureCount: number; scope: string | null;
  tokenRefreshError: string | null; store: { id: string; name: string; country: string; currency: string } | null;
  app: { appName: string; clientId: string; redirectUri: string };
};

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
}

export default function MercadoLivreStoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [apps, setApps] = useState<AppConfig[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ appName: "", clientId: "", clientSecret: "", redirectUri: "https://www.baxi8.com/api/mercadolivre/oauth/callback", pkceEnabled: false });

  const load = async () => {
    setLoading(true);
    try {
      const [appsResponse, statusResponse] = await Promise.all([fetch("/api/mercado-livre/apps"), fetch("/api/mercado-livre/status")]);
      const appsData = await appsResponse.json();
      const statusData = await statusResponse.json();
      if (!appsResponse.ok) throw new Error(appsData.error || "应用加载失败");
      if (!statusResponse.ok) throw new Error(statusData.error || "账号加载失败");
      setApps(appsData.apps || []);
      setAccounts(statusData.accounts || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success) toast.success(`Mercado Livre 店铺授权成功${searchParams.get("userId") ? `（卖家 ID: ${searchParams.get("userId")}）` : ""}`);
    if (error) toast.error(`Mercado Livre 授权失败：${error}`);
    if (success || error) router.replace("/platforms/mercado-livre/stores");
    void load();
  }, [router, searchParams]);

  const saveApp = async () => {
    if (!form.appName.trim() || !form.clientId.trim() || !form.clientSecret.trim() || !form.redirectUri.trim()) {
      toast.error("请完整填写应用名称、Client ID、Client Secret 和回调地址");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/mercado-livre/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      toast.success("Mercado Livre 应用已保存");
      setForm({ appName: "", clientId: "", clientSecret: "", redirectUri: "https://www.baxi8.com/api/mercadolivre/oauth/callback", pkceEnabled: false });
      setShowForm(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const authorize = async (appId: string) => {
    setAuthorizing(appId);
    try {
      const response = await fetch(`/api/mercado-livre/auth?appId=${encodeURIComponent(appId)}`);
      const data = await response.json();
      if (!response.ok || !data.authUrl) throw new Error(data.error || "无法生成授权链接");
      window.location.assign(data.authUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "授权跳转失败");
      setAuthorizing(null);
    }
  };

  const disconnect = async (id: string) => {
    if (!window.confirm("确定断开该 Mercado Livre 账号授权吗？断开后将停止后续 API 同步。")) return;
    const response = await fetch(`/api/mercado-livre/status?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { toast.error(data.error || "断开失败"); return; }
    toast.success("已断开 Mercado Livre 授权");
    await load();
  };

  const refresh = async (id: string) => {
    setRefreshing(id);
    try {
      const response = await fetch("/api/mercado-livre/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Token 续期失败");
      toast.success("Mercado Livre Token 已续期");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Token 续期失败");
    } finally {
      setRefreshing(null);
    }
  };

  return <div className="min-h-screen space-y-6 bg-slate-950 p-6 text-slate-100">
    <div>
      <h1 className="text-2xl font-semibold">Mercado Livre 店铺与授权</h1>
      <p className="mt-1 text-sm text-slate-400">配置 Mercado Livre 应用后，通过官方 OAuth 授权巴西卖家账号。</p>
    </div>

    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-medium"><KeyRound className="h-5 w-5 text-amber-400" />应用配置</h2>
        <button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm hover:bg-amber-500"><Plus className="h-4 w-4" />添加应用</button>
      </div>
      {showForm && <div className="mt-4 grid gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-4 md:grid-cols-2">
        {(["appName", "clientId", "clientSecret"] as const).map((key) => <label key={key} className="text-sm text-slate-300">{key === "appName" ? "应用名称" : key === "clientId" ? "Client ID" : "Client Secret"}<input type={key === "clientSecret" ? "password" : "text"} value={form[key]} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-amber-400" /></label>)}
        <label className="text-sm text-slate-300 md:col-span-2">OAuth 回调地址<input value={form.redirectUri} onChange={(event) => setForm((value) => ({ ...value, redirectUri: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-amber-400" /><span className="mt-1 block text-xs text-slate-500">需与 Mercado Livre 开发者后台登记的 Redirect URI 完全一致。</span></label>
        <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2"><input type="checkbox" checked={form.pkceEnabled} onChange={(event) => setForm((value) => ({ ...value, pkceEnabled: event.target.checked }))} className="h-4 w-4 accent-amber-500" /><span>应用已在 Mercado Livre 后台启用 PKCE</span></label>
        <div className="flex gap-2 md:col-span-2"><button disabled={saving} onClick={() => void saveApp()} className="rounded-md bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50">{saving ? "保存中..." : "保存配置"}</button><button onClick={() => setShowForm(false)} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300">取消</button></div>
      </div>}
      {apps.length === 0 && !loading ? <p className="py-6 text-center text-sm text-slate-500">尚未配置 Mercado Livre 应用，请先填写开发者后台的 Client ID 和 Client Secret。</p> : <div className="mt-4 space-y-2">{apps.map((app) => <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div><div className="font-medium">{app.appName}</div><div className="text-xs text-slate-400">Client ID: {app.clientId} · 已授权 {app.accountCount} 个账号 · PKCE {app.pkceEnabled ? "已启用" : "未启用"}</div><div className="mt-1 break-all text-xs text-slate-500">回调：{app.redirectUri}</div></div><button onClick={() => void authorize(app.id)} disabled={authorizing === app.id} className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500 disabled:opacity-50">{authorizing === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}授权店铺</button></div>)}</div>}
    </section>

    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="flex items-center gap-2 text-lg font-medium"><StoreIcon className="h-5 w-5 text-blue-400" />已授权账号</h2>{loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : accounts.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">还没有授权 Mercado Livre 账号</p> : <div className="mt-4 space-y-2">{accounts.map((account) => <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4"><div><div className="flex items-center gap-2 font-medium">{account.nickname || `Mercado Livre-${account.userId}`}<CheckCircle2 className={`h-4 w-4 ${account.status === "active" ? "text-emerald-400" : "text-slate-500"}`} /></div><div className="text-xs text-slate-400">卖家 ID: {account.userId} · {account.siteId} · {account.currency} · {account.app.appName}</div>{account.store && <div className="mt-1 text-xs text-slate-500">系统店铺：{account.store.name}</div>}<div className="mt-1 text-xs text-slate-500">Token 有效至：{dateTime(account.tokenExpireAt)} · 最近续期：{dateTime(account.tokenRefreshedAt)}</div><div className="mt-1 text-xs text-slate-500">API 权限：{account.scope || "重新授权后显示"}</div>{account.tokenRefreshFailureCount > 0 && <div className="mt-1 text-xs text-rose-300">续期失败 {account.tokenRefreshFailureCount} 次：{account.tokenRefreshError || "请重新授权"}</div>}</div><div className="flex items-center gap-3"><span className={`text-xs ${account.status === "active" ? "text-emerald-400" : "text-slate-500"}`}>{account.status === "active" ? "已连接" : account.status === "expired" ? "授权已过期" : "已断开"}</span>{account.status === "active" && <button onClick={() => void refresh(account.id)} disabled={refreshing === account.id} className="rounded-md border border-blue-500/40 p-2 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50" title="立即续期 Token">{refreshing === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>} {account.status === "active" && <button onClick={() => void disconnect(account.id)} className="rounded-md border border-rose-500/40 p-2 text-rose-300 hover:bg-rose-500/10" title="断开授权"><Unplug className="h-4 w-4" /></button>}</div></div>)}</div>}</section>
  </div>;
}
