"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, ExternalLink, Trash2, Plus, Key, Store } from "lucide-react";

type Shop = {
  id: string; shopId: string; shopName: string; region: string;
  sellerType: string | null; status: string;
  tokenExpireAt: string | null; lastSyncAt: string | null; isExpired: boolean;
};

type AppConfig = {
  id: string; appKey: string; appName: string | null;
  remark: string | null; status: string; shopCount: number;
};

export default function TikTokSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [shops, setShops] = useState<Shop[]>([]);
  const [apps, setApps] = useState<AppConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [selectedAppKey, setSelectedAppKey] = useState("");
  const [showAddApp, setShowAddApp] = useState(false);
  const [newApp, setNewApp] = useState({ appKey: "", appSecret: "", appName: "", remark: "" });

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const warn = searchParams.get("warn");
    if (success) {
      const count = searchParams.get("shops") || "0";
      toast.success(`授权成功！已连接 ${count} 个店铺`);
      if (warn) toast.warning("店铺信息获取失败，但授权已成功");
      router.replace("/settings/tiktok");
    }
    if (error) {
      toast.error(`授权失败: ${decodeURIComponent(error)}`);
      router.replace("/settings/tiktok");
    }
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusRes, appsRes] = await Promise.all([
        fetch("/api/tiktok/status"),
        fetch("/api/tiktok/apps"),
      ]);
      const statusData = await statusRes.json();
      const appsData = await appsRes.json();
      setShops(statusData.shops || []);
      setApps(appsData.apps || []);
      if (appsData.apps?.length > 0 && !selectedAppKey) {
        setSelectedAppKey(appsData.apps[0].appKey);
      }
    } catch { toast.error("加载失败"); }
    setLoading(false);
  };

  const handleAuthorize = async () => {
    if (!selectedAppKey) { toast.error("请先选择或添加 App"); return; }
    setAuthorizing(true);
    try {
      const res = await fetch(`/api/tiktok/auth?appKey=${selectedAppKey}`);
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error(data.error || "生成授权链接失败");
      }
    } catch { toast.error("请求失败"); }
    setAuthorizing(false);
  };

  const handleAddApp = async () => {
    if (!newApp.appKey || !newApp.appSecret) { toast.error("请填写 App Key 和 Secret"); return; }
    try {
      const res = await fetch("/api/tiktok/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newApp),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("App 添加成功");
        setNewApp({ appKey: "", appSecret: "", appName: "", remark: "" });
        setShowAddApp(false);
        fetchStatus();
      } else {
        toast.error(data.error || "添加失败");
      }
    } catch { toast.error("请求失败"); }
  };

  const handleDeleteApp = async (id: string, appKey: string) => {
    if (!confirm(`确定要删除 App ${appKey} 吗？`)) return;
    try {
      const res = await fetch(`/api/tiktok/apps?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { toast.success("已删除"); fetchStatus(); }
      else { toast.error(data.error || "删除失败"); }
    } catch { toast.error("请求失败"); }
  };

  const handleDisconnect = async (shopId: string) => {
    if (!confirm("确定要断开此店铺的授权吗？")) return;
    try {
      await fetch(`/api/tiktok/status?shopId=${shopId}`, { method: "DELETE" });
      toast.success("已断开授权");
      fetchStatus();
    } catch { toast.error("操作失败"); }
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">TikTok Shop 对接</h1>
        <p className="text-sm text-slate-400 mt-1">管理多个店铺的 App 配置和授权</p>
      </div>

      {/* App 配置管理 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-400" />
            App 配置 ({apps.length})
          </h2>
          <button
            onClick={() => setShowAddApp(!showAddApp)}
            className="flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> 添加 App
          </button>
        </div>

        {/* 添加 App 表单 */}
        {showAddApp && (
          <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">App Key *</label>
                <input
                  value={newApp.appKey}
                  onChange={(e) => setNewApp({ ...newApp, appKey: e.target.value })}
                  placeholder="如: 6koen81dvpr2b"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">App Secret *</label>
                <input
                  type="password"
                  value={newApp.appSecret}
                  onChange={(e) => setNewApp({ ...newApp, appSecret: e.target.value })}
                  placeholder="App Secret"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">应用名称（备注）</label>
                <input
                  value={newApp.appName}
                  onChange={(e) => setNewApp({ ...newApp, appName: e.target.value })}
                  placeholder="如: 店铺B专用App"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">说明</label>
                <input
                  value={newApp.remark}
                  onChange={(e) => setNewApp({ ...newApp, remark: e.target.value })}
                  placeholder="如: 巴西第二家店铺"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddApp} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
                确认添加
              </button>
              <button onClick={() => setShowAddApp(false)} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm text-slate-200">
                取消
              </button>
            </div>
          </div>
        )}

        {/* App 列表 */}
        {apps.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">还没有配置 App，点击「添加 App」开始</p>
        ) : (
          <div className="space-y-2">
            {apps.map((app) => (
              <div key={app.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                <div>
                  <div className="text-slate-200 font-medium text-sm">
                    {app.appName || app.appKey}
                    <span className="ml-2 text-xs text-slate-500 font-mono">{app.appKey}</span>
                  </div>
                  {app.remark && <div className="text-xs text-slate-400 mt-0.5">{app.remark}</div>}
                  <div className="text-xs text-emerald-400 mt-0.5">已绑定 {app.shopCount} 个店铺</div>
                </div>
                <button
                  onClick={() => handleDeleteApp(app.id, app.appKey)}
                  className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3 w-3 inline" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 授权店铺 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Store className="h-5 w-5 text-blue-400" />
          授权店铺
        </h2>

        {/* 选择 App 授权 */}
        {apps.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-slate-400">选择 App:</span>
            <select
              value={selectedAppKey}
              onChange={(e) => setSelectedAppKey(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            >
              {apps.map(a => (
                <option key={a.appKey} value={a.appKey}>{a.appName || a.appKey}</option>
              ))}
            </select>
            <button
              onClick={handleAuthorize}
              disabled={authorizing}
              className="flex items-center gap-2 rounded-lg bg-primary-500 hover:bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {authorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              {authorizing ? "跳转中..." : "授权店铺"}
            </button>
          </div>
        )}

        {/* 店铺列表 */}
        {loading ? (
          <div className="text-center py-8 text-slate-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />加载中...</div>
        ) : shops.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p className="mb-2">还没有授权任何店铺</p>
            <p className="text-xs">选择上方的 App，点击「授权店铺」按钮</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shops.map((shop) => (
              <div key={shop.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/40 p-4">
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${shop.status === "active" && !shop.isExpired ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
                    {shop.status === "active" && !shop.isExpired ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <XCircle className="h-5 w-5 text-rose-400" />}
                  </div>
                  <div>
                    <div className="text-slate-100 font-medium">{shop.shopName}</div>
                    <div className="text-xs text-slate-400">ID: {shop.shopId} · {shop.region}{shop.sellerType && ` · ${shop.sellerType}`}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {shop.status === "active" && !shop.isExpired ? <span className="text-emerald-400">✓ 已连接</span> : <span className="text-rose-400">已断开/过期</span>}
                      {shop.lastSyncAt && ` · 最后同步: ${new Date(shop.lastSyncAt).toLocaleString("zh-CN")}`}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDisconnect(shop.shopId)} className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-500/20">
                  <Trash2 className="h-3.5 w-3.5 inline mr-1" />断开
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 提示 */}
      <div className="rounded-xl border border-blue-800/40 bg-blue-900/10 p-4">
        <h3 className="text-sm font-semibold text-blue-300 mb-2">📌 多店铺接入说明</h3>
        <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
          <li>每个 TikTok 店铺需要创建自己的 Private App（卖家开发者后台）</li>
          <li>在上面「App 配置」中添加每个店铺的 App Key 和 Secret</li>
          <li>选择对应的 App，点击「授权店铺」跳转到 TikTok 授权</li>
          <li>用对应店铺的卖家账号登录并授权</li>
          <li>授权成功后，在订单管理和财务回款页面可切换查看不同店铺</li>
        </ol>
      </div>
    </div>
  );
}
