"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Calculator, Plus, RotateCcw, Trash2, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui";

const fetcher = (url: string) => fetch(url).then(async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "读取失败");
  return body;
});
const n = (value: unknown, digits = 3) => Number(value || 0).toFixed(digits);
type Item = { id: string; quantity: number };

export default function LogisticsFeeTestPage() {
  const { data, error, isLoading } = useSWR<any>("/api/logistics-fee-test", fetcher, { revalidateOnFocus: false, dedupingInterval: 600000 });
  const [warehouseId, setWarehouseId] = useState("");
  const [items, setItems] = useState<Item[]>([{ id: "", quantity: 1 }]);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const variants = data?.variants || [];
  const warehouses = data?.warehouses || [];
  const ruleMeta = warehouseId ? data?.warehouseRules?.[warehouseId] : null;
  const selectedIds = useMemo(() => new Set(items.map((item) => item.id).filter(Boolean)), [items]);

  const addItem = () => setItems((current) => [...current, { id: "", quantity: 1 }]);
  const updateItem = (index: number, patch: Partial<Item>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removeItem = (index: number) => setItems((current) => current.length === 1 ? [{ id: "", quantity: 1 }] : current.filter((_, itemIndex) => itemIndex !== index));
  const calculate = async () => {
    if (!warehouseId) return setResult({ error: "请选择仓库" });
    if (items.some((item) => !item.id || item.quantity < 1)) return setResult({ error: "请完整填写 SKU 和数量" });
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/logistics-fee-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ warehouseId, items: items.map((item) => ({ variantId: item.id, quantity: item.quantity })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "测算失败");
      setResult(body);
    } catch (calculateError: any) { setResult({ error: calculateError?.message || "测算失败" }); }
    finally { setBusy(false); }
  };
  const reset = () => { setItems([{ id: "", quantity: 1 }]); setResult(null); };

  return <div className="space-y-5">
    <PageHeader title={<span className="inline-flex items-center gap-2"><Truck className="h-6 w-6 text-emerald-300" />物流费用测试</span>} description="组合 SKU、数量和仓库，模拟当前生效的海外仓费用规则" />
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">仅用于费用试算，不会修改订单、库存、月账单或财务流水。当前包裹三边按所选 SKU 的最大单品尺寸估算。</div>
    {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error.message}</div>}
    <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)]">
        <label className="text-sm text-slate-300"><span className="mb-1.5 block text-xs text-slate-500">计费仓库</span><select className="input" value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setResult(null); }} disabled={isLoading}><option value="">请选择海外仓</option>{warehouses.map((warehouse: any) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? ` · ${warehouse.code}` : ""}</option>)}</select></label>
        <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">{ruleMeta ? <><div>当前模式：<span className="text-slate-200">{ruleMeta.pricingMode === "PACKAGE_TIER" ? "包裹分档" : ruleMeta.pricingMode === "WEIGHT_TIER" ? "重量分档" : "按件"}</span> · 币种 <span className="text-slate-200">{ruleMeta.currency}</span></div><div className="mt-1">体积除数：{ruleMeta.volumetricDivisor} · {ruleMeta.useVolumetricWeight ? "实际重/体积重取大" : "按实际重量"}{ruleMeta.shopSpecific ? " · 当前仅找到店铺专用规则" : ""}</div></> : "选择仓库后显示当前生效规则"}</div>
      </div>
      <div className="mt-6 flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-100">SKU 组合</h2><p className="mt-1 text-xs text-slate-500">同一订单中的不同 SKU 分行填写，数量按实际件数填写</p></div><button type="button" onClick={addItem} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800"><Plus className="h-4 w-4" />添加 SKU</button></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="text-xs text-slate-500"><tr className="border-b border-slate-800"><th className="px-2 py-2 text-left">SKU / 商品</th><th className="w-28 px-2 py-2 text-left">数量</th><th className="px-2 py-2 text-left">单件资料</th><th className="w-12" /></tr></thead><tbody>{items.map((item, index) => { const variant = variants.find((candidate: any) => candidate.id === item.id); return <tr key={`${index}-${item.id}`} className="border-b border-slate-900"><td className="px-2 py-2"><select className="input" value={item.id} onChange={(event) => updateItem(index, { id: event.target.value })}><option value="">请选择 SKU</option>{variants.map((candidate: any) => <option key={candidate.id} value={candidate.id} disabled={selectedIds.has(candidate.id) && candidate.id !== item.id}>{candidate.skuId} · {candidate.productName}</option>)}</select></td><td className="px-2 py-2"><input className="input" type="number" min={1} step={1} value={item.quantity} onChange={(event) => updateItem(index, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /></td><td className="px-2 py-2 text-xs text-slate-400">{variant ? `${n(variant.weightKg)}kg · ${variant.lengthCm || "-"}×${variant.widthCm || "-"}×${variant.heightCm || "-"}cm` : "-"}</td><td className="px-2 py-2"><button type="button" title="移除 SKU" onClick={() => removeItem(index)} className="icon-button text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></td></tr>; })}</tbody></table></div>
      <div className="mt-5 flex gap-2"><button type="button" disabled={busy} onClick={calculate} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"><Calculator className="h-4 w-4" />{busy ? "计算中..." : "开始测算"}</button><button type="button" onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-700 px-4 text-sm text-slate-300 hover:bg-slate-800"><RotateCcw className="h-4 w-4" />重置</button></div>
    </section>
    {result?.error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{result.error}</div>}
    {result?.totals && <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-5"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-100">模拟结果</h2><p className="mt-1 text-xs text-slate-500">{result.warehouse.name} · 规则生效版本 {result.rule.id.slice(0, 8)}</p></div><div className="text-right"><div className="text-xs text-slate-500">模拟总费用</div><div className="text-2xl font-semibold text-emerald-300">{n(result.fee.total, 2)} <span className="text-sm">{result.rule.currency}</span></div></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["总件数", result.totals.totalUnits], ["实际重量", `${n(result.totals.totalWeightKg)} kg`], ["总体积", `${n(result.totals.totalVolumeCm3, 0)} cm³`], ["体积重", `${n(result.totals.totalVolumeWeightKg)} kg`], ["计费重量", `${n(result.totals.chargeableWeightKg)} kg`], ["估算包裹尺寸", `${result.totals.packageDimensions.join(" × ")} cm`], ["出库操作费", `${n(result.fee.operational, 2)} ${result.rule.currency}`], ["包材/超尺寸", `${n(result.fee.packaging + result.fee.oversize, 2)} ${result.rule.currency}`]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-slate-800 bg-slate-950/50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-sm font-medium text-slate-200">{value}</div></div>)}</div><div className="mt-4 text-xs text-slate-500">{result.note}</div></section>}
  </div>;
}
