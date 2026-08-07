"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type CostRuleData = {
  shops: Array<{ id: string; name: string; currency: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  shopRules: Array<any>;
  warehouseRules: Array<any>;
};

type FeeTierDraft = {
  id: string;
  minWeightKg: string;
  maxWeightKg: string;
  minInclusive: boolean;
  maxInclusive: boolean;
  maxLengthCm: string;
  maxWidthCm: string;
  maxHeightCm: string;
  baseFee: string;
};

const HQST_FEE_TIERS: FeeTierDraft[] = [
  [0, 1, 2.5], [1, 3, 3.5], [3, 5, 6], [5, 10, 8], [10, 20, 14],
  [20, 30, 20], [30, 40, 30], [40, 50, 33], [50, 60, 40], [60, 70, 47],
].map(([min, max, fee], index) => ({
  id: `hqst-${index}`,
  minWeightKg: String(min), maxWeightKg: String(max), minInclusive: false, maxInclusive: true,
  maxLengthCm: "", maxWidthCm: "", maxHeightCm: "", baseFee: String(fee),
}));

const PANLIAN_FEE_TIERS: FeeTierDraft[] = [
  [0, 0.5, 15, 10, 3, 2.5],
  [0, 1, 30, 25, 3, 3],
  [0, 3, 50, 40, 5, 4],
].map(([min, max, length, width, height, fee], index) => ({
  id: `panlian-${index}`,
  minWeightKg: String(min), maxWeightKg: String(max), minInclusive: false, maxInclusive: true,
  maxLengthCm: String(length), maxWidthCm: String(width), maxHeightCm: String(height), baseFee: String(fee),
}));

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "成本规则加载失败");
  return body;
};

const costTypeLabel: Record<string, string> = {
  PLATFORM_FULFILLMENT: "平台及履约费预估",
  TAX: "店铺税务成本",
  INFLUENCER_COMMISSION: "达人团队佣金",
};

