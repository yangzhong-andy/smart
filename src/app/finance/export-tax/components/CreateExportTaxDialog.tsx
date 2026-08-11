"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { Check, FilePlus2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { ExportTaxCase, ExportTaxSourceItem } from "@/lib/export-tax";
import { resolveExportTaxAvailableQty } from "@/lib/export-tax-calculation";

type SourceResponse = {
  deliveryOrder: {
    id: string;
    deliveryNumber: string;
    contractId: string;
    contractNumber: string;
    supplierId?: string;
    supplierName: string;
    defaultTaxPointRate?: number;
  };
  items: ExportTaxSourceItem[];
};

type SelectedItem = ExportTaxSourceItem & {
  selected: boolean;
  qty: number;
  needsInvoice: boolean;
  needsTaxRefund: boolean;
  declarationUnitPrice: number;
  invoiceUnitPrice: number;
  refundRate: number | "";
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "加载失败");
  return data;
};

function maxQty(item: SelectedItem) {
  return resolveExportTaxAvailableQty(item);
}

export default function CreateExportTaxDialog({
  deliveryOrderId,
  onClose,
  onCreated,
}: {
  deliveryOrderId: string;
  onClose: () => void;
  onCreated: (created: ExportTaxCase) => void;
}) {
  const { data: session } = useSession();
  const { data, error, isLoading } = useSWR<SourceResponse>(
    deliveryOrderId ? `/api/export-tax-cases/source?deliveryOrderId=${encodeURIComponent(deliveryOrderId)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: exportersRaw } = useSWR("/api/exporters?isActive=true&page=1&pageSize=50", fetcher);
  const exporters = Array.isArray(exportersRaw?.data) ? exportersRaw.data : [];
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [destinationCountry, setDestinationCountry] = useState("");
  const [exporterId, setExporterId] = useState("");
  const [taxPointRate, setTaxPointRate] = useState<number | "">("");
  const [refundRate, setRefundRate] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTaxPointRate(data.deliveryOrder.defaultTaxPointRate ?? "");
    setItems(data.items.map((item) => ({
      ...item,
      selected: false,
      qty: 0,
      needsInvoice: item.invoiceAvailableQty > 0,
      needsTaxRefund: item.refundAvailableQty > 0,
      declarationUnitPrice: item.purchaseUnitPrice,
      invoiceUnitPrice: item.purchaseUnitPrice,
      refundRate: "",
    })));
  }, [data]);

  const selectedCount = useMemo(() => items.filter((item) => item.selected).length, [items]);
  const declarationTotal = useMemo(
    () => items.filter((item) => item.selected).reduce((sum, item) => sum + item.qty * item.declarationUnitPrice, 0),
    [items],
  );

  const patchItem = (index: number, patch: Partial<SelectedItem>) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      const limit = maxQty(next);
      if (next.selected && next.qty <= 0 && limit > 0) next.qty = limit;
      if (next.qty > limit) next.qty = limit;
      return next;
    }));
  };

  const handleSubmit = async () => {
    const selected = items.filter((item) => item.selected);
    if (selected.length === 0) {
      toast.error("请至少选择一个货品");
      return;
    }
    for (const item of selected) {
      if (item.qty <= 0 || (!item.needsInvoice && !item.needsTaxRefund)) {
        toast.error(`${item.sku} 的数量或办理类型不正确`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const selectedExporter = exporters.find((item: any) => item.id === exporterId);
      const response = await fetch("/api/export-tax-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryOrderId,
          exporterId: exporterId || undefined,
          exporterName: selectedExporter?.name,
          destinationCountry,
          taxPointRate,
          refundRate,
          createdBy: session?.user?.name || session?.user?.email || "当前用户",
          items: selected.map((item) => ({
            contractItemId: item.contractItemId,
            qty: item.qty,
            needsInvoice: item.needsInvoice,
            needsTaxRefund: item.needsTaxRefund,
            declarationUnitPrice: item.declarationUnitPrice,
            invoiceUnitPrice: item.invoiceUnitPrice,
            refundRate: item.refundRate === "" ? refundRate : item.refundRate,
            customsName: item.customsName,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "创建失败");
      toast.success("出口退税业务单已创建");
      onCreated(result);
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <FilePlus2 className="h-5 w-5 text-cyan-400" />
              从拿货单发起出口退税
            </h2>
            {data && <p className="mt-1 text-sm text-slate-400">{data.deliveryOrder.deliveryNumber} · {data.deliveryOrder.supplierName}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex min-h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载拿货单货品...</div>
          ) : error ? (
            <div className="py-16 text-center text-rose-300">{error.message}</div>
          ) : data ? (
            <div className="space-y-5">
              <div className="grid gap-4 border-b border-slate-800 pb-5 md:grid-cols-4">
                <label className="space-y-1 text-sm text-slate-300">
                  <span>出口主体</span>
                  <select value={exporterId} onChange={(event) => setExporterId(event.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">
                    <option value="">暂不指定</option>
                    {exporters.map((exporter: any) => <option key={exporter.id} value={exporter.id}>{exporter.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm text-slate-300">
                  <span>出口目的国</span>
                  <input value={destinationCountry} onChange={(event) => setDestinationCountry(event.target.value)} placeholder="例如：巴西、美国" className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" />
                </label>
                <label className="space-y-1 text-sm text-slate-300">
                  <span>工厂税点（%）</span>
                  <input type="number" min="0" step="0.01" value={taxPointRate} onChange={(event) => setTaxPointRate(event.target.value === "" ? "" : Number(event.target.value))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" />
                </label>
                <label className="space-y-1 text-sm text-slate-300">
                  <span>默认退税率（%）</span>
                  <input type="number" min="0" step="0.01" value={refundRate} onChange={(event) => setRefundRate(event.target.value === "" ? "" : Number(event.target.value))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" />
                </label>
              </div>

              <div className="overflow-x-auto border border-slate-800">
                <table className="min-w-[1050px] w-full text-sm">
                  <thead className="bg-slate-900 text-left text-xs text-slate-400">
                    <tr>
                      <th className="w-12 px-3 py-3">选择</th>
                      <th className="px-3 py-3">SKU / 商品</th>
                      <th className="px-3 py-3">拿货 / 剩余</th>
                      <th className="w-28 px-3 py-3">办理数量</th>
                      <th className="w-24 px-3 py-3">开发票</th>
                      <th className="w-24 px-3 py-3">出口退税</th>
                      <th className="w-32 px-3 py-3">申报单价 CNY</th>
                      <th className="w-32 px-3 py-3">开票单价 CNY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {items.map((item, index) => {
                      const unavailable = item.invoiceAvailableQty <= 0 && item.refundAvailableQty <= 0;
                      return (
                        <tr key={item.contractItemId} className={item.selected ? "bg-cyan-500/5" : "bg-slate-950"}>
                          <td className="px-3 py-3">
                            <input type="checkbox" checked={item.selected} disabled={unavailable} onChange={(event) => patchItem(index, { selected: event.target.checked })} className="h-4 w-4 accent-cyan-500" />
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-mono text-slate-100">{item.sku}</div>
                            <div className="mt-1 max-w-sm text-xs text-slate-400">{item.skuName || item.spec || "-"}</div>
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <div className="text-slate-200">拿货 {item.deliveryQty}</div>
                            <div className="mt-1 text-amber-300">可开票 {item.invoiceAvailableQty}</div>
                            <div className="text-emerald-300">可退税 {item.refundAvailableQty}</div>
                          </td>
                          <td className="px-3 py-3"><input type="number" min="1" max={maxQty(item)} disabled={!item.selected} value={item.qty || ""} onChange={(event) => patchItem(index, { qty: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 disabled:opacity-40" /></td>
                          <td className="px-3 py-3"><input type="checkbox" checked={item.needsInvoice} disabled={!item.selected || item.invoiceAvailableQty <= 0} onChange={(event) => patchItem(index, { needsInvoice: event.target.checked })} className="h-4 w-4 accent-amber-500" /></td>
                          <td className="px-3 py-3"><input type="checkbox" checked={item.needsTaxRefund} disabled={!item.selected || item.refundAvailableQty <= 0} onChange={(event) => patchItem(index, { needsTaxRefund: event.target.checked })} className="h-4 w-4 accent-emerald-500" /></td>
                          <td className="px-3 py-3"><input type="number" min="0" step="0.0001" disabled={!item.selected} value={item.declarationUnitPrice} onChange={(event) => patchItem(index, { declarationUnitPrice: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 disabled:opacity-40" /></td>
                          <td className="px-3 py-3"><input type="number" min="0" step="0.0001" disabled={!item.selected || !item.needsInvoice} value={item.invoiceUnitPrice} onChange={(event) => patchItem(index, { invoiceUnitPrice: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 disabled:opacity-40" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/70 px-5 py-4">
          <div className="text-sm text-slate-400">已选 {selectedCount} 个 SKU · 预计申报 CNY {declarationTotal.toFixed(2)}</div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">取消</button>
            <button type="button" disabled={submitting || selectedCount === 0} onClick={handleSubmit} className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              创建业务单
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
