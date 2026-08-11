"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import {
  EXPORT_TAX_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  TAX_POINT_STATUS_LABELS,
  type ExportTaxCase,
  type ExportTaxCaseItem,
} from "@/lib/export-tax";
import { calculateExportTaxLine, roundExportTaxMoney } from "@/lib/export-tax-calculation";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "加载失败");
  return data;
};

const inputClass = "w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500";
const labelClass = "space-y-1 text-sm text-slate-300";
const dateInput = (value?: string) => value ? value.slice(0, 10) : "";

function statusOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

export default function ExportTaxDetailDialog({
  caseId,
  onClose,
  onSaved,
}: {
  caseId: string;
  onClose: () => void;
  onSaved: (row: ExportTaxCase) => void;
}) {
  const { data, error, isLoading } = useSWR<ExportTaxCase>(caseId ? `/api/export-tax-cases/${caseId}` : null, fetcher, { revalidateOnFocus: false });
  const { data: exportersRaw } = useSWR("/api/exporters?isActive=true&page=1&pageSize=50", fetcher);
  const exporters = Array.isArray(exportersRaw?.data) ? exportersRaw.data : [];
  const [form, setForm] = useState<ExportTaxCase | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const patch = (values: Partial<ExportTaxCase>) => setForm((current) => current ? { ...current, ...values } : current);

  const patchItem = (itemId: string, values: Partial<ExportTaxCaseItem>) => {
    setForm((current) => {
      if (!current) return current;
      const items = current.items.map((item) => {
        if (item.id !== itemId) return item;
        const next = { ...item, ...values };
        const { declarationAmount, invoiceAmount, estimatedRefundAmount } = calculateExportTaxLine({
          qty: next.qty,
          purchaseUnitPrice: next.purchaseUnitPrice,
          declarationUnitPrice: Number(next.declarationUnitPrice || 0),
          invoiceUnitPrice: next.invoiceUnitPrice == null ? null : Number(next.invoiceUnitPrice),
          needsInvoice: next.needsInvoice,
          needsTaxRefund: next.needsTaxRefund,
          refundRate: next.refundRate == null ? null : Number(next.refundRate),
        });
        return { ...next, declarationAmount, invoiceAmount, estimatedRefundAmount };
      });
      const declarationAmount = Math.round(items.reduce((sum, item) => sum + item.declarationAmount, 0) * 100) / 100;
      const invoiceAmount = Math.round(items.reduce((sum, item) => sum + item.invoiceAmount, 0) * 100) / 100;
      const refundClaimAmount = Math.round(items.reduce((sum, item) => sum + item.estimatedRefundAmount, 0) * 100) / 100;
      const taxPointAmount = current.taxPointRate == null
        ? current.taxPointAmount
        : roundExportTaxMoney(invoiceAmount * Number(current.taxPointRate) / 100);
      return { ...current, items, declarationAmount, invoiceAmount, refundClaimAmount, taxPointAmount };
    });
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/export-tax-cases/${caseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      toast.success("出口退税进度已保存");
      onSaved(result);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">出口退税业务单</h2>
            {form && <p className="mt-1 font-mono text-sm text-cyan-300">{form.caseNumber} · {form.deliveryNumber}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="关闭"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载业务单...</div>
          ) : error ? (
            <div className="py-16 text-center text-rose-300">{error.message}</div>
          ) : form ? (
            <div className="space-y-7">
              <section className="grid gap-4 border-b border-slate-800 pb-6 md:grid-cols-4">
                <label className={labelClass}><span>整体进度</span><select value={form.status} onChange={(event) => patch({ status: event.target.value })} className={inputClass}>{statusOptions(EXPORT_TAX_STATUS_LABELS)}</select></label>
                <label className={labelClass}><span>出口主体</span><select value={form.exporterId || ""} onChange={(event) => { const selected = exporters.find((item: any) => item.id === event.target.value); patch({ exporterId: event.target.value || undefined, exporterName: selected?.name || undefined }); }} className={inputClass}><option value="">暂不指定</option>{exporters.map((exporter: any) => <option key={exporter.id} value={exporter.id}>{exporter.name}</option>)}</select></label>
                <label className={labelClass}><span>出口目的国</span><input value={form.destinationCountry || ""} onChange={(event) => patch({ destinationCountry: event.target.value })} className={inputClass} /></label>
                <label className={labelClass}><span>供应商</span><input value={form.supplierName} disabled className={`${inputClass} opacity-60`} /></label>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-semibold text-cyan-300">出口申报</h3>
                <div className="grid gap-4 md:grid-cols-5">
                  <label className={labelClass}><span>申报币种</span><select value={form.declarationCurrency} onChange={(event) => patch({ declarationCurrency: event.target.value })} className={inputClass}><option>CNY</option><option>USD</option><option>BRL</option><option>EUR</option></select></label>
                  <label className={labelClass}><span>申报总金额</span><input type="number" min="0" step="0.01" value={form.declarationAmount} onChange={(event) => patch({ declarationAmount: Number(event.target.value) || 0 })} className={inputClass} /></label>
                  <label className={labelClass}><span>报关单号</span><input value={form.customsDeclarationNumber || ""} onChange={(event) => patch({ customsDeclarationNumber: event.target.value })} className={inputClass} /></label>
                  <label className={labelClass}><span>申报日期</span><input type="date" value={dateInput(form.declarationDate)} onChange={(event) => patch({ declarationDate: event.target.value || undefined })} className={inputClass} /></label>
                  <div className="md:col-span-1"><ImageUploader value={form.declarationVouchers} onChange={(value) => patch({ declarationVouchers: Array.isArray(value) ? value : value ? [value] : [] })} multiple maxImages={3} maxSizeKB={350} acceptPdf label="报关凭证" /></div>
                </div>
              </section>

              <section className="border-t border-slate-800 pt-6">
                <h3 className="mb-4 text-sm font-semibold text-amber-300">工厂开票</h3>
                <div className="grid gap-4 md:grid-cols-6">
                  <label className={labelClass}><span>开票状态</span><select value={form.invoiceStatus} onChange={(event) => patch({ invoiceStatus: event.target.value })} className={inputClass}>{statusOptions(INVOICE_STATUS_LABELS)}</select></label>
                  <label className={labelClass}><span>发票币种</span><select value={form.invoiceCurrency} onChange={(event) => patch({ invoiceCurrency: event.target.value })} className={inputClass}><option>CNY</option><option>USD</option></select></label>
                  <label className={labelClass}><span>开票金额</span><input type="number" min="0" step="0.01" value={form.invoiceAmount} onChange={(event) => patch({ invoiceAmount: Number(event.target.value) || 0 })} className={inputClass} /></label>
                  <label className={labelClass}><span>发票号码</span><input value={form.invoiceNumber || ""} onChange={(event) => patch({ invoiceNumber: event.target.value })} className={inputClass} /></label>
                  <label className={labelClass}><span>开票日期</span><input type="date" value={dateInput(form.invoiceDate)} onChange={(event) => patch({ invoiceDate: event.target.value || undefined })} className={inputClass} /></label>
                  <label className={labelClass}><span>收票日期</span><input type="date" value={dateInput(form.invoiceReceivedDate)} onChange={(event) => patch({ invoiceReceivedDate: event.target.value || undefined })} className={inputClass} /></label>
                  <div className="md:col-span-2"><ImageUploader value={form.invoiceVouchers} onChange={(value) => patch({ invoiceVouchers: Array.isArray(value) ? value : value ? [value] : [] })} multiple maxImages={5} maxSizeKB={350} acceptPdf label="发票凭证" /></div>
                </div>
              </section>

              <section className="border-t border-slate-800 pt-6">
                <h3 className="mb-4 text-sm font-semibold text-rose-300">税点支付</h3>
                <div className="grid gap-4 md:grid-cols-6">
                  <label className={labelClass}><span>支付状态</span><select value={form.taxPointStatus} onChange={(event) => patch({ taxPointStatus: event.target.value })} className={inputClass}>{statusOptions(TAX_POINT_STATUS_LABELS)}</select></label>
                  <label className={labelClass}><span>税点（%）</span><input type="number" min="0" step="0.01" value={form.taxPointRate ?? ""} onChange={(event) => patch({ taxPointRate: event.target.value === "" ? undefined : Number(event.target.value) })} className={inputClass} /></label>
                  <label className={labelClass}><span>税点应付</span><input type="number" min="0" step="0.01" value={form.taxPointAmount} onChange={(event) => patch({ taxPointAmount: Number(event.target.value) || 0 })} className={inputClass} /></label>
                  <label className={labelClass}><span>税点已付</span><input type="number" min="0" step="0.01" value={form.taxPointPaidAmount} onChange={(event) => patch({ taxPointPaidAmount: Number(event.target.value) || 0 })} className={inputClass} /></label>
                  <label className={labelClass}><span>支付日期</span><input type="date" value={dateInput(form.taxPointPaidDate)} onChange={(event) => patch({ taxPointPaidDate: event.target.value || undefined })} className={inputClass} /></label>
                  <div><ImageUploader value={form.taxPointVouchers} onChange={(value) => patch({ taxPointVouchers: Array.isArray(value) ? value : value ? [value] : [] })} multiple maxImages={3} maxSizeKB={350} acceptPdf label="支付凭证" /></div>
                </div>
              </section>

              <section className="border-t border-slate-800 pt-6">
                <h3 className="mb-4 text-sm font-semibold text-emerald-300">税务局退税</h3>
                <div className="grid gap-4 md:grid-cols-6">
                  <label className={labelClass}><span>退税状态</span><select value={form.refundStatus} onChange={(event) => patch({ refundStatus: event.target.value })} className={inputClass}>{statusOptions(REFUND_STATUS_LABELS)}</select></label>
                  <label className={labelClass}><span>默认退税率（%）</span><input type="number" min="0" step="0.01" value={form.refundRate ?? ""} onChange={(event) => patch({ refundRate: event.target.value === "" ? undefined : Number(event.target.value) })} className={inputClass} /></label>
                  <label className={labelClass}><span>申请退税金额</span><input type="number" min="0" step="0.01" value={form.refundClaimAmount} onChange={(event) => patch({ refundClaimAmount: Number(event.target.value) || 0 })} className={inputClass} /></label>
                  <label className={labelClass}><span>实际到账金额</span><input type="number" min="0" step="0.01" value={form.refundReceivedAmount} onChange={(event) => patch({ refundReceivedAmount: Number(event.target.value) || 0 })} className={inputClass} /></label>
                  <label className={labelClass}><span>申请日期</span><input type="date" value={dateInput(form.refundApplicationDate)} onChange={(event) => patch({ refundApplicationDate: event.target.value || undefined })} className={inputClass} /></label>
                  <label className={labelClass}><span>到账日期</span><input type="date" value={dateInput(form.refundReceivedDate)} onChange={(event) => patch({ refundReceivedDate: event.target.value || undefined })} className={inputClass} /></label>
                  <div className="md:col-span-2"><ImageUploader value={form.refundVouchers} onChange={(value) => patch({ refundVouchers: Array.isArray(value) ? value : value ? [value] : [] })} multiple maxImages={5} maxSizeKB={350} acceptPdf label="退税凭证" /></div>
                </div>
              </section>

              <section className="border-t border-slate-800 pt-6">
                <h3 className="mb-4 text-sm font-semibold text-slate-200">SKU 核算明细</h3>
                <div className="overflow-x-auto border border-slate-800">
                  <table className="min-w-[1250px] w-full text-sm">
                    <thead className="bg-slate-900 text-left text-xs text-slate-400"><tr><th className="px-3 py-3">SKU / 商品</th><th className="px-3 py-3">数量</th><th className="px-3 py-3">用途</th><th className="px-3 py-3">申报单价</th><th className="px-3 py-3">开票单价</th><th className="px-3 py-3">退税率 %</th><th className="px-3 py-3">HS编码</th><th className="px-3 py-3">报关品名</th><th className="px-3 py-3 text-right">预计退税</th></tr></thead>
                    <tbody className="divide-y divide-slate-800">
                      {form.items.map((item) => <tr key={item.id}><td className="px-3 py-3"><div className="font-mono text-slate-100">{item.sku}</div><div className="mt-1 max-w-xs text-xs text-slate-500">{item.skuName || item.spec || "-"}</div></td><td className="px-3 py-3 text-slate-200">{item.qty}</td><td className="px-3 py-3 text-xs"><div className={item.needsInvoice ? "text-amber-300" : "text-slate-600"}>开票</div><div className={item.needsTaxRefund ? "text-emerald-300" : "text-slate-600"}>退税</div></td><td className="px-3 py-3"><input type="number" min="0" step="0.0001" value={item.declarationUnitPrice} onChange={(event) => patchItem(item.id, { declarationUnitPrice: Number(event.target.value) || 0 })} className={inputClass} /></td><td className="px-3 py-3"><input type="number" min="0" step="0.0001" disabled={!item.needsInvoice} value={item.invoiceUnitPrice ?? ""} onChange={(event) => patchItem(item.id, { invoiceUnitPrice: event.target.value === "" ? undefined : Number(event.target.value) })} className={`${inputClass} disabled:opacity-40`} /></td><td className="px-3 py-3"><input type="number" min="0" step="0.01" disabled={!item.needsTaxRefund} value={item.refundRate ?? ""} onChange={(event) => patchItem(item.id, { refundRate: event.target.value === "" ? undefined : Number(event.target.value) })} className={`${inputClass} disabled:opacity-40`} /></td><td className="px-3 py-3"><input value={item.hsCode || ""} onChange={(event) => patchItem(item.id, { hsCode: event.target.value })} className={inputClass} /></td><td className="px-3 py-3"><input value={item.customsName || ""} onChange={(event) => patchItem(item.id, { customsName: event.target.value })} className={inputClass} /></td><td className="px-3 py-3 text-right font-medium text-emerald-300">{form.refundCurrency} {item.estimatedRefundAmount.toFixed(2)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </section>

              <label className={`${labelClass} block border-t border-slate-800 pt-6`}><span>备注</span><textarea rows={3} value={form.notes || ""} onChange={(event) => patch({ notes: event.target.value })} className={inputClass} /></label>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-800 bg-slate-900/70 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">关闭</button>
          <button type="button" disabled={!form || saving} onClick={handleSave} className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存进度</button>
        </div>
      </div>
    </div>
  );
}
