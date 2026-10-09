"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type App = { id: string; appKey: string; appName: string };
type Shop = { id: string; merchantId: string; shopName: string; appId: string; status: string; tokenExpireAt: string; refreshExpireAt: string; lastReadAt: string | null };
type RecordRow = { externalId: string; payload: any; fetchedAt: string };
const CALLBACK = "https://www.baxi8.com/api/kwai/oauth/callback";
const classes = "rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 disabled:opacity-40";
const money = (n: number | null | undefined) => n == null ? "未提供" : `R$ ${(n / 100).toFixed(2)}`;
const date = (s: string | null) => s ? new Date(s).toLocaleString("zh-CN", { hour12: false }) : "尚未读取";
const statusNames: Record<number,string> = { 10: "未支付", 101: "待上传发票", 102: "待安排发货", 200: "待揽收", 210: "已打包待揽收", 30: "已发货", 40: "已收货", 50: "已完成", 60: "已关闭" };
async function json(url: string, body?: unknown) {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "操作失败");
  return data;
}
export default function KwaiPage() {
  const [apps, setApps] = useState<App[]>([]), [shops, setShops] = useState<Shop[]>([]);
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [secure, setSecure] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ appName: "Kwai 巴西店铺", appKey: "", appSecret: "", signSecret: "" });
  const [shopId, setShopId] = useState(""), [kind, setKind] = useState("orders");
  const [rows, setRows] = useState<RecordRow[]>([]), [total, setTotal] = useState(0), [viewPage, setViewPage] = useState(1);
  const [officialPage, setOfficialPage] = useState(1), [readNote, setReadNote] = useState("");
  const [range, setRange] = useState<{timeFrom:number; timeTo:number} | null>(null);
  const [days, setDays] = useState(7);
  const recordRequest = useRef(0);
  const load = useCallback(async () => {
    try {
      const data = await json("/api/kwai/settings");
      setApps(data.apps); setShops(data.shops); setError(""); setLoaded(true);
      setShopId((old) => data.shops.some((s: Shop) => s.id === old) ? old : data.shops[0]?.id || "");
    } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); }
  }, []);
  const records = useCallback(async () => {
    const requestId = ++recordRequest.current;
    if (!shopId) { setRows([]); setTotal(0); return; }
    try {
      const data = await json(`/api/kwai/records?shopId=${encodeURIComponent(shopId)}&kind=${kind}&page=${viewPage}`);
      if (requestId === recordRequest.current) { setRows(data.rows); setTotal(data.total); }
    } catch (e) { if (requestId === recordRequest.current) toast.error(e instanceof Error ? e.message : "加载失败"); }
  }, [shopId, kind, viewPage]);
  useEffect(() => {
    setSecure(window.location.origin === "https://www.baxi8.com");
    const query = new URLSearchParams(window.location.search);
    if (query.has("success")) toast.success("Kwai 店铺授权已保存");
    if (query.has("error")) toast.error("授权未完成：请核对密钥，并从本页重新发起授权。同一浏览器内完成，授权链接 10 分钟有效。");
    if (query.has("success") || query.has("error")) window.history.replaceState({}, "", "/platforms/kwai");
    void load();
  }, [load]);
  useEffect(() => { const guard = recordRequest; setRows([]); setTotal(0); void records(); return () => { guard.current++; }; }, [records]);
  function resetRead() { setOfficialPage(1); setRange(null); setReadNote(""); setViewPage(1); }
  async function action(body: unknown) {
    if (!secure) { toast.error("请使用下方 HTTPS 安全入口登录后操作"); return; }
    setBusy(true);
    try {
      const data = await json("/api/kwai/settings", body);
      if (data.authUrl) { window.location.assign(data.authUrl); return; }
      setForm((old) => ({ ...old, appSecret: "", signSecret: "" }));
      toast.success("操作成功"); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  }
  async function readPage(itemId?: string) {
    if (!secure || !shopId) return;
    setBusy(true);
    const fixed = range || { timeFrom: Date.now() - days * 86400000, timeTo: Date.now() };
    setRange(fixed);
    try {
      const data = await json("/api/kwai/records", { shopId, kind: itemId ? "skus" : kind, itemId, page: officialPage, ...fixed });
      setReadNote(itemId ? `已读取商品 ${itemId} 的 ${data.count} 个 SKU。` : `官方第 ${data.page} 页读取 ${data.count} 条；官方匹配总数 ${data.total}。${data.hasMore ? "还有后续页，请继续读取。" : "已到最后一页。"}这不是自动全量同步。`);
      if (!itemId && data.hasMore) setOfficialPage(data.page + 1);
      await records(); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "官方数据读取失败"); }
    finally { setBusy(false); }
  }
  return <main className="space-y-6 p-6 text-slate-200">
    <header><h1 className="text-2xl font-semibold">Kwai Shop · 店铺授权与数据</h1><p className="mt-2 text-sm text-slate-400">首版为人工触发的分页查询，不回写库存、不发货、不生成财务收支；结算与利润核算尚未接入。</p></header>
    {error && <div role="alert" className="rounded border border-rose-800 p-3 text-rose-300">{error}<button className={`${classes} ml-3`} onClick={() => void load()}>重新加载</button></div>}
    <section className="space-y-3 rounded-xl border border-slate-700 p-5">
      <h2 className="font-semibold">1. 回调地址与应用配置</h2><code className="block break-all text-cyan-300">{CALLBACK}</code>
      <p className="text-sm text-slate-400">该地址接收店铺授权，不是订单消息推送地址。后台保存完整 HTTPS 地址；授权跳转参数由系统按官方规则去掉协议头。</p>
      {!secure ? <p className="text-amber-300">密钥配置与授权仅允许在 HTTPS 域名页面操作。<a className="ml-2 underline" href="https://www.baxi8.com/platforms/kwai">进入安全配置页面</a></p> : loaded && <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void action({ action: "save", ...form }); }}>
        <label className="text-sm">应用名称<input className={`${classes} mt-1 w-full`} value={form.appName} onChange={(e) => setForm({ ...form, appName: e.target.value })} required maxLength={100} disabled={busy} /></label>
        <label className="text-sm">appKey<input className={`${classes} mt-1 w-full`} value={form.appKey} onChange={(e) => setForm({ ...form, appKey: e.target.value.trim() })} required autoComplete="off" disabled={busy} /></label>
        <label className="text-sm">appSecret（请输入重置后的密钥）<input type="password" className={`${classes} mt-1 w-full`} value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value.trim() })} required autoComplete="new-password" disabled={busy} /></label>
        <label className="text-sm">signSecret（独立签名密钥）<input type="password" className={`${classes} mt-1 w-full`} value={form.signSecret} onChange={(e) => setForm({ ...form, signSecret: e.target.value.trim() })} required autoComplete="new-password" disabled={busy} /></label>
        <p className="text-xs text-slate-400 md:col-span-2">仅管理员可配置。密钥和令牌在数据库加密保存，查询接口不返回密钥。相同 appKey 保存会更新密钥，并使未完成的旧授权链接失效。</p>
        <button className={classes} disabled={busy}>保存应用配置</button>
      </form>}
      {apps.map((app) => <div key={app.id} className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3"><span>{app.appName} · appKey …{app.appKey.slice(-6)}</span><button className={classes} disabled={busy || !secure} onClick={() => void action({ action: "authorize", appId: app.id })}>前往 Kwai 授权店铺</button></div>)}
    </section>
    <section className="space-y-3 rounded-xl border border-slate-700 p-5"><h2 className="font-semibold">2. 已授权店铺</h2>
      {loaded && !shops.length && <p className="text-sm text-slate-400">尚未授权店铺。请先保存应用配置，再点击“前往 Kwai 授权店铺”。</p>}
      {shops.map((shop) => <div key={shop.id} className="space-y-2 border-t border-slate-800 py-3"><p>{shop.shopName} · 商家 {shop.merchantId} · {shop.status === "active" ? new Date(shop.tokenExpireAt).getTime() <= Date.now() ? "访问令牌到期（查询前尝试续期）" : "已授权" : "已断开"}</p><p className="text-xs text-slate-400">访问令牌到期：{date(shop.tokenExpireAt)} · 刷新授权到期：{date(shop.refreshExpireAt)} · 最近读取：{date(shop.lastReadAt)}</p><div className="flex gap-2"><button className={classes} disabled={busy || !secure || shop.status !== "active"} onClick={() => void action({ action: "refresh", shopId: shop.id })}>续期授权</button><button className={classes} disabled={busy || !secure || shop.status !== "active"} onClick={() => { if (window.confirm("断开后停止查询并清除本地令牌，已读取记录保留。确认断开？")) void action({ action: "disconnect", shopId: shop.id }); }}>断开授权</button></div></div>)}
    </section>
    <section className="space-y-3 rounded-xl border border-slate-700 p-5"><h2 className="font-semibold">3. 官方数据分页读取</h2>
      <div className="flex flex-wrap gap-3"><select aria-label="Kwai 店铺" className={classes} value={shopId} disabled={busy} onChange={(e) => {setShopId(e.target.value); resetRead();}}><option value="">请选择店铺</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.shopName}</option>)}</select>
        <select aria-label="数据类型" className={classes} value={kind} disabled={busy} onChange={(e) => {setKind(e.target.value); resetRead();}}><option value="orders">订单</option><option value="products">商品 / SKU</option></select>
        {kind === "orders" && <select aria-label="订单更新时间范围" className={classes} value={days} disabled={busy} onChange={(e) => {setDays(Number(e.target.value)); resetRead();}}><option value={7}>最近 7 天更新</option><option value={30}>最近 30 天更新</option></select>}
        <label className="text-sm">官方页码 <input aria-label="官方页码" type="number" min={1} max={10000} className={`${classes} w-24`} value={officialPage} disabled={busy} onChange={(e) => setOfficialPage(Number(e.target.value))} /></label>
        <button className={classes} disabled={busy || !secure || !shopId} onClick={() => void readPage()}>{busy ? "处理中…" : "读取官方本页（最多50条）"}</button>
      </div>
      {readNote && <p role="status" className="text-sm text-cyan-300">{readNote}</p>}
      <p className="text-xs text-slate-400">已保存 {total} 条记录。订单金额为买家实付，不等于平台结算回款。SKU 编码为店铺编码，尚未自动映射到系统 SKU。</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-slate-700"><th className="p-2">官方编号</th><th className="p-2">商品 / 状态</th><th className="p-2">金额 / 售价</th><th className="p-2">明细</th><th className="p-2">读取时间</th></tr></thead><tbody>{rows.map((row) => <tr key={row.externalId} className="border-b border-slate-800"><td className="p-2 font-mono">{row.externalId}</td><td className="max-w-xs p-2">{kind === "orders" ? statusNames[row.payload.status] || `状态 ${row.payload.status ?? "未知"}` : row.payload.title}</td><td className="p-2">{money(kind === "orders" ? row.payload.totalAmountCents : row.payload.priceCents)}</td><td className="p-2">{kind === "products" && <button className={classes} disabled={busy || !secure} onClick={() => void readPage(row.externalId)}>读取 SKU</button>}<details><summary>查看 SKU 明细</summary>{(kind === "orders" ? row.payload.items || [] : row.payload.skus || []).map((sku: any) => <p key={sku.skuId} className="my-2 text-xs">{sku.sellerSku || sku.skuId} · {sku.name || sku.skuName} · {kind === "orders" ? `数量 ${sku.quantity ?? "未提供"}` : `官方库存 ${sku.stock ?? "未提供"}`}</p>)}</details></td><td className="p-2 text-xs text-slate-400">{date(row.fetchedAt)}</td></tr>)}</tbody></table></div>
      <div className="flex items-center gap-3"><button className={classes} disabled={busy || viewPage <= 1} onClick={() => setViewPage(viewPage - 1)}>已存记录上一页</button><span>第 {viewPage} 页</span><button className={classes} disabled={busy || viewPage * 50 >= total} onClick={() => setViewPage(viewPage + 1)}>已存记录下一页</button></div>
    </section>
  </main>;
}
