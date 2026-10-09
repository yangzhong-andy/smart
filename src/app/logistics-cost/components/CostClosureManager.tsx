"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { isBatchCostClosed, type LogisticsCostTargets } from "@/lib/logistics-cost-targets";

export default function CostClosureManager({ targets, loading, error, onRefresh, onClose }: {
  targets?: LogisticsCostTargets;
  loading: boolean;
  error: boolean;
  onRefresh: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [type, setType] = useState<"container" | "batch">("container");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [saving, setSaving] = useState<string | null>(null);
  const rows = useMemo(() => {
    const items = type === "container"
      ? (targets?.containers ?? []).map((c) => ({
        id: c.id, label: `${c.containerNo} · ${c.containerType}`, closed: Boolean(c.costsClosedAt),
        closedAt: c.costsClosedAt, inherited: false,
      }))
      : (targets?.batches ?? []).map((b) => ({
        id: b.id,
        label: `${b.batchNumber} / ${b.outboundOrder.outboundNumber}${b.container ? ` · 柜 ${b.container.containerNo}` : " · 未绑柜"}`,
        closed: isBatchCostClosed(b), closedAt: b.costsClosedAt || b.container?.costsClosedAt,
        inherited: Boolean(b.container?.costsClosedAt),
      }));
    const query = search.trim().toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(query) &&
      (status === "all" || (status === "closed" ? item.closed : !item.closed)));
  }, [type, targets, search, status]);

  async function toggle(row: typeof rows[number]) {
    const closed = !row.closed;
    const question = closed
      ? `确认 ${row.label} 的费用已全部登记？完结后新建费用不再显示${type === "container" ? "该柜及其下批次" : "该批次"}。历史费用及付款仍可处理。`
      : `重新打开 ${row.label} 的费用登记？${type === "container" ? "单独完结的批次仍保持完结。" : ""}`;
    if (!window.confirm(question)) return;
    setSaving(row.id);
    try {
      const res = await fetch("/api/logistics-cost/targets", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: row.id, closed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      toast.success(closed ? "已标记费用完结" : "已重新打开费用登记");
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setSaving(null);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="cost-closure-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-700 p-4">
        <h2 id="cost-closure-title" className="text-lg font-semibold text-slate-200">费用完结管理</h2>
        <button type="button" aria-label="关闭费用完结管理" disabled={Boolean(saving)} onClick={onClose} className="p-1.5 text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-3 border-b border-slate-700 p-4">
        <p className="text-sm text-slate-400">确认所有费用均已登记后，再标记完结。完结只关闭新增费用入口，历史费用和付款记录保留。</p>
        <div className="flex flex-wrap gap-2">
          {(["container", "batch"] as const).map((tab) => <button type="button" key={tab} disabled={Boolean(saving)} onClick={() => setType(tab)} className={`rounded-lg px-3 py-2 text-sm ${type === tab ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>{tab === "container" ? "柜子" : "出库批次"}</button>)}
          <input aria-label="搜索柜号、批次或出库单" placeholder="搜索柜号、批次或出库单" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200" />
          <select aria-label="费用完结状态" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
            <option value="all">全部状态</option><option value="open">未完结</option><option value="closed">已完结</option>
          </select>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto p-4">
        {error ? <p className="text-sm text-rose-400">加载失败。<button type="button" className="ml-2 underline" onClick={() => void onRefresh()}>重新加载</button></p>
          : loading ? <p className="text-sm text-slate-400">正在加载…</p>
          : rows.length === 0 ? <p className="text-sm text-slate-400">没有符合条件的记录</p>
          : <ul className="divide-y divide-slate-800">{rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm text-slate-200">{row.label}</p>
              <p className={`mt-1 text-xs ${row.closed ? "text-emerald-300" : "text-slate-400"}`}>
                {row.inherited ? "费用已完结（所属柜子已完结，请先重新打开柜子）" : row.closed ? "费用已完结" : "费用未完结"}
                {row.closedAt ? ` · ${new Date(row.closedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}` : ""}
              </p>
            </div>
            <button type="button" disabled={Boolean(saving) || row.inherited} onClick={() => void toggle(row)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-cyan-300 disabled:opacity-40">
              {saving === row.id ? "保存中…" : row.closed ? "重新打开" : "标记费用完结"}
            </button>
          </li>)}</ul>}
      </div>
      <div className="border-t border-slate-700 p-3 text-xs text-slate-500">柜子完结后，其下所有批次一并从新增费用选项中隐藏；重新打开柜子不会清除批次自身的完结标记。</div>
    </section>
  </div>;
}
