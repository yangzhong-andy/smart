"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  Anchor,
  Boxes,
  ChevronDown,
  ChevronRight,
  Factory,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { INVENTORY_ASSET_BUCKETS, type InventoryAssetBucket } from "@/lib/inventory-asset-core";

type Money = Record<string, number>;
type BucketPosition = {
  quantity: number;
  values: Money;
  missingCostQuantity: number;
  sources: Array<{ id: string; label: string; status?: string | null; quantity: number }>;
};
type AssetRow = {
  variantId: string;
  skuId: string;
  productName: string;
  imageUrl?: string | null;
  totalQuantity: number;
  totalValues: Money;
  missingCostQuantity: number;
  issues: string[];
  buckets: Record<InventoryAssetBucket, BucketPosition>;
};
type SummaryBucket = { quantity: number; skuCount: number; values: Money; missingCostQuantity: number };
type AssetPayload = {
  generatedAt: string;
  policy: Record<string, string>;
  summary: Record<InventoryAssetBucket, SummaryBucket>;
  totals: { quantity: number; skuCount: number; values: Money; missingCostQuantity: number; issueSkuCount: number };
  rows: AssetRow[];
  diagnostics: {
    unlinkedFactoryQuantity: number;
    unlinkedDomesticInboundQuantity: number;
    unlinkedTransitQuantity: number;
    transitMissingDepartureQuantity: number;
    staleTransitRows: Array<{ variantId: string; skuId: string; cachedQuantity: number; liveQuantity: number }>;
  };
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(async (response) => {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "货物资产加载失败");
  return payload;
});

const bucketMeta: Record<InventoryAssetBucket, { label: string; hint: string; color: string; icon: typeof Factory }> = {
  FACTORY: { label: "工厂待提", hint: "有效合同未提数量", color: "text-violet-300", icon: Factory },
  DOMESTIC: { label: "国内待发", hint: "正式入库减有效出库", color: "text-cyan-300", icon: Warehouse },
  SEA_TRANSIT: { label: "运输途中", hint: "装柜至确认到仓", color: "text-amber-300", icon: Anchor },
  OVERSEAS: { label: "海外仓现货", hint: "海外仓当前实物余额", color: "text-emerald-300", icon: PackageCheck },
};

