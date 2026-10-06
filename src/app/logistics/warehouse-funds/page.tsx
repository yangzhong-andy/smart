"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowDownToLine, ChevronDown, ChevronUp, RefreshCw, WalletCards } from "lucide-react";
import { PageHeader, ActionButton, EmptyState } from "@/components/ui";
import { toast } from "sonner";

type Account = { warehouseId: string; warehouseCode: string; warehouseName: string; currency: string; balance: number; totalCredit: number; totalDebit: number };
type Entry = {
  id: string; warehouseId: string; warehouseCode: string; warehouseName: string; currency: string; entryType: string; amount: number;
  balanceBefore: number; balanceAfter: number; sourceType: string; sourceId: string; orderId: string | null; notes: string | null; occurredAt: string; createdBy: string | null;
  platform: string | null; shopId: string | null; shopName: string | null; countryCode: string | null;
  details: { orderOutbound?: number; packaging?: number; oversize?: number; total?: number; billedUnits?: number; distinctSkuCount?: number; chargeableWeightKg?: number; packageDimensions?: number[]; tier?: { minWeightKg?: number | null; maxWeightKg?: number | null; baseFee?: number } | null; ruleId?: string | null } | null;
};
type FundResponse = { accounts: Account[]; entries: Entry[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };
const fetcher = (url: string) => fetch(url).then((res) => res.json());
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export default function WarehouseFundsPage() {
  const today = isoDate(new Date());
  const initialStart = isoDate(new Date(Date.now() - 6 * 86400000));
  const [warehouseId, setWarehouseId] = useState("");
  const [platform, setPlatform] = useState("");
  const [currency, setCurrency] = useState("");
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(today);
  const [orderKeyword, setOrderKeyword] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (currency) params.set("currency", currency);
    if (platform) params.set("platform", platform);
    return `/api/warehouse-funds?${params.toString()}`;
  }, [page, warehouseId, currency, platform]);
  const { data, isLoading, mutate } = useSWR<FundResponse>(query, fetcher, { revalidateOnFocus: false });
  const accounts = useMemo(() => data?.accounts || [], [data?.accounts]);
  const entries = (data?.entries || []).filter((entry) => {
    if (!orderKeyword.trim()) return true;
    const keyword = orderKeyword.trim().toLowerCase();
    return String(entry.orderId || entry.sourceId).toLowerCase().includes(keyword);
  });
  const warehouses = useMemo(() => [...new Map(accounts.map((account) => [account.warehouseId, account])).values()], [accounts]);

  const reconcile = async () => {
    if (!startDate || !endDate || startDate > endDate) {
      toast.error("请先选择有效的日期范围");
      return;
    }
    setReconciling(true);
    try {
      const response = await fetch("/api/warehouse-funds/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startDate, endDate, shopId: "", platform: platform || "ALL" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "补记失败");
      toast.success(`扣费补记完成：新增 ${result.deducted} 笔，已存在 ${result.duplicate} 笔，冲正 ${result.reversed} 笔`);
      await mutate();
    } catch (error: any) {
      toast.error(error?.message || "扣费补记失败");
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="仓库资金台账" description="海外仓每笔代发扣费与预存资金余额，按订单可追溯" />

      <section className="grid gap-3 md:grid-cols-3">
        {accounts.map((account) => (
          <div key={`${account.warehouseId}-${account.currency}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200"><WalletCards className="h-4 w-4 text-cyan-400" />{account.warehouseName} · {account.currency}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-slate-500">累计充值</div><div className="mt-1 font-mono text-emerald-300">{account.totalCredit.toFixed(2)}</div></div>
              <div><div className="text-slate-500">累计扣费</div><div className="mt-1 font-mono text-rose-300">{account.totalDebit.toFixed(2)}</div></div>
              <div><div className="text-slate-500">余额</div><div className="mt-1 font-mono text-slate-100">{account.balance.toFixed(2)}</div></div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">仓库<select value={warehouseId} onChange={(event) => { setWarehouseId(event.target.value); setPage(1); }} className="mt-1 block min-w-44 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"><option value="">全部仓库</option>{warehouses.map((warehouse) => <option key={warehouse.warehouseId} value={warehouse.warehouseId}>{warehouse.warehouseName}</option>)}</select></label>
          <label className="text-xs text-slate-400">平台<select value={platform} onChange={(event) => { setPlatform(event.target.value); setPage(1); }} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"><option value="">全部平台</option><option value="TIKTOK">TikTok Shop</option><option value="SHOPEE">Shopee</option><option value="MERCADO_LIVRE">Mercado Livre</option></select></label>
          <label className="text-xs text-slate-400">币种<select value={currency} onChange={(event) => { setCurrency(event.target.value); setPage(1); }} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"><option value="">全部</option>{[...new Set(accounts.map((account) => account.currency))].map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
          <label className="text-xs text-slate-400">订单号<input value={orderKeyword} onChange={(event) => setOrderKeyword(event.target.value)} placeholder="搜索订单" className="mt-1 block w-44 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" /></label>
          <label className="text-xs text-slate-400">补记开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" /></label>
          <label className="text-xs text-slate-400">补记结束日期<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" /></label>
          <ActionButton onClick={reconcile} disabled={reconciling} icon={reconciling ? RefreshCw : ArrowDownToLine}>{reconciling ? "执行中..." : "按利润核算补记扣费"}</ActionButton>
        </div>
        <p className="mt-3 text-xs text-slate-500">补记只写入仓库资金台账，不修改订单、库存或利润金额；同一订单重复执行不会重复扣费。取消订单会生成冲正流水。</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/70 text-xs text-slate-500"><tr><th className="px-4 py-3">发生时间</th><th className="px-4 py-3">平台 / 店铺</th><th className="px-4 py-3">仓库 / 订单</th><th className="px-4 py-3">类型</th><th className="px-4 py-3">HQ-订单出库费</th><th className="px-4 py-3">HQ-包材费</th><th className="px-4 py-3">合计</th><th className="px-4 py-3">扣费后余额</th><th className="px-4 py-3">明细</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {entries.map((entry) => {
                const detail = entry.details || {};
                const isOpen = expanded === entry.id;
                return <tr key={entry.id} className="align-top text-slate-300">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-400">{new Date(entry.occurredAt).toLocaleString("zh-CN")}</td>
                  <td className="px-4 py-3"><div className={entry.platform === "SHOPEE" ? "text-orange-300" : entry.platform === "MERCADO_LIVRE" ? "text-yellow-300" : "text-cyan-300"}>{entry.platform === "SHOPEE" ? "Shopee" : entry.platform === "TIKTOK" ? "TikTok Shop" : entry.platform === "MERCADO_LIVRE" ? "Mercado Livre" : "其他"}</div><div className="mt-1 text-xs text-slate-400">{entry.shopName || entry.shopId || "历史流水"}{entry.countryCode ? ` · ${entry.countryCode}` : ""}</div></td>
                  <td className="px-4 py-3"><div>{entry.warehouseName}</div><div className="mt-1 font-mono text-xs text-cyan-300">{entry.orderId || entry.sourceId}</div></td>
                  <td className="px-4 py-3 text-xs">{entry.entryType === "FULFILLMENT_DEBIT" ? <span className="text-rose-300">代发扣费</span> : entry.entryType === "REVERSAL" ? <span className="text-amber-300">取消冲正</span> : <span>{entry.entryType}</span>}</td>
                  <td className="px-4 py-3 font-mono text-rose-300">{entry.currency} {Number(detail.orderOutbound || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-rose-300">{entry.currency} {Number(detail.packaging || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-rose-200">{entry.currency} {Math.abs(entry.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-slate-200">{entry.currency} {entry.balanceAfter.toFixed(2)}</td>
                  <td className="px-4 py-3"><button type="button" title="查看扣费明细" onClick={() => setExpanded(isOpen ? null : entry.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100">{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{isOpen && <div className="mt-2 min-w-56 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400"><div>计费件数：<span className="text-slate-200">{detail.billedUnits ?? "-"}</span></div><div>SKU 数：<span className="text-slate-200">{detail.distinctSkuCount ?? "-"}</span></div><div>计费重量：<span className="text-slate-200">{detail.chargeableWeightKg != null ? `${Number(detail.chargeableWeightKg).toFixed(3)} kg` : "-"}</span></div><div>包裹尺寸：<span className="text-slate-200">{detail.packageDimensions?.join(" × ") || "-"} cm</span></div><div>规则：<span className="font-mono text-slate-200">{detail.ruleId || "-"}</span></div></div>}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {!isLoading && entries.length === 0 && <EmptyState title="暂无仓库资金流水" description="执行补记后，订单扣费会按订单号出现在这里" />}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-500"><span>共 {data?.pagination?.total || 0} 条</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">上一页</button><span>{page} / {data?.pagination?.totalPages || 1}</span><button disabled={page >= (data?.pagination?.totalPages || 1)} onClick={() => setPage((value) => value + 1)} className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40">下一页</button></div></div>
      </section>
    </div>
  );
}
