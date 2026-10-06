"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, Clock3, Image as ImageIcon, Loader2, Package, RefreshCw, Search, Store, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Pagination } from "@/components/Pagination";
import { formatOrderDateTime } from "@/lib/order-business-time";

type ReturnItem = { id: string; itemSku: string | null; modelSku: string | null; itemName: string | null; quantity: number; itemPrice: string | null; images: unknown };
type ReturnCase = {
  id: string; shopId: string; returnSn: string; orderSn: string | null; status: string | null; reason: string | null; textReason: string | null;
  refundAmount: string | null; amountBeforeDiscount: string | null; currency: string | null; trackingNumber: string | null;
  needsLogistics: boolean; dueDate: string | null; returnShipDueDate: string | null; returnSellerDueDate: string | null;
  negotiationStatus: string | null; sellerProofStatus: string | null; sellerCompensationStatus: string | null;
  buyerUsername: string | null; images: unknown; disputeReasons: unknown; sourceCreateTime: string | null; sourceUpdateTime: string | null;
  items: ReturnItem[]; order: { status: string | null; totalAmount: string | null; createTime: string | null } | null;
  shopSetting: { shopName: string | null; region: string };
};
type Shop = { shopId: string; shopName: string | null; region: string };

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "申请中", ACCEPTED: "已接受", REFUND_PAID: "已退款", REFUND金: "已退款", CANCELLED: "已取消",
  IN_DISPUTE: "争议中", JUDGING: "平台裁决", CLOSED: "已关闭", PROCESSING: "处理中",
};
const STATUS_STYLE: Record<string, string> = {
  REQUESTED: "border-amber-500/30 bg-amber-500/10 text-amber-300", ACCEPTED: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  REFUND_PAID: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", CLOSED: "border-slate-700 bg-slate-800 text-slate-300",
  CANCELLED: "border-rose-500/30 bg-rose-500/10 text-rose-300", IN_DISPUTE: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function text(value: unknown) { return value === null || value === undefined || value === "" ? "--" : String(value); }
function money(value: string | null, currency: string | null) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value); if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(number);
}
function arrayOfStrings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []; }