function moneyLines(values: Money, empty = "待补成本") {
  const entries = Object.entries(values || {});
  if (!entries.length) return <span className="text-slate-500">{empty}</span>;
  return (
    <span className="space-y-0.5">
      {entries.map(([currency, amount]) => (
        <span key={currency} className="block tabular-nums">{currency} {amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      ))}
    </span>
  );
}

function totalDiagnosticQuantity(payload?: AssetPayload) {
  if (!payload) return 0;
  return payload.diagnostics.unlinkedFactoryQuantity
    + payload.diagnostics.unlinkedDomesticInboundQuantity
    + payload.diagnostics.unlinkedTransitQuantity
    + payload.diagnostics.transitMissingDepartureQuantity;
}

export default function InventoryAssetsPage() {
  const { data, error, isLoading, mutate } = useSWR<AssetPayload>("/api/inventory/assets", fetcher, {
    revalidateOnFocus: false,
  });
  const [query, setQuery] = useState("");
  const [activeBucket, setActiveBucket] = useState<InventoryAssetBucket | "ALL">("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (data?.rows || []).filter((row) => {
      if (activeBucket !== "ALL" && row.buckets[activeBucket].quantity <= 0) return false;
      return !keyword || `${row.skuId} ${row.productName}`.toLowerCase().includes(keyword);
    });
  }, [activeBucket, data?.rows, query]);

  const diagnosticQuantity = totalDiagnosticQuantity(data);

  return (
    <div className="min-h-screen w-full max-w-none overflow-x-hidden bg-slate-950 px-3 py-5 text-slate-100 sm:px-5 lg:px-6 2xl:px-8">
      <div className="w-full max-w-none space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="h-6 w-6 text-emerald-400" />
              <h1 className="text-2xl font-semibold">货物资产总账</h1>
            </div>
            <p className="mt-2 text-sm text-slate-400">从采购合同到海外仓的同一套实时口径；数量可追溯，货值按币种分开，异常不再静默吞掉。</p>
          </div>
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            刷新实时数据
          </button>
        </header>

        {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error.message}</div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <button type="button" onClick={() => setActiveBucket("ALL")} className={`rounded-xl border p-4 text-left transition ${activeBucket === "ALL" ? "border-slate-500 bg-slate-800/80" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}>
            <div className="flex items-center justify-between"><span className="text-sm text-slate-300">全部在管货物</span><Boxes className="h-4 w-4 text-slate-400" /></div>
            <div className="mt-3 text-3xl font-semibold tabular-nums">{isLoading ? "…" : (data?.totals.quantity || 0).toLocaleString("en-US")}</div>
            <div className="mt-2 text-xs text-slate-500">{data?.totals.skuCount || 0} 个 SKU · 暂估货值</div>
            <div className="mt-2 text-sm text-slate-300">{data ? moneyLines(data.totals.values) : "—"}</div>
          </button>
          {INVENTORY_ASSET_BUCKETS.map((bucket) => {
            const meta = bucketMeta[bucket];
            const Icon = meta.icon;
            const value = data?.summary[bucket];
            return (
              <button key={bucket} type="button" onClick={() => setActiveBucket(bucket)} className={`rounded-xl border p-4 text-left transition ${activeBucket === bucket ? "border-slate-500 bg-slate-800/80" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}>
                <div className="flex items-center justify-between"><span className="text-sm text-slate-300">{meta.label}</span><Icon className={`h-4 w-4 ${meta.color}`} /></div>
                <div className={`mt-3 text-3xl font-semibold tabular-nums ${meta.color}`}>{isLoading ? "…" : (value?.quantity || 0).toLocaleString("en-US")}</div>
                <div className="mt-2 text-xs text-slate-500">{value?.skuCount || 0} 个 SKU · {meta.hint}</div>
                <div className="mt-2 text-sm text-slate-300">{value ? moneyLines(value.values) : "—"}</div>
              </button>
            );
          })}
        </section>

        <section className={`rounded-xl border px-4 py-4 ${diagnosticQuantity || data?.diagnostics.staleTransitRows.length ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/25 bg-emerald-500/5"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {diagnosticQuantity || data?.diagnostics.staleTransitRows.length ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" /> : <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />}
              <div>
                <div className="font-medium">数据健康检查</div>
                <div className="mt-1 text-sm text-slate-400">旧的产品档案库存只作为缓存校验；本页全部从合同、入出库、柜子和仓库余额实时计算。</div>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs ${diagnosticQuantity || data?.diagnostics.staleTransitRows.length ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/15 text-emerald-200"}`}>
              {diagnosticQuantity || data?.diagnostics.staleTransitRows.length ? "存在待完善数据" : "关键链路正常"}
            </span>
          </div>
          {data && (
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md bg-slate-950/45 px-3 py-2"><div className="text-xs text-slate-500">工厂未关联 SKU</div><div className="mt-1 tabular-nums">{data.diagnostics.unlinkedFactoryQuantity.toLocaleString("en-US")} 件</div></div>
              <div className="rounded-md bg-slate-950/45 px-3 py-2"><div className="text-xs text-slate-500">国内入库未关联</div><div className="mt-1 tabular-nums">{data.diagnostics.unlinkedDomesticInboundQuantity.toLocaleString("en-US")} 件</div></div>
              <div className="rounded-md bg-slate-950/45 px-3 py-2"><div className="text-xs text-slate-500">在途未关联 SKU</div><div className="mt-1 tabular-nums">{data.diagnostics.unlinkedTransitQuantity.toLocaleString("en-US")} 件</div></div>
              <div className="rounded-md bg-slate-950/45 px-3 py-2"><div className="text-xs text-slate-500">运输中未填开船</div><div className="mt-1 tabular-nums">{data.diagnostics.transitMissingDepartureQuantity.toLocaleString("en-US")} 件</div></div>
              <div className="rounded-md bg-slate-950/45 px-3 py-2"><div className="text-xs text-slate-500">旧缓存不一致</div><div className="mt-1 tabular-nums">{data.diagnostics.staleTransitRows.length.toLocaleString("en-US")} 个 SKU</div></div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="relative min-w-[260px] flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 SKU 或产品名称" className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500" />
            </div>
            <div className="text-xs text-slate-500">显示 {rows.length} 个 SKU · 更新于 {data?.generatedAt ? new Date(data.generatedAt).toLocaleString("zh-CN") : "—"}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px]">
              <thead className="bg-slate-950/60 text-xs text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3" />
                  <th className="px-3 py-3 text-left">SKU / 产品</th>
                  {INVENTORY_ASSET_BUCKETS.map((bucket) => <th key={bucket} className="px-3 py-3 text-right">{bucketMeta[bucket].label}</th>)}
                  <th className="px-3 py-3 text-right">总数量</th>
                  <th className="px-3 py-3 text-right">暂估货值</th>
                  <th className="px-3 py-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row) => {
                  const isExpanded = expanded === row.variantId;
                  return (
                    <Fragment key={row.variantId}>
                      <tr className="hover:bg-slate-800/30">
                        <td className="px-3 py-3"><button type="button" onClick={() => setExpanded(isExpanded ? null : row.variantId)} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 overflow-hidden rounded-md border border-slate-700 bg-slate-800">{row.imageUrl ? <img src={row.imageUrl} alt="" className="h-full w-full object-cover" /> : <Boxes className="m-2.5 h-4 w-4 text-slate-500" />}</div>
                            <div><div className="font-mono text-sm text-slate-100">{row.skuId}</div><div className="mt-0.5 max-w-[260px] truncate text-xs text-slate-500">{row.productName}</div></div>
                          </div>
                        </td>
                        {INVENTORY_ASSET_BUCKETS.map((bucket) => <td key={bucket} className={`px-3 py-3 text-right font-medium tabular-nums ${bucketMeta[bucket].color}`}>{row.buckets[bucket].quantity.toLocaleString("en-US")}</td>)}
                        <td className="px-3 py-3 text-right text-base font-semibold tabular-nums">{row.totalQuantity.toLocaleString("en-US")}</td>
                        <td className="px-3 py-3 text-right text-sm text-slate-300">{moneyLines(row.totalValues)}</td>
                        <td className="px-3 py-3 text-center">{row.issues.length || row.missingCostQuantity ? <span className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-200">待完善</span> : <span className="rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">正常</span>}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-950/45">
                          <td colSpan={9} className="px-5 py-4">
                            {row.issues.length > 0 && <div className="mb-3 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">{row.issues.join("；")}</div>}
                            <div className="grid gap-3 lg:grid-cols-4">
                              {INVENTORY_ASSET_BUCKETS.map((bucket) => {
                                const position = row.buckets[bucket];
                                return (
                                  <div key={bucket} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                                    <div className="flex items-center justify-between"><span className={`text-sm font-medium ${bucketMeta[bucket].color}`}>{bucketMeta[bucket].label}</span><span className="tabular-nums text-slate-200">{position.quantity.toLocaleString("en-US")} 件</span></div>
                                    <div className="mt-2 text-xs text-slate-500">{moneyLines(position.values)}</div>
                                    <div className="mt-3 space-y-1.5">
                                      {position.sources.map((source) => <div key={source.id} className="flex items-start justify-between gap-3 rounded bg-slate-950/60 px-2 py-1.5 text-xs"><div><div className="text-slate-300">{source.label}</div>{source.status && <div className="mt-0.5 text-slate-600">{source.status}</div>}</div><span className="shrink-0 tabular-nums text-slate-200">{source.quantity.toLocaleString("en-US")}</span></div>)}
                                      {!position.sources.length && <div className="text-xs text-slate-600">暂无数量</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!isLoading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-14 text-center text-sm text-slate-500">没有符合条件的货物资产记录</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-4 text-xs text-slate-400">
          <div className="font-medium text-slate-300">本版核算边界</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div>数量：只认真实业务单据，不再把产品档案中的手工缓存字段当作总账。</div>
            <div>货值：不同币种分别展示；成本缺失会直接报警，不按 0 元伪装成正常资产。</div>
            <div>海外仓：以 Stock 实物余额为准，销售、寄样、退货及盘点必须留下库存流水。</div>
            <div>会计确认：当前为经营管理货值；物流费、关税等落地成本完成分摊后再升级为财务账面价值。</div>
          </div>
        </section>
      </div>
    </div>
  );
}
