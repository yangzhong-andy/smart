"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Package, Pencil, RefreshCw, Save, Search, Users, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import type { ProfitReportResponse, ProfitSampleRow } from "@/lib/profit-report-types";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "达人营销成本加载失败");
  return body;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value || 0);
}

export default function InfluencerCostsPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startDate, setStartDate] = useState(() => addDays(new Date().toISOString().slice(0, 10), -29));
  const [endDate, setEndDate] = useState(today);
  const [shopId, setShopId] = useState("all");
  const [search, setSearch] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [editing, setEditing] = useState<ProfitSampleRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ influencerId: "", teamName: "", manualShippingCost: "0", otherCost: "0", currency: "BRL", notes: "" });
  const query = useMemo(() => {
    const params = new URLSearchParams({ startDate, endDate, groupBy: "day" });
    if (shopId !== "all") params.set("shopId", shopId);
    return `/api/profit-report?${params.toString()}`;
  }, [startDate, endDate, shopId]);
  const { data, error, isLoading, isValidating, mutate } = useSWR<ProfitReportResponse>(query, fetcher, { revalidateOnFocus: false });
  const { data: influencerData } = useSWR<any>("/api/influencers?page=1&pageSize=500", fetcher, { revalidateOnFocus: false });
  const influencers = Array.isArray(influencerData) ? influencerData : influencerData?.data || [];
  const samples = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.influencerMarketing.samples || []).filter((row) => {
      if (onlyUnlinked && row.influencerId) return false;
      if (!keyword) return true;
      return [row.orderId, row.storeName, row.warehouseName, row.sellerSkus, row.influencerName, row.teamName]
        .some((value) => value?.toLowerCase().includes(keyword));
    });
  }, [data?.influencerMarketing.samples, onlyUnlinked, search]);

  const openEditor = (row: ProfitSampleRow) => {
    setEditing(row);
    setDraft({
      influencerId: row.influencerId || "",
      teamName: row.teamName || "",
      manualShippingCost: String(row.manualShippingCost || 0),
      otherCost: String(row.manualOtherCost || 0),
      currency: row.manualCurrency || "BRL",
      notes: row.notes || "",
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/influencer-sample-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: editing.orderId, ...draft }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "寄样成本保存失败");
      await mutate();
      setEditing(null);
      toast.success("寄样归属和补充费用已保存");
    } catch (saveError: any) {
      toast.error(saveError?.message || "寄样成本保存失败");
    } finally {
      setSaving(false);
    }
  };

  const report = data?.influencerMarketing;
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance/profit" title="返回利润核算" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <div><h1 className="text-2xl font-semibold">达人营销核算</h1><p className="mt-1 text-xs text-slate-500">免费样品全成本与达人团队佣金</p></div>
        </div>
        <button type="button" onClick={() => mutate()} title="刷新" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} /></button>
      </header>

      <section className="grid gap-3 border-b border-slate-800 py-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-slate-500"><span className="mb-1.5 block">开始日期</span><input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="input" /></label>
        <label className="text-xs text-slate-500"><span className="mb-1.5 block">结束日期</span><input type="date" value={endDate} min={startDate} max={today} onChange={(event) => setEndDate(event.target.value)} className="input" /></label>
        <label className="text-xs text-slate-500"><span className="mb-1.5 block">店铺</span><select value={shopId} onChange={(event) => setShopId(event.target.value)} className="input"><option value="all">全部店铺</option>{(data?.shops || []).map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
        <label className="relative text-xs text-slate-500"><span className="mb-1.5 block">搜索</span><Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-600" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="订单、SKU、达人或仓库" className="input pl-9" /></label>
      </section>

      {error && <div className="border-b border-rose-500/30 py-4 text-sm text-rose-300">{error.message}</div>}
      {isLoading && !data && <div className="py-16 text-center text-sm text-slate-500">正在核算达人营销成本...</div>}

      {report && <>
        <section className="grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <Stat label="达人营销总成本" value={money(report.totalCostCny)} icon={WalletCards} />
          <Stat label="团队佣金" value={money(report.teamCommissionCny)} icon={Users} />
          <Stat label="样品采购" value={money(report.sampleProductCostCny)} icon={Package} />
          <Stat label="样品头程" value={money(report.sampleLogisticsCostCny)} icon={Package} />
          <Stat label="仓库代发" value={money(report.sampleWarehouseCostCny)} icon={Package} />
          <Stat label="寄样物流" value={money(report.sampleShippingCostCny)} icon={Package} />
          <Stat label="其他寄样费用" value={money(report.sampleOtherCostCny)} icon={WalletCards} />
          <Stat label="免费样品" value={`${report.sampleOrders} 单 / ${report.sampleUnits} 件`} icon={Package} />
        </section>

        <section className="border-t border-slate-800 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-slate-200">寄样订单明细</h2><p className="mt-1 text-xs text-slate-500">已关联达人 {report.linkedSampleOrders} / {report.sampleOrders} 单</p></div>
            <label className="inline-flex h-9 items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={onlyUnlinked} onChange={(event) => setOnlyUnlinked(event.target.checked)} className="h-4 w-4 accent-emerald-500" />只看未关联达人</label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-sm">
              <thead className="text-xs text-slate-500"><tr className="border-b border-slate-800"><th className="px-3 py-3 text-left">日期 / 订单</th><th className="px-3 py-3 text-left">店铺</th><th className="px-3 py-3 text-left">达人 / 团队</th><th className="px-3 py-3 text-left">仓库</th><th className="px-3 py-3 text-left">SKU / 数量</th><th className="px-3 py-3 text-right">样品采购</th><th className="px-3 py-3 text-right">头程</th><th className="px-3 py-3 text-right">代发</th><th className="px-3 py-3 text-right">寄样物流</th><th className="px-3 py-3 text-right">其他</th><th className="px-3 py-3 text-right">合计</th><th className="w-12" /></tr></thead>
              <tbody>{samples.map((row) => <tr key={row.orderId} className="border-b border-slate-900 hover:bg-slate-900/60"><td className="px-3 py-2.5"><div className="text-slate-300">{row.date}</div><div className="font-mono text-xs text-slate-600">{row.orderId}</div></td><td className="px-3 py-2.5 text-slate-400">{row.storeName}</td><td className="px-3 py-2.5"><div className={row.influencerName ? "text-slate-300" : "text-amber-300"}>{row.influencerName || "待关联"}</div><div className="text-xs text-slate-600">{row.teamName || "-"}</div></td><td className="px-3 py-2.5"><div className={row.warehouseCostCovered ? "text-slate-300" : "text-amber-300"}>{row.warehouseName}</div>{!row.warehouseCostCovered && <div className="text-xs text-amber-400">待配置费用</div>}</td><td className="max-w-[320px] px-3 py-2.5 text-slate-300"><div className="truncate" title={row.sellerSkus}>{row.sellerSkus}</div><div className="text-xs text-slate-600">{row.units} 件</div></td><MoneyCell value={row.productCostCny} covered={row.productCostCovered} /><MoneyCell value={row.logisticsCostCny} covered={row.logisticsCostCovered} /><MoneyCell value={row.warehouseFulfillmentCostCny} covered={row.warehouseCostCovered} /><MoneyCell value={row.shippingCostCny} /><MoneyCell value={row.otherCostCny} /><td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-200">{money(row.totalCostCny)}</td><td><button type="button" onClick={() => openEditor(row)} title="编辑达人和补充费用" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200"><Pencil className="h-4 w-4" /></button></td></tr>)}</tbody>
            </table>
            {samples.length === 0 && <div className="py-16 text-center text-sm text-slate-500">没有匹配的免费样品订单</div>}
          </div>
        </section>
      </>}

      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-xl rounded-md border border-slate-700 bg-slate-950 shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-800 px-5 py-4"><div><h2 className="font-semibold">补充寄样信息</h2><p className="mt-1 font-mono text-xs text-slate-500">{editing.orderId}</p></div><button type="button" onClick={() => setEditing(null)} title="关闭" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <label className="text-xs text-slate-500"><span className="mb-1.5 block">达人</span><select value={draft.influencerId} onChange={(event) => setDraft({ ...draft, influencerId: event.target.value })} className="input"><option value="">待关联</option>{influencers.map((influencer: any) => <option key={influencer.id} value={influencer.id}>{influencer.accountName}</option>)}</select></label>
            <label className="text-xs text-slate-500"><span className="mb-1.5 block">团队</span><input value={draft.teamName} onChange={(event) => setDraft({ ...draft, teamName: event.target.value })} className="input" /></label>
            <label className="text-xs text-slate-500"><span className="mb-1.5 block">额外寄样物流</span><input type="number" min="0" value={draft.manualShippingCost} onChange={(event) => setDraft({ ...draft, manualShippingCost: event.target.value })} className="input" /></label>
            <label className="text-xs text-slate-500"><span className="mb-1.5 block">其他费用</span><input type="number" min="0" value={draft.otherCost} onChange={(event) => setDraft({ ...draft, otherCost: event.target.value })} className="input" /></label>
            <label className="text-xs text-slate-500"><span className="mb-1.5 block">币种</span><select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} className="input"><option>BRL</option><option>USD</option><option>CNY</option></select></label>
            <label className="text-xs text-slate-500"><span className="mb-1.5 block">备注</span><input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="input" /></label>
          </div>
          <div className="flex justify-end border-t border-slate-800 px-5 py-4"><button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "保存中" : "保存"}</button></div>
        </div>
      </div>}
      <style jsx>{`.input{height:2.5rem;width:100%;border-radius:.375rem;border:1px solid #334155;background:#0f172a;padding:0 .75rem;font-size:.875rem;color:#e2e8f0;outline:none}.input:focus{border-color:#10b981}`}</style>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Package }) {
  return <div className="min-w-0 rounded-md border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between gap-3 text-xs text-slate-400"><span>{label}</span><Icon className="h-4 w-4 text-slate-500" /></div><div className="mt-2 truncate text-lg font-semibold tabular-nums text-slate-100" title={value}>{value}</div></div>;
}

function MoneyCell({ value, covered = true }: { value: number; covered?: boolean }) {
  return <td className={`px-3 py-2.5 text-right tabular-nums ${covered ? "text-slate-300" : "text-amber-300"}`}>{covered ? money(value) : "待配置"}</td>;
}
