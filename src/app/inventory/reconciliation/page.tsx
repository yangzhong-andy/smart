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
  businessByLocation: {
    FACTORY: number;
    DOMESTIC: number;
    TRANSIT: number;
    OVERSEAS: number;
  };
  businessTotalQty: number;
  /** 与业务 TRANSIT 一致：绑柜且在途/装柜的出库批次明细件数 */
  seaTransitFromContainer?: number;
  /** 计入海运在途的柜子状态（枚举值） */
  seaTransitContainerStatuses?: string[];
  diagnostics?: {
    factoryRemainUnlinked: number;
    inboundReceivedLinked: number;
    outboundQtyLinked: number;
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
  const [isSyncingProfileInventory, setIsSyncingProfileInventory] = useState(false);

  const filteredWarehouses = useMemo(() => {
    if (!data?.byWarehouse) return [];
    if (locFilter === "all") return data.byWarehouse;
    return data.byWarehouse.filter((w) => w.location === locFilter);
  }, [data, locFilter]);

  const pct = (part: number, total: number) =>
    total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
  const fmt = (v: unknown) => Number(v ?? 0).toLocaleString("zh-CN");

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

  const syncProfileInventory = async () => {
    if (isSyncingProfileInventory) return;
    setIsSyncingProfileInventory(true);
    try {
      const res = await fetch("/api/inventory/reconciliation", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(json?.error || `HTTP ${res.status}`));
      }
      toast.success(
        `已重算 ${Number(json?.affectedVariantCount ?? 0).toLocaleString("zh-CN")} 个 SKU`
      );
      await mutate();
    } catch (e) {
      toast.error(`重算失败：${String((e as Error).message || e)}`);
    } finally {
      setIsSyncingProfileInventory(false);
    }
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
        description="Stock 实物仓与「合同/入库/出库」业务流分开展示；业务段与产品档案使用同一套重算逻辑（仅含已绑定 SKU 的明细）。"
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
            <ActionButton
              icon={RefreshCw}
              onClick={syncProfileInventory}
              disabled={isSyncingProfileInventory}
            >
              {isSyncingProfileInventory ? "重算中..." : "全量重算产品库存"}
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
              数据生成时间：{data.generatedAt ? new Date(data.generatedAt).toLocaleString("zh-CN") : "-"} ·{" "}
              <span className="text-slate-300">Stock</span> 为实物仓维度（按仓库 location）；「业务四段」与产品档案字段按合同/入库/出库流水计算，仅统计{" "}
              <span className="text-slate-300">已绑定 SKU（variantId）</span> 的明细，二者本就可能与仓内实物不一致，属正常现象。
            </p>
            {data.diagnostics && data.diagnostics.factoryRemainUnlinked > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
                提示：合同里仍有{" "}
                <span className="font-mono tabular-nums">{fmt(data.diagnostics.factoryRemainUnlinked)}</span>{" "}
                件「工厂剩余」未关联到产品 SKU（无 variantId），已计入上方业务工厂以外的潜在数量；请在合同明细中补全 SKU 后重算，产品档案才能覆盖这部分。
              </div>
            )}

            {/* 总览 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-primary-500/30 bg-primary-500/10 p-4">
                <div className="text-xs text-primary-200/80">业务总库存（工厂+国内+在途+海外）</div>
                <div className="text-2xl font-semibold text-primary-100 tabular-nums mt-1">
                  {fmt(data.businessTotalQty)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">Stock 总件数（qty）</div>
                <div className="text-2xl font-semibold text-slate-100 tabular-nums mt-1">
                  {fmt(data.grandTotalQty)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">预留合计</div>
                <div className="text-2xl font-semibold text-amber-300/90 tabular-nums mt-1">
                  {fmt(data.grandReservedQty)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">可用约（qty − 预留）</div>
                <div className="text-2xl font-semibold text-emerald-300/90 tabular-nums mt-1">
                  {fmt(data.grandAvailableApprox)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs text-slate-500">产品档案 · 工厂+国内+在途（参考）</div>
                <div className="text-2xl font-semibold text-slate-300 tabular-nums mt-1">
                  {fmt(data.variantProfile?.sumProfileThree)}
                </div>
              </div>
            </div>

            {/* 四段 + 未知 */}
            <div>
              <h2 className="text-sm font-medium text-slate-300 mb-3">按仓库位置（Stock 口径）</h2>
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
                        {fmt(b.qty)}
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

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-medium text-slate-300 mb-2">业务四段口径（与「全量重算产品库存」一致）</h2>
              <p className="text-xs text-slate-500 mb-3">
                工厂：合同明细 max(qty−picked，0)，且{" "}
                <span className="text-slate-400">仅 variantId 非空</span>；国内：入库 received（多行明细 + 无明细头表，父单未取消）减出库批次明细（variantId
                非空）；海运在途：已绑柜且柜状态为「装柜中/在途」的出库明细；海外：Stock 海外仓段。
                {Array.isArray(data.seaTransitContainerStatuses) &&
                  data.seaTransitContainerStatuses.length > 0 && (
                    <span className="block mt-1 text-slate-600">
                      柜状态（系统枚举）：{data.seaTransitContainerStatuses.join("、")}
                    </span>
                  )}
              </p>
              {data.diagnostics && (
                <p className="text-[11px] text-slate-600 mb-3 font-mono tabular-nums">
                  诊断（已关联 SKU）：入库 received 合计 {fmt(data.diagnostics.inboundReceivedLinked)} · 出库 qty 合计{" "}
                  {fmt(data.diagnostics.outboundQtyLinked)}
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">工厂</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.businessByLocation?.FACTORY)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">国内</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.businessByLocation?.DOMESTIC)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">海运在途</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.businessByLocation?.TRANSIT)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">海外仓</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.businessByLocation?.OVERSEAS)}
                  </div>
                </div>
              </div>
            </div>

            {/* 产品档案对照 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-medium text-slate-300 mb-2">产品档案（ProductVariant）分布 — 参考对照</h2>
              <p className="text-xs text-slate-500 mb-3">
                以下为变体表字段合计。点击「全量重算产品库存」后，理论上应与上方「业务四段」之和（不含海外仓 Stock 段）在数值上对齐；若仍不一致多为仍有未绑定 SKU 的合同/入库行或同步未执行。
                Stock 实物仓与业务流本就可能不同（例如已入库到国内虚拟仓但合同行未关账等）。
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-slate-500">atFactory</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.variantProfile?.sumAtFactory)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">atDomestic</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.variantProfile?.sumAtDomestic)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">inTransit</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.variantProfile?.sumInTransit)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">stockQuantity 字段合计</span>
                  <div className="text-slate-100 font-mono tabular-nums">
                    {fmt(data.variantProfile?.sumStockQuantityField)}
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
                          {fmt(w.qty)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-amber-300/80">
                          {fmt(w.reservedQty)}
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
              <span className="text-slate-300">Stock 总件数</span> 以仓库实物为准；<span className="text-slate-300">业务总库存</span>{" "}
              为合同/入库/出库链路合计（仅含已绑定 SKU 的行）；<span className="text-slate-300">产品档案合计</span>{" "}
              为重算后的快照之和。三者服务不同目的，不必强行相等。若希望档案与业务对齐，请先补全合同/入库行的 SKU，再点「全量重算产品库存」。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
