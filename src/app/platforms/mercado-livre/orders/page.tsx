"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, CircleDollarSign, CreditCard, Eye, Loader2,
  Package, RefreshCw, RotateCcw, Search, ShoppingBag, Store, Truck, X,
} from "lucide-react";
import { toast } from "sonner";
import { Pagination } from "@/components/Pagination";

type MoneyValue = number | string | null;
type Account = { id: string; userId: string; nickname: string | null; currency: string; lastSyncAt: string | null };
type ListItem = { id: string; sellerSku: string | null; title: string | null; quantity: number; unitPrice: MoneyValue };
type Order = {
  id: string; externalOrderId: string; status: string | null; substatus: string | null; currency: string | null;
  totalAmount: MoneyValue; paidAmount: MoneyValue; buyerNickname: string | null; shippingId: string | null;
  packId: string | null; dateCreated: string | null; lastUpdated: string | null; items: ListItem[];
  account: { userId: string; nickname: string | null; currency: string };
};
type DetailItem = {
  id: string; itemId: string; variationId: string | null; sellerSku: string | null; title: string | null;
  quantity: number; unitPrice: MoneyValue; fullUnitPrice: MoneyValue; lineTotal: MoneyValue;
  originalTotal: MoneyValue; discountAmount: MoneyValue; saleFee: MoneyValue;
};
type Charge = { id: string; paymentId: string; code: string; label: string; amount: number; refundedAmount: number; type: string | null };
type Payment = {
  id: string | null; status: string | null; statusDetail: string | null; currency: string | null;
  transactionAmount: MoneyValue; totalPaidAmount: MoneyValue; netReceivedAmount: MoneyValue; refundedAmount: MoneyValue;
  couponAmount: MoneyValue; shippingAmount: MoneyValue; taxesAmount: MoneyValue; installments: MoneyValue;
  paymentMethodId: string | null; paymentTypeId: string | null; dateCreated: string | null; dateApproved: string | null;
  moneyReleaseDate: string | null; moneyReleaseStatus: string | null;
};
type OrderDetail = {
  order: {
    id: string; externalOrderId: string; status: string | null; substatus: string | null; currency: string;
    totalAmount: MoneyValue; paidAmount: MoneyValue; shippingId: string | null; packId: string | null;
    dateCreated: string | null; lastUpdated: string | null; dateClosed: string | null; syncedAt: string | null;
    account: { userId: string; nickname: string | null; country: string; currency: string };
  };
  buyer: { id: string | null; nickname: string | null };
  items: DetailItem[];
  payments: Payment[];
  financialSummary: {
    gmv: MoneyValue; paidAmount: MoneyValue; netReceivedAmount: MoneyValue; refundedAmount: MoneyValue;
    saleCommission: MoneyValue; paymentProcessingFee: MoneyValue; financingFee: MoneyValue;
    sellerShippingFee: MoneyValue; charges: Charge[];
  };
  shipment: null | {
    id: string | null; status: string | null; substatus: string | null; mode: string | null; logisticType: string | null;
    trackingNumber: string | null; trackingMethod: string | null; serviceId: string | null; dateCreated: string | null;
    lastUpdated: string | null; dateFirstPrinted: string | null; buyerShippingCost: MoneyValue;
    listedShippingCost: MoneyValue; sellerShippingCost: MoneyValue; sellerShippingSaving: MoneyValue; grossShippingCost: MoneyValue;
  };
  cancellation: null | { reason: string | null; description: string | null; date: string | null; type: string | null };
  warnings: string[];
};

const STATUS_LABELS: Record<string, string> = {
  paid: "已付款", confirmed: "已确认", payment_required: "待付款", payment_in_process: "付款处理中",
  partially_paid: "部分付款", cancelled: "已取消", invalid: "无效订单", refunded: "已退款",
};
const STATUS_STYLES: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  confirmed: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  payment_required: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  payment_in_process: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  partially_paid: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  cancelled: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  invalid: "border-slate-600 bg-slate-800 text-slate-300",
  refunded: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

