"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, RefreshCw, Search, ShoppingBag, Store } from "lucide-react";
import { toast } from "sonner";
import { KWAI_SYNC_MAX_PAGES, KWAI_SYNC_PAGE_SIZE, syncKwaiPages } from "@/lib/kwai-sync";

type Kind = "orders" | "products";
type App = { id: string; appKey: string; appName: string };
type Shop = { id: string; merchantId: string; shopName: string; appId: string; status: string; tokenExpireAt: string; refreshExpireAt: string; lastReadAt: string | null };
type RecordRow = { externalId: string; payload: any; fetchedAt: string };

const classes = "rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 disabled:opacity-40";
const statusNames: Record<number, string> = { 10: "未支付", 101: "待上传发票", 102: "待安排发货", 200: "待揽收", 210: "已打包待揽收", 30: "已发货", 40: "已收货", 50: "已完成", 60: "已关闭" };
const money = (cents: number | null | undefined) => cents == null ? "未提供" : `R$ ${(cents / 100).toFixed(2)}`;
const date = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未读取";
const platformDate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "未提供";
const statusText = (value: unknown) => value == null ? "未提供" : String(value);
function JsonValue({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="text-slate-500">未提供</span>;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  return <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-300">{JSON.stringify(value, null, 2)}</pre>;
}
function OrderDetails({ payload }: { payload: any }) {
  return <details className="mt-2 rounded border border-slate-700/70 bg-slate-950/60 p-2 text-xs">
    <summary className="cursor-pointer select-none text-cyan-300">查看完整业务字段</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><div className="text-slate-500">时间与金额</div><div>创建：{platformDate(payload.createdAt)}</div><div>付款：{platformDate(payload.paidAt)}</div><div>商品金额：{money(payload.productAmountCents)}</div><div>运费：{money(payload.shippingFeeCents)}</div><div>运费优惠：{money(payload.shippingDiscountCents)}</div><div>平台优惠：{money(payload.productPlatformDiscountCents)}</div><div>卖家优惠：{money(payload.productSellerDiscountCents)}</div></div>
      <div className="space-y-1"><div className="text-slate-500">状态与履约</div><div>取消状态：{statusText(payload.cancelStatus)}</div><div>取消原因：{payload.cancelReason || "未提供"}</div><div>售后状态：{statusText(payload.afterSaleStatus)}</div><div>发货方式：{payload.deliveryType || "未提供"}</div><div>发货状态：{statusText(payload.deliveryStatus)}</div><div>物流公司：{payload.logisticsCompany || "未提供"}</div><div>物流单号：{payload.trackingNumber || "未提供"}</div></div>
      <div className="space-y-1"><div className="text-slate-500">发票</div><div>发票状态：{statusText(payload.invoiceStatus)}</div><div>发票号：{payload.invoiceNumber || "未提供"}</div><div>发票金额：{money(payload.invoiceAmountCents)}</div></div>
      <div className="space-y-1"><div className="text-slate-500">订单操作记录</div><JsonValue value={payload.operationLogs} /></div>
    </div>
    <div className="mt-3 border-t border-slate-800 pt-3"><div className="mb-1 text-slate-500">商品行补充字段</div><div className="space-y-2">{(payload.items || []).map((item: any) => <div key={`${item.itemId}-${item.skuId}`} className="rounded border border-slate-800 p-2"><div>{item.name || item.skuName || "未命名"} · {item.sellerSku || item.skuId || "无 SKU"}</div><div className="mt-1 grid gap-1 text-slate-400 sm:grid-cols-3"><span>小计：{money(item.subtotalCents)}</span><span>售后：{statusText(item.afterSaleStatus)}</span><span>图片：{item.imageUrl ? <a className="text-cyan-300 hover:underline" href={item.imageUrl} target="_blank" rel="noreferrer">查看</a> : "未提供"}</span></div>{item.extras && Object.keys(item.extras).length > 0 && <JsonValue value={item.extras} />}</div>)}</div></div>
    {!!payload.extras && Object.keys(payload.extras).length > 0 && <div className="mt-3 border-t border-slate-800 pt-3"><div className="mb-1 text-slate-500">其他非敏感字段</div><JsonValue value={payload.extras} /></div>}
  </details>;
}

async function json(url: string, body?: unknown) {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

export default function KwaiRecordsView({ kind }: { kind: Kind }) {
  const [apps, setApps] = useState<App[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [viewPage, setViewPage] = useState(1);
  const [officialPage, setOfficialPage] = useState(1);
  const [days, setDays] = useState(7);
  const [range, setRange] = useState<{ timeFrom: number; timeTo: number } | null>(null);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const requestId = useRef(0);

  const loadSettings = useCallback(async () => {
    const data = await json("/api/kwai/settings");
    setApps(data.apps || []);
    setShops(data.shops || []);
    setShopId((old: string) => data.shops?.some((shop: Shop) => shop.id === old) ? old : data.shops?.[0]?.id || "");
  }, []);

  const loadRecords = useCallback(async () => {
    const current = ++requestId.current;
    if (!shopId) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await json(`/api/kwai/records?shopId=${encodeURIComponent(shopId)}&kind=${kind}&page=${viewPage}`);
      if (current === requestId.current) { setRows(data.rows || []); setTotal(data.total || 0); }
    } catch (error) {
      if (current === requestId.current) toast.error(error instanceof Error ? error.message : "记录加载失败");
    } finally { if (current === requestId.current) setLoading(false); }
  }, [kind, shopId, viewPage]);

  useEffect(() => { void loadSettings().catch((error) => toast.error(error instanceof Error ? error.message : "Kwai 店铺加载失败")); }, [loadSettings]);
  useEffect(() => { setRows([]); setTotal(0); void loadRecords(); }, [loadRecords]);

  function resetFilters() { setOfficialPage(1); setRange(null); setKeyword(""); setViewPage(1); setNote(""); }

  async function readPage(itemId?: string) {
    if (!shopId) return;
    setBusy(true);
    const fixed = range || { timeFrom: Date.now() - days * 86400000, timeTo: Date.now() };
    setRange(fixed);
    try {
      const data = await json("/api/kwai/records", { shopId, kind: itemId ? "skus" : kind, itemId, page: officialPage, ...fixed });
      setNote(itemId ? `已读取商品 ${itemId} 的 ${data.count} 个 SKU。` : `官方第 ${data.page} 页读取 ${data.count} 条，匹配总数 ${data.total}。${data.hasMore ? "还有后续页，请继续读取。" : "已到最后一页。"}`);
      if (!itemId && data.hasMore) setOfficialPage(data.page + 1);
      await loadRecords();
      await loadSettings();
    } catch (error) { toast.error(error instanceof Error ? error.message : "官方数据读取失败"); }
    finally { setBusy(false); }
  }

  async function syncAllPages() {
    if (!shopId) return;
    setBusy(true);
    setSyncProgress("准备同步");
    const fixed = range || { timeFrom: Date.now() - days * 86400000, timeTo: Date.now() };
    setRange(fixed);
    let lastSuccessfulPage = officialPage - 1;
    try {
      const result = await syncKwaiPages({
        startPage: officialPage,
        readPage: async (page) => json("/api/kwai/records", { shopId, kind, page, ...fixed }),
        onPage: ({ currentPage, pagesRead, rowsRead, total }) => {
          lastSuccessfulPage = currentPage;
          setSyncProgress(`已同步 ${pagesRead} 页 / ${rowsRead} 条，官方匹配总数 ${total}，当前第 ${currentPage} 页`);
        },
      });
      if (result.nextPage) setOfficialPage(result.nextPage);
      else setOfficialPage(1);
      setNote(result.nextPage
        ? `本批完成 ${result.pagesRead} 页、${result.rowsRead} 条；官方还有数据，点击继续同步（从第 ${result.nextPage} 页开始）。`
        : `同步完成：${result.rowsRead} 条，官方匹配总数 ${result.total}。`);
      await loadRecords();
      await loadSettings();
    } catch (error) {
      const failedPage = lastSuccessfulPage + 1;
      setOfficialPage(failedPage);
      setNote(`同步在第 ${failedPage} 页中断；此前成功页已保存，可从第 ${failedPage} 页继续。`);
      toast.error(error instanceof Error ? error.message : "Kwai 批量同步失败");
      await loadRecords();
      await loadSettings();
    } finally {
      setBusy(false);
      setSyncProgress("");
    }
  }

  const visibleRows = keyword.trim() ? rows.filter((row) => JSON.stringify(row.payload).toLowerCase().includes(keyword.trim().toLowerCase())) : rows;
  const activeShop = shops.find((shop) => shop.id === shopId);
  const isOrders = kind === "orders";

  return <main className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold">{isOrders ? <ShoppingBag className="h-6 w-6 text-cyan-400" /> : <Package className="h-6 w-6 text-cyan-400" />}{isOrders ? "Kwai 订单管理" : "Kwai 商品与 SKU"}</h1><p className="mt-1 text-sm text-slate-400">{isOrders ? "按店铺查看 Kwai 巴西订单、状态、商品明细和买家实付。" : "按店铺查看 Kwai 商品、店铺 SKU、售价和官方库存。"}</p></div>
      <div className="flex flex-wrap gap-2"><button className={`${classes} flex items-center gap-2`} disabled={busy || !shopId} onClick={() => void syncAllPages()}><RefreshCw className="h-4 w-4" />{busy ? "同步中…" : `批量同步${isOrders ? `最近${days}天订单` : "全部商品"}`}</button><button className={classes} disabled={busy || !shopId} onClick={() => void readPage()}>{`只读当前页`}</button></div>
    </header>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="text-xs text-slate-400">已保存记录</div><div className="mt-1 text-2xl font-semibold">{total}</div></div><div className="rounded-md border border-cyan-500/20 bg-slate-900 p-4"><div className="text-xs text-cyan-300">当前店铺</div><div className="mt-1 truncate text-lg font-semibold">{activeShop?.shopName || "未选择"}</div></div><div className="rounded-md border border-amber-500/20 bg-slate-900 p-4"><div className="text-xs text-amber-300">数据口径</div><div className="mt-1 text-sm">{isOrders ? "买家实付，不等于结算回款" : "官方 SKU / 库存快照"}</div></div></div>
    <section className="flex flex-wrap items-center gap-3 border-y border-slate-800 py-4">
      <select aria-label="Kwai 店铺" className={classes} value={shopId} disabled={busy} onChange={(event) => { setShopId(event.target.value); resetFilters(); }}><option value="">请选择 Kwai 店铺</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopName || shop.merchantId}</option>)}</select>
      {isOrders && <select aria-label="订单更新时间范围" className={classes} value={days} disabled={busy} onChange={(event) => { setDays(Number(event.target.value)); resetFilters(); }}><option value={7}>最近 7 天更新</option><option value={30}>最近 30 天更新</option></select>}
      <label className="text-sm">官方页码 <input aria-label="官方页码" type="number" min={1} max={10000} className={`${classes} w-24`} value={officialPage} disabled={busy} onChange={(event) => setOfficialPage(Number(event.target.value))} /></label>
      <form className="flex min-w-56 flex-1" onSubmit={(event) => event.preventDefault()}><input className="h-10 min-w-0 flex-1 rounded-l border border-slate-700 bg-slate-900 px-3 text-sm" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={isOrders ? "订单号、商品名称或 SKU" : "商品名称、商品 SKU 或 Item ID"} /><button aria-label="搜索" className="flex h-10 w-10 items-center justify-center rounded-r bg-slate-700"><Search className="h-4 w-4" /></button></form>
    </section>
      {(note || syncProgress) && <p role="status" className="rounded border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-300">{syncProgress || note} {syncProgress && `（单次最多 ${KWAI_SYNC_MAX_PAGES * KWAI_SYNC_PAGE_SIZE} 条）`}仅保存白名单快照，不自动改库存、发货或生成财务流水。</p>}
    {!apps.length && <p className="rounded border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-300">尚未配置 Kwai 应用。请先到“店铺与授权”保存应用并完成店铺授权。</p>}
    <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
      {loading ? <div className="flex h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div> : !shopId ? <div className="flex h-52 flex-col items-center justify-center text-slate-500"><Store className="mb-3 h-8 w-8" />请先选择已授权店铺</div> : visibleRows.length === 0 ? <div className="flex h-52 flex-col items-center justify-center text-slate-500">暂无已保存数据，请点击上方读取官方数据</div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-800/80 text-xs text-slate-400"><tr><th className="px-3 py-3">官方编号</th><th className="px-3 py-3">{isOrders ? "订单状态" : "商品名称"}</th><th className="px-3 py-3">{isOrders ? "买家实付" : "售价"}</th><th className="px-3 py-3">{isOrders ? "商品明细" : "SKU / 库存"}</th><th className="px-3 py-3">更新时间</th><th className="px-3 py-3">店铺</th></tr></thead><tbody className="divide-y divide-slate-800">{visibleRows.map((row) => <tr key={row.externalId} className="hover:bg-slate-800/40"><td className="px-3 py-3 font-mono text-xs">{row.externalId}</td><td className="max-w-xs px-3 py-3">{isOrders ? statusNames[row.payload.status] || `状态 ${row.payload.status ?? "未知"}` : row.payload.title || "未命名商品"}</td><td className="px-3 py-3">{money(isOrders ? row.payload.totalAmountCents : row.payload.priceCents)}</td><td className="px-3 py-3 text-xs">{isOrders ? <div>{(row.payload.items || []).map((item: any) => <p key={`${item.itemId}-${item.skuId}`}>{item.sellerSku || item.skuId} · {item.name || item.skuName || "未命名"} · ×{item.quantity ?? "未提供"}</p>)}<OrderDetails payload={row.payload} /></div> : <div><div>{row.payload.sellerSku || "无商品 SKU"} · 官方库存 {row.payload.stock ?? "未提供"}{row.payload.skus?.length ? <span className="ml-2 text-slate-500">{row.payload.skus.length} 个 SKU</span> : null}</div><button className={`${classes} mt-2 px-2 py-1 text-xs`} disabled={busy} onClick={() => void readPage(row.externalId)}>读取 SKU</button></div>}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{date(row.fetchedAt)}</td><td className="px-3 py-3 text-xs"><Store className="mr-1 inline h-3 w-3 text-cyan-400" />{activeShop?.shopName || row.externalId}</td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-slate-800 px-3 py-3 text-sm"><button className={classes} disabled={busy || viewPage <= 1} onClick={() => setViewPage((page) => page - 1)}>上一页</button><span>第 {viewPage} 页 · 共 {total} 条</span><button className={classes} disabled={busy || viewPage * 50 >= total} onClick={() => setViewPage((page) => page + 1)}>下一页</button></div>
    </section>
  </main>;
}
