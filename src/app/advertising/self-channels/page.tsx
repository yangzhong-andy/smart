"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import { BarChart3, Eye, Package, Plus, RefreshCw, ScanSearch, Trash2, Video } from "lucide-react";
import StoreMarketingNav from "@/components/store-marketing/StoreMarketingNav";

type Shop = { shopId: string; shopName: string; region: string | null };
type Channel = { id: string; shopId: string; username: string; remark: string | null };
type Summary = { username: string; remark: string | null; videoCount: number; currency: string; gmv: number; itemsSold: number; skuOrders: number; views: number };
type VideoRow = { id: string; username: string; title: string; postTime: string | null; views: number; likes: number; gmv: number; currency: string; itemsSold: number; skuOrders: number; productClicks: number; clickThroughRate: number; productName: string };
type ConfigResponse = { success: boolean; shops: Shop[]; channels: Channel[] };
type PerformanceResponse = { success: boolean; shop: Shop; channels: Channel[]; summary: Summary[]; videos: VideoRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; latestAvailableDate: string | null; note: string };

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "自营渠道号数据加载失败");
  return body as T;
};

function dayOffset(days: number) { return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }
function quantity(value: number) { return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0); }
function money(value: number, currency: string) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 2 }).format(value || 0); }
function dateTime(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"; }
function percentage(value: number) { return `${(value > 0 && value <= 1 ? value * 100 : value || 0).toFixed(2)}%`; }

export default function SelfChannelsPage() {
  const [shopId, setShopId] = useState("");
  const [startDate, setStartDate] = useState(() => dayOffset(29));
  const [endDate, setEndDate] = useState(today);
  const [page, setPage] = useState(1);
  const [username, setUsername] = useState("");
  const [remark, setRemark] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const { data: config, error: configError, mutate: mutateConfig } = useSWR<ConfigResponse>("/api/tiktok/self-channel-performance?config=true", fetcher, { revalidateOnFocus: false });

  useEffect(() => {
    if (!shopId && config?.shops[0]) setShopId(config.shops[0].shopId);
  }, [config, shopId]);

  const query = useMemo(() => {
    if (!shopId) return null;
    return `/api/tiktok/self-channel-performance?${new URLSearchParams({ shopId, startDate, endDate, page: String(page), pageSize: "30" }).toString()}`;
  }, [endDate, page, shopId, startDate]);
  const { data, error, isLoading, isValidating, mutate } = useSWR<PerformanceResponse>(query, fetcher, { revalidateOnFocus: false });
  const totalGmv = useMemo(() => data?.summary.reduce((sum, row) => sum + row.gmv, 0) || 0, [data?.summary]);
  const currency = data?.summary.find((row) => row.currency)?.currency || "BRL";
  const configuredChannels = (config?.channels || []).filter((channel) => channel.shopId === shopId);

  async function addChannel(event: FormEvent) {
    event.preventDefault();
    if (!shopId || !username.trim()) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/tiktok/self-channel-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, username, remark }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "新增自营账号失败");
      setUsername("");
      setRemark("");
      await Promise.all([mutateConfig(), mutate()]);
    } catch (saveError: any) {
      window.alert(saveError?.message || "新增自营账号失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function discoverChannels() {
    if (!shopId || !startDate || !endDate) return;
    setIsDiscovering(true);
    try {
      const response = await fetch("/api/tiktok/self-channel-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discover", shopId, startDate, endDate }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "扫描自营账号失败");
      window.alert(`扫描到 ${body.discovered || 0} 个账号，新增登记 ${body.imported || 0} 个账号`);
      await Promise.all([mutateConfig(), mutate()]);
    } catch (discoverError: any) {
      window.alert(discoverError?.message || "扫描自营账号失败");
    } finally {
      setIsDiscovering(false);
    }
  }

  async function removeChannel(channel: Channel) {
    if (!window.confirm(`确定删除 @${channel.username} 吗？`)) return;
    const response = await fetch(`/api/tiktok/self-channel-performance?id=${encodeURIComponent(channel.id)}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return window.alert(body?.error || "删除自营账号失败");
    await mutateConfig();
    await mutate();
  }

  return <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 md:px-6">
    <div className="mx-auto max-w-[1800px] space-y-5">
      <StoreMarketingNav />
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Video className="h-6 w-6 text-violet-400" />自营渠道号</h1><p className="mt-1 text-sm text-slate-500">仅统计系统登记的店铺自营 TikTok 账号，数据来自官方视频表现接口。</p></div>
        <button type="button" onClick={() => mutate()} title="刷新" className="icon-button"><RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} /></button>
      </header>

      <section className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-semibold text-slate-200">管理自营 TikTok 账号</h2></div>
        <form onSubmit={addChannel} className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(180px,1fr)_auto_auto] md:items-end">
          <label className="field"><span>店铺</span><select value={shopId} onChange={(event) => { setShopId(event.target.value); setPage(1); }} disabled={!config?.shops.length}><option value="">请选择店铺</option>{(config?.shops || []).map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName}{shop.region ? ` · ${shop.region}` : ""}</option>)}</select></label>
          <label className="field"><span>TikTok 用户名</span><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如 djdjgjfjx 或 @djdjgjfjx" maxLength={100} /></label>
          <label className="field"><span>备注（可选）</span><input value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="例如 店铺自营账号" maxLength={200} /></label>
          <button type="submit" disabled={isSaving || !shopId || !username.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" />{isSaving ? "保存中..." : "登记账号"}</button>
          <button type="button" onClick={discoverChannels} disabled={isDiscovering || !shopId || !startDate || !endDate} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-violet-500/50 px-4 text-sm font-medium text-violet-200 hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"><ScanSearch className="h-4 w-4" />{isDiscovering ? "扫描中..." : "扫描并导入"}</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">{configuredChannels.map((channel) => <div key={channel.id} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><span className="text-slate-200">@{channel.username}</span><span className="text-xs text-slate-500">{channel.remark || "无备注"}</span><button type="button" onClick={() => removeChannel(channel)} title="删除账号" className="ml-1 text-slate-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div>)}{shopId && configuredChannels.length === 0 && <span className="text-xs text-slate-500">该店铺还没有登记自营账号。</span>}</div>
      </section>

      <section className="grid gap-3 border-b border-slate-800 pb-5 sm:grid-cols-3">
        <label className="field"><span>店铺</span><select value={shopId} onChange={(event) => { setShopId(event.target.value); setPage(1); }} disabled={!config?.shops.length}><option value="">请选择店铺</option>{(config?.shops || []).map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName}{shop.region ? ` · ${shop.region}` : ""}</option>)}</select></label>
        <label className="field"><span>开始日期</span><input type="date" value={startDate} max={endDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></label>
        <label className="field"><span>结束日期</span><input type="date" value={endDate} min={startDate} max={today()} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></label>
      </section>

      {(configError || error) && <div className="rounded-md border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{configError?.message || error?.message}</div>}
      {!config?.shops.length && !configError && <div className="rounded-md border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">暂无自营渠道号配置。请先在店铺配置中登记 TikTok 账号后查看数据。</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="自营账号" value={`${data?.summary.length || 0} 个`} icon={Video} /><Metric label="自营视频" value={`${quantity(data?.pagination.total || 0)} 条`} icon={BarChart3} /><Metric label="视频 GMV" value={money(totalGmv, currency)} icon={Package} /><Metric label="视频播放" value={quantity(data?.summary.reduce((sum, row) => sum + row.views, 0) || 0)} icon={Eye} /></section>

      <section className="border-y border-slate-800 py-5"><div className="mb-3"><h2 className="text-sm font-semibold text-slate-200">自营账号表现</h2><p className="mt-1 text-xs text-slate-500">账号维度汇总，不与联盟达人订单归因相加。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr><th>自营账号 / 备注</th><th>视频数</th><th>视频 GMV</th><th>售出商品</th><th>SKU 订单数</th><th>播放量</th></tr></thead><tbody>{(data?.summary || []).map((row) => <tr key={row.username}><td><div className="font-medium text-slate-200">@{row.username}</div><div className="text-xs text-slate-500">{row.remark || "店铺自营渠道号"}</div></td><td>{quantity(row.videoCount)}</td><td className="money text-violet-200">{money(row.gmv, row.currency)}</td><td>{quantity(row.itemsSold)}</td><td>{quantity(row.skuOrders)}</td><td>{quantity(row.views)}</td></tr>)}</tbody></table>{!isLoading && shopId && (data?.summary.length || 0) === 0 && <Empty message="该日期内没有该自营账号的视频表现数据。" />}</div></section>

      <section><div className="mb-3 flex items-end justify-between gap-4"><div><h2 className="text-sm font-semibold text-slate-200">视频表现明细</h2><p className="mt-1 text-xs text-slate-500">{data?.note || "官方视频数据加载中..."}</p></div><div className="text-xs text-slate-500">第 {data?.pagination.page || 1} / {data?.pagination.totalPages || 1} 页</div></div><div className="overflow-x-auto"><table className="w-full min-w-[1300px] text-sm"><thead><tr><th>自营账号</th><th>视频 / 发布时间</th><th>关联商品</th><th>视频 GMV</th><th>售出商品</th><th>SKU 订单数</th><th>播放</th><th>商品点击</th><th>点击率</th></tr></thead><tbody>{(data?.videos || []).map((row) => <tr key={row.id}><td className="font-medium text-slate-200">@{row.username}</td><td><div className="max-w-[360px] truncate text-slate-200" title={row.title}>{row.title || "未提供标题"}</div><div className="mt-1 text-xs text-slate-500">{dateTime(row.postTime)}</div></td><td className="max-w-[240px] truncate text-xs text-slate-400" title={row.productName}>{row.productName || "-"}</td><td className="money text-violet-200">{money(row.gmv, row.currency)}</td><td>{quantity(row.itemsSold)}</td><td>{quantity(row.skuOrders)}</td><td>{quantity(row.views)}</td><td>{quantity(row.productClicks)}</td><td>{percentage(row.clickThroughRate)}</td></tr>)}</tbody></table>{isLoading && <div className="py-16 text-center text-sm text-slate-500">正在读取 TikTok 官方视频数据...</div>}{!isLoading && shopId && (data?.videos.length || 0) === 0 && <Empty message="暂无视频明细" />}</div><div className="mt-4 flex justify-end gap-2"><button className="pager" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><button className="pager" disabled={!data || page >= data.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div></section>
    </div>
    <style jsx>{`.field{font-size:12px;color:#94a3b8}.field span{display:block;margin:0 0 6px}.field input,.field select{height:40px;width:100%;border:1px solid #334155;border-radius:6px;background:#0f172a;padding:0 12px;color:#e2e8f0;font-size:14px;outline:none}.field input:focus,.field select:focus{border-color:#8b5cf6}.icon-button{display:inline-flex;height:40px;width:40px;align-items:center;justify-content:center;border:1px solid #334155;border-radius:6px;color:#cbd5e1}.icon-button:hover,.pager:hover:not(:disabled){background:#1e293b}.pager{height:34px;border:1px solid #334155;border-radius:6px;padding:0 12px;font-size:13px;color:#cbd5e1}.pager:disabled{cursor:not-allowed;opacity:.4}table{border-collapse:collapse}th{border-bottom:1px solid #334155;padding:10px 12px;text-align:left;font-size:12px;font-weight:500;color:#94a3b8}td{border-bottom:1px solid #172033;padding:11px 12px;color:#cbd5e1;vertical-align:middle}tbody tr:hover{background:rgba(30,41,59,.55)}.money{text-align:right;font-variant-numeric:tabular-nums}`}</style>
  </main>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Video }) { return <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-xs text-slate-400"><span>{label}</span><Icon className="h-4 w-4 text-slate-500" /></div><div className="mt-2 text-xl font-semibold tabular-nums text-slate-100">{value}</div></div>; }
function Empty({ message }: { message: string }) { return <div className="py-16 text-center text-sm text-slate-500">{message}</div>; }
