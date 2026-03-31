"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Package,
  Factory,
  Ship,
  Globe2,
  Warehouse as WarehouseIcon,
  HelpCircle,
  Download,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, ActionButton } from "@/components/ui";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

type LocBucket = {
  qty: number;
  reservedQty: number;
  skuLines: number;
  warehouseIds: string[];
  label: string;
  warehouseCount: number;
};

type ReconciliationPayload = {
  generatedAt: string;
  grandTotalQty: number;
  grandReservedQty: number;
  grandAvailableApprox: number;
  byLocation: Record<string, LocBucket>;
  byWarehouse: Array<{
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    location: string;
    locationLabel: string;
    qty: number;
    reservedQty: number;
    skuLineCount: number;
    isActive: boolean;
  }>;
  variantProfile: {
    sumAtFactory: number;
    sumAtDomestic: number;
    sumInTransit: number;
    sumStockQuantityField: number;
    sumProfileThree: number;
  };
};

const ORDER = ["FACTORY", "DOMESTIC", "TRANSIT", "OVERSEAS", "UNKNOWN"] as const;

export default function InventoryReconciliationPage() {
  const { data, error, isLoading, mutate } = useSWR<ReconciliationPayload>(
    "/api/inventory/reconciliation?noCache=true",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const [locFilter, setLocFilter] = useState<string>("all");

  const filteredWarehouses = useMemo(() => {
    if (!data?.byWarehouse) return [];
    if (locFilter === "all") return data.byWarehouse;
    return data.byWarehouse.filter((w) => w.location === locFilter);
  }, [data, locFilter]);

  const pct = (part: number, total: number) =>
    total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";

  const exportCsv = () => {
    if (!data) {
      toast.error("暂无数据");
      return;
    }
    const headers = [
      "位置",
      "仓库编码",
      "仓库名称",
      "总库存",
      "预留",
      "SKU行数",
      "仓库有效",
    ];
    const rows = data.byWarehouse.map((w) => [
      w.locationLabel,
      w.warehouseCode,
      w.warehouseName,
      String(w.qty),
      String(w.reservedQty),
      String(w.skuLineCount),
      w.isActive ? "是" : "否",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `库存对账_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("已导出");
  };

  const iconFor = (key: string) => {
    switch (key) {
      case "FACTORY":
        return Factory;
      case "DOMESTIC":
        return WarehouseIcon;
      case "TRANSIT":
        return Ship;
      case "OVERSEAS":
        return Globe2;
      default:
        return HelpCircle;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <PageHeader
        title="库存对账"
        description="按「仓库位置」汇总 Stock 表全量数据，并与产品档案上的分布字段对照，便于排查差异。"
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionButton
              icon={RefreshCw}
              onClick={() => {
                void mutate();
                toast.success("已请求刷新");
              }}
            >
              刷新
            </ActionButton>
            <ActionButton icon={Download} onClick={exportCsv} disabled={!data}>
              导出明细
            </ActionButton>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            加载失败：{String((error as Error).message || error)}
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16 text-slate-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40 animate-pulse" />
            正在汇总全库库存…
          </div>
        )}

        {data && !isLoading && (
          <>
            <p className="text-xs text-slate-500">
              数据生成时间：{new Date(data.generatedAt).toLocaleString("zh-CN")} · 主口径为{" "}
              <span className="text-slate-300">Stock（SKU×仓库）</span> 按仓库{" "}
              <span className="text-slate-300">location</span> 聚合，无条数上限截断。
            </p>

            {/* 总览 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">Stock 总件数（qty）</div>
                <div className="text-2xl font-semibold text-slate-100 tabular-nums mt-1">
                  {data.grandTotalQty.toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">预留合计</div>
                <div className="text-2xl font-semibold text-amber-300/90 tabular-nums mt-1">
                  {data.grandReservedQty.toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">可用约（qty − 预留）</div>
                <div className="text-2xl font-semibold text-emerald-300/90 tabular-nums mt-1">
                  {data.grandAvailableApprox.toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">产品档案 · 工厂+国内+在途（参考）</div>
                <div className="text-2xl font-semibold text-slate-300 tabular-nums mt-1">
                  {data.variantProfile.sumProfileThree.toLocaleString("zh-CN")}
                </div>
              </div>
            </div>

            {/* 四段 + 未知 */}
            <div>
              <h2 className="text-sm font-medium text-slate-300 mb-3">按仓库位置（业务四段）</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {ORDER.map((key) => {
                  const b = data.byLocation[key];
                  if (!b) return null;
                  const Icon = iconFor(key);
                  const total = data.grandTotalQty || 1;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLocFilter(locFilter === key ? "all" : key)}
                      className={`rounded-xl border p-4 text-left transition-all hover:bg-slate-800/50 ${
                        locFilter === key
                          ? "border-primary-500/60 bg-primary-500/10 ring-1 ring-primary-500/30"
                          : "border-slate-800 bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
                        <Icon className="h-4 w-4" />
                        {b.label}
                      </div>
                      <div className="text-xl font-bold text-slate-100 tabular-nums">
                        {b.qty.toLocaleString("zh-CN")}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-2">
                        占比 {pct(b.qty, total)}% · {b.warehouseCount} 个仓 · {b.skuLines} 条明细行
                      </div>
                    </button>
                  );
                })}
              </div>
              {locFilter !== "all" && (
                <p className="text-xs text-slate-500 mt-2">
                  已筛选位置：{data.byLocation[locFilter]?.label ?? locFilter}，点击下方「全部」可清除。
                </p>
              )}
            </div>

            {/* 产品档案对照 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-medium text-slate-300 mb-2">产品档案（ProductVariant）分布 — 参考对照</h2>
              <p className="text-xs text-slate-500 mb-3">
                以下为变体表上的「工厂 / 国内待发 / 海运中」字段合计，可能与 Stock 仓库存因同步时机不同而不一致；海外库存主要在 Stock（海外仓）中体现。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">atFactory</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {data.variantProfile.sumAtFactory.toLocaleString("zh-CN")}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">atDomestic</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {data.variantProfile.sumAtDomestic.toLocaleString("zh-CN")}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">inTransit</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {data.variantProfile.sumInTransit.toLocaleString("zh-CN")}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">stockQuantity 字段合计</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {data.variantProfile.sumStockQuantityField.toLocaleString("zh-CN")}
                  </div>
                </div>
              </div>
            </div>

            {/* 按仓明细 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-slate-800">
                <h2 className="text-sm font-medium text-slate-200">按仓库明细（Stock 汇总）</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocFilter("all")}
                    className="text-xs text-primary-400 hover:text-primary-300"
                  >
                    显示全部位置
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50 text-left text-xs text-slate-400">
                    <tr>
                      <th className="px-4 py-2">位置</th>
                      <th className="px-4 py-2">仓库编码</th>
                      <th className="px-4 py-2">仓库名称</th>
                      <th className="px-4 py-2 text-right">总库存 qty</th>
                      <th className="px-4 py-2 text-right">预留</th>
                      <th className="px-4 py-2 text-right">SKU行数</th>
                      <th className="px-4 py-2">启用</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredWarehouses.map((w) => (
                      <tr key={w.warehouseId} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2 text-slate-300">{w.locationLabel}</td>
                        <td className="px-4 py-2 font-mono text-slate-400">{w.warehouseCode}</td>
                        <td className="px-4 py-2 text-slate-200">{w.warehouseName}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-100">
                          {w.qty.toLocaleString("zh-CN")}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-amber-300/80">
                          {w.reservedQty.toLocaleString("zh-CN")}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                          {w.skuLineCount}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{w.isActive ? "是" : "否"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-800">
                共 {filteredWarehouses.length} 个仓库有库存记录
                {locFilter !== "all" ? `（已按位置筛选）` : ""}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-slate-900/30 p-4 text-xs text-slate-500 leading-relaxed">
              <strong className="text-slate-400">说明：</strong>
              全量件数以 <span className="text-slate-300">Stock.qty</span> 为准，按{" "}
              <span className="text-slate-300">Warehouse.location</span> 归入工厂 / 国内 / 在途 / 海外。若某段明显偏小，请检查该段业务是否已写入
              Stock（例如入库、调拨、海外上架）。未匹配到仓库主数据的行会归入「未匹配仓库」。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
