"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Calculator, CircleAlert, Plus, Save, Search, Trash2 } from "lucide-react";
import {
  calculateProfitEstimate, estimatedWarehouseFeeBrl, PROFIT_ESTIMATE_LABELS,
  PROFIT_ESTIMATE_PLATFORMS, type ProfitEstimatePlatform,
} from "@/lib/profit-estimate";
import { compressImage } from "@/lib/image-utils";

type ProductOption = { id: string; skuId: string; name: string; purchaseCostCny: number; weightKg: number | null };
type SelectionItem = {
  id: string; platform: ProfitEstimatePlatform; name: string; sellerSku: string | null;
  imageUrl: string | null;
  productVariantId: string | null; linkedSku: string | null; purchaseCostCny: number;
  weightKg: number | null; targetPriceBrl: number | null; firstLegCny: number;
  status: string; notes: string | null; updatedAt: string;
};
type HistoryItem = {
  id: string; platform: ProfitEstimatePlatform; productName: string; skuId: string | null;
  grossRevenueBrl: number; settlementBrl: number; exchangeRate: number;
  netProfitCny: number; roi: number; breakEvenRoi: number; createdAt: string;
  inputSnapshot: { version?: number } | null;
};
type EstimateForm = {
  productName: string; purchaseCostCny: string; weightKg: string; firstLegCny: string;
  adCostCny: string; salePriceBrl: string; discountSalePriceBrl: string; exchangeRate: string;
  quantity: string; warehouseFeeBrl: string; platformFeePercent: string;
  fulfillmentFeeBrl: string; lastMileFeeBrl: string; affiliateFeeBrl: string; taxPercent: string;
  invoiceFeePercent: string; remittanceFeePercent: string; targetRoi: string;
};
type SelectionForm = {
  name: string; sellerSku: string; productVariantId: string; purchaseCostCny: string;
  weightKg: string; targetPriceBrl: string; firstLegCny: string;
  status: string; notes: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `请求失败 (${response.status})`);
  return body;
};
const money = (value: number) => Number.isFinite(value) ? value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
const num = (value: string) => Number(value || 0);
const fieldClass = "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500";
const labelClass = "text-xs text-slate-400";
const blankSelection: SelectionForm = { name: "", sellerSku: "", productVariantId: "", purchaseCostCny: "0", weightKg: "", targetPriceBrl: "", firstLegCny: "0", status: "CANDIDATE", notes: "" };

function blankEstimate(platform: ProfitEstimatePlatform): EstimateForm {
  return {
    productName: "", purchaseCostCny: "0", weightKg: "", firstLegCny: "0", adCostCny: "0",
    salePriceBrl: "0", discountSalePriceBrl: "", exchangeRate: "1.35", quantity: "1",
    warehouseFeeBrl: "0", platformFeePercent: "0", fulfillmentFeeBrl: "0", lastMileFeeBrl: "0", affiliateFeeBrl: "0",
    taxPercent: "0", invoiceFeePercent: platform === "TIKTOK" ? "6" : "0",
    remittanceFeePercent: platform === "TIKTOK" ? "1" : "0", targetRoi: "",
  };
}

function NumberField({ label, value, onChange, hint, step = "0.01" }: {
  label: string; value: string; onChange: (value: string) => void; hint?: string; step?: string;
}) {
  return <label className={labelClass}>{label}
    <input type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
  </label>;
}

