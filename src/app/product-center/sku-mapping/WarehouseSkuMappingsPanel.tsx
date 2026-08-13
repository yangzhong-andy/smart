"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Pencil, Plus, Power, PowerOff, Save, Search, X } from "lucide-react";
import { toast } from "sonner";

type Variant = {
  id: string;
  skuId: string;
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  product: { name: string };
};

type Mapping = {
  id: string;
  warehouseId: string;
  warehouseSku: string;
  enabled: boolean;
  notes: string | null;
  warehouse: { id: string; code: string; name: string };
  components: Array<{ variantId: string; quantity: number; variant: { id: string; skuId: string; product: { name: string } } }>;
};

type Data = {
  warehouses: Array<{ id: string; code: string; name: string }>;
  variants: Variant[];
  mappings: Mapping[];
};

type ComponentDraft = { key: string; variantId: string; quantity: number };

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "仓库 SKU 映射加载失败");
  return body;
};

const emptyComponent = (key = "initial") => ({ key, variantId: "", quantity: 1 });

export default function WarehouseSkuMappingsPanel() {
  const { data, error, isLoading, mutate } = useSWR<Data>("/api/warehouse-sku-mappings", fetcher, { revalidateOnFocus: false });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [form, setForm] = useState({
    id: "",
    warehouseId: "",
    warehouseSku: "",
    notes: "",
    components: [emptyComponent()] as ComponentDraft[],
  });

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.mappings || []).filter((mapping) => (
      (warehouseFilter === "all" || mapping.warehouseId === warehouseFilter)
      && (!keyword
        || mapping.warehouseSku.toLowerCase().includes(keyword)
        || mapping.warehouse.name.toLowerCase().includes(keyword)
        || mapping.components.some((component) => component.variant.skuId.toLowerCase().includes(keyword)))
    ));
  }, [data?.mappings, search, warehouseFilter]);

  const reset = () => setForm({ id: "", warehouseId: "", warehouseSku: "", notes: "", components: [emptyComponent()] });

  const edit = (mapping: Mapping) => setForm({
    id: mapping.id,
    warehouseId: mapping.warehouseId,
    warehouseSku: mapping.warehouseSku,
    notes: mapping.notes || "",
    components: mapping.components.map((component, index) => ({ key: `${mapping.id}-${index}`, variantId: component.variantId, quantity: component.quantity })),
  });

  const updateComponent = (index: number, patch: Partial<ComponentDraft>) => {
    setForm((current) => ({
      ...current,
      components: current.components.map((component, componentIndex) => componentIndex === index ? { ...component, ...patch } : component),
    }));
  };

  const save = async () => {
    const components = form.components.filter((component) => component.variantId && component.quantity > 0);
    if (!form.warehouseId || !form.warehouseSku.trim() || components.length === 0) {
      return toast.error("请选择仓库、填写仓库 SKU，并至少添加一个内部 SKU");
    }
    setSaving(true);
    try {
      const response = await fetch("/api/warehouse-sku-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, components }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "仓库 SKU 映射保存失败");
      await mutate();
      reset();
      toast.success("仓库 SKU 映射已保存");
    } catch (saveError: any) {
      toast.error(saveError?.message || "仓库 SKU 映射保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (mapping: Mapping) => {
    const response = await fetch("/api/warehouse-sku-mappings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: mapping.id, enabled: !mapping.enabled }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body?.error || "状态更新失败");
    await mutate();
    toast.success(mapping.enabled ? "映射已停用" : "映射已启用");
  };

  if (isLoading) return <div className="py-16 text-center text-sm text-slate-500">正在加载仓库 SKU 映射...</div>;
  if (error) return <div className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error.message}</div>;
  if (!data) return null;

  return <div className="space-y-5">
    <section className="border-b border-slate-800 pb-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="海外仓"><select value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })} className="input"><option value="">请选择</option>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
        <Field label="仓库 SKU"><input value={form.warehouseSku} onChange={(event) => setForm({ ...form, warehouseSku: event.target.value })} placeholder="仓库系统中的 SKU 编码" className="input" /></Field>
        <Field label="备注"><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="可填写产品别名或用途" className="input" /></Field>
      </div>

      <div className="mt-4 overflow-x-auto border-y border-slate-800 py-4">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-200">内部 SKU 组成</h3><p className="mt-1 text-xs text-slate-500">普通产品添加一行；组合装添加多行并填写数量</p></div><button type="button" onClick={() => setForm({ ...form, components: [...form.components, emptyComponent(`${Date.now()}-${form.components.length}`)] })} title="添加内部 SKU" className="icon-button"><Plus className="h-4 w-4" /></button></div>
        <table className="w-full min-w-[760px] text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-2 py-2 text-left">内部 SKU / 产品</th><th className="w-32 px-2 py-2 text-left">包含数量</th><th className="px-2 py-2 text-left">重量 / 尺寸资料</th><th className="w-12" /></tr></thead><tbody>{form.components.map((component, index) => {
          const variant = data.variants.find((item) => item.id === component.variantId);
          const complete = Boolean(variant?.weightKg && variant?.lengthCm && variant?.widthCm && variant?.heightCm);
          return <tr key={component.key} className="border-t border-slate-900"><td className="px-2 py-2"><select value={component.variantId} onChange={(event) => updateComponent(index, { variantId: event.target.value })} className="input"><option value="">请选择内部 SKU</option>{data.variants.map((item) => <option key={item.id} value={item.id}>{item.skuId} · {item.product.name}</option>)}</select></td><td className="px-2 py-2"><input type="number" min="1" max="999" value={component.quantity} onChange={(event) => updateComponent(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="input" /></td><td className="px-2 py-2 text-xs"><span className={complete ? "text-emerald-300" : "text-amber-300"}>{variant ? (complete ? `${variant.weightKg}kg · ${variant.lengthCm}×${variant.widthCm}×${variant.heightCm}cm` : "资料不完整，无法精确计算磐联费用") : "-"}</span></td><td><button type="button" onClick={() => setForm({ ...form, components: form.components.length === 1 ? [emptyComponent()] : form.components.filter((_, componentIndex) => componentIndex !== index) })} title="移除" className="icon-button hover:text-rose-300"><X className="h-4 w-4" /></button></td></tr>;
        })}</tbody></table>
      </div>

      <div className="mt-4 flex gap-2"><button type="button" onClick={save} disabled={saving} className="command-button bg-emerald-600 text-white hover:bg-emerald-500"><Save className="h-4 w-4" />{form.id ? "更新映射" : "保存映射"}</button>{form.id && <button type="button" onClick={reset} className="command-button border border-slate-700 text-slate-300 hover:bg-slate-800"><X className="h-4 w-4" />取消编辑</button>}</div>
    </section>

    <section>
      <div className="mb-3 grid gap-3 md:grid-cols-[240px_1fr]"><select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} className="input"><option value="all">全部海外仓</option>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索仓库 SKU、内部 SKU 或仓库" className="input pl-9" /></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="text-xs text-slate-500"><tr className="border-b border-slate-800"><th className="px-3 py-3 text-left">海外仓</th><th className="px-3 py-3 text-left">仓库 SKU</th><th className="px-3 py-3 text-left">内部 SKU 组成</th><th className="px-3 py-3 text-left">状态</th><th className="px-3 py-3 text-left">备注</th><th className="w-24" /></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">暂无仓库 SKU 映射</td></tr> : rows.map((mapping) => <tr key={mapping.id} className="border-b border-slate-900"><td className="px-3 py-3 text-slate-300">{mapping.warehouse.name}</td><td className="px-3 py-3 font-mono text-slate-100">{mapping.warehouseSku}</td><td className="px-3 py-3 text-slate-300">{mapping.components.map((component) => `${component.variant.skuId} × ${component.quantity}`).join(" + ")}</td><td className="px-3 py-3"><span className={mapping.enabled ? "text-emerald-300" : "text-slate-500"}>{mapping.enabled ? "启用" : "停用"}</span></td><td className="max-w-[260px] px-3 py-3 text-slate-500"><div className="truncate" title={mapping.notes || ""}>{mapping.notes || "-"}</div></td><td className="px-2 py-3"><div className="flex gap-1"><button type="button" onClick={() => edit(mapping)} title="编辑映射" className="icon-button"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => toggle(mapping)} title={mapping.enabled ? "停用映射" : "启用映射"} className="icon-button">{mapping.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}</button></div></td></tr>)}</tbody></table></div>
    </section>
    <style jsx>{`.input{height:2.5rem;width:100%;border-radius:.375rem;border:1px solid #334155;background:#0f172a;padding:0 .75rem;font-size:.875rem;color:#e2e8f0;outline:none}.input:focus{border-color:#10b981}.icon-button{display:inline-flex;height:2rem;width:2rem;align-items:center;justify-content:center;border-radius:.375rem;color:#94a3b8}.icon-button:hover{background:#1e293b;color:#f8fafc}.command-button{display:inline-flex;height:2.25rem;align-items:center;gap:.5rem;border-radius:.375rem;padding:0 1rem;font-size:.875rem;font-weight:500}.command-button:disabled{opacity:.5}`}</style>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0 text-xs text-slate-500"><span className="mb-1.5 block">{label}</span>{children}</label>;
}