export default function ShopeeAfterSalesPage() {
  const [rows, setRows] = useState<ReturnCase[]>([]); const [shops, setShops] = useState<Shop[]>([]); const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [refundTotal, setRefundTotal] = useState("0"); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20);
  const [shopId, setShopId] = useState(""); const [status, setStatus] = useState(""); const [keywordInput, setKeywordInput] = useState(""); const [keyword, setKeyword] = useState(""); const [startDate, setStartDate] = useState(""); const [endDate, setEndDate] = useState("");
  const [syncDays, setSyncDays] = useState(30); const [loading, setLoading] = useState(true); const [syncing, setSyncing] = useState(false); const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (shopId) params.set("shopId", shopId); if (status) params.set("status", status); if (keyword) params.set("keyword", keyword); if (startDate) params.set("startDate", startDate); if (endDate) params.set("endDate", endDate);
      const response = await fetch(`/api/shopee/after-sales?${params}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Shopee 售后加载失败");
      setRows(data.data || []); setShops(data.shops || []); setTotal(data.total || 0); setStatusCounts(data.statusCounts || {}); setRefundTotal(String(data.refundTotal ?? 0));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Shopee 售后加载失败"); } finally { setLoading(false); }
  }, [endDate, keyword, page, pageSize, shopId, startDate, status]);
  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/shopee/after-sales/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: syncDays, shopId: shopId || undefined }) });
      const data = await response.json(); if (!response.ok && response.status !== 207) throw new Error(data.error || "Shopee 售后同步失败");
      const saved = (data.results || []).reduce((sum: number, result: { saved?: number }) => sum + (result.saved || 0), 0);
      if (data.errors?.length) toast.error(data.errors.map((item: { shopId: string; error: string }) => `${item.shopId}: ${item.error}`).join("；")); else toast.success(`售后同步完成，写入或更新 ${saved} 条记录`);
      setPage(1); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Shopee 售后同步失败"); } finally { setSyncing(false); }
  };

  const statusOptions = Array.from(new Set([...Object.keys(STATUS_LABELS), ...Object.keys(statusCounts)])).filter((item) => item !== "UNKNOWN");
  return <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Wallet className="h-6 w-6 text-orange-400" />Shopee 售后管理</h1><p className="mt-1 text-sm text-slate-400">退货、退款、争议和退回商品独立记录，关联 Shopee 订单。</p></div><div className="flex items-center gap-2"><select value={syncDays} onChange={(event) => setSyncDays(Number(event.target.value))} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option><option value={180}>最近 180 天</option><option value={365}>最近 365 天</option></select><button onClick={() => void sync()} disabled={syncing || shops.length === 0} className="flex h-10 items-center gap-2 rounded-md bg-orange-600 px-4 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{syncing ? "同步中" : "同步售后"}</button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="text-xs text-slate-400">售后记录</div><div className="mt-1 text-2xl font-semibold">{total.toLocaleString()}</div></div><div className="rounded-md border border-amber-500/20 bg-slate-900 p-4"><div className="text-xs text-amber-300">申请中</div><div className="mt-1 text-2xl font-semibold">{(statusCounts.REQUESTED || 0).toLocaleString()}</div></div><div className="rounded-md border border-rose-500/20 bg-slate-900 p-4"><div className="text-xs text-rose-300">争议中</div><div className="mt-1 text-2xl font-semibold">{(statusCounts.IN_DISPUTE || statusCounts.JUDGING || 0).toLocaleString()}</div></div><div className="rounded-md border border-emerald-500/20 bg-slate-900 p-4"><div className="text-xs text-emerald-300">退款合计</div><div className="mt-1 text-2xl font-semibold">{money(refundTotal, "BRL")}</div></div></div>
    <div className="flex flex-wrap items-center gap-3 border-y border-slate-800 py-4"><select value={shopId} onChange={(event) => { setShopId(event.target.value); setPage(1); }} className="h-10 min-w-48 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部 Shopee 店铺</option>{shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName || shop.shopId}</option>)}</select><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"><option value="">全部状态</option>{statusOptions.map((value) => <option key={value} value={value}>{STATUS_LABELS[value] || value}</option>)}</select><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm" /><span className="text-slate-500">至</span><input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm" /><form onSubmit={(event) => { event.preventDefault(); setKeyword(keywordInput.trim()); setPage(1); }} className="flex min-w-64 flex-1"><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="退货单、订单号、物流单号或 SKU" className="h-10 min-w-0 flex-1 rounded-l-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus:border-orange-400" /><button className="flex h-10 w-10 items-center justify-center rounded-r-md bg-slate-700 hover:bg-slate-600" title="搜索"><Search className="h-4 w-4" /></button></form></div>
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">{loading ? <div className="flex h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div> : rows.length === 0 ? <div className="flex h-52 flex-col items-center justify-center text-slate-500"><Package className="mb-3 h-8 w-8" /><span>暂无 Shopee 售后记录</span></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-800/80 text-xs text-slate-400"><tr><th className="w-10 px-3 py-3" /><th className="px-3 py-3">售后 / 订单</th><th className="px-3 py-3">店铺</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">退款金额</th><th className="px-3 py-3">原因</th><th className="px-3 py-3">申请时间</th><th className="px-3 py-3">截止时间</th></tr></thead><tbody className="divide-y divide-slate-800">{rows.map((row) => <Fragment key={row.id}><tr className="hover:bg-slate-800/40"><td className="px-3 py-3"><button onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="rounded p-1 text-slate-400 hover:bg-slate-700" title="查看售后明细">{expanded === row.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td><td className="px-3 py-3 font-mono text-xs text-slate-200">{row.returnSn}<div className="mt-1 font-sans text-slate-500">订单：{row.orderSn || "未关联订单"}</div></td><td className="px-3 py-3"><span className="flex items-center gap-1.5"><Store className="h-4 w-4 text-orange-400" />{row.shopSetting.shopName || row.shopId}</span></td><td className="px-3 py-3"><span className={`inline-flex rounded border px-2 py-1 text-xs ${STATUS_STYLE[row.status || ""] || "border-slate-700 bg-slate-800 text-slate-300"}`}>{STATUS_LABELS[row.status || ""] || text(row.status)}</span></td><td className="px-3 py-3 font-medium">{money(row.refundAmount, row.currency)}</td><td className="max-w-52 px-3 py-3"><div className="truncate" title={row.textReason || row.reason || ""}>{row.textReason || row.reason || "--"}</div></td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{formatOrderDateTime(row.sourceCreateTime, row.shopSetting.region)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{formatOrderDateTime(row.dueDate || row.returnShipDueDate, row.shopSetting.region)}</td></tr>{expanded === row.id && <tr><td colSpan={8} className="bg-slate-950/60 px-6 py-4"><div className="grid gap-4 lg:grid-cols-3"><div className="space-y-1 text-xs text-slate-400"><div>买家：<b className="text-slate-200">{row.buyerUsername || "未授权"}</b></div><div>物流单号：<b className="font-mono text-slate-200">{row.trackingNumber || "--"}</b></div><div>需要退货物流：<b className="text-slate-200">{row.needsLogistics ? "是" : "否"}</b></div><div>更新时间：{formatOrderDateTime(row.sourceUpdateTime, row.shopSetting.region)}</div></div><div className="space-y-1 text-xs text-slate-400"><div>原订单金额：{money(row.order?.totalAmount || row.amountBeforeDiscount, row.currency)}</div><div>协商状态：{text(row.negotiationStatus)}</div><div>卖家凭证：{text(row.sellerProofStatus)}</div><div>卖家赔付：{text(row.sellerCompensationStatus)}</div></div><div className="space-y-2 text-xs text-slate-400"><div className="flex items-center gap-1"><Clock3 className="h-4 w-4" />截止时间：{formatOrderDateTime(row.returnSellerDueDate || row.returnShipDueDate || row.dueDate, row.shopSetting.region)}</div>{arrayOfStrings(row.disputeReasons).length > 0 && <div className="flex gap-1"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" /><span>{arrayOfStrings(row.disputeReasons).join("、")}</span></div>}</div></div><div className="mt-4 border-t border-slate-800 pt-4"><div className="mb-2 text-xs text-slate-400">退回商品（{row.items.length} 个 SKU）</div>{row.items.length === 0 ? <span className="text-xs text-slate-500">接口未返回 SKU 明细</span> : <div className="grid gap-2 md:grid-cols-2">{row.items.map((item) => <div key={item.id} className="flex gap-3 border-l-2 border-slate-700 bg-slate-900 px-3 py-2"><div className="flex h-12 w-12 shrink-0 items-center justify-center bg-slate-800"><Package className="h-5 w-5 text-slate-600" /></div><div className="min-w-0"><div className="truncate text-sm text-slate-200">{item.itemName || "未命名商品"}</div><div className="mt-1 truncate text-xs text-slate-500">SKU {item.modelSku || item.itemSku || "--"} · {item.quantity} 件</div><div className="mt-1 text-xs text-slate-400">{money(item.itemPrice, row.currency)}</div></div></div>)}</div>}</div>{arrayOfStrings(row.images).length > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">{arrayOfStrings(row.images).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="flex h-16 w-16 items-center justify-center overflow-hidden border border-slate-700 bg-slate-900" title="查看凭证"><img src={url} alt="售后凭证" className="h-full w-full object-cover" /></a>)}</div>}</td></tr>}</Fragment>)}</tbody></table></div>}<Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} showAllOption={false} /></div>
  </div>;
}