export default function ProfitSettingsPage() {
  const { data, error, isLoading, mutate } = useSWR<CostRuleData>("/api/profit-cost-rules", fetcher, { revalidateOnFocus: false });
  const today = new Date().toISOString().slice(0, 10);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [warehousePreset, setWarehousePreset] = useState("");
  const [shopForm, setShopForm] = useState({
    shopId: "",
    costType: "TAX",
    ratePercent: "6",
    fixedPerOrder: "0",
    fixedPerUnit: "0",
    currency: "BRL",
    effectiveFrom: today,
    effectiveTo: "",
    threshold: "50",
    lowerPlatformRate: "10",
    lowerUnitFee: "4",
    upperPlatformRate: "6",
    upperUnitFee: "6",
    notes: "",
  });
  const [warehouseForm, setWarehouseForm] = useState({
    warehouseId: "",
    shopId: "",
    pricingMode: "WEIGHT_TIER",
    billingUnit: "INTERNAL_COMPONENT",
    baseOrderFee: "1",
    firstUnitFee: "0",
    additionalUnitFee: "0.5",
    volumetricDivisor: "6000",
    overweightThresholdKg: "70",
    overweightFeePerKg: "0.1",
    feeTiers: HQST_FEE_TIERS,
    currency: "BRL",
    effectiveFrom: "",
    effectiveTo: "",
    notes: "",
  });

  const applyWarehousePreset = (preset: string) => {
    setWarehousePreset(preset);
    if (preset === "HQST") {
      setWarehouseForm((current) => ({
        ...current,
        pricingMode: "WEIGHT_TIER",
        billingUnit: "INTERNAL_COMPONENT",
        baseOrderFee: "1",
        firstUnitFee: "0",
        additionalUnitFee: "0.5",
        volumetricDivisor: "6000",
        overweightThresholdKg: "70",
        overweightFeePerKg: "0.1",
        feeTiers: HQST_FEE_TIERS,
        currency: "BRL",
        notes: "环球盛通巴西海外仓报价；包材费 R$1/单",
      }));
    } else if (preset === "PANLIAN") {
      setWarehouseForm((current) => ({
        ...current,
        pricingMode: "PACKAGE_TIER",
        billingUnit: "SELLER_UNIT",
        baseOrderFee: "0",
        firstUnitFee: "0",
        additionalUnitFee: "0",
        volumetricDivisor: "6000",
        overweightThresholdKg: "",
        overweightFeePerKg: "0",
        feeTiers: PANLIAN_FEE_TIERS,
        currency: "BRL",
        effectiveFrom: "2026-03-01",
        effectiveTo: "2026-05-31",
        notes: "磐联云仓巴西报价（历史有效期；包材费 R$0）",
      }));
    }
  };

  const saveShopRule = async () => {
    if (!shopForm.shopId || !shopForm.effectiveFrom) return toast.error("请选择店铺和生效日期");
    const isPlatform = shopForm.costType === "PLATFORM_FULFILLMENT";
    const threshold = Number(shopForm.threshold);
    const tiers = isPlatform ? [
      { minOrderAmount: null, maxOrderAmount: threshold, minInclusive: true, maxInclusive: false, platformRatePercent: Number(shopForm.lowerPlatformRate), perUnitFee: Number(shopForm.lowerUnitFee), currency: shopForm.currency },
      { minOrderAmount: threshold, maxOrderAmount: null, minInclusive: true, maxInclusive: false, platformRatePercent: Number(shopForm.upperPlatformRate), perUnitFee: Number(shopForm.upperUnitFee), currency: shopForm.currency },
    ] : undefined;
    setSaving(true);
    try {
      const response = await fetch("/api/profit-cost-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "shop",
          ...shopForm,
          ratePercent: Number(shopForm.ratePercent || 0),
          fixedPerOrder: Number(shopForm.fixedPerOrder || 0),
          fixedPerUnit: Number(shopForm.fixedPerUnit || 0),
          tiers,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "保存失败");
      await mutate();
      toast.success("店铺成本规则已保存");
    } catch (saveError: any) {
      toast.error(saveError?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const saveWarehouseRule = async () => {
    if (!warehouseForm.warehouseId || !warehouseForm.effectiveFrom) return toast.error("请选择仓库和生效日期");
    setSaving(true);
    try {
      const response = await fetch("/api/profit-cost-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "warehouse",
          ...warehouseForm,
          baseOrderFee: Number(warehouseForm.baseOrderFee || 0),
          firstUnitFee: Number(warehouseForm.firstUnitFee || 0),
          additionalUnitFee: Number(warehouseForm.additionalUnitFee || 0),
          volumetricDivisor: Number(warehouseForm.volumetricDivisor || 6000),
          overweightThresholdKg: warehouseForm.overweightThresholdKg === "" ? null : Number(warehouseForm.overweightThresholdKg),
          overweightFeePerKg: Number(warehouseForm.overweightFeePerKg || 0),
          feeTiers: warehouseForm.feeTiers.map((tier) => ({
            minWeightKg: tier.minWeightKg === "" ? null : Number(tier.minWeightKg),
            maxWeightKg: tier.maxWeightKg === "" ? null : Number(tier.maxWeightKg),
            minInclusive: tier.minInclusive,
            maxInclusive: tier.maxInclusive,
            maxLengthCm: tier.maxLengthCm === "" ? null : Number(tier.maxLengthCm),
            maxWidthCm: tier.maxWidthCm === "" ? null : Number(tier.maxWidthCm),
            maxHeightCm: tier.maxHeightCm === "" ? null : Number(tier.maxHeightCm),
            baseFee: Number(tier.baseFee || 0),
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "保存失败");
      await mutate();
      toast.success("仓库代发规则已保存");
    } catch (saveError: any) {
      toast.error(saveError?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (kind: "shop" | "warehouse", id: string) => {
    const response = await fetch(`/api/profit-cost-rules?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) return toast.error(body?.error || "删除失败");
    await mutate();
    toast.success("规则已删除");
  };

  const syncFinancials = async () => {
    if (!shopForm.shopId) return toast.error("请先选择店铺");
    setSyncing(true);
    try {
      const response = await fetch("/api/profit-financial-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: shopForm.shopId, days: 60 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "逐单账单同步失败");
      toast.success(`已同步 ${body.settledOrders} 个已结算订单，${body.estimatedOrders} 个未结算订单`);
    } catch (syncError: any) {
      toast.error(syncError?.message || "逐单账单同步失败");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/finance/profit" title="返回利润核算" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <div><h1 className="text-2xl font-semibold">利润成本规则</h1><p className="mt-1 text-xs text-slate-500">按店铺、仓库和生效日期保留历史规则</p></div>
        </div>
        <button type="button" onClick={() => mutate()} title="刷新" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
      </header>

      {error && <div className="border-b border-rose-500/30 py-4 text-sm text-rose-300">{error.message}</div>}
      {isLoading && <div className="py-16 text-center text-sm text-slate-500">正在加载成本规则...</div>}

      {data && <>
        <section className="border-b border-slate-800 py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">店铺规则</h2><p className="mt-1 text-xs text-slate-500">税务、达人团队佣金及未结算平台费预估</p></div><button type="button" onClick={syncFinancials} disabled={syncing} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />同步逐单账单</button></div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Field label="店铺"><select value={shopForm.shopId} onChange={(event) => setShopForm({ ...shopForm, shopId: event.target.value })} className="input"><option value="">请选择</option>{data.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></Field>
            <Field label="成本类型"><select value={shopForm.costType} onChange={(event) => setShopForm({ ...shopForm, costType: event.target.value })} className="input">{Object.entries(costTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="生效日期"><input type="date" value={shopForm.effectiveFrom} onChange={(event) => setShopForm({ ...shopForm, effectiveFrom: event.target.value })} className="input" /></Field>
            <Field label="结束日期"><input type="date" value={shopForm.effectiveTo} onChange={(event) => setShopForm({ ...shopForm, effectiveTo: event.target.value })} className="input" /></Field>
            {shopForm.costType !== "PLATFORM_FULFILLMENT" && <Field label="营业额比例 (%)"><input type="number" min="0" step="0.01" value={shopForm.ratePercent} onChange={(event) => setShopForm({ ...shopForm, ratePercent: event.target.value })} className="input" /></Field>}
            <Field label="备注"><input value={shopForm.notes} onChange={(event) => setShopForm({ ...shopForm, notes: event.target.value })} className="input" /></Field>
          </div>
          {shopForm.costType === "PLATFORM_FULFILLMENT" && <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-3 xl:grid-cols-5">
            <Field label="物流佣金 (%)"><input type="number" min="0" value={shopForm.ratePercent} onChange={(event) => setShopForm({ ...shopForm, ratePercent: event.target.value })} className="input" /></Field>
            <Field label={`单个订单金额分界 (${shopForm.currency})`}><input type="number" min="0" value={shopForm.threshold} onChange={(event) => setShopForm({ ...shopForm, threshold: event.target.value })} className="input" /></Field>
            <Field label="低价档平台佣金 (%)"><input type="number" min="0" value={shopForm.lowerPlatformRate} onChange={(event) => setShopForm({ ...shopForm, lowerPlatformRate: event.target.value })} className="input" /></Field>
            <Field label={`低价档每件费 (${shopForm.currency})`}><input type="number" min="0" value={shopForm.lowerUnitFee} onChange={(event) => setShopForm({ ...shopForm, lowerUnitFee: event.target.value })} className="input" /></Field>
            <Field label="高价档平台佣金 (%)"><input type="number" min="0" value={shopForm.upperPlatformRate} onChange={(event) => setShopForm({ ...shopForm, upperPlatformRate: event.target.value })} className="input" /></Field>
            <Field label={`高价档每件费 (${shopForm.currency})`}><input type="number" min="0" value={shopForm.upperUnitFee} onChange={(event) => setShopForm({ ...shopForm, upperUnitFee: event.target.value })} className="input" /></Field>
          </div>}
          <button type="button" onClick={saveShopRule} disabled={saving} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"><Save className="h-4 w-4" />保存店铺规则</button>

          <RuleTable rows={data.shopRules} shops={data.shops} onDelete={(id) => deleteRule("shop", id)} />
        </section>

        <section className="py-6">
          <div className="mb-4"><h2 className="text-base font-semibold">海外仓代发规则</h2><p className="mt-1 text-xs text-slate-500">按订单仓库、实物件数、重量、尺寸和生效日期匹配</p></div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Field label="报价模板"><select value={warehousePreset} onChange={(event) => applyWarehousePreset(event.target.value)} className="input"><option value="">自定义</option><option value="HQST">环球盛通</option><option value="PANLIAN">磐联云仓</option></select></Field>
            <Field label="海外仓"><select value={warehouseForm.warehouseId} onChange={(event) => setWarehouseForm({ ...warehouseForm, warehouseId: event.target.value })} className="input"><option value="">请选择</option>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field>
            <Field label="指定店铺"><select value={warehouseForm.shopId} onChange={(event) => setWarehouseForm({ ...warehouseForm, shopId: event.target.value })} className="input"><option value="">全部店铺</option>{data.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></Field>
            <Field label="计费方式"><select value={warehouseForm.pricingMode} onChange={(event) => setWarehouseForm({ ...warehouseForm, pricingMode: event.target.value })} className="input"><option value="FLAT_UNIT">固定首续件</option><option value="WEIGHT_TIER">重量分档</option><option value="PACKAGE_TIER">重量与尺寸分档</option></select></Field>
            <Field label="计件口径"><select value={warehouseForm.billingUnit} onChange={(event) => setWarehouseForm({ ...warehouseForm, billingUnit: event.target.value })} className="input"><option value="SELLER_UNIT">销售 SKU 件数</option><option value="INTERNAL_COMPONENT">内部商品件数</option></select></Field>
            <Field label="币种"><select value={warehouseForm.currency} onChange={(event) => setWarehouseForm({ ...warehouseForm, currency: event.target.value })} className="input"><option>BRL</option><option>USD</option><option>CNY</option></select></Field>
            <Field label={`每单基础费 (${warehouseForm.currency})`}><input type="number" min="0" value={warehouseForm.baseOrderFee} onChange={(event) => setWarehouseForm({ ...warehouseForm, baseOrderFee: event.target.value })} className="input" /></Field>
            {warehouseForm.pricingMode === "FLAT_UNIT" && <Field label={`首件费 (${warehouseForm.currency})`}><input type="number" min="0" value={warehouseForm.firstUnitFee} onChange={(event) => setWarehouseForm({ ...warehouseForm, firstUnitFee: event.target.value })} className="input" /></Field>}
            <Field label={`超首件每件费 (${warehouseForm.currency})`}><input type="number" min="0" value={warehouseForm.additionalUnitFee} onChange={(event) => setWarehouseForm({ ...warehouseForm, additionalUnitFee: event.target.value })} className="input" /></Field>
            {warehouseForm.pricingMode !== "FLAT_UNIT" && <Field label="体积重除数"><input type="number" min="1" value={warehouseForm.volumetricDivisor} onChange={(event) => setWarehouseForm({ ...warehouseForm, volumetricDivisor: event.target.value })} className="input" /></Field>}
            {warehouseForm.pricingMode === "WEIGHT_TIER" && <Field label="续重起点 (kg)"><input type="number" min="0" value={warehouseForm.overweightThresholdKg} onChange={(event) => setWarehouseForm({ ...warehouseForm, overweightThresholdKg: event.target.value })} className="input" /></Field>}
            {warehouseForm.pricingMode === "WEIGHT_TIER" && <Field label={`续重费 / kg (${warehouseForm.currency})`}><input type="number" min="0" step="0.01" value={warehouseForm.overweightFeePerKg} onChange={(event) => setWarehouseForm({ ...warehouseForm, overweightFeePerKg: event.target.value })} className="input" /></Field>}
            <Field label="生效日期"><input type="date" value={warehouseForm.effectiveFrom} onChange={(event) => setWarehouseForm({ ...warehouseForm, effectiveFrom: event.target.value })} className="input" /></Field>
            <Field label="结束日期"><input type="date" value={warehouseForm.effectiveTo} onChange={(event) => setWarehouseForm({ ...warehouseForm, effectiveTo: event.target.value })} className="input" /></Field>
            <Field label="备注"><input value={warehouseForm.notes} onChange={(event) => setWarehouseForm({ ...warehouseForm, notes: event.target.value })} className="input" /></Field>
          </div>
          {warehouseForm.pricingMode !== "FLAT_UNIT" && <FeeTierEditor
            tiers={warehouseForm.feeTiers}
            showDimensions={warehouseForm.pricingMode === "PACKAGE_TIER"}
            currency={warehouseForm.currency}
            onChange={(feeTiers) => setWarehouseForm({ ...warehouseForm, feeTiers })}
          />}
          <button type="button" onClick={saveWarehouseRule} disabled={saving} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"><Save className="h-4 w-4" />保存仓库规则</button>
          <WarehouseRuleTable rows={data.warehouseRules} shops={data.shops} onDelete={(id) => deleteRule("warehouse", id)} />
        </section>
      </>}
      <style jsx>{`.input{height:2.5rem;width:100%;border-radius:.375rem;border:1px solid #334155;background:#0f172a;padding:0 .75rem;font-size:.875rem;color:#e2e8f0;outline:none}.input:focus{border-color:#10b981}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="min-w-0 text-xs text-slate-500"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function FeeTierEditor({
  tiers,
  showDimensions,
  currency,
  onChange,
}: {
  tiers: FeeTierDraft[];
  showDimensions: boolean;
  currency: string;
  onChange: (tiers: FeeTierDraft[]) => void;
}) {
  const update = (index: number, patch: Partial<FeeTierDraft>) => {
    onChange(tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier));
  };
  const add = () => onChange([...tiers, {
    id: crypto.randomUUID(),
    minWeightKg: "", maxWeightKg: "", minInclusive: false, maxInclusive: true,
    maxLengthCm: "", maxWidthCm: "", maxHeightCm: "", baseFee: "",
  }]);
  return <div className="mt-5 overflow-x-auto border-y border-slate-800 py-4">
    <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-200">费用分档</h3><button type="button" onClick={add} title="新增分档" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"><Plus className="h-4 w-4" /></button></div>
    <table className={`w-full text-sm ${showDimensions ? "min-w-[900px]" : "min-w-[560px]"}`}>
      <thead className="text-xs text-slate-500"><tr><th className="px-2 py-2 text-left">最小重量 kg</th><th className="px-2 py-2 text-left">最大重量 kg</th>{showDimensions && <><th className="px-2 py-2 text-left">最长边 cm</th><th className="px-2 py-2 text-left">次长边 cm</th><th className="px-2 py-2 text-left">最短边 cm</th></>}<th className="px-2 py-2 text-left">每单费用 ({currency})</th><th className="w-10" /></tr></thead>
      <tbody>{tiers.map((tier, index) => <tr key={tier.id} className="border-t border-slate-900">
        <td className="px-2 py-2"><input type="number" min="0" value={tier.minWeightKg} onChange={(event) => update(index, { minWeightKg: event.target.value })} className="input" /></td>
        <td className="px-2 py-2"><input type="number" min="0" value={tier.maxWeightKg} onChange={(event) => update(index, { maxWeightKg: event.target.value })} className="input" /></td>
        {showDimensions && <><td className="px-2 py-2"><input type="number" min="0" value={tier.maxLengthCm} onChange={(event) => update(index, { maxLengthCm: event.target.value })} className="input" /></td><td className="px-2 py-2"><input type="number" min="0" value={tier.maxWidthCm} onChange={(event) => update(index, { maxWidthCm: event.target.value })} className="input" /></td><td className="px-2 py-2"><input type="number" min="0" value={tier.maxHeightCm} onChange={(event) => update(index, { maxHeightCm: event.target.value })} className="input" /></td></>}
        <td className="px-2 py-2"><input type="number" min="0" step="0.01" value={tier.baseFee} onChange={(event) => update(index, { baseFee: event.target.value })} className="input" /></td>
        <td><button type="button" onClick={() => onChange(tiers.filter((_, tierIndex) => tierIndex !== index))} title="删除分档" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-rose-300"><X className="h-4 w-4" /></button></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function RuleTable({ rows, shops, onDelete }: { rows: any[]; shops: CostRuleData["shops"]; onDelete: (id: string) => void }) {
  return <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="text-xs text-slate-500"><tr className="border-b border-slate-800"><th className="px-3 py-3 text-left">店铺</th><th className="px-3 py-3 text-left">类型</th><th className="px-3 py-3 text-left">规则</th><th className="px-3 py-3 text-left">有效期</th><th className="px-3 py-3 text-left">备注</th><th className="w-12" /></tr></thead><tbody>{rows.map((rule) => <tr key={rule.id} className="border-b border-slate-900"><td className="px-3 py-3 text-slate-300">{shops.find((shop) => shop.id === rule.shopId)?.name || rule.shopId}</td><td className="px-3 py-3 text-slate-400">{costTypeLabel[rule.costType] || rule.costType}</td><td className="px-3 py-3 text-slate-300">{rule.platformFeeTiers?.length ? `SFP ${rule.ratePercent}%；` + rule.platformFeeTiers.map((tier: any) => `${tier.maxOrderAmount != null ? `<${tier.maxOrderAmount}` : `≥${tier.minOrderAmount}`}：平台 ${tier.platformRatePercent}% + 每件服务费 ${tier.perUnitFee} ${tier.currency}`).join("；") : `${rule.ratePercent}%`}</td><td className="px-3 py-3 text-slate-400">{rule.effectiveFrom} 至 {rule.effectiveTo || "长期"}</td><td className="px-3 py-3 text-slate-500">{rule.notes || "-"}</td><td><button type="button" onClick={() => onDelete(rule.id)} title="删除规则" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>;
}

function WarehouseRuleTable({ rows, shops, onDelete }: { rows: any[]; shops: CostRuleData["shops"]; onDelete: (id: string) => void }) {
  return <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead className="text-xs text-slate-500"><tr className="border-b border-slate-800"><th className="px-3 py-3 text-left">仓库</th><th className="px-3 py-3 text-left">店铺</th><th className="px-3 py-3 text-left">收费</th><th className="px-3 py-3 text-left">计件口径</th><th className="px-3 py-3 text-left">有效期</th><th className="px-3 py-3 text-left">备注</th><th className="w-12" /></tr></thead><tbody>{rows.map((rule) => {
    const feeText = rule.pricingMode === "WEIGHT_TIER"
      ? `重量 ${rule.feeTiers?.length || 0} 档；超首件 ${rule.additionalUnitFee}；>${rule.overweightThresholdKg || "-"}kg +${rule.overweightFeePerKg}/kg ${rule.currency}`
      : rule.pricingMode === "PACKAGE_TIER"
        ? `重量/尺寸 ${rule.feeTiers?.length || 0} 档；超范围待询价 ${rule.currency}`
        : `基础 ${rule.baseOrderFee} + 首件 ${rule.firstUnitFee} + 续件 ${rule.additionalUnitFee} ${rule.currency}`;
    return <tr key={rule.id} className="border-b border-slate-900"><td className="px-3 py-3 text-slate-300">{rule.warehouse?.name}</td><td className="px-3 py-3 text-slate-400">{rule.shopId ? shops.find((shop) => shop.id === rule.shopId)?.name : "全部店铺"}</td><td className="px-3 py-3 text-slate-300">{feeText}</td><td className="px-3 py-3 text-slate-400">{rule.billingUnit === "INTERNAL_COMPONENT" ? "内部商品件数" : "销售 SKU 件数"}</td><td className="px-3 py-3 text-slate-400">{rule.effectiveFrom} 至 {rule.effectiveTo || "长期"}</td><td className="max-w-[280px] px-3 py-3 text-slate-500"><div className="truncate" title={rule.notes || ""}>{rule.notes || "-"}</div></td><td><button type="button" onClick={() => onDelete(rule.id)} title="删除规则" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button></td></tr>;
  })}</tbody></table></div>;
}
