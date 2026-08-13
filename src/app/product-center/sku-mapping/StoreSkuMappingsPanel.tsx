"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Pencil, Plus, Power, PowerOff, Save, Search, X } from "lucide-react";
import { toast } from "sonner";

type Variant = { id: string; skuId: string; product: { name: string } };
type Shop = { shopId: string; shopName: string; region: string };
type Mapping = {
  id: string;
  platform: string;
  shopId: string;
  sellerSku: string;
  enabled: boolean;
  notes: string | null;
  components: Array<{ variantId: string; quantity: number; variant: Variant }>;
};
type Data = { mappings: Mapping[]; shops: Shop[]; variants: Variant[] };
type ComponentDraft = { key: string; variantId: string; quantity: number };

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "店铺销售 SKU 映射加载失败");
  return body;
};
const emptyComponent = (key = "initial"): ComponentDraft => ({ key, variantId: "", quantity: 1 });

export default function StoreSkuMappingsPanel() {
  const { data, error, isLoading, mutate } = useSWR<Data>("/api/profit-sku-mappings", fetcher, { revalidateOnFocus: false });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [shopFilter, setShopFilter] = useState("all");
  const [form, setForm] = useState({
    id: "", shopId: "", sellerSku: "", notes: "", components: [emptyComponent()] as ComponentDraft[],
  });

  const shopById = useMemo(() => new Map((data?.shops || []).map((shop) => [shop.shopId, shop])), [data?.shops]);
  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (data?.mappings || []).filter((mapping) => (
      (shopFilter === "all" || mapping.shopId === shopFilter)
      && (!keyword
        || mapping.sellerSku.toLowerCase().includes(keyword)
        || (shopById.get(mapping.shopId)?.shopName || "").toLowerCase().includes(keyword)
        || mapping.components.some((component) => component.variant.skuId.toLowerCase().includes(keyword)))
    ));
  }, [data?.mappings, search, shopById, shopFilter]);

  const reset = () => setForm({ id: "", shopId: "", sellerSku: "", notes: "", components: [emptyComponent()] });
  const edit = (mapping: Mapping) => setForm({
    id: mapping.id,
    shopId: mapping.shopId,
    sellerSku: mapping.sellerSku,
    notes: mapping.notes || "",
    components: mapping.components.map((component, index) => ({
      key: `${mapping.id}-${index}`, variantId: component.variantId, quantity: component.quantity,
    })),
  });
  const updateComponent = (index: number, patch: Partial<ComponentDraft>) => setForm((current) => ({
    ...current,
    components: current.components.map((component, componentIndex) => componentIndex === index ? { ...component, ...patch } : component),
  }));

  const save = async () => {
    const components = form.components.filter((component) => component.variantId && component.quantity > 0);
    if (!form.shopId || !form.sellerSku.trim() || components.length === 0) {
      return toast.error("请选择店铺、填写销售 SKU，并至少添加一个内部 SKU");
    }
    setSaving(true);
    try {
      const response = await fetch("/api/profit-sku-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "TIKTOK", ...form, components }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "店铺销售 SKU 映射保存失败");
      await mutate();
      reset();
      toast.success("店铺销售 SKU 映射已保存");
    } catch (saveError: any) {
      toast.error(saveError?.message || "店铺销售 SKU 映射保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (mapping: Mapping) => {
    const response = await fetch("/api/profit-sku-mappings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: mapping.id, enabled: !mapping.enabled }),
    });
    const body = await response.json();
    if (!response.ok) return toast.error(body?.error || "状态更新失败");
    await mutate();
    toast.success(mapping.enabled ? "映射已停用" : "映射已启用");
  };

  if (isLoading) return <div className="py-16 text-center text-sm text-slate-500">正在加载店铺销售 SKU 映射...</div>;
  if (error) return <div className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error.message}</div>;
  if (!data) return null;

  return <div className="space-y-5">
    <section className="border-b border-slate-800 pb-5">
      <div className="mb-4 border-l-2 border-emerald-500 bg-slate-900 px-4 py-3 text-sm text-slate-300">
        组合装请添加多行内部 SKU。系统按内部组成计算真实件数、采购成本和后续库存扣减。
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="店铺"><select value={form.shopId} onChange={(event) => setForm({ ...form, shopId: event.target.value })} className="input"><option value="">请选择</option>{data.shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName} · {shop.region}</option>)}</select></Field>
        <Field label="店铺销售 SKU"><input value={form.sellerSku} onChange={(event) => setForm({ ...form, sellerSku: event.target.value })} placeholder="例如 FY-T3B" className="input" /></Field>
        <Field label="备注"><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="例如马桶刷与刷头组合装" className="input" /></Field>
      </div>

      <div className="mt-4 overflow-x-auto border-y border-slate-800 py-4">
        <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-slate-200">内部 SKU 组成</h3><p className="mt-1 text-xs text-slate-500">普通 SKU 一行；组合装多行。相同内部 SKU 会自动合并数量。</p></div><button type="button" onClick={() => setForm({ ...form, components: [...form.components, emptyComponent(`${Date.now()}-${form.components.length}`)] })} title="添加内部 SKU" className="icon-button"><Plus className="h-4 w-4" /></button></div>
        <table className="w-full min-w-[680px] text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-2 py-2 text-left">内部 SKU / 产品</th><th className="w-32 px-2 py-2 text-left">包含数量</th><th className="w-12" /></tr></thead><tbody>{form.components.map((component, index) => <tr key={component.key} className="border-t border-slate-900"><td className="px-2 py-2"><select value={component.variantId} onChange={(event) => updateComponent(index, { variantId: event.target.value })} className="input"><option value="">请选择内部 SKU</option>{data.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.skuId} · {variant.product.name}</option>)}</select></td><td className="px-2 py-2"><input type="number" min="1" max="999" value={component.quantity} onChange={(event) => updateComponent(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="input" /></td><td><button type="button" onClick={() => setForm({ ...form, components: form.components.length === 1 ? [emptyComponent()] : form.components.filter((_, componentIndex) => componentIndex !== index) })} title="移除" className="icon-button hover:text-rose-300"><X className="h-4 w-4" /></button></td></tr>)}</tbody></table>
      </div>
      <div className="mt-4 flex gap-2"><button type="button" onClick={save} disabled={saving} className="command-button bg-emerald-600 text-white hover:bg-emerald-500"><Save className="h-4 w-4" />{form.id ? "更新映射" : "保存映射"}</button><button type="button" onClick={reset} className="command-button border border-slate-700 text-slate-300 hover:bg-slate-800"><X className="h-4 w-4" />{form.id ? "取消编辑" : "清空"}</button></div>
    </section>

    <section>
      <div className="mb-3 grid gap-3 md:grid-cols-[260px_1fr]"><select value={shopFilter} onChange={(event) => setShopFilter(event.target.value)} className="input"><option value="all">全部店铺</option>{data.shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName}</option>)}</select><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索店铺销售 SKU、内部 SKU 或店铺" className="input pl-9" /></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="text-xs text-slate-500"><tr className="border-b border-slate-800"><th className="px-3 py-3 text-left">店铺</th><th className="px-3 py-3 text-left">销售 SKU</th><th className="px-3 py-3 text-left">内部 SKU 组成</th><th className="px-3 py-3 text-left">真实件数</th><th className="px-3 py-3 text-left">状态</th><th className="px-3 py-3 text-left">备注</th><th className="w-24" /></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">暂无店铺销售 SKU 映射</td></tr> : rows.map((mapping) => <tr key={mapping.id} className="border-b border-slate-900"><td className="px-3 py-3 text-slate-300">{shopById.get(mapping.shopId)?.shopName || mapping.shopId}</td><td className="px-3 py-3 font-mono text-slate-100">{mapping.sellerSku}</td><td className="px-3 py-3 text-slate-300">{mapping.components.map((component) => `${component.variant.skuId} × ${component.quantity}`).join(" + ")}</td><td className="px-3 py-3 text-slate-200">{mapping.components.reduce((sum, component) => sum + component.quantity, 0)} 件</td><td className="px-3 py-3"><span className={mapping.enabled ? "text-emerald-300" : "text-slate-500"}>{mapping.enabled ? "启用" : "停用"}</span></td><td className="max-w-[220px] px-3 py-3 text-slate-500"><div className="truncate" title={mapping.notes || ""}>{mapping.notes || "-"}</div></td><td className="px-2 py-3"><div className="flex gap-1"><button type="button" onClick={() => edit(mapping)} title="编辑映射" className="icon-button"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => toggle(mapping)} title={mapping.enabled ? "停用映射" : "启用映射"} className="icon-button">{mapping.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}</button></div></td></tr>)}</tbody></table></div>
    </section>
    <style jsx>{`.input{height:2.5rem;width:100%;border-radius:.375rem;border:1px solid #334155;background:#0f172a;padding:0 .75rem;font-size:.875rem;color:#e2e8f0;outline:none}.input:focus{border-color:#10b981}.icon-button{display:inline-flex;height:2rem;width:2rem;align-items:center;justify-content:center;border-radius:.375rem;color:#94a3b8}.icon-button:hover{background:#1e293b;color:#f8fafc}.command-button{display:inline-flex;height:2.25rem;align-items:center;gap:.5rem;border-radius:.375rem;padding:0 1rem;font-size:.875rem;font-weight:500}.command-button:disabled{opacity:.5}`}</style>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0 text-xs text-slate-500"><span className="mb-1.5 block">{label}</span>{children}</label>;
}
