"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowDownToLine, Calculator, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/ui";
import { toast } from "sonner";

type Entry = {
  id: string; warehouseName: string; currency: string; entryType: string; amount: number; balanceAfter: number;
  orderId: string | null; sourceId: string; occurredAt: string;
  platform: string | null; shopId: string | null; shopName: string | null; countryCode: string | null;
  details: { orderOutbound?: number; packaging?: number; oversize?: number; billedUnits?: number; distinctSkuCount?: number; chargeableWeightKg?: number; packageDimensions?: number[]; orderKind?: string; isSampleOrder?: boolean; date?: string; volumeCbm?: number; dailyRate?: number; freeDays?: number; receivedDate?: string; rows?: Array<{ sku?: string; qty?: number; volumeCbm?: number; amount?: number }> } | null;
};
const fetcher = (url: string) => fetch(url).then((response) => response.json());

export default function WarehouseFundLedger() {
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState("");
  const [orderKeyword, setOrderKeyword] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [running, setRunning] = useState(false);
  const [storageRunning, setStorageRunning] = useState(false);
  const [storagePreview, setStoragePreview] = useState<{ total: number; missingDimensions: number; untracked: number } | null>(null);
  const ledgerQuery = new URLSearchParams({ page: String(page), pageSize: "30" });
  if (platform) ledgerQuery.set("platform", platform);
  const { data, mutate } = useSWR<{ entries: Entry[]; pagination: { total: number; totalPages: number } }>(`/api/warehouse-funds?${ledgerQuery.toString()}`, fetcher, { revalidateOnFocus: false });
  const entries = (data?.entries || []).filter((entry) => !orderKeyword.trim() || String(entry.orderId || entry.sourceId).includes(orderKeyword.trim()));

  const reconcile = async () => {
    if (startDate > endDate) return toast.error("日期范围无效");
    setRunning(true);
    try {
      const response = await fetch("/api/warehouse-funds/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate, endDate, platform: platform || "ALL" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "补记失败");
      toast.success(`补记完成：新增 ${result.deducted} 笔，已存在 ${result.duplicate} 笔，冲正 ${result.reversed} 笔`);
      await mutate();
    } catch (error: any) { toast.error(error?.message || "补记失败"); } finally { setRunning(false); }
  };

  const previewStorage = async () => {
    setStorageRunning(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const response = await fetch(`/api/warehouse-storage-fees?date=${date}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "仓储费试算失败");
      setStoragePreview({ total: Number(result.total || 0), missingDimensions: result.missingDimensions?.length || 0, untracked: result.untracked?.length || 0 });
      toast.success(`今日仓储费试算：${Number(result.total || 0).toFixed(2)}；明细 ${result.rows?.length || 0} 条`);
    } catch (error: any) { toast.error(error?.message || "仓储费试算失败"); } finally { setStorageRunning(false); }
  };

  const postStorage = async () => {
    setStorageRunning(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const response = await fetch("/api/warehouse-storage-fees", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate: date, endDate: date }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "仓储费扣记失败");
      toast.success(`今日仓储费已计提：新增 ${result.added} 笔，重复 ${result.duplicate} 笔`);
      await mutate();
    } catch (error: any) { toast.error(error?.message || "仓储费扣记失败"); } finally { setStorageRunning(false); }
  };

  return <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-slate-100">仓库扣费台账</h2><p className="mt-1 text-xs text-slate-500">按平台、国家和店铺追踪每笔仓库扣费；TikTok 达人免费样品也会单独入账</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-slate-500">平台<select value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1); }} className="ml-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"><option value="">全部平台</option><option value="TIKTOK">TikTok Shop</option><option value="SHOPEE">Shopee</option><option value="MERCADO_LIVRE">Mercado Livre</option></select></label>
        <label className="text-[11px] text-slate-500">订单号<input value={orderKeyword} onChange={(event) => setOrderKeyword(event.target.value)} placeholder="搜索" className="ml-1 w-36 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" /></label>
        <label className="text-[11px] text-slate-500">补记<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="ml-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" /></label>
        <label className="text-[11px] text-slate-500">至<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="ml-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" /></label>
        <ActionButton size="sm" onClick={reconcile} disabled={running} icon={running ? RefreshCw : ArrowDownToLine}>{running ? "执行中" : "按利润核算补记"}</ActionButton>
        <ActionButton size="sm" onClick={previewStorage} disabled={storageRunning} icon={storageRunning ? RefreshCw : Calculator}>{storageRunning ? "计算中" : "试算今日仓储费"}</ActionButton>
        <ActionButton size="sm" onClick={postStorage} disabled={storageRunning} icon={storageRunning ? RefreshCw : ArrowDownToLine}>计提今日仓储费</ActionButton>
      </div>
    </div>
    {storagePreview && <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-950/10 px-3 py-2 text-xs text-cyan-100">今日仓储费试算 <b className="font-mono">{storagePreview.total.toFixed(2)}</b>；缺少尺寸 {storagePreview.missingDimensions} 个 SKU；未能匹配入库批次 {storagePreview.untracked} 个 SKU。</div>}
    <div className="mt-4 overflow-x-auto"><table className="min-w-[1080px] w-full text-left text-xs"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="px-3 py-2">时间</th><th className="px-3 py-2">平台 / 店铺</th><th className="px-3 py-2">仓库 / 订单</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">HQ-订单出库费</th><th className="px-3 py-2">HQ-包材费</th><th className="px-3 py-2">合计</th><th className="px-3 py-2">余额</th><th className="px-3 py-2">详情</th></tr></thead><tbody className="divide-y divide-slate-800">{entries.map((entry) => { const detail = entry.details || {}; const open = expanded === entry.id; const isStorage = entry.entryType === "STORAGE_DEBIT"; const isSampleOrder = detail.isSampleOrder === true || detail.orderKind === "INFLUENCER_FREE_SAMPLE"; const platformLabel = entry.platform === "SHOPEE" ? "Shopee" : entry.platform === "TIKTOK" ? "TikTok Shop" : entry.platform === "MERCADO_LIVRE" ? "Mercado Livre" : "其他"; const platformClass = entry.platform === "SHOPEE" ? "border-orange-500/40 bg-orange-500/10 text-orange-200" : entry.platform === "MERCADO_LIVRE" ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-200" : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"; return <tr key={entry.id} className="text-slate-300"><td className="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(entry.occurredAt).toLocaleString("zh-CN")}</td><td className="px-3 py-2">{isStorage ? <span className="inline-flex rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">仓储费</span> : <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${platformClass}`}>{platformLabel}</span>}<div className="mt-1 text-slate-300">{entry.shopName || entry.shopId || (isStorage ? "按仓库规则计提" : "历史流水")}</div>{entry.countryCode && <div className="text-[10px] text-slate-500">{entry.countryCode}</div>}</td><td className="px-3 py-2"><div>{entry.warehouseName}</div><div className="font-mono text-cyan-300">{entry.orderId || entry.sourceId}</div>{isSampleOrder && <span className="mt-1 inline-flex rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">达人免费样品</span>}</td><td className="px-3 py-2">{entry.entryType === "FULFILLMENT_DEBIT" ? <span className="text-rose-300">代发扣费</span> : entry.entryType === "STORAGE_DEBIT" ? <span className="text-violet-300">仓储费</span> : entry.entryType === "REVERSAL" ? <span className="text-amber-300">取消冲正</span> : entry.entryType}</td><td className="px-3 py-2 font-mono text-rose-300">{isStorage ? "-" : `${entry.currency} ${Number(detail.orderOutbound || 0).toFixed(2)}`}</td><td className="px-3 py-2 font-mono text-rose-300">{isStorage ? "-" : `${entry.currency} ${Number(detail.packaging || 0).toFixed(2)}`}</td><td className="px-3 py-2 font-mono font-semibold text-rose-200">{entry.currency} {Math.abs(entry.amount).toFixed(2)}</td><td className="px-3 py-2 font-mono">{entry.currency} {entry.balanceAfter.toFixed(2)}</td><td className="px-3 py-2"><button type="button" title="查看扣费明细" onClick={() => setExpanded(open ? null : entry.id)} className="rounded p-1 text-slate-400 hover:bg-slate-800">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{open && <div className="mt-1 rounded border border-slate-700 bg-slate-950 p-2 leading-5 text-slate-400">{isStorage ? <>计费日期 {detail.date || "-"}<br />入库批次明细 {detail.rows?.length || 0} 条<br />每日单价 {detail.dailyRate ?? "-"} / CBM<br />免仓天数 {detail.freeDays ?? "-"}</> : <>{isSampleOrder && <>订单类型 达人免费样品<br /></>}件数 {detail.billedUnits ?? "-"} · SKU {detail.distinctSkuCount ?? "-"}<br />计费重量 {detail.chargeableWeightKg != null ? `${Number(detail.chargeableWeightKg).toFixed(3)} kg` : "-"}<br />尺寸 {detail.packageDimensions?.join(" × ") || "-"} cm</>}</div>}</td></tr>; })}</tbody></table>{entries.length === 0 && <div className="py-8 text-center text-xs text-slate-500">暂无扣费流水，请先执行补记</div>}</div>
    <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>共 {data?.pagination?.total || 0} 条</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">上一页</button><span>{page} / {data?.pagination?.totalPages || 1}</span><button disabled={page >= (data?.pagination?.totalPages || 1)} onClick={() => setPage((value) => value + 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">下一页</button></div></div>
  </section>;
}