export default function ProfitCalculationPage() {
  const [platform, setPlatform] = useState<ProfitEstimatePlatform>("TIKTOK");
  const [tab, setTab] = useState<"estimate" | "selection">("estimate");
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<EstimateForm>(() => blankEstimate("TIKTOK"));
  const [shippingMode, setShippingMode] = useState<"SFP" | "WAREHOUSE_3PL">("SFP");
  const [manualExchangeRate, setManualExchangeRate] = useState(false);
  const [selectionForm, setSelectionForm] = useState<SelectionForm>(blankSelection);
  const [editingSelectionId, setEditingSelectionId] = useState<string | null>(null);
  const [selectionImage, setSelectionImage] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null | undefined>(undefined);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: selections = [], error: selectionError, mutate: refreshSelections } = useSWR<SelectionItem[]>(
    `/api/profit-selection?platform=${platform}`, fetcher, { revalidateOnFocus: false },
  );
  const { data: history = [], error: historyError, mutate: refreshHistory } = useSWR<HistoryItem[]>(
    `/api/profit-calculations?platform=${platform}`, fetcher, { revalidateOnFocus: false },
  );
  const { data: products = [] } = useSWR<ProductOption[]>(
    `/api/profit-calculations/products?q=${encodeURIComponent(productSearch)}`, fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 },
  );
  const { data: financeRates } = useSWR<{ success: boolean; data?: { BRL?: number; USD?: number } }>(
    "/api/finance-rates", fetcher, { revalidateOnFocus: false },
  );
  const systemBrlRate = financeRates?.success && Number(financeRates.data?.BRL) > 0 ? Number(financeRates.data?.BRL) : null;
  const usdRate = financeRates?.success && Number(financeRates.data?.USD) > 0 ? Number(financeRates.data?.USD) : null;
  useEffect(() => {
    if (systemBrlRate && !manualExchangeRate) setForm((current) => ({ ...current, exchangeRate: systemBrlRate.toFixed(4) }));
  }, [manualExchangeRate, systemBrlRate]);

  const updateForm = <K extends keyof EstimateForm>(key: K, value: EstimateForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateSelection = <K extends keyof SelectionForm>(key: K, value: SelectionForm[K]) => setSelectionForm((current) => ({ ...current, [key]: value }));
  const calculation = useMemo(() => calculateProfitEstimate({
    platform, quantity: num(form.quantity), salePriceBrl: num(form.salePriceBrl),
    discountSalePriceBrl: num(form.discountSalePriceBrl), exchangeRate: num(form.exchangeRate),
    purchaseCostCny: num(form.purchaseCostCny), firstLegCny: num(form.firstLegCny),
    adCostCny: num(form.adCostCny), weightKg: num(form.weightKg),
    warehouseFeeBrl: num(form.warehouseFeeBrl), platformFeePercent: num(form.platformFeePercent),
    fulfillmentFeeBrl: num(form.fulfillmentFeeBrl), lastMileFeeBrl: num(form.lastMileFeeBrl),
    affiliateFeeBrl: num(form.affiliateFeeBrl),
    taxPercent: num(form.taxPercent), invoiceFeePercent: num(form.invoiceFeePercent),
    remittanceFeePercent: num(form.remittanceFeePercent), isCommissionFree: false,
    targetRoi: num(form.targetRoi),
  }), [form, platform]);

  const changePlatform = (value: ProfitEstimatePlatform) => {
    setPlatform(value); setSelectedId(""); setForm(blankEstimate(value));
    setEditingSelectionId(null); setSelectionForm(blankSelection); setSelectionImage(null); setImageDataUrl(undefined); setManualExchangeRate(false);
  };
  const acceptSelectionImage = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("请选择 JPG、PNG、WebP 或 GIF 图片"); return;
    }
    if (file.size > 10 * 1024 * 1024) { toast.error("原图不能超过 10 MB"); return; }
    setImageBusy(true);
    try {
      const dataUrl = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.78, maxSizeKB: 250, outputFormat: "jpeg" });
      if (dataUrl.length > 410_000) throw new Error("压缩后图片超过 300 KB，请换一张图片");
      setSelectionImage(dataUrl); setImageDataUrl(dataUrl);
    } catch (error) { toast.error(error instanceof Error ? error.message : "图片处理失败"); }
    finally { setImageBusy(false); }
  };
  const selectCandidate = (id: string) => {
    setSelectedId(id);
    const row = selections.find((item) => item.id === id);
    if (!row) return;
    setForm((current) => ({ ...current, productName: row.name,
      purchaseCostCny: String(row.purchaseCostCny), weightKg: row.weightKg == null ? "" : String(row.weightKg),
      firstLegCny: String(row.firstLegCny), salePriceBrl: row.targetPriceBrl == null ? current.salePriceBrl : String(row.targetPriceBrl),
    }));
  };
  const selectCatalogProduct = (id: string) => {
    const item = products.find((product) => product.id === id);
    if (!item) { updateSelection("productVariantId", ""); return; }
    setSelectionForm((current) => ({ ...current, productVariantId: id, name: item.name,
      sellerSku: item.skuId, purchaseCostCny: String(item.purchaseCostCny),
      weightKg: item.weightKg == null ? "" : String(item.weightKg),
    }));
  };
  const saveSelection = async () => {
    if (!selectionForm.name.trim()) { toast.error("请填写选品名称"); return; }
    if (imageBusy) { toast.error("图片仍在处理中，请稍候"); return; }
    setSaving(true);
    try {
      const endpoint = editingSelectionId ? `/api/profit-selection/${editingSelectionId}` : "/api/profit-selection";
      const response = await fetch(endpoint, { method: editingSelectionId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          ...selectionForm, platform, imageDataUrl, purchaseCostCny: num(selectionForm.purchaseCostCny),
          firstLegCny: num(selectionForm.firstLegCny), weightKg: selectionForm.weightKg === "" ? null : num(selectionForm.weightKg),
          targetPriceBrl: selectionForm.targetPriceBrl === "" ? null : num(selectionForm.targetPriceBrl),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      await refreshSelections(); setEditingSelectionId(null); setSelectionForm(blankSelection); setSelectionImage(null); setImageDataUrl(undefined);
      toast.success("选品记录已保存");
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };
  const editSelection = (row: SelectionItem) => {
    setEditingSelectionId(row.id);
    setSelectionImage(row.imageUrl ? `${row.imageUrl}?v=${encodeURIComponent(row.updatedAt)}` : null); setImageDataUrl(undefined);
    setSelectionForm({ name: row.name, sellerSku: row.sellerSku || "", productVariantId: row.productVariantId || "",
      purchaseCostCny: String(row.purchaseCostCny), weightKg: row.weightKg == null ? "" : String(row.weightKg),
      targetPriceBrl: row.targetPriceBrl == null ? "" : String(row.targetPriceBrl), firstLegCny: String(row.firstLegCny),
      status: row.status, notes: row.notes || "",
    });
    setTab("selection");
  };
  const deleteSelection = async (row: SelectionItem) => {
    if (!window.confirm(`确定删除选品记录“${row.name}”？历史测算不会删除。`)) return;
    const response = await fetch(`/api/profit-selection/${row.id}`, { method: "DELETE" });
    if (!response.ok) { toast.error("删除失败"); return; }
    if (selectedId === row.id) setSelectedId("");
    await refreshSelections(); toast.success("已删除选品记录");
  };
  const saveEstimate = async () => {
    if (!form.productName.trim()) { toast.error("请从价格选品表选择商品，或填写商品名称"); return; }
    if (num(form.exchangeRate) <= 0 || num(form.salePriceBrl) <= 0 || num(form.quantity) < 1) {
      toast.error("售价、汇率和件数必须大于 0"); return;
    }
    setSaving(true);
    try {
      const selected = selections.find((item) => item.id === selectedId);
      const response = await fetch("/api/profit-calculations", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          platform, selectionItemId: selectedId || null, productId: selected?.productVariantId || null,
          productName: form.productName.trim(), ...Object.fromEntries(Object.entries(form).filter(([key]) => key !== "productName").map(([key, value]) => [key, value === "" ? null : num(value)])),
          isCommissionFree: false, shippingMode,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      await refreshHistory(); toast.success("预测测算已存档");
    } catch (error) { toast.error(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };
  const deleteHistory = async (id: string) => {
    if (!window.confirm("确定删除这条测算历史？")) return;
    const response = await fetch(`/api/profit-calculations/${id}`, { method: "DELETE" });
    if (!response.ok) { toast.error("删除失败"); return; }
    await refreshHistory(); toast.success("已删除");
  };

  const breakdown: Array<[string, number, string]> = [
    ["商品销售额", calculation.gmvBrl, "BRL"], [platform === "TIKTOK" ? "平台佣金（含每件费）" : "平台佣金", -calculation.platformFeeBrl, "BRL"],
    ["履约费", -calculation.fulfillmentFeeBrl, "BRL"], ["尾程物流费", -calculation.lastMileFeeBrl, "BRL"],
    ["预计结算额", calculation.settlementBrl, "BRL"], ["采购成本", -calculation.purchaseCostCny, "CNY"],
    ["头程物流", -calculation.firstLegCny, "CNY"], ["海外仓费", -calculation.warehouseFeeCny, "CNY"],
    ["广告费", -calculation.adCostCny, "CNY"], ["税费", -calculation.taxCostCny, "CNY"],
    ["达人佣金", -calculation.affiliateFeeCny, "CNY"],
    ["开票费", -calculation.invoiceFeeCny, "CNY"], ["回款手续费", -calculation.remittanceFeeCny, "CNY"],
  ];

  return <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <header className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-2 text-cyan-300"><Calculator size={18} /><span className="text-xs tracking-[0.18em]">OPS PROFIT TOOL</span></div>
      <h1 className="mt-2 text-2xl font-semibold">跨平台利润测算</h1>
      <p className="mt-1 text-sm text-slate-400">价格选品 → 费用预测 → 利润与广告保本点。这里是预测，不替代实际利润核算与官方结算单。</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-400">平台
          <select className={`${fieldClass} min-w-[220px]`} value={platform} onChange={(event) => changePlatform(event.target.value as ProfitEstimatePlatform)}>
            {PROFIT_ESTIMATE_PLATFORMS.map((value) => <option key={value} value={value}>{PROFIT_ESTIMATE_LABELS[value]}</option>)}
          </select>
        </label>
        <div className="flex rounded-lg border border-slate-700 p-1 text-sm">
          <button className={`rounded-md px-3 py-2 ${tab === "estimate" ? "bg-cyan-600 text-white" : "text-slate-400"}`} onClick={() => setTab("estimate")}>利润测算</button>
          <button className={`rounded-md px-3 py-2 ${tab === "selection" ? "bg-cyan-600 text-white" : "text-slate-400"}`} onClick={() => setTab("selection")}>价格选品表格</button>
        </div>
      </div>
    </header>

    {selectionError && <p className="rounded-lg border border-rose-600/40 bg-rose-950/30 p-3 text-sm text-rose-300">选品表加载失败：{selectionError.message}</p>}
    {tab === "selection" ? <>
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold">{editingSelectionId ? "编辑候选商品" : "新增候选商品"}</h2>
        <p className="mt-1 text-xs text-slate-400">可关联主商品库 SKU，也可以先手动登记尚未建档的选品。各平台的候选商品分开管理。</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="md:col-span-3 xl:col-span-4">
            <div className={labelClass}>产品图片（可选）</div>
            <div tabIndex={0} onPaste={(event) => {
              const file = Array.from(event.clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
              if (file) { event.preventDefault(); void acceptSelectionImage(file); }
            }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
              event.preventDefault(); void acceptSelectionImage(event.dataTransfer.files[0]);
            }} className="mt-1 flex min-h-28 items-center gap-4 rounded-lg border border-dashed border-slate-600 bg-slate-950 p-3 outline-none focus:border-cyan-500">
              {selectionImage && <img src={selectionImage} alt="候选商品预览" className="h-20 w-20 rounded-md object-cover" />}
              <div className="space-y-2 text-xs text-slate-400">
                <p>点击此区域后按 Ctrl+V 粘贴图片，也可拖入或选择文件</p>
                <button type="button" disabled={imageBusy} onClick={() => imageInputRef.current?.click()} className="rounded-md border border-slate-600 px-3 py-1.5 text-cyan-300 disabled:opacity-50">{imageBusy ? "处理图片中…" : "选择图片"}</button>
                {selectionImage && <button type="button" onClick={() => { setSelectionImage(null); setImageDataUrl(null); }} className="ml-2 text-rose-300">移除图片</button>}
                <p>支持 JPG、PNG、WebP、GIF，自动压缩；最多 300 KB</p>
              </div>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => {
                void acceptSelectionImage(event.target.files?.[0]); event.target.value = "";
              }} />
            </div>
          </div>
          <label className={labelClass}>搜索主商品库 SKU
            <div className="relative"><Search size={15} className="absolute left-3 top-4 text-slate-500" />
              <input className={`${fieldClass} pl-9`} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="商品名或 SKU" /></div>
            <select className={fieldClass} value={products.some((item) => item.id === selectionForm.productVariantId) ? selectionForm.productVariantId : ""} onChange={(event) => selectCatalogProduct(event.target.value)}>
              <option value="">不关联主商品库</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.skuId}</option>)}
            </select>
          </label>
          <label className={labelClass}>候选商品名称<input className={fieldClass} value={selectionForm.name} onChange={(event) => updateSelection("name", event.target.value)} /></label>
          <label className={labelClass}>SKU / 选品编号<input className={fieldClass} value={selectionForm.sellerSku} onChange={(event) => updateSelection("sellerSku", event.target.value)} /></label>
          <label className={labelClass}>状态<select className={fieldClass} value={selectionForm.status} onChange={(event) => updateSelection("status", event.target.value)}>
            <option value="CANDIDATE">待评估</option><option value="SHORTLIST">入选</option><option value="REJECTED">淘汰</option>
          </select></label>
          <NumberField label="采购成本 CNY/件" value={selectionForm.purchaseCostCny} onChange={(value) => updateSelection("purchaseCostCny", value)} />
          <NumberField label="重量 kg/件" value={selectionForm.weightKg} onChange={(value) => updateSelection("weightKg", value)} step="0.001" />
          <NumberField label="目标售价 BRL/件" value={selectionForm.targetPriceBrl} onChange={(value) => updateSelection("targetPriceBrl", value)} />
          <NumberField label="头程物流 CNY/件" value={selectionForm.firstLegCny} onChange={(value) => updateSelection("firstLegCny", value)} />
          <label className={`${labelClass} md:col-span-3 xl:col-span-4`}>备注<input className={fieldClass} value={selectionForm.notes} onChange={(event) => updateSelection("notes", event.target.value)} placeholder="供应商、价格依据、待核事项" /></label>
        </div>
        <div className="mt-4 flex gap-2"><button disabled={saving || imageBusy} onClick={saveSelection} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white disabled:opacity-50"><Plus size={15} />{editingSelectionId ? "保存修改" : "加入选品表"}</button>
          {editingSelectionId && <button onClick={() => { setEditingSelectionId(null); setSelectionForm(blankSelection); setSelectionImage(null); setImageDataUrl(undefined); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">取消编辑</button>}</div>
      </section>
      <section className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-lg font-semibold">{PROFIT_ESTIMATE_LABELS[platform]} · 价格选品表格</h2>
        <table className="min-w-[850px] w-full text-left text-sm"><thead className="border-b border-slate-700 text-slate-400"><tr>
          <th className="py-2">商品 / SKU</th><th>状态</th><th>采购成本</th><th>目标售价</th><th>头程/件</th><th>重量</th><th>更新</th><th className="text-right">操作</th>
        </tr></thead><tbody>{selections.map((row) => <tr key={row.id} className="border-b border-slate-800/70">
          <td className="py-3"><div className="flex items-center gap-2">{row.imageUrl && <img src={`${row.imageUrl}?v=${encodeURIComponent(row.updatedAt)}`} alt="" className="h-10 w-10 rounded object-cover" />}<div><div>{row.name}</div><div className="text-xs text-slate-500">{row.sellerSku || row.linkedSku || "未录 SKU"}</div></div></div></td>
          <td>{row.status === "SHORTLIST" ? "入选" : row.status === "REJECTED" ? "淘汰" : "待评估"}</td>
          <td>¥{money(row.purchaseCostCny)}</td><td>{row.targetPriceBrl == null ? "待定" : `R$ ${money(row.targetPriceBrl)}`}</td>
          <td>¥{money(row.firstLegCny)}</td><td>{row.weightKg == null ? "-" : `${row.weightKg} kg`}</td>
          <td className="text-xs text-slate-500">{new Date(row.updatedAt).toLocaleDateString("zh-CN")}</td>
          <td className="space-x-3 text-right"><button className="text-cyan-300" onClick={() => { selectCandidate(row.id); setTab("estimate"); }}>测算</button>
            <button className="text-slate-300" onClick={() => editSelection(row)}>编辑</button>
            <button className="text-rose-400" onClick={() => deleteSelection(row)}>删除</button></td>
        </tr>)}</tbody></table>{!selections.length && <div className="py-8 text-center text-sm text-slate-500">暂无选品。先添加候选商品，再从利润测算中直接选取。</div>}
      </section>
    </> : <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">测算参数</h2><span className="text-xs text-amber-300">手填费用均为预测值，官方结算后以实际报表为准</span></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>从价格选品表选择商品
              <select className={fieldClass} value={selectedId} onChange={(event) => selectCandidate(event.target.value)}><option value="">手工录入</option>
                {selections.filter((row) => row.status !== "REJECTED").map((row) => <option key={row.id} value={row.id}>{row.name} · {row.sellerSku || row.linkedSku || "无 SKU"}</option>)}
              </select>
            </label>
            <label className={labelClass}>商品名称<input className={fieldClass} value={form.productName} onChange={(event) => updateForm("productName", event.target.value)} /></label>
            <NumberField label="售价 BRL/件" value={form.salePriceBrl} onChange={(value) => updateForm("salePriceBrl", value)} />
            <NumberField label="折扣后售价 BRL/件（留空按售价）" value={form.discountSalePriceBrl} onChange={(value) => updateForm("discountSalePriceBrl", value)} />
            <NumberField label="件数" value={form.quantity} onChange={(value) => updateForm("quantity", value)} step="1" />
            <NumberField label="汇率 1 BRL = ? CNY" value={form.exchangeRate} onChange={(value) => { setManualExchangeRate(true); updateForm("exchangeRate", value); }} step="0.0001" hint={systemBrlRate ? `系统当前 ${systemBrlRate.toFixed(4)}；手动修改仅用于本次测算` : "系统汇率未取到，请核对手填汇率"} />
            <NumberField label="采购成本 CNY/件" value={form.purchaseCostCny} onChange={(value) => updateForm("purchaseCostCny", value)} />
            <NumberField label="头程物流 CNY/件" value={form.firstLegCny} onChange={(value) => updateForm("firstLegCny", value)} />
            <NumberField label="广告分摊 CNY/件" value={form.adCostCny} onChange={(value) => updateForm("adCostCny", value)} />
            <NumberField label="重量 kg/件" value={form.weightKg} onChange={(value) => updateForm("weightKg", value)} step="0.001" />
            <label className={labelClass}>海外仓操作费 BRL/单
              <div className="flex gap-2"><input type="number" min="0" step="0.01" className={fieldClass} value={form.warehouseFeeBrl} onChange={(event) => updateForm("warehouseFeeBrl", event.target.value)} />
                <button className="mt-1 shrink-0 rounded-lg border border-slate-600 px-2 text-xs text-cyan-300" onClick={() => updateForm("warehouseFeeBrl", String(estimatedWarehouseFeeBrl(num(form.weightKg), num(form.quantity))))}>按重量估算</button></div>
            </label>
            {platform !== "TIKTOK" && <NumberField label="平台佣金率 %" value={form.platformFeePercent} onChange={(value) => updateForm("platformFeePercent", value)} hint="请依据该平台商品类目/店铺费率填写，默认 0 不代表免佣" />}
            <NumberField label="履约费 BRL/单" value={form.fulfillmentFeeBrl} onChange={(value) => updateForm("fulfillmentFeeBrl", value)} />
            <NumberField label="尾程物流费 BRL/单" value={form.lastMileFeeBrl} onChange={(value) => updateForm("lastMileFeeBrl", value)} />
            <NumberField label="达人/联盟佣金 BRL/单" value={form.affiliateFeeBrl} onChange={(value) => updateForm("affiliateFeeBrl", value)} />
            <NumberField label="税费率 %（按 GMV）" value={form.taxPercent} onChange={(value) => updateForm("taxPercent", value)} />
            <NumberField label="开票费率 %（按预计结算额）" value={form.invoiceFeePercent} onChange={(value) => updateForm("invoiceFeePercent", value)} />
            <NumberField label="回款手续费率 %（按预计结算额）" value={form.remittanceFeePercent} onChange={(value) => updateForm("remittanceFeePercent", value)} />
            <NumberField label="目标广告 ROI" value={form.targetRoi} onChange={(value) => updateForm("targetRoi", value)} hint="ROI = GMV ÷ 广告消耗；不填则不推演目标利润" />
          </div>
          {platform === "TIKTOK" && <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">按卖家折扣后单件售价分档：低于 R$50 为 10%＋R$4/件；R$50 及以上为 6%＋R$6/件。这是一项佣金，不另加 6% SFP。</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-400"><span>履约模式：</span>
            <button onClick={() => setShippingMode("SFP")} className={`rounded-md px-3 py-1.5 ${shippingMode === "SFP" ? "bg-blue-600 text-white" : "bg-slate-800"}`}>自发货</button>
            <button onClick={() => setShippingMode("WAREHOUSE_3PL")} className={`rounded-md px-3 py-1.5 ${shippingMode === "WAREHOUSE_3PL" ? "bg-blue-600 text-white" : "bg-slate-800"}`}>海外仓</button>
            <span className="text-xs">费用仍按上方填写值计算，模式用于存档说明。</span>
          </div>
          <button disabled={saving} onClick={saveEstimate} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"><Save size={16} />保存预测测算</button>
        </section>
        <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">测算仪表盘</h2>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["GMV", calculation.gmvBrl, "BRL"], ["预计结算", calculation.settlementBrl, "BRL"],
              ["预计净利润", calculation.netProfitCny, "CNY"], ["利润率", calculation.profitRate, "%"],
            ] as Array<[string, number, string]>).map(([label, value, unit]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-semibold text-cyan-300">{money(value)} {unit}</div></div>)}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"><div className="text-slate-400">广告保本与目标</div>
            <div className="mt-2 flex justify-between"><span>保本广告预算</span><span>¥{money(calculation.breakEvenAdCostCny)}</span></div>
            <div className="mt-2 flex justify-between"><span>保本 ROI</span><span>{calculation.breakEvenRoi > 0 ? calculation.breakEvenRoi.toFixed(2) : "无法保本"}</span></div>
            <div className="mt-2 flex justify-between"><span>当前广告 ROI</span><span>{calculation.adRoi > 0 ? calculation.adRoi.toFixed(2) : "未填广告费"}</span></div>
            <div className="mt-2 flex justify-between"><span>目标 ROI 下利润</span><span>{calculation.expectedProfitCny == null ? "—" : `¥${money(calculation.expectedProfitCny)}`}</span></div>
            {usdRate && <div className="mt-2 text-xs text-slate-500">保本广告预算约 USD {money(calculation.breakEvenAdCostCny / usdRate)}；系统汇率 {usdRate.toFixed(4)} CNY/USD</div>}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm"><h3 className="mb-2 text-slate-400">核算拆解</h3>
            {breakdown.map(([label, value, unit]) => <div key={label} className="flex justify-between gap-2 border-t border-slate-800/60 py-1.5"><span>{label}</span><span className="tabular-nums">{value < 0 ? "−" : ""}{money(Math.abs(value))} {unit}</span></div>)}
          </div>
          {(platform !== "TIKTOK" && num(form.platformFeePercent) === 0 || num(form.lastMileFeeBrl) === 0) && <div className="flex gap-2 rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-300"><CircleAlert size={15} className="shrink-0" />部分平台/尾程费用为 0。若尚未拿到报价，利润可能偏高。</div>}
        </aside>
      </div>
      <section className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="mb-3 text-lg font-semibold">测算历史 · {PROFIT_ESTIMATE_LABELS[platform]}</h2>
        {historyError && <p className="text-sm text-rose-300">历史加载失败：{historyError.message}</p>}
        <table className="min-w-[760px] w-full text-left text-sm"><thead className="border-b border-slate-700 text-slate-400"><tr><th className="py-2">商品</th><th>GMV</th><th>预计结算</th><th>净利润</th><th>保本 ROI</th><th>口径</th><th>时间</th><th className="text-right">操作</th></tr></thead>
          <tbody>{history.filter((row) => (row.platform || "TIKTOK") === platform).map((row) => <tr key={row.id} className="border-b border-slate-800/70"><td className="py-3">{row.productName}<div className="text-xs text-slate-500">{row.skuId || ""}</div></td><td>R$ {money(row.grossRevenueBrl)}</td><td>R$ {money(row.settlementBrl)}</td><td>¥{money(row.netProfitCny)}</td><td>{row.breakEvenRoi.toFixed(2)}</td><td className="text-xs text-slate-500">{row.inputSnapshot?.version === 2 ? "预测 v2" : "旧版测算"}</td><td className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleString("zh-CN")}</td><td className="text-right"><button onClick={() => deleteHistory(row.id)} className="inline-flex items-center gap-1 text-rose-400"><Trash2 size={14} />删除</button></td></tr>)}</tbody>
        </table>
      </section>
    </>}
  </div>;
}