function statusLabel(value: string | null) { return value ? STATUS_LABELS[value.toLowerCase()] || value : "未知状态"; }
function statusStyle(value: string | null) { return STATUS_STYLES[value?.toLowerCase() || ""] || "border-slate-600 bg-slate-800 text-slate-300"; }
function hasMoney(value: MoneyValue | undefined) { return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)); }
function money(value: MoneyValue | undefined, currency = "BRL") {
  return hasMoney(value) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value)) : "--";
}
function dateTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
function Metric({ label, value, detail, tone = "text-slate-100" }: { label: string; value: string; detail?: string; tone?: string }) {
  return <div className="min-w-0 border-l-2 border-slate-700 pl-3"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 truncate text-lg font-semibold ${tone}`} title={value}>{value}</div>{detail && <div className="mt-0.5 truncate text-xs text-slate-500" title={detail}>{detail}</div>}</div>;
}
function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-w-0 items-start justify-between gap-4 py-1.5 text-sm"><span className="shrink-0 text-slate-500">{label}</span><span className={`min-w-0 break-words text-right text-slate-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</span></div>;
}
function SectionTitle({ icon: Icon, title, note }: { icon: typeof Package; title: string; note?: string }) {
  return <div className="mb-4 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Icon className="h-4 w-4 text-amber-400" />{title}</h3>{note && <span className="text-xs text-slate-500">{note}</span>}</div>;
}

function OrderDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/mercado-livre/orders/${encodeURIComponent(orderId)}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "订单详情加载失败"); setDetail(data); })
      .catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "订单详情加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderId]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", handleKey); };
  }, [onClose]);

  const currency = detail?.order.currency || "BRL";
  const summary = detail?.financialSummary;
  const quantity = detail?.items.reduce((total, item) => total + item.quantity, 0) || 0;

  return <div className="fixed inset-0 z-[80]">
    <button className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]" aria-label="关闭订单详情" onClick={onClose} />
    <aside role="dialog" aria-modal="true" aria-label="Mercado Livre 订单详情" className="absolute inset-y-0 right-0 flex w-full max-w-[960px] flex-col border-l border-slate-700 bg-slate-950 shadow-2xl">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-4 sm:px-6"><div className="min-w-0"><div className="text-xs text-slate-500">订单详情</div><h2 className="truncate font-mono text-base font-semibold text-slate-100">{detail?.order.externalOrderId || "正在读取..."}</h2></div><button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white" title="关闭"><X className="h-5 w-5" /></button></header>
      {loading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-amber-400" /></div>
        : error ? <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"><AlertTriangle className="h-8 w-8 text-rose-400" /><p className="text-sm text-slate-300">{error}</p></div>
          : detail && <div className="flex-1 overflow-y-auto">
            <section className="border-b border-slate-800 bg-slate-900/60 px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex rounded border px-2 py-1 text-xs ${statusStyle(detail.order.status)}`}>{statusLabel(detail.order.status)}</span>{detail.order.substatus && <span className="text-xs text-slate-500">{detail.order.status} / {detail.order.substatus}</span>}</div><div className="mt-3 text-sm text-slate-300">{detail.order.account.nickname || detail.order.account.userId}</div><div className="mt-1 text-xs text-slate-500">买家：{detail.buyer.nickname || detail.buyer.id || "平台未返回"}</div></div><div className="text-right text-xs text-slate-500"><div>下单（巴西时间）</div><div className="mt-1 text-sm text-slate-200">{dateTime(detail.order.dateCreated)}</div></div></div>
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4"><Metric label="GMV / 订单金额" value={money(summary?.gmv, currency)} /><Metric label="买家实付" value={money(summary?.paidAmount, currency)} /><Metric label="净到账" value={money(summary?.netReceivedAmount, currency)} tone="text-emerald-300" detail={detail.payments[0]?.moneyReleaseStatus || undefined} /><Metric label="退款" value={money(summary?.refundedAmount, currency)} tone={Number(summary?.refundedAmount || 0) > 0 ? "text-rose-300" : "text-slate-100"} /></div>
            </section>

            {detail.warnings.length > 0 && <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 sm:px-6"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><b>部分实时数据暂未取得</b>{detail.warnings.map((warning) => <div className="mt-1" key={warning}>{warning}</div>)}</div></div></div>}

            <section className="border-b border-slate-800 px-4 py-6 sm:px-6">
              <SectionTitle icon={Package} title="订单商品" note={`${detail.items.length} 个 SKU · ${quantity} 件`} />
              <div className="overflow-x-auto border border-slate-800"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-900 text-xs text-slate-500"><tr><th className="px-3 py-2.5 font-medium">商品 / SKU</th><th className="px-3 py-2.5 text-right font-medium">原价</th><th className="px-3 py-2.5 text-right font-medium">成交单价</th><th className="px-3 py-2.5 text-right font-medium">数量</th><th className="px-3 py-2.5 text-right font-medium">小计</th></tr></thead><tbody className="divide-y divide-slate-800">{detail.items.map((item) => <tr key={item.id}><td className="max-w-sm px-3 py-3"><div className="truncate text-slate-200" title={item.title || ""}>{item.title || "未命名商品"}</div><div className="mt-1 font-mono text-xs text-slate-500">{item.sellerSku || item.itemId}{item.variationId && item.variationId !== "0" ? ` · ${item.variationId}` : ""}</div></td><td className="whitespace-nowrap px-3 py-3 text-right text-slate-400">{money(item.fullUnitPrice, currency)}</td><td className="whitespace-nowrap px-3 py-3 text-right text-slate-200">{money(item.unitPrice, currency)}</td><td className="px-3 py-3 text-right text-slate-300">{item.quantity}</td><td className="whitespace-nowrap px-3 py-3 text-right font-medium text-slate-100">{money(item.lineTotal, currency)}</td></tr>)}</tbody></table></div>
            </section>

            <section className="border-b border-slate-800 px-4 py-6 sm:px-6">
              <SectionTitle icon={CircleDollarSign} title="收入与平台费用" note="来自订单及 Mercado Pago" />
              <div className="grid gap-x-8 gap-y-1 md:grid-cols-2"><div><DetailRow label="平台销售佣金" value={money(summary?.saleCommission, currency)} /><DetailRow label="支付处理费" value={money(summary?.paymentProcessingFee, currency)} /></div><div><DetailRow label="分期 / 融资费" value={money(summary?.financingFee, currency)} /><DetailRow label="卖家物流费" value={money(summary?.sellerShippingFee, currency)} /></div></div>
              {summary?.charges.length ? <div className="mt-4 overflow-x-auto border-t border-slate-800 pt-3"><table className="w-full min-w-[600px] text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2 font-medium">费用项</th><th className="py-2 font-medium">接口代码</th><th className="py-2 text-right font-medium">原金额</th><th className="py-2 text-right font-medium">退回金额</th></tr></thead><tbody className="divide-y divide-slate-800">{summary.charges.map((charge) => <tr key={charge.id}><td className="py-2.5 text-slate-200">{charge.label}</td><td className="py-2.5 font-mono text-slate-500">{charge.code}</td><td className="py-2.5 text-right text-slate-200">{money(charge.amount, currency)}</td><td className="py-2.5 text-right text-slate-400">{money(charge.refundedAmount, currency)}</td></tr>)}</tbody></table></div> : <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">接口暂未返回逐项费用，平台销售佣金优先使用订单商品佣金。</div>}
            </section>

            <section className="border-b border-slate-800 px-4 py-6 sm:px-6">
              <SectionTitle icon={CreditCard} title="支付与退款" note={`${detail.payments.length} 笔支付`} />
              {detail.payments.length === 0 ? <div className="text-sm text-slate-500">订单暂未返回可查询的支付记录。</div> : <div className="divide-y divide-slate-800 border-y border-slate-800">{detail.payments.map((payment) => <div key={payment.id || "payment"} className="grid gap-x-8 py-4 md:grid-cols-2"><div><DetailRow label="支付编号" value={payment.id || "--"} mono /><DetailRow label="支付状态" value={`${payment.status || "--"}${payment.statusDetail ? ` / ${payment.statusDetail}` : ""}`} /><DetailRow label="支付方式" value={[payment.paymentMethodId, payment.paymentTypeId].filter(Boolean).join(" / ") || "--"} /></div><div><DetailRow label="支付金额" value={money(payment.transactionAmount, payment.currency || currency)} /><DetailRow label="净到账" value={money(payment.netReceivedAmount, payment.currency || currency)} /><DetailRow label="预计放款" value={dateTime(payment.moneyReleaseDate)} /></div></div>)}</div>}
            </section>

            <section className="border-b border-slate-800 px-4 py-6 sm:px-6">
              <SectionTitle icon={Truck} title="物流与履约" />
              {!detail.shipment ? <div className="text-sm text-slate-500">该订单暂未生成物流记录。</div> : <div className="grid gap-x-8 md:grid-cols-2"><div><DetailRow label="物流编号" value={detail.shipment.id || "--"} mono /><DetailRow label="物流状态" value={[detail.shipment.status, detail.shipment.substatus].filter(Boolean).join(" / ") || "--"} /><DetailRow label="履约类型" value={detail.shipment.logisticType || detail.shipment.mode || "--"} /><DetailRow label="承运方式" value={detail.shipment.trackingMethod || "--"} /></div><div><DetailRow label="追踪单号" value={detail.shipment.trackingNumber || "--"} mono /><DetailRow label="标价物流成本" value={money(detail.shipment.listedShippingCost, currency)} /><DetailRow label="卖家承担物流" value={money(detail.shipment.sellerShippingCost, currency)} /><DetailRow label="物流成本节省" value={money(detail.shipment.sellerShippingSaving, currency)} /></div></div>}
            </section>

            {(detail.cancellation || Number(summary?.refundedAmount || 0) > 0) && <section className="border-b border-slate-800 px-4 py-6 sm:px-6"><SectionTitle icon={RotateCcw} title="取消 / 退款" /><div className="grid gap-x-8 md:grid-cols-2"><div><DetailRow label="退款金额" value={money(summary?.refundedAmount, currency)} /><DetailRow label="取消原因" value={detail.cancellation?.reason || "--"} /></div><div><DetailRow label="原因说明" value={detail.cancellation?.description || "--"} /><DetailRow label="取消时间" value={dateTime(detail.cancellation?.date)} /></div></div></section>}

            <section className="px-4 py-5 sm:px-6"><SectionTitle icon={CalendarDays} title="订单时间" /><div className="grid gap-x-8 md:grid-cols-2"><div><DetailRow label="下单时间" value={dateTime(detail.order.dateCreated)} /><DetailRow label="关闭时间" value={dateTime(detail.order.dateClosed)} /></div><div><DetailRow label="平台更新时间" value={dateTime(detail.order.lastUpdated)} /><DetailRow label="系统同步时间" value={dateTime(detail.order.syncedAt)} /></div></div></section>
          </div>}
    </aside>
  </div>;
}

export default function MercadoLivreOrdersPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [baseTotal, setBaseTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (accountId) params.set("accountId", accountId);
    if (keyword) params.set("keyword", keyword);
    if (status) params.set("status", status);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params;
  }, [accountId, endDate, keyword, page, pageSize, startDate, status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/mercado-livre/orders?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "订单加载失败");
      setOrders(data.data || []); setTotal(data.total || 0); setBaseTotal(data.baseTotal ?? data.total ?? 0);
      setAccounts(data.accounts || []); setStatusCounts(data.statusCounts || {});
    } catch (error) { toast.error(error instanceof Error ? error.message : "订单加载失败"); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/mercado-livre/orders/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(accountId ? { accountId } : {}), days: 90 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "订单同步失败");
      const saved = data.results?.reduce((sum: number, row: { saved?: number }) => sum + Number(row.saved || 0), 0) || 0;
      if (data.errors?.length) toast.error(data.errors.map((row: { error: string }) => row.error).join("；")); else toast.success(`订单同步完成：已写入或更新 ${saved} 笔`);
      setPage(1); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "订单同步失败"); }
    finally { setSyncing(false); }
  };
  const search = (event: FormEvent) => { event.preventDefault(); setKeyword(keywordInput.trim()); setPage(1); };
  const clearFilters = () => { setAccountId(""); setStatus(""); setKeywordInput(""); setKeyword(""); setStartDate(""); setEndDate(""); setPage(1); };
  const statuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
  const activeFilters = Boolean(accountId || status || keyword || startDate || endDate);

  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl"><ShoppingBag className="h-6 w-6 text-amber-400" />Mercado Livre 订单</h1><p className="mt-1 text-sm text-slate-500">订单时间按巴西圣保罗时区展示，点击订单查看真实支付、费用与物流明细。</p></div><button onClick={() => void sync()} disabled={syncing} className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{syncing ? "同步中..." : "同步近 90 天"}</button></header>

    <section className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="订单状态概览"><button onClick={() => { setStatus(""); setPage(1); }} className={`min-w-[130px] border px-4 py-3 text-left transition ${!status ? "border-amber-500 bg-amber-500/10" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}><div className="text-xs text-slate-500">全部订单</div><div className="mt-1 text-xl font-semibold">{baseTotal.toLocaleString()}</div></button>{statuses.map(([key, count]) => <button key={key} onClick={() => { setStatus(key === "UNKNOWN" ? "" : key); setPage(1); }} className={`min-w-[130px] border px-4 py-3 text-left transition ${status === key ? "border-amber-500 bg-amber-500/10" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}><div className="truncate text-xs text-slate-500">{statusLabel(key)}</div><div className="mt-1 text-xl font-semibold">{count.toLocaleString()}</div></button>)}</section>

    <form onSubmit={search} className="mb-4 border border-slate-800 bg-slate-900 p-3"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,0.8fr)_minmax(150px,0.7fr)_150px_150px_minmax(260px,1.4fr)_auto]">
      <label className="text-xs text-slate-500">授权店铺<select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-500"><option value="">全部店铺</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.nickname || account.userId}</option>)}</select></label>
      <label className="text-xs text-slate-500">订单状态<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-500"><option value="">全部状态</option>{statuses.map(([key]) => <option key={key} value={key}>{statusLabel(key)}</option>)}</select></label>
      <label className="text-xs text-slate-500">开始日期<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-500" /></label>
      <label className="text-xs text-slate-500">结束日期<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-amber-500" /></label>
      <label className="text-xs text-slate-500">订单号、买家、物流单号或 SKU<div className="relative mt-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-amber-500" /></div></label>
      <div className="flex items-end gap-2"><button type="submit" className="h-10 rounded-md bg-slate-100 px-4 text-sm font-medium text-slate-950 hover:bg-white">查询</button>{activeFilters && <button type="button" onClick={clearFilters} className="grid h-10 w-10 place-items-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white" title="清除筛选"><X className="h-4 w-4" /></button>}</div>
    </div></form>

    <section className="overflow-hidden border border-slate-800 bg-slate-900"><div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm"><span className="text-slate-400">当前结果 <b className="text-slate-100">{total.toLocaleString()}</b> 笔</span>{activeFilters && <span className="text-xs text-slate-500">已应用筛选条件</span>}</div>
      {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-400" /></div> : orders.length === 0 ? <div className="flex h-64 flex-col items-center justify-center text-slate-500"><Package className="mb-3 h-8 w-8" /><span className="text-sm">没有符合条件的订单</span></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-800/70 text-xs text-slate-400"><tr><th className="px-4 py-3 font-medium">订单 / 买家</th><th className="px-4 py-3 font-medium">店铺</th><th className="px-4 py-3 font-medium">商品</th><th className="px-4 py-3 text-right font-medium">数量</th><th className="px-4 py-3 text-right font-medium">订单金额</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">下单时间</th><th className="w-14 px-3 py-3" /></tr></thead><tbody className="divide-y divide-slate-800">{orders.map((order) => {
        const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0); const firstItem = order.items[0]; const currency = order.currency || order.account.currency || "BRL";
        return <tr key={order.id} onClick={() => setSelectedOrderId(order.id)} className="cursor-pointer align-middle hover:bg-slate-800/50"><td className="px-4 py-3"><div className="font-mono text-xs font-semibold text-slate-100">{order.externalOrderId}</div><div className="mt-1 truncate text-xs text-slate-500">{order.buyerNickname || "买家信息未返回"}{order.shippingId ? ` · 物流 ${order.shippingId}` : ""}</div></td><td className="px-4 py-3"><div className="flex items-center gap-2 text-slate-200"><Store className="h-4 w-4 shrink-0 text-amber-400" /><span className="max-w-40 truncate">{order.account.nickname || order.account.userId}</span></div></td><td className="max-w-[320px] px-4 py-3"><div className="truncate text-slate-200" title={firstItem?.title || ""}>{firstItem?.title || "未命名商品"}</div><div className="mt-1 truncate font-mono text-xs text-slate-500">{firstItem?.sellerSku || "无 SKU"}{order.items.length > 1 ? ` · 另 ${order.items.length - 1} 个 SKU` : ""}</div></td><td className="px-4 py-3 text-right font-medium text-slate-200">{quantity}</td><td className="whitespace-nowrap px-4 py-3 text-right"><div className="font-medium text-slate-100">{money(order.totalAmount, currency)}</div>{Number(order.paidAmount || 0) !== Number(order.totalAmount || 0) && <div className="mt-1 text-xs text-slate-500">实付 {money(order.paidAmount, currency)}</div>}</td><td className="px-4 py-3"><span className={`inline-flex rounded border px-2 py-1 text-xs ${statusStyle(order.status)}`}>{statusLabel(order.status)}</span>{order.substatus && <div className="mt-1 text-xs text-slate-500">{order.substatus}</div>}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-300">{dateTime(order.dateCreated)}<div className="mt-1 text-slate-500">更新 {dateTime(order.lastUpdated)}</div></td><td className="px-3 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedOrderId(order.id); }} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-700 hover:text-white" title="查看订单详情"><Eye className="h-4 w-4" /></button></td></tr>;
      })}</tbody></table></div>}
      <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} showAllOption={false} />
    </section>
    {selectedOrderId && <OrderDrawer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />}
  </main>;
}
