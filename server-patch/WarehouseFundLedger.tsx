"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowDownToLine, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/ui";
import { toast } from "sonner";

type Entry = {
  id: string; warehouseName: string; currency: string; entryType: string; amount: number; balanceAfter: number;
  orderId: string | null; sourceId: string; occurredAt: string;
  details: { orderOutbound?: number; packaging?: number; oversize?: number; billedUnits?: number; distinctSkuCount?: number; chargeableWeightKg?: number; packageDimensions?: number[]; orderKind?: string; isSampleOrder?: boolean } | null;
};
const fetcher = (url: string) => fetch(url).then((response) => response.json());

export default function WarehouseFundLedger() {
  const [page, setPage] = useState(1);
  const [orderKeyword, setOrderKeyword] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [running, setRunning] = useState(false);
  const { data, mutate } = useSWR<{ entries: Entry[]; pagination: { total: number; totalPages: number } }>(`/api/warehouse-funds?page=${page}&pageSize=30`, fetcher, { revalidateOnFocus: false });
  const entries = (data?.entries || []).filter((entry) => !orderKeyword.trim() || String(entry.orderId || entry.sourceId).includes(orderKeyword.trim()));

  const reconcile = async () => {
    if (startDate > endDate) return toast.error("日期范围无效");
    setRunning(true);
    try {
      const response = await fetch("/api/warehouse-funds/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate, endDate }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "补记失败");
      toast.success(`补记完成：新增 ${result.deducted} 笔（含达人样品 ${result.sampleDeducted || 0} 笔），已存在 ${result.duplicate} 笔，冲正 ${result.reversed} 笔`);
      await mutate();
    } catch (error: any) { toast.error(error?.message || "补记失败"); } finally { setRunning(false); }
  };

  return <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold text-slate-100">仓库扣费台账</h2><p className="mt-1 text-xs text-slate-500">每笔扣费关联订单，并拆分 HQ-订单出库费 / HQ-包材费；达人免费样品也会单独入账</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-slate-500">订单号<input value={orderKeyword} onChange={(event) => setOrderKeyword(event.target.value)} placeholder="搜索" className="ml-1 w-36 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" /></label>
        <label className="text-[11px] text-slate-500">补记<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="ml-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" /></label>
        <label className="text-[11px] text-slate-500">至<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="ml-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100" /></label>
        <ActionButton size="sm" onClick={reconcile} disabled={running} icon={running ? RefreshCw : ArrowDownToLine}>{running ? "执行中" : "按利润核算补记"}</ActionButton>
      </div>
    </div>
    <div className="mt-4 overflow-x-auto"><table className="min-w-[900px] w-full text-left text-xs"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="px-3 py-2">时间</th><th className="px-3 py-2">仓库 / 订单</th><th className="px-3 py-2">类型</th><th className="px-3 py-2">HQ-订单出库费</th><th className="px-3 py-2">HQ-包材费</th><th className="px-3 py-2">合计</th><th className="px-3 py-2">余额</th><th className="px-3 py-2">详情</th></tr></thead><tbody className="divide-y divide-slate-800">{entries.map((entry) => { const detail = entry.details || {}; const open = expanded === entry.id; const isSampleOrder = detail.isSampleOrder === true || detail.orderKind === "INFLUENCER_FREE_SAMPLE"; return <tr key={entry.id} className="text-slate-300"><td className="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(entry.occurredAt).toLocaleString("zh-CN")}</td><td className="px-3 py-2"><div>{entry.warehouseName}</div><div className="font-mono text-cyan-300">{entry.orderId || entry.sourceId}</div>{isSampleOrder && <span className="mt-1 inline-flex rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">达人免费样品</span>}</td><td className="px-3 py-2">{entry.entryType === "FULFILLMENT_DEBIT" ? <span className="text-rose-300">代发扣费</span> : entry.entryType === "REVERSAL" ? <span className="text-amber-300">取消冲正</span> : entry.entryType}</td><td className="px-3 py-2 font-mono text-rose-300">{entry.currency} {Number(detail.orderOutbound || 0).toFixed(2)}</td><td className="px-3 py-2 font-mono text-rose-300">{entry.currency} {Number(detail.packaging || 0).toFixed(2)}</td><td className="px-3 py-2 font-mono font-semibold text-rose-200">{entry.currency} {Math.abs(entry.amount).toFixed(2)}</td><td className="px-3 py-2 font-mono">{entry.currency} {entry.balanceAfter.toFixed(2)}</td><td className="px-3 py-2"><button type="button" title="查看扣费明细" onClick={() => setExpanded(open ? null : entry.id)} className="rounded p-1 text-slate-400 hover:bg-slate-800">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{open && <div className="mt-1 rounded border border-slate-700 bg-slate-950 p-2 leading-5 text-slate-400">{isSampleOrder && <>订单类型 达人免费样品<br /></>}件数 {detail.billedUnits ?? "-"} · SKU {detail.distinctSkuCount ?? "-"}<br />计费重量 {detail.chargeableWeightKg != null ? `${Number(detail.chargeableWeightKg).toFixed(3)} kg` : "-"}<br />尺寸 {detail.packageDimensions?.join(" × ") || "-"} cm</div>}</td></tr>; })}</tbody></table>{entries.length === 0 && <div className="py-8 text-center text-xs text-slate-500">暂无扣费流水，请先执行补记</div>}</div>
    <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>共 {data?.pagination?.total || 0} 条</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">上一页</button><span>{page} / {data?.pagination?.totalPages || 1}</span><button disabled={page >= (data?.pagination?.totalPages || 1)} onClick={() => setPage((value) => value + 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">下一页</button></div></div>
  </section>;
}
