"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowRight, CheckCircle2, Clock3, PackageCheck, Plus, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";

type VariantOption = {
  id: string;
  skuId: string;
  color?: string | null;
  size?: string | null;
  product: { name: string };
};

type Conversion = {
  id: string;
  conversionNo: string;
  plannedQty: number;
  completedQty: number;
  damagedQty: number;
  status: "PROCESSING" | "COMPLETED" | "CANCELLED";
  feeAmount: number;
  feeCurrency: string;
  notes?: string | null;
  completionNotes?: string | null;
  evidence?: string | null;
  createdBy?: string | null;
  completedBy?: string | null;
  createdAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  warehouse: { id: string; code: string; name: string; type: string };
  sourceVariant: VariantOption;
  outputs: Array<{ id: string; variantId: string; quantityPerSource: number; variant: VariantOption }>;
};

type ConversionData = {
  conversions: Conversion[];
  warehouses: Array<{ id: string; code: string; name: string; type: string }>;
  stocks: Array<{ id: string; warehouseId: string; variantId: string; qty: number; reservedQty: number; availableQty: number; variant: VariantOption }>;
  variants: VariantOption[];
};

type Props = {
  view: "create" | "records";
  initialWarehouseId?: string;
  onStocksChanged?: () => void | Promise<unknown>;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "数据加载失败");
  return result;
};

const variantLabel = (variant: VariantOption) =>
  `${variant.skuId} · ${variant.product.name}${[variant.color, variant.size].filter(Boolean).length ? ` · ${[variant.color, variant.size].filter(Boolean).join("/")}` : ""}`;

