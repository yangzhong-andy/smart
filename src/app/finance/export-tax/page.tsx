"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, FileInput, Search } from "lucide-react";
import CreateExportTaxDialog from "./components/CreateExportTaxDialog";
import ExportTaxDetailDialog from "./components/ExportTaxDetailDialog";
import {
  EXPORT_TAX_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  TAX_POINT_STATUS_LABELS,
  type ExportTaxCase,
} from "@/lib/export-tax";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "加载失败");
  return data;
};

const statusColor: Record<string, string> = {
  DRAFT: "border-slate-600 bg-slate-800 text-slate-300",
  DECLARING: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  INVOICING: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  TAX_POINT_PENDING: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  REFUND_PENDING: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  PARTIAL_REFUNDED: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  COMPLETED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  CANCELLED: "border-slate-700 bg-slate-900 text-slate-500",
};

const money = (amount: number, currency = "CNY") => new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount || 0);

const shortDate = (value?: string) => value ? new Date(value).toLocaleDateString("zh-CN") : "-";

export default function ExportTaxManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceDeliveryOrderId = searchParams.get("deliveryOrderId") || "";
  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status !== "all") params.set("status", status);
    if (search) params.set("keyword", search);
    return params.toString();
  }, [page, search, status]);
  const { data, error, isLoading, mutate } = useSWR(`/api/export-tax-cases?${query}`, fetcher, { revalidateOnFocus: false });
  const rows = (Array.isArray(data?.data) ? data.data : []) as ExportTaxCase[];
  const pagination = data?.pagination || { page: 1, total: 0, totalPages: 1 };
  const totals = data?.totals || { declarationAmount: 0, invoiceAmount: 0, taxPointPaidAmount: 0, refundReceivedAmount: 0 };

  const closeCreate = () => router.replace("/finance/export-tax");

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500"><Link href="/finance" className="inline-flex items-center gap-1 hover:text-slate-300"><ArrowLeft className="h-4 w-4" />财务中心</Link><span>/</span><span>出口退税</span></div>
            <h1 className="text-2xl font-semibold">出口退税管理</h1>
            <p className="mt-1 text-sm text-slate-400">按拿货单跟踪出口申报、工厂开票、税点支付与税局退税</p>
          </div>
          <Link href="/procurement/delivery-orders" className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500"><FileInput className="h-4 w-4" />从拿货单发起</Link>
        </header>

        <section className="grid border-y border-slate-800 bg-slate-900/30 md:grid-cols-5">
          {[
            ["业务单", `${pagination.total} 笔`, "text-slate-100"],
            ["申报金额", money(totals.declarationAmount), "text-cyan-300"],
            ["工厂开票", money(totals.invoiceAmount), "text-amber-300"],
            ["税点已付", money(totals.taxPointPaidAmount), "text-rose-300"],
            ["退税到账", money(totals.refundReceivedAmount), "text-emerald-300"],
          ].map(([label, value, color], index) => <div key={label} className={`px-5 py-4 ${index > 0 ? "border-t border-slate-800 md:border-l md:border-t-0" : ""}`}><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div></div>)}
        </section>

        <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setStatus("all"); setPage(1); }} className={`rounded-md border px-3 py-1.5 text-xs ${status === "all" ? "border-cyan-500 bg-cyan-500/10 text-cyan-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>全部</button>
            {Object.entries(EXPORT_TAX_STATUS_LABELS).map(([value, label]) => <button key={value} type="button" onClick={() => { setStatus(value); setPage(1); }} className={`rounded-md border px-3 py-1.5 text-xs ${status === value ? statusColor[value] : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"}`}>{label}</button>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); setSearch(keyword.trim()); setPage(1); }} className="flex w-full max-w-md gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="业务单、拿货单、供应商、SKU、报关单号" className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500" /></div>
            <button className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">查询</button>
          </form>
        </section>

        <section className="overflow-hidden border border-slate-800 bg-slate-950">
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs text-slate-400"><tr><th className="px-4 py-3">业务单 / 状态</th><th className="px-4 py-3">拿货单 / 供应商</th><th className="px-4 py-3">货品</th><th className="px-4 py-3 text-right">出口申报</th><th className="px-4 py-3">工厂开票</th><th className="px-4 py-3">税点支付</th><th className="px-4 py-3">税局退税</th><th className="px-4 py-3">更新日期</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {isLoading ? <tr><td colSpan={9} className="px-4 py-16 text-center text-slate-500">正在加载...</td></tr> : error ? <tr><td colSpan={9} className="px-4 py-16 text-center text-rose-300">{error.message}</td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="px-4 py-16 text-center text-slate-500">暂无业务单，请从拿货单发起</td></tr> : rows.map((row) => {
                  const totalQty = row.items.reduce((sum, item) => sum + item.qty, 0);
                  return <tr key={row.id} className="hover:bg-slate-900/60">
                    <td className="px-4 py-3 align-top"><div className="font-mono text-cyan-300">{row.caseNumber}</div><span className={`mt-2 inline-flex rounded border px-2 py-0.5 text-xs ${statusColor[row.status] || statusColor.DRAFT}`}>{EXPORT_TAX_STATUS_LABELS[row.status] || row.status}</span></td>
                    <td className="px-4 py-3 align-top"><div className="font-medium text-slate-100">{row.deliveryNumber}</div><div className="mt-1 text-xs text-slate-400">{row.supplierName}</div><div className="text-xs text-slate-600">合同 {row.contractNumber}</div></td>
                    <td className="px-4 py-3 align-top"><div className="max-w-xs truncate font-mono text-slate-200">{row.items.map((item) => item.sku).join("、")}</div><div className="mt-1 text-xs text-slate-500">{row.items.length} 个 SKU · {totalQty} 件</div></td>
                    <td className="px-4 py-3 text-right align-top"><div className="font-medium text-cyan-300">{money(row.declarationAmount, row.declarationCurrency)}</div><div className="mt-1 text-xs text-slate-500">{row.customsDeclarationNumber || "未录报关单号"}</div></td>
                    <td className="px-4 py-3 align-top"><div className="text-amber-300">{INVOICE_STATUS_LABELS[row.invoiceStatus] || row.invoiceStatus}</div><div className="mt-1 text-xs text-slate-400">{money(row.invoiceAmount, row.invoiceCurrency)}</div></td>
                    <td className="px-4 py-3 align-top"><div className="text-rose-300">{TAX_POINT_STATUS_LABELS[row.taxPointStatus] || row.taxPointStatus}</div><div className="mt-1 text-xs text-slate-400">已付 {money(row.taxPointPaidAmount)}</div><div className="text-xs text-slate-600">应付 {money(row.taxPointAmount)}</div></td>
                    <td className="px-4 py-3 align-top"><div className="text-emerald-300">{REFUND_STATUS_LABELS[row.refundStatus] || row.refundStatus}</div><div className="mt-1 text-xs text-slate-400">到账 {money(row.refundReceivedAmount, row.refundCurrency)}</div><div className="text-xs text-slate-600">申请 {money(row.refundClaimAmount, row.refundCurrency)}</div></td>
                    <td className="px-4 py-3 align-top text-xs text-slate-400">{shortDate(row.updatedAt)}</td>
                    <td className="px-4 py-3 text-right align-top"><button type="button" onClick={() => setSelectedCaseId(row.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/60 hover:text-cyan-300"><Eye className="h-3.5 w-3.5" />查看 / 更新</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-400"><span>共 {pagination.total} 笔，第 {pagination.page}/{Math.max(1, pagination.totalPages)} 页</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-slate-700 p-2 hover:bg-slate-800 disabled:opacity-30" title="上一页"><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border border-slate-700 p-2 hover:bg-slate-800 disabled:opacity-30" title="下一页"><ChevronRight className="h-4 w-4" /></button></div></div>
        </section>
      </div>

      {sourceDeliveryOrderId && <CreateExportTaxDialog deliveryOrderId={sourceDeliveryOrderId} onClose={closeCreate} onCreated={(created) => { closeCreate(); setSelectedCaseId(created.id); void mutate(); }} />}
      {selectedCaseId && <ExportTaxDetailDialog caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} onSaved={() => { setSelectedCaseId(null); void mutate(); }} />}
    </div>
  );
}
