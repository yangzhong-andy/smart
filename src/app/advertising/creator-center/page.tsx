"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { BarChart3, Database, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import StoreMarketingNav from "@/components/store-marketing/StoreMarketingNav";

type Shop = { shopId: string; shopName: string; region: string | null };
type Summary = { shopId: string; shopName: string; creatorUsername: string; creatorNickname: string | null; orders: number; skuLines: number; quantity: number; gross: number; commission: number; currency: string };
type CreatorLine = {
  id: string; shopId: string; shopName: string; orderId: string; orderTime: string | null; orderStatus: string | null;
  creatorUsername: string; creatorNickname: string | null; creatorUserId: string | null; externalSkuId: string;
  quantity: number; currency: string; unitPrice: number; gross: number; settlementStatus: string | null;
  collaborationType: string | null; source: string; syncedAt: string; settlementCommission: number; commissionAllocation: string;
};
type Response = { shops: Shop[]; summary: Summary[]; lines: CreatorLine[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; note: string };

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || "达人中心加载失败");
  return body as Response;
};

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(days: number) { return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); }
function money(value: number, currency: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: currency || "BRL", maximumFractionDigits: 2 }).format(value || 0);
}
function displayTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "订单待补齐";
}

export default function CreatorCenterPage() {
  const [shopId, setShopId] = useState("all");
  const [startDate, setStartDate] = useState(() => daysAgo(29));
  const [endDate, setEndDate] = useState(today);
  const [creator, setCreator] = useState("");
  const [orderId, setOrderId] = useState("");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const query = useMemo(() => {
    const params = new URLSearchParams({ startDate, endDate, page: String(page), pageSize: "30" });
    if (shopId !== "all") params.set("shopId", shopId);
    if (creator.trim()) params.set("creator", creator.trim());
    if (orderId.trim()) params.set("orderId", orderId.trim());
    return `/api/creator-center?${params.toString()}`;
  }, [creator, endDate, orderId, page, shopId, startDate]);
  const { data, error, isLoading, isValidating, mutate } = useSWR<Response>(query, fetcher, { revalidateOnFocus: false });

  const totalOrders = useMemo(() => data?.summary.reduce((sum, row) => sum + row.orders, 0) || 0, [data?.summary]);
  const totalUnits = useMemo(() => data?.summary.reduce((sum, row) => sum + row.quantity, 0) || 0, [data?.summary]);

  const submitFilters = () => setPage(1);
  const syncOrders = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/tiktok/creator-orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(shopId !== "all" ? { shopId } : {}),
          startTime: Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000),
          endTime: Math.floor(new Date(`${endDate}T00:00:00Z`).getTime() / 1000) + 86400,
          ...(creator.trim() ? { creatorUsername: creator.trim() } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "同步失败");
      const count = (body.results || []).reduce((sum: number, row: { upserts?: number }) => sum + (row.upserts || 0), 0);
      toast.success(`官方联盟归因同步完成，写入 ${count} 条 SKU 归因`);
      await mutate();
    } catch (syncError: any) {
      toast.error(syncError?.message || "达人订单同步失败");
    } finally {
      setSyncing(false);
    }
  };

  return <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 md:px-6">
    <div className="mx-auto max-w-[1800px] space-y-5">
      <StoreMarketingNav />
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Users className="h-6 w-6 text-cyan-400" />达人中心</h1><p className="mt-1 text-sm text-slate-500">订单归因按店铺、订单、SKU 与达人账号保存；佣金以平台结算单为准。</p></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => mutate()} title="刷新" className="icon-button"><RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} /></button><button type="button" onClick={syncOrders} disabled={syncing} className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"><Database className="h-4 w-4" />{syncing ? "同步中" : "同步官方联盟订单"}</button></div>
      </header>

      <section className="grid gap-3 border-b border-slate-800 pb-5 sm:grid-cols-2 xl:grid-cols-5">
        <label className="field"><span>开始日期</span><input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="field"><span>结束日期</span><input type="date" value={endDate} min={startDate} max={today()} onChange={(event) => setEndDate(event.target.value)} /></label>
        <label className="field"><span>店铺</span><select value={shopId} onChange={(event) => { setShopId(event.target.value); setPage(1); }}><option value="all">全部店铺</option>{(data?.shops || []).map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName}</option>)}</select></label>
        <label className="field"><span>达人账号</span><input value={creator} placeholder="creator username" onChange={(event) => setCreator(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitFilters()} /></label>
        <label className="field"><span>订单号</span><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600" /><input className="pl-9" value={orderId} placeholder="搜索订单" onChange={(event) => setOrderId(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submitFilters()} /></div></label>
      </section>

      {error && <div className="rounded-md border border-rose-500/40 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">{error.message}</div>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="归因达人" value={`${data?.summary.length || 0} 人`} icon={Users} /><Metric label="归因订单" value={`${totalOrders} 单`} icon={BarChart3} /><Metric label="关联商品件数" value={`${totalUnits} 件`} icon={Database} /><Metric label="SKU 归因记录" value={`${data?.pagination.total || 0} 条`} icon={Database} /></section>

      <section className="border-y border-slate-800 py-5"><div className="mb-3"><h2 className="text-sm font-semibold text-slate-200">达人表现概览</h2><p className="mt-1 text-xs text-slate-500">GMV 来自官方联盟订单 SKU 单价；达人佣金来自结算单，未结算订单显示为 0。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr><th>店铺 / 达人</th><th>订单</th><th>SKU 行</th><th>件数</th><th>归因 GMV</th><th>已结算达人佣金</th></tr></thead><tbody>{(data?.summary || []).map((row) => <tr key={`${row.shopId}-${row.creatorUsername}-${row.currency}`}><td><div className="font-medium text-slate-200">{row.creatorNickname || row.creatorUsername}</div><div className="text-xs text-slate-500">{row.creatorUsername} · {row.shopName}</div></td><td>{row.orders}</td><td>{row.skuLines}</td><td>{row.quantity}</td><td className="money">{money(row.gross, row.currency)}</td><td className="money text-cyan-300">{money(row.commission, row.currency)}</td></tr>)}</tbody></table>{!isLoading && (data?.summary.length || 0) === 0 && <Empty message="当前条件下没有已同步的达人订单归因。" />}</div></section>

      <section><div className="mb-3 flex items-end justify-between gap-4"><div><h2 className="text-sm font-semibold text-slate-200">达人订单明细</h2><p className="mt-1 text-xs text-slate-500">{data?.note}</p></div><div className="text-xs text-slate-500">第 {data?.pagination.page || 1} / {data?.pagination.totalPages || 1} 页</div></div><div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-sm"><thead><tr><th>店铺 / 状态</th><th>订单 / 时间</th><th>达人</th><th>平台 SKU</th><th>件数</th><th>SKU 单价</th><th>归因 GMV</th><th>达人佣金</th><th>归因 / 结算状态</th><th>同步时间</th></tr></thead><tbody>{(data?.lines || []).map((row) => <tr key={row.id}><td><div className="text-slate-200">{row.shopName}</div><div className="text-xs text-slate-500">{row.orderStatus || "待订单同步"}</div></td><td><div className="font-mono text-xs text-slate-300">{row.orderId}</div><div className="text-xs text-slate-500">{displayTime(row.orderTime)}</div></td><td><div className="text-slate-200">{row.creatorNickname || row.creatorUsername}</div><div className="text-xs text-slate-500">{row.creatorUsername}</div></td><td className="font-mono text-xs text-slate-300">{row.externalSkuId}</td><td>{row.quantity}</td><td className="money">{money(row.unitPrice, row.currency)}</td><td className="money">{money(row.gross, row.currency)}</td><td className="money text-cyan-300" title={row.commissionAllocation}>{money(row.settlementCommission, row.currency)}</td><td><div className="text-xs text-slate-300">{row.source === "OFFICIAL_AFFILIATE_API" ? "官方联盟 API" : row.source}</div><div className="mt-1 text-xs text-slate-500">{row.settlementStatus || "未结算"}</div></td><td className="text-xs text-slate-500">{displayTime(row.syncedAt)}</td></tr>)}</tbody></table>{isLoading && <div className="py-16 text-center text-sm text-slate-500">加载达人归因数据...</div>}{!isLoading && (data?.lines.length || 0) === 0 && <Empty message="暂无明细" />}</div><div className="mt-4 flex justify-end gap-2"><button className="pager" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><button className="pager" disabled={!data || page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>下一页</button></div></section>
    </div>
    <style jsx>{`.field{font-size:12px;color:#94a3b8}.field span{display:block;margin:0 0 6px}.field input,.field select{height:40px;width:100%;border:1px solid #334155;border-radius:6px;background:#0f172a;padding:0 12px;color:#e2e8f0;font-size:14px;outline:none}.field input:focus,.field select:focus{border-color:#06b6d4}.icon-button{display:inline-flex;height:40px;width:40px;align-items:center;justify-content:center;border:1px solid #334155;border-radius:6px;color:#cbd5e1}.icon-button:hover,.pager:hover:not(:disabled){background:#1e293b}.pager{height:34px;border:1px solid #334155;border-radius:6px;padding:0 12px;font-size:13px;color:#cbd5e1}.pager:disabled{cursor:not-allowed;opacity:.4}table{border-collapse:collapse}th{border-bottom:1px solid #334155;padding:10px 12px;text-align:left;font-size:12px;font-weight:500;color:#94a3b8}td{border-bottom:1px solid #172033;padding:11px 12px;color:#cbd5e1;vertical-align:middle}tbody tr:hover{background:rgba(30,41,59,.55)}.money{text-align:right;font-variant-numeric:tabular-nums}`}</style>
  </main>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between text-xs text-slate-400"><span>{label}</span><Icon className="h-4 w-4 text-slate-500" /></div><div className="mt-2 text-xl font-semibold tabular-nums text-slate-100">{value}</div></div>;
}
function Empty({ message }: { message: string }) { return <div className="py-16 text-center text-sm text-slate-500">{message}</div>; }