const statusStyle = {
  PROCESSING: { label: "拆装中", className: "border-amber-500/30 bg-amber-500/10 text-amber-200", icon: Clock3 },
  COMPLETED: { label: "已完成", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", icon: CheckCircle2 },
  CANCELLED: { label: "已取消", className: "border-slate-600 bg-slate-800 text-slate-400", icon: XCircle },
} as const;

export default function SkuConversionPanel({ view, initialWarehouseId, onStocksChanged }: Props) {
  const { data, error, isLoading, mutate } = useSWR<ConversionData>("/api/inventory/sku-conversions", fetcher, {
    revalidateOnFocus: false,
  });
  const [warehouseId, setWarehouseId] = useState("");
  const [sourceVariantId, setSourceVariantId] = useState("");
  const [plannedQty, setPlannedQty] = useState("");
  const [feeAmount, setFeeAmount] = useState("0");
  const [feeCurrency, setFeeCurrency] = useState("BRL");
  const [notes, setNotes] = useState("");
  const [outputs, setOutputs] = useState([{ variantId: "", quantityPerSource: "1" }, { variantId: "", quantityPerSource: "1" }]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState<Conversion | null>(null);
  const [completedQty, setCompletedQty] = useState("");
  const [damagedQty, setDamagedQty] = useState("0");
  const [actualFeeAmount, setActualFeeAmount] = useState("0");
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionEvidence, setCompletionEvidence] = useState<string | string[]>([]);
  const [actionSaving, setActionSaving] = useState(false);

  useEffect(() => {
    if (initialWarehouseId && data?.warehouses.some((warehouse) => warehouse.id === initialWarehouseId)) {
      setWarehouseId(initialWarehouseId);
    } else if (!warehouseId && data?.warehouses.length) {
      setWarehouseId(data.warehouses[0].id);
    }
  }, [data?.warehouses, initialWarehouseId, warehouseId]);

  useEffect(() => {
    setSourceVariantId("");
  }, [warehouseId]);

  const sourceStocks = useMemo(
    () => (data?.stocks || []).filter((stock) => stock.warehouseId === warehouseId && stock.availableQty > 0),
    [data?.stocks, warehouseId],
  );
  const selectedSourceStock = sourceStocks.find((stock) => stock.variantId === sourceVariantId);
  const processing = (data?.conversions || []).filter((conversion) => conversion.status === "PROCESSING");
  const records = (data?.conversions || []).filter((conversion) => conversion.status !== "PROCESSING");

  const refreshAll = async () => {
    await mutate();
    await onStocksChanged?.();
  };

  const updateOutput = (index: number, patch: Partial<{ variantId: string; quantityPerSource: string }>) => {
    setOutputs((current) => current.map((output, outputIndex) => outputIndex === index ? { ...output, ...patch } : output));
  };

  const createConversion = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/inventory/sku-conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId,
          sourceVariantId,
          plannedQty: Number(plannedQty),
          feeAmount: Number(feeAmount || 0),
          feeCurrency,
          notes,
          outputs: outputs.map((output) => ({ variantId: output.variantId, quantityPerSource: Number(output.quantityPerSource) })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "拆装单创建失败");
      toast.success(`拆装单 ${result.conversion.conversionNo} 已创建，母 SKU 库存已锁定`);
      setSourceVariantId(""); setPlannedQty(""); setFeeAmount("0"); setNotes("");
      setOutputs([{ variantId: "", quantityPerSource: "1" }, { variantId: "", quantityPerSource: "1" }]);
      await refreshAll();
    } catch (createError: any) {
      toast.error(createError?.message || "拆装单创建失败");
    } finally {
      setSaving(false);
    }
  };

  const cancelConversion = async (conversion: Conversion) => {
    if (!window.confirm(`确认取消拆装单 ${conversion.conversionNo}？锁定的 ${conversion.plannedQty} 件库存将恢复可售。`)) return;
    setActionSaving(true);
    try {
      const response = await fetch(`/api/inventory/sku-conversions/${conversion.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "取消失败");
      toast.success("拆装单已取消，锁定库存已释放");
      await refreshAll();
    } catch (cancelError: any) { toast.error(cancelError?.message || "取消失败"); }
    finally { setActionSaving(false); }
  };

  const openCompletion = (conversion: Conversion) => {
    setCompleting(conversion);
    setCompletedQty(String(conversion.plannedQty));
    setDamagedQty("0");
    setActualFeeAmount(String(conversion.feeAmount));
    setCompletionNotes("");
    setCompletionEvidence([]);
  };

  const completeConversion = async () => {
    if (!completing) return;
    setActionSaving(true);
    try {
      const response = await fetch(`/api/inventory/sku-conversions/${completing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", completedQty: Number(completedQty), damagedQty: Number(damagedQty || 0), feeAmount: Number(actualFeeAmount || 0), notes: completionNotes, evidence: completionEvidence }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "确认完成失败");
      toast.success(`拆装已入账${result.uncompletedQty ? `，未完成 ${result.uncompletedQty} 件已解除锁定` : ""}`);
      setCompleting(null);
      await refreshAll();
    } catch (completeError: any) { toast.error(completeError?.message || "确认完成失败"); }
    finally { setActionSaving(false); }
  };

  if (isLoading) return <div className="p-6 text-center text-sm text-slate-400">正在加载拆装数据...</div>;
  if (error) return <div className="m-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error.message}</div>;

  return (
    <div className="space-y-5 p-6">
      {view === "create" ? (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100"><PackageCheck className="h-5 w-5 text-cyan-400" />发起 SKU 拆装</h2>
                <p className="mt-1 text-sm text-slate-400">提交后立即锁定母 SKU 可用库存；海外仓确认完成后才正式转换库存。</p>
              </div>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">库存锁定 ≠ 已扣库存</div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="block"><span className="mb-1.5 block text-sm text-slate-300">海外仓</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">请选择海外仓</option>{(data?.warehouses || []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
              <label className="block lg:col-span-2"><span className="mb-1.5 block text-sm text-slate-300">母 SKU</span><select value={sourceVariantId} onChange={(event) => setSourceVariantId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="">请选择有可用库存的母 SKU</option>{sourceStocks.map((stock) => <option key={stock.id} value={stock.variantId}>{variantLabel(stock.variant)}（库存 {stock.qty} / 锁定 {stock.reservedQty} / 可用 {stock.availableQty}）</option>)}</select></label>
            </div>
            {selectedSourceStock && <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center text-xs"><div><div className="text-slate-500">实物库存</div><div className="mt-1 text-base font-semibold text-slate-200">{selectedSourceStock.qty.toLocaleString("en-US")}</div></div><div><div className="text-slate-500">已锁定</div><div className="mt-1 text-base font-semibold text-amber-300">{selectedSourceStock.reservedQty.toLocaleString("en-US")}</div></div><div><div className="text-slate-500">可拆数量</div><div className="mt-1 text-base font-semibold text-emerald-300">{selectedSourceStock.availableQty.toLocaleString("en-US")}</div></div></div>}
            <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-slate-800" /><ArrowRight className="h-4 w-4 text-slate-500" /><span className="text-sm font-medium text-slate-300">拆装后生成</span><div className="h-px flex-1 bg-slate-800" /></div>
            <div className="space-y-3">
              {outputs.map((output, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 md:grid-cols-[1fr_160px_40px]">
                  <label><span className="mb-1 block text-xs text-slate-500">子 SKU {index + 1}</span><select value={output.variantId} onChange={(event) => updateOutput(index, { variantId: event.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="">请选择拆装后 SKU</option>{(data?.variants || []).filter((variant) => variant.id !== sourceVariantId).map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant)}</option>)}</select></label>
                  <label><span className="mb-1 block text-xs text-slate-500">每拆1件母SKU生成</span><div className="flex items-center gap-2"><input type="number" min="1" step="1" value={output.quantityPerSource} onChange={(event) => updateOutput(index, { quantityPerSource: event.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><span className="text-xs text-slate-500">件</span></div></label>
                  <button type="button" title="删除子 SKU" disabled={outputs.length <= 1} onClick={() => setOutputs((current) => current.filter((_, outputIndex) => outputIndex !== index))} className="mt-5 inline-flex h-9 w-9 items-center justify-center rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setOutputs((current) => [...current, { variantId: "", quantityPerSource: "1" }])} className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"><Plus className="h-4 w-4" />增加一个子 SKU</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <label><span className="mb-1.5 block text-sm text-slate-300">计划拆装数量</span><input type="number" min="1" step="1" value={plannedQty} onChange={(event) => setPlannedQty(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" /></label>
              <label><span className="mb-1.5 block text-sm text-slate-300">预计拆装费</span><input type="number" min="0" step="0.01" value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" /></label>
              <label><span className="mb-1.5 block text-sm text-slate-300">费用币种</span><select value={feeCurrency} onChange={(event) => setFeeCurrency(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm"><option value="BRL">BRL</option><option value="USD">USD</option><option value="CNY">CNY</option></select></label>
              <label><span className="mb-1.5 block text-sm text-slate-300">仓库指令</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="如：拆外包装并更换SKU标签" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" /></label>
            </div>
            <div className="mt-5 flex justify-end"><button type="button" disabled={saving} onClick={createConversion} className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">{saving ? "正在创建并锁定..." : "创建拆装单并锁定库存"}</button></div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 p-4"><div><h2 className="font-semibold text-slate-100">拆装处理中</h2><p className="mt-1 text-xs text-slate-500">共 {processing.length} 张单据，库存已经锁定但尚未扣减</p></div></div>
            <ConversionTable conversions={processing} showActions actionSaving={actionSaving} onComplete={openCompletion} onCancel={cancelConversion} />
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="border-b border-slate-800 p-4"><h2 className="font-semibold text-slate-100">拆装记录</h2><p className="mt-1 text-xs text-slate-500">已完成和已取消的拆装单均永久保留，便于核对库存与仓库费用。</p></div>
          <ConversionTable conversions={records} />
        </section>
      )}

      {completing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={() => !actionSaving && setCompleting(null)}>
          <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between"><div><h2 className="text-lg font-semibold">确认海外仓拆装结果</h2><p className="mt-1 text-sm text-slate-400">{completing.conversionNo} · {completing.warehouse.name} · {completing.sourceVariant.skuId}</p></div><button type="button" title="关闭" disabled={actionSaving} onClick={() => setCompleting(null)}><X className="h-5 w-5" /></button></div>
            <div className="mb-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-100">计划拆装 {completing.plannedQty} 件：{completing.outputs.map((output) => `${output.variant.skuId} × ${output.quantityPerSource}`).join("，")}</div>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="mb-1 block text-sm text-slate-300">实际完成数量</span><input type="number" min="0" max={completing.plannedQty} step="1" value={completedQty} onChange={(event) => setCompletedQty(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></label>
              <label><span className="mb-1 block text-sm text-slate-300">破损报废数量</span><input type="number" min="0" max={completing.plannedQty} step="1" value={damagedQty} onChange={(event) => setDamagedQty(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            </div>
            <label className="mt-3 block"><span className="mb-1 block text-sm text-slate-300">实际拆装费（{completing.feeCurrency}）</span><input type="number" min="0" step="0.01" value={actualFeeAmount} onChange={(event) => setActualFeeAmount(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <label className="mt-3 block"><span className="mb-1 block text-sm text-slate-300">完成说明</span><textarea rows={2} value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} placeholder="如：实际完成980件，剩余20件暂不拆" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <div className="mt-3"><ImageUploader value={completionEvidence} onChange={setCompletionEvidence} multiple maxImages={5} maxSizeKB={350} label="仓库回执/拆装凭证（选填）" /></div>
            <div className="mt-4 rounded border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">确认后会一次性扣除母 SKU、增加子 SKU、写入库存流水，并按拆装单费用扣减海外仓余额。该操作不能直接撤销。</div>
            <button type="button" disabled={actionSaving} onClick={completeConversion} className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white disabled:opacity-50">{actionSaving ? "正在入账..." : "确认拆装完成并入账"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversionTable({
  conversions,
  showActions = false,
  actionSaving = false,
  onComplete,
  onCancel,
}: {
  conversions: Conversion[];
  showActions?: boolean;
  actionSaving?: boolean;
  onComplete?: (conversion: Conversion) => void;
  onCancel?: (conversion: Conversion) => void;
}) {
  if (!conversions.length) return <div className="p-10 text-center text-sm text-slate-500">暂无拆装单</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-sm">
        <thead className="bg-slate-800/50 text-xs text-slate-400"><tr><th className="px-4 py-3 text-left">拆装单号 / 状态</th><th className="px-4 py-3 text-left">海外仓</th><th className="px-4 py-3 text-left">母 SKU</th><th className="px-4 py-3 text-left">生成 SKU</th><th className="px-4 py-3 text-right">计划 / 完成 / 破损</th><th className="px-4 py-3 text-right">拆装费</th><th className="px-4 py-3 text-left">创建信息</th>{showActions && <th className="px-4 py-3 text-center">操作</th>}</tr></thead>
        <tbody className="divide-y divide-slate-800">
          {conversions.map((conversion) => {
            const status = statusStyle[conversion.status] || statusStyle.CANCELLED;
            const StatusIcon = status.icon;
            return <tr key={conversion.id} className="hover:bg-slate-800/25">
              <td className="px-4 py-3"><div className="font-mono text-xs text-slate-300">{conversion.conversionNo}</div><span className={`mt-1.5 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${status.className}`}><StatusIcon className="h-3 w-3" />{status.label}</span></td>
              <td className="px-4 py-3 text-slate-300">{conversion.warehouse.name}</td>
              <td className="px-4 py-3"><div className="font-mono text-slate-200">{conversion.sourceVariant.skuId}</div><div className="mt-0.5 max-w-48 truncate text-xs text-slate-500">{conversion.sourceVariant.product.name}</div></td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">{conversion.outputs.map((output) => <span key={output.id} className="rounded bg-cyan-500/10 px-2 py-1 font-mono text-xs text-cyan-200">{output.variant.skuId} × {output.quantityPerSource}</span>)}</div></td>
              <td className="px-4 py-3 text-right tabular-nums"><span className="text-slate-200">{conversion.plannedQty}</span><span className="mx-1 text-slate-600">/</span><span className="text-emerald-300">{conversion.completedQty}</span><span className="mx-1 text-slate-600">/</span><span className="text-rose-300">{conversion.damagedQty}</span></td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-300">{conversion.feeCurrency} {conversion.feeAmount.toFixed(2)}</td>
              <td className="px-4 py-3"><div className="text-xs text-slate-400">{new Date(conversion.createdAt).toLocaleString("zh-CN")}</div><div className="mt-1 text-xs text-slate-500">{conversion.createdBy || "管理员"}</div>{conversion.notes && <div className="mt-1 max-w-48 truncate text-xs text-slate-500" title={conversion.notes}>{conversion.notes}</div>}</td>
              {showActions && <td className="px-4 py-3"><div className="flex justify-center gap-2"><button type="button" disabled={actionSaving} onClick={() => onComplete?.(conversion)} className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">确认完成</button><button type="button" disabled={actionSaving} onClick={() => onCancel?.(conversion)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-50">取消</button></div></td>}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
