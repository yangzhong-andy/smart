"use client";

import useSWR from "swr";
import { AlertTriangle, ClipboardCheck, RefreshCw, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { ActionButton, PageHeader, StatCard } from "@/components/ui";

type AuditRow = {
  orderId?: string;
  shopId?: string;
  sellerSku?: string | null;
  variantId?: string;
  qty?: number;
  recordedWarehouseId?: string;
  expectedWarehouseId?: string | null;
  resolutionStatus?: string;
  tiktokWarehouseId?: string | null;
  reason?: string;
};

type AuditPayload = {
  readOnly: boolean;
  summary: {
    deductionRows: number;
    affectedOrders: number;
    mismatchRows: number;
    missingOrders: number;
  };
  mismatches: AuditRow[];
  truncated: boolean;
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
  return json as AuditPayload;
};

export default function WarehouseAuditPage() {
  const { data, error, isLoading, mutate } = useSWR<AuditPayload>("/api/tiktok/stock-audit", fetcher, {
    revalidateOnFocus: false,
  });

  const refresh = async () => {
    await mutate();
    toast.success("已完成库存归属核对");
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <PageHeader
        title="库存归属核对"
        description="对比订单已记录的扣减仓库与利润核算中的仓库切换规则。此页面只读，不会修改库存、订单或财务数据。"
        actions={<ActionButton icon={RefreshCw} onClick={() => void refresh()} disabled={isLoading}>重新核对</ActionButton>}
      />

      <div className="mx-auto max-w-[1600px] space-y-6 p-6">
        {error && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">加载失败：{error.message}</div>}
        {isLoading && <div className="py-16 text-center text-slate-400"><ClipboardCheck className="mx-auto mb-3 h-10 w-10 animate-pulse" />正在核对订单仓库归属...</div>}

        {data && !isLoading && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard title="已扣减记录" value={data.summary.deductionRows.toLocaleString("zh-CN")} icon={Warehouse} />
              <StatCard title="受影响订单" value={data.summary.affectedOrders.toLocaleString("zh-CN")} icon={AlertTriangle} iconColor="text-amber-300" />
              <StatCard title="仓库不一致明细" value={data.summary.mismatchRows.toLocaleString("zh-CN")} icon={AlertTriangle} iconColor="text-rose-300" />
              <StatCard title="找不到订单" value={data.summary.missingOrders.toLocaleString("zh-CN")} icon={ClipboardCheck} iconColor="text-slate-300" />
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-100">异常明细</h2>
                  <p className="mt-1 text-xs text-slate-500">仅展示当前规则与历史扣减不一致的记录，不提供直接修复操作。</p>
                </div>
                {data.truncated && <span className="text-xs text-amber-300">结果超过 2000 条，已截断显示</span>}
              </div>
              {data.mismatches.length === 0 ? (
                <div className="py-16 text-center text-emerald-300">未发现仓库归属不一致</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-left text-sm">
                    <thead className="border-b border-slate-800 bg-slate-950/60 text-xs text-slate-400">
                      <tr>
                        <th className="px-4 py-3">订单号</th>
                        <th className="px-4 py-3">销售 SKU</th>
                        <th className="px-4 py-3 text-right">数量</th>
                        <th className="px-4 py-3">已记录仓库</th>
                        <th className="px-4 py-3">按规则应属仓库</th>
                        <th className="px-4 py-3">平台仓库 ID</th>
                        <th className="px-4 py-3">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.mismatches.map((row, index) => (
                        <tr key={`${row.orderId || "missing"}-${row.variantId || index}`} className="border-b border-slate-800/70 text-slate-300">
                          <td className="px-4 py-3 font-mono text-xs">{row.orderId || "-"}</td>
                          <td className="px-4 py-3">{row.sellerSku || "-"}</td>
                          <td className="px-4 py-3 text-right">{row.qty ?? "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-rose-300">{row.recordedWarehouseId || "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-emerald-300">{row.expectedWarehouseId || "未匹配"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.tiktokWarehouseId || "-"}</td>
                          <td className="px-4 py-3 text-xs">{row.reason || row.resolutionStatus || "不一致"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
