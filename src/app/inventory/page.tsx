"use client";

import { useMemo, useState, Fragment } from "react";
import useSWR from "swr";
import InventoryDistribution from "@/components/InventoryDistribution";
import { Package, Search, X, Download, History, ChevronDown, ChevronUp, AlertTriangle, Link2 } from "lucide-react";
import { toast } from "sonner";

// 格式化货币
const formatCurrency = (n: number, curr: string = "CNY") => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { 
    style: "currency", 
    currency: curr, 
    maximumFractionDigits: 2 
  }).format(n);
};
import { getMovementsBySkuId, type InventoryMovement } from "@/lib/inventory-movements-store";
import {
  aggregateInventoryTotals,
  getInventoryBuckets,
  unitCostRmb,
} from "@/lib/inventory-display";

type InventoryProductRow = {
  sku_id?: string;
  /** 变体主键，列表行 key 与 sku_id 解耦，避免异常数据下 key 冲突导致少行 */
  variant_id?: string;
  product_id?: string;
  name?: string;
  category?: string;
  factory_name?: string;
  at_factory?: number;
  at_domestic?: number;
  in_transit?: number;
  at_overseas?: number;
  stock_quantity?: number;
  cost_price?: number;
  currency?: string;
};

// 变动历史行组件
function InventoryHistoryRow({ product, movements }: { product: any; movements: InventoryMovement[] }) {
  const getMovementTypeColor = (type: InventoryMovement["movementType"]) => {
    if (type.includes("完工") || type.includes("入库")) return "text-emerald-400";
    if (type.includes("出库")) return "text-red-400";
    if (type.includes("调拨")) return "text-blue-400";
    if (type.includes("盘点")) return "text-amber-400";
    return "text-slate-400";
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <tr key={`history-${product.sku_id}`} className="bg-slate-900/80">
      <td colSpan={10} className="px-4 py-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-200">
              {product.name} ({product.sku_id}) - 变动历史
            </h4>
            <span className="text-xs text-slate-400">
              共 {movements.length} 条记录
            </span>
          </div>
          {movements.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              暂无变动记录
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {movements.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-start gap-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium ${getMovementTypeColor(movement.movementType)}`}>
                        {movement.movementType}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDate(movement.operationDate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>
                        数量: <span className={movement.qty > 0 ? "text-emerald-400" : "text-red-400"}>
                          {movement.qty > 0 ? "+" : ""}{movement.qty}
                        </span>
                      </span>
                      <span>
                        变动前: {movement.qtyBefore}
                      </span>
                      <span>
                        变动后: <span className="text-slate-200 font-medium">{movement.qtyAfter}</span>
                      </span>
                      {movement.totalCost && (
                        <span>
                          成本: <span className="text-emerald-300">
                            {formatCurrency(movement.totalCost, movement.currency || "CNY")}
                          </span>
                        </span>
                      )}
                    </div>
                    {movement.relatedOrderNumber && (
                      <div className="text-xs text-slate-500 mt-1">
                        关联单据: {movement.relatedOrderType} {movement.relatedOrderNumber}
                      </div>
                    )}
                    {movement.notes && (
                      <div className="text-xs text-slate-500 mt-1 italic">
                        {movement.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

type InventoryOverviewPayload = {
  totalValue: number;
  totalPieces: number;
  factoryQty: number;
  factoryValue: number;
  domesticQty: number;
  domesticValue: number;
  transitQty: number;
  transitValue: number;
  overseasQty: number;
  overseasValue: number;
  contractPickedQtySum: number;
  contractOrderQtySum: number;
  contractFinishedQtySum: number;
};

const overviewFetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() as Promise<InventoryOverviewPayload> : Promise.resolve(undefined)));

type UnlinkedContractSkuPayload = {
  count: number;
  items: Array<{
    itemId: string;
    sku: string;
    contractNumber: string;
    qty: number;
    pickedQty: number;
    canAutoLink: boolean;
    suggestedCatalogSkuId?: string | null;
  }>;
  hint?: string;
};

export default function InventoryPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  /** 默认只显示四分仓+总库存合计 &gt; 0 的 SKU；关闭则显示全部变体（含零库存），避免「少一个 SKU」实为未展示 */
  const [showZeroStock, setShowZeroStock] = useState(false);
  const [expandedSkuIds, setExpandedSkuIds] = useState<Set<string>>(new Set());
  const [movementsBySku, setMovementsBySku] = useState<Record<string, InventoryMovement[]>>({});
  const [linkingContractSkus, setLinkingContractSkus] = useState(false);

  const { data: productsRaw, mutate: mutateProducts } = useSWR<any>("/api/products?page=1&pageSize=500", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });
  const products = (Array.isArray(productsRaw) ? productsRaw : (productsRaw?.data ?? productsRaw?.list ?? [])) as InventoryProductRow[];

  /** 全库汇总 + 合同累计（与列表行同一公式，避免只拉部分产品导致卡片偏差） */
  const { data: overviewPayload, mutate: mutateOverview } = useSWR<InventoryOverviewPayload | undefined>(
    "/api/inventory/overview",
    overviewFetcher,
    { revalidateOnFocus: true, dedupingInterval: 30000 }
  );

  const { data: unlinkedPayload, mutate: mutateUnlinked } = useSWR<UnlinkedContractSkuPayload | undefined>(
    "/api/inventory/unlinked-contract-skus",
    (u) => fetch(u).then((r) => (r.ok ? r.json() : undefined)),
    { revalidateOnFocus: true, dedupingInterval: 30000 }
  );

  const handleBackfillContractVariantLinks = async () => {
    setLinkingContractSkus(true);
    try {
      const res = await fetch("/api/inventory/link-contract-items-to-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "补绑失败");
      toast.success(
        `已补绑 ${j.linked} 条；未匹配 ${j.skipped} 条（产品档案中仍无对应 skuId 的需在档案中先建变体）`
      );
      await mutateProducts();
      await mutateOverview();
      await mutateUnlinked();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "补绑失败");
    } finally {
      setLinkingContractSkus(false);
    }
  };

  // 加载变动历史
  const loadMovements = (skuId: string) => {
    if (!movementsBySku[skuId]) {
      const movements = getMovementsBySkuId(skuId);
      setMovementsBySku((prev) => ({ ...prev, [skuId]: movements }));
    }
  };

  // 切换展开/收起
  const toggleExpand = (skuId: string) => {
    const newExpanded = new Set(expandedSkuIds);
    if (newExpanded.has(skuId)) {
      newExpanded.delete(skuId);
    } else {
      newExpanded.add(skuId);
      loadMovements(skuId);
    }
    setExpandedSkuIds(newExpanded);
  };

  const inventoryStats = useMemo(() => {
    const fallback = aggregateInventoryTotals(products);
    const o = overviewPayload;
    if (
      o &&
      typeof o.totalPieces === "number" &&
      Number.isFinite(o.totalPieces)
    ) {
      return {
        totalValue: o.totalValue,
        totalPieces: o.totalPieces,
        factoryQty: o.factoryQty,
        factoryValue: o.factoryValue,
        domesticQty: o.domesticQty,
        domesticValue: o.domesticValue,
        transitQty: o.transitQty,
        transitValue: o.transitValue,
        overseasQty: o.overseasQty ?? 0,
        overseasValue: o.overseasValue ?? 0,
        contractPickedQtySum: o.contractPickedQtySum ?? 0,
        contractOrderQtySum: o.contractOrderQtySum ?? 0,
        contractFinishedQtySum: o.contractFinishedQtySum ?? 0,
      };
    }
    return {
      ...fallback,
      contractPickedQtySum: 0,
      contractOrderQtySum: 0,
      contractFinishedQtySum: 0,
    };
  }, [overviewPayload, products]);

  const filteredProducts = useMemo(() => {
    let result = products.filter((p) =>
      showZeroStock ? true : getInventoryBuckets(p).totalQty > 0
    );

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((p) =>
        p.sku_id?.toLowerCase().includes(keyword) ||
        p.name?.toLowerCase().includes(keyword) ||
        p.category?.toLowerCase().includes(keyword) ||
        p.factory_name?.toLowerCase().includes(keyword)
      );
    }

    return result;
  }, [products, searchKeyword, showZeroStock]);

  // 导出库存数据
  const handleExportData = () => {
    if (filteredProducts.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    const headers = [
      "SKU编码",
      "产品名称",
      "工厂现货",
      "国内待发",
      "海运中",
      "海外仓",
      "总库存",
      "单价",
      "币种",
      "库存总值(RMB)",
      "关联工厂"
    ];

    const rows = filteredProducts.map((p) => {
      const b = getInventoryBuckets(p);
      const { atFactory, atDomestic, inTransit, atOverseas, totalQty } = b;
      const totalValue = totalQty * unitCostRmb(p);
      const currency = p.currency || "CNY";

      return [
        p.sku_id || "",
        p.name || "",
        String(atFactory),
        String(atDomestic),
        String(inTransit),
        String(atOverseas),
        String(totalQty),
        String(p.cost_price || 0),
        currency,
        totalValue.toFixed(2),
        p.factory_name || ""
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row: (string | number)[]) => row.map((cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `库存查询_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("库存数据导出成功");
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">库存查询</h1>
          <p className="mt-1 text-sm text-slate-400">
            数据来自各 SKU 变体（<code className="text-slate-500">/api/products</code>）的工厂、国内、海运与<strong className="text-slate-300">海外仓</strong>（货到海外后入海外仓 Stock）及成本价；总库存 = 四段之和，与上方总览及表格一致。
          </p>
        </div>
        <button
          onClick={handleExportData}
          className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 shadow hover:bg-slate-700 active:translate-y-px transition-colors"
        >
          <Download className="h-4 w-4" />
          导出数据
        </button>
      </header>

      {/* 库存统计卡片 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">库存总览</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {/* 存货资产总值 */}
          <div
            className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              <div className="text-xs font-medium text-white/80 mb-1">存货资产总值</div>
              <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCurrency(inventoryStats.totalValue, "CNY")}
              </div>
              <div className="text-xs text-white/60 mt-2">
                当前在库流转合计 {inventoryStats.totalPieces.toLocaleString("zh-CN")} 件
              </div>
              <p className="text-[10px] text-white/45 mt-2 leading-snug max-w-[14rem]">
                口径：各 SKU 四分仓（工厂+国内+海运+海外仓）× 成本价。不含已出库/已销耗；与下方「合同累计已拿货」不是同一数字。
              </p>
            </div>
          </div>

          {/* 工厂现货 */}
          <div
            className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
              <div className="text-xs font-medium text-white/80 mb-1">工厂现货</div>
              <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {inventoryStats.factoryQty.toLocaleString("zh-CN")}
              </div>
              <div className="text-xs text-white/60 mt-2">
                {formatCurrency(inventoryStats.factoryValue, "CNY")}
              </div>
            </div>
          </div>

          {/* 国内待发 */}
          <div
            className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
              </div>
              <div className="text-xs font-medium text-white/80 mb-1">国内待发</div>
              <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {inventoryStats.domesticQty.toLocaleString("zh-CN")}
              </div>
              <div className="text-xs text-white/60 mt-2">
                {formatCurrency(inventoryStats.domesticValue, "CNY")}
              </div>
            </div>
          </div>

          {/* 海运中 */}
          <div
            className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <div className="text-xs font-medium text-white/80 mb-1">海运中</div>
              <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {inventoryStats.transitQty.toLocaleString("zh-CN")}
              </div>
              <div className="text-xs text-white/60 mt-2">
                {formatCurrency(inventoryStats.transitValue, "CNY")}
              </div>
            </div>
          </div>

          {/* 海外仓 */}
          <div
            className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
              border: "1px solid rgba(255, 255, 255, 0.1)"
            }}
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="text-xs font-medium text-white/80 mb-1">海外仓</div>
              <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {(inventoryStats.overseasQty ?? 0).toLocaleString("zh-CN")}
              </div>
              <div className="text-xs text-white/60 mt-2">
                {formatCurrency(inventoryStats.overseasValue ?? 0, "CNY")}
              </div>
              <p className="text-[10px] text-white/45 mt-2 leading-snug max-w-[14rem]">
                货到目的港后入海外仓，数量来自 <span className="text-white/60">Stock + 海外仓</span>。
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-slate-500">采购合同（明细行合计）</span>
            <span>
              累计已拿货{" "}
              <strong className="text-slate-100 tabular-nums">
                {(inventoryStats.contractPickedQtySum ?? 0).toLocaleString("zh-CN")}
              </strong>{" "}
              件
            </span>
            <span className="text-slate-600">·</span>
            <span>
              下单总量{" "}
              <strong className="text-slate-100 tabular-nums">
                {(inventoryStats.contractOrderQtySum ?? 0).toLocaleString("zh-CN")}
              </strong>{" "}
              件
            </span>
            <span className="text-slate-600">·</span>
            <span>
              工厂完工累计{" "}
              <strong className="text-slate-100 tabular-nums">
                {(inventoryStats.contractFinishedQtySum ?? 0).toLocaleString("zh-CN")}
              </strong>{" "}
              件
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            「已拿货」为合同侧累计取货件数；若您心里预期是 6 万+，通常应对照此项。上方紫色卡片为<strong className="text-slate-400">此刻仍在库内流转</strong>的件数（已出库、已发走、已消耗的不计入）。
          </p>
        </div>
      </section>

      {/* 搜索框 */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索 SKU、产品名称、分类或工厂..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
            />
            {searchKeyword && (
              <button
                onClick={() => setSearchKeyword("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 shrink-0 text-sm text-slate-300 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showZeroStock}
              onChange={(e) => setShowZeroStock(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-primary-500 focus:ring-primary-400"
            />
            显示零库存 SKU
          </label>
        </div>
      </section>

      {unlinkedPayload && unlinkedPayload.count > 0 && (
        <section className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium text-amber-100">
                有 {unlinkedPayload.count} 条采购合同明细未绑定产品变体（合同里有 SKU 文案，但系统内没有对应 ProductVariant / 创建时未对上 skuId）
              </p>
              <p className="text-xs text-amber-200/80">{unlinkedPayload.hint}</p>
              <ul className="text-xs text-slate-300 space-y-1 max-h-40 overflow-y-auto">
                {unlinkedPayload.items.slice(0, 20).map((row) => (
                  <li key={row.itemId} className="font-mono">
                    <span className="text-slate-400">{row.contractNumber}</span> · {row.sku}
                    {row.canAutoLink && row.suggestedCatalogSkuId ? (
                      <span className="text-emerald-400/90 ml-1">
                        → 可匹配档案「{row.suggestedCatalogSkuId}」
                      </span>
                    ) : (
                      <span className="text-rose-300/90 ml-1">→ 档案中未找到匹配变体</span>
                    )}
                    <span className="text-slate-500 ml-1">
                      （下单 {row.qty} / 已拿 {row.pickedQty}）
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={linkingContractSkus}
                  onClick={handleBackfillContractVariantLinks}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  {linkingContractSkus ? "正在补绑…" : "自动补绑（按 SKU 宽松匹配）"}
                </button>
                <span className="text-[11px] text-slate-500 self-center">
                  若仍缺 SKU，请到「产品档案」新增变体，使 skuId 与合同完全一致后再点补绑。
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 库存产品列表 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h3 className="text-sm font-medium text-slate-100">
            {showZeroStock ? "SKU 列表（含零库存）" : "有库存的产品列表"}
          </h3>
          <p className="text-xs text-slate-500">
            本页共 {filteredProducts.length} 行
            {products.length > 0 ? ` · 接口返回 ${products.length} 个变体` : ""}
            {!showZeroStock && " · 默认隐藏库存为 0 的 SKU"}
          </p>
        </div>
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无数据</p>
            <p className="text-xs mt-2">
              {products.length === 0
                ? '请先在「产品档案」维护 SKU，或在采购合同中完成"工厂完工"等入库流程'
                : !showZeroStock
                  ? "当前仅显示有库存的 SKU。若少了一个物料，请勾选上方「显示零库存 SKU」"
                  : "没有符合条件的记录"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">产品名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">库存分布</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">工厂现货</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">国内待发</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">海运中</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">海外仓</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">总库存</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">库存总值</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                {filteredProducts.map((product, idx) => {
                  const b = getInventoryBuckets(product);
                  const { atFactory, atDomestic, inTransit, atOverseas, totalQty, bucketsMismatch, unallocatedOnly } = b;
                  const totalValue = totalQty * unitCostRmb(product);
                  const rowKey =
                    product.variant_id ??
                    product.sku_id ??
                    product.product_id ??
                    `row-${idx}`;

                  return (
                    <Fragment key={rowKey}>
                      <tr className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-slate-200">{product.sku_id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-100">{product.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <InventoryDistribution
                            atFactory={atFactory}
                            atDomestic={atDomestic}
                            inTransit={inTransit}
                            atOverseas={atOverseas}
                            unitPrice={product.cost_price}
                            size="sm"
                            showValue={false}
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">{atFactory.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{atDomestic.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{inTransit.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{atOverseas.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-100">
                          <span title={unallocatedOnly ? "仅有总库存字段，尚未拆到四个仓位" : undefined}>
                            {totalQty.toLocaleString("zh-CN")}
                          </span>
                          {bucketsMismatch && !unallocatedOnly && (
                            <span
                              className="ml-1 text-[10px] text-amber-400/90 align-middle"
                              title="stockQuantity 与四分仓之和不一致，已按分仓合计展示；可在库存核对页修正"
                            >
                              ※
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-300">
                          {formatCurrency(totalValue, "CNY")}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleExpand(product.sku_id ?? "")}
                            className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
                            title="查看变动历史"
                          >
                            {expandedSkuIds.has(product.sku_id ?? "") ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <History className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedSkuIds.has(product.sku_id ?? "") && (
                        <InventoryHistoryRow 
                          product={product}
                          movements={movementsBySku[product.sku_id ?? ""] || []}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
