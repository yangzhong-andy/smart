"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Package, Warehouse as WarehouseIcon, ChevronDown, ChevronUp, Download, Ship, ClipboardCheck, ShieldAlert, WalletCards, X } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";

type StockItem = {
  id: string;
  variantId: string;
  warehouseId: string;
  skuId: string;
  productName: string;
  color?: string;
  size?: string;
  barcode?: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseType?: string;
  location?: string;
  qty: number;
  availableQty: number;
  lockedQty: number;
  tiktokDeducted?: number;
  costPrice?: number;
  currency?: string;
  cumulativeInbound: number;
  cumulativeOutbound: number;
  openingQty: number;
  inboundAfterOpening: number;
  outboundAfterOpening: number;
  adjustmentAfterOpening: number;
  ledgerQty: number;
  reconciliationDifference: number;
  reconciliationStatus: "RECONCILED" | "PENDING_STOCKTAKE";
  assetStatus: "RECONCILED" | "PENDING_STOCKTAKE" | "PENDING_COST_REVIEW";
  costContinuous: boolean;
  hasFormalStocktake: boolean;
  totalValue: number;
  confirmedAssetValue: number;
  provisionalAssetValue: number;
};

type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: string;
  location?: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WarehouseInventoryPage() {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [skuKeyword, setSkuKeyword] = useState<string>("");
  const [productKeyword, setProductKeyword] = useState<string>("");
  const [expandedWarehouse, setExpandedWarehouse] = useState<string | null>(null);

  // 获取仓库列表
  const { data: warehousesRaw } = useSWR<Warehouse[]>("/api/warehouses?noCache=true", fetcher, {
    revalidateOnFocus: false,
  });
  const warehouses = Array.isArray(warehousesRaw)
    ? warehousesRaw
    : (warehousesRaw as any)?.data || [];

  // 变体「海运中」合计（发运离境后、未入海外仓前；与国内仓 Stock 无关）
  const { data: transitRaw } = useSWR<{ inTransitTotal?: number }>(
    "/api/inventory/variant-in-transit-total?noCache=true",
    fetcher,
    { revalidateOnFocus: false }
  );
  const inTransitVariantTotal = Number(transitRaw?.inTransitTotal ?? 0);

  // 获取库存数据
  const { data: stocksRaw, isLoading, mutate: mutateStocks } = useSWR<StockItem[]>(
    selectedWarehouseId === "all" 
      ? "/api/stock?noCache=true" 
      : `/api/stock?warehouseId=${selectedWarehouseId}&noCache=true`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const stocks = Array.isArray(stocksRaw) 
    ? stocksRaw 
    : (stocksRaw as any)?.data || [];
  const { data: fundData } = useSWR<{
    accounts: Array<{ warehouseId: string; warehouseName: string; currency: string; balance: number; totalCredit: number; totalDebit: number }>;
    entries: Array<{ id: string; warehouseName: string; currency: string; entryType: string; amount: number; balanceAfter: number; occurredAt: string; notes?: string | null }>;
  }>(
    "/api/warehouse-funds?page=1&pageSize=20", fetcher, { revalidateOnFocus: false }
  );
  const [stocktakeItem, setStocktakeItem] = useState<StockItem | null>(null);
  const [stocktakeQty, setStocktakeQty] = useState("");
  const [stocktakeReason, setStocktakeReason] = useState("");
  const [stocktakeUnitCost, setStocktakeUnitCost] = useState("");
  const [stocktakeCurrency, setStocktakeCurrency] = useState("CNY");
  const [stocktakeEvidence, setStocktakeEvidence] = useState<string | string[]>([]);
  const [stocktakeSaving, setStocktakeSaving] = useState(false);

  // 按仓库分组统计
  const warehouseStats = useMemo(() => {
    const map = new Map<string, { 
      warehouse: Warehouse; 
      totalQty: number; 
      availableQty: number;
      skuCount: number;
      items: StockItem[];
    }>();

    warehouses.forEach((w: Warehouse) => {
      map.set(w.id, { 
        warehouse: w, 
        totalQty: 0, 
        availableQty: 0, 
        skuCount: 0,
        items: [] 
      });
    });

    stocks.forEach((item: StockItem) => {
      const key = item.warehouseId;
      if (map.has(key)) {
        const stat = map.get(key)!;
        stat.totalQty += item.qty || 0;
        stat.availableQty += item.availableQty || 0;
        stat.skuCount += 1;
        stat.items.push(item);
      }
    });

    return Array.from(map.values()).filter(w => w.totalQty > 0);
  }, [stocks, warehouses]);

  // 总体统计
  const totalStats = useMemo(() => {
    const domestic = warehouseStats.filter(w => w.warehouse.type === "DOMESTIC");
    const overseas = warehouseStats.filter(w => w.warehouse.type === "OVERSEAS");
    return {
      totalWarehouses: warehouseStats.length,
      domesticWarehouses: domestic.length,
      overseasWarehouses: overseas.length,
      totalQty: warehouseStats.reduce((sum, w) => sum + w.totalQty, 0),
      availableQty: warehouseStats.reduce((sum, w) => sum + w.availableQty, 0),
      totalSku: warehouseStats.reduce((sum, w) => sum + w.skuCount, 0),
      overseasAssetByCurrency: stocks.filter((item: StockItem) => item.warehouseType === "OVERSEAS").reduce((totals: Record<string, number>, item: StockItem) => {
        const currency = item.currency || "CNY";
        totals[currency] = (totals[currency] || 0) + (item.totalValue || 0);
        return totals;
      }, {}),
      confirmedAssetByCurrency: stocks.filter((item: StockItem) => item.warehouseType === "OVERSEAS").reduce((totals: Record<string, number>, item: StockItem) => {
        const currency = item.currency || "CNY";
        totals[currency] = (totals[currency] || 0) + (item.confirmedAssetValue || 0);
        return totals;
      }, {}),
      pendingStocktake: stocks.filter((item: StockItem) => item.warehouseType === "OVERSEAS" && item.assetStatus !== "RECONCILED").length,
    };
  }, [warehouseStats]);

  // 当前选中的仓库
  const selectedWarehouse = warehouses.find((w: Warehouse) => w.id === selectedWarehouseId);
  const selectedWarehouseStocks = selectedWarehouseId === "all" 
    ? stocks 
    : stocks.filter((s: StockItem) => s.warehouseId === selectedWarehouseId);
  const filteredWarehouseStocks = useMemo(() => {
    const sku = skuKeyword.trim();
    const product = productKeyword.trim().toLowerCase();
    return selectedWarehouseStocks.filter((item: StockItem) => {
      const hitSku = !sku || (item.skuId || "") === sku;
      const hitProduct = !product || (item.productName || "").toLowerCase().includes(product);
      return hitSku && hitProduct;
    });
  }, [selectedWarehouseStocks, skuKeyword, productKeyword]);

  const toggleWarehouse = (id: string) => {
    setExpandedWarehouse(expandedWarehouse === id ? null : id);
  };

  const submitStocktake = async () => {
    if (!stocktakeItem) return;
    setStocktakeSaving(true);
    try {
      const response = await fetch("/api/stock/stocktake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: stocktakeItem.warehouseId, variantId: stocktakeItem.variantId, countedQty: Number(stocktakeQty), unitCost: Number(stocktakeUnitCost), currency: stocktakeCurrency, reason: stocktakeReason, evidence: stocktakeEvidence, operationDate: new Date().toISOString() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "盘点入账失败");
      toast.success(`盘点已入账：${result.qtyBefore} → ${result.countedQty}，差异 ${result.difference}`);
      setStocktakeItem(null); setStocktakeQty(""); setStocktakeReason(""); setStocktakeUnitCost(""); setStocktakeEvidence([]);
      await mutateStocks();
    } catch (error: any) { toast.error(error?.message || "盘点入账失败"); }
    finally { setStocktakeSaving(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <PageHeader
        title="仓库库存"
        description="海外仓库存按资产台账管理；只有完成正式盘点且后续流水连续的 SKU 才标记为已核对资产。"
        actions={
          <ActionButton
            icon={Download}
            onClick={() => {
              const headers = ["仓库", "SKU", "产品名称", "规格", "累计入库", "累计出库", "当前剩余", "单位成本", "暂估资产", "对账状态"];
              const rows = filteredWarehouseStocks.map((item: StockItem) => [
                item.warehouseName,
                item.skuId,
                item.productName,
                [item.color, item.size].filter(Boolean).join("/") || "-",
                String(item.cumulativeInbound || 0), String(item.cumulativeOutbound || 0), String(item.qty || 0),
                `${item.currency || "CNY"} ${(item.costPrice || 0).toFixed(2)}`,
                `${item.currency || "CNY"} ${(item.totalValue || 0).toFixed(2)}`,
                item.reconciliationStatus === "RECONCILED" ? "已核对" : "待盘点",
              ]);
              const csv = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
              const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `仓库库存_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
            }}
          >
            导出CSV
          </ActionButton>
        }
      />

      <div className="p-6 space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard
            title="仓库数量"
            value={totalStats.totalWarehouses}
            icon={WarehouseIcon}
            iconColor="text-blue-400"
          />
          <StatCard
            title="国内仓"
            value={totalStats.domesticWarehouses}
            icon={WarehouseIcon}
            iconColor="text-emerald-400"
          />
          <StatCard
            title="海外仓"
            value={totalStats.overseasWarehouses}
            icon={WarehouseIcon}
            iconColor="text-purple-400"
          />
          <StatCard
            title="SKU种类"
            value={totalStats.totalSku}
            icon={Package}
            iconColor="text-amber-400"
          />
          <StatCard
            title="库内库存"
            value={totalStats.totalQty.toLocaleString("en-US")}
            icon={Package}
            iconColor="text-green-400"
          />
          <StatCard
            title="海运在途"
            value={inTransitVariantTotal.toLocaleString("en-US")}
            icon={Ship}
            iconColor="text-orange-400"
          />
          <StatCard
            title="可用库存"
            value={totalStats.availableQty.toLocaleString("en-US")}
            icon={Package}
            iconColor="text-cyan-400"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200"><WalletCards className="h-4 w-4 text-emerald-400" />海外仓预存资金</div>
              <span className="text-xs text-slate-500">与商品库存分账管理</span>
            </div>
            <div className="space-y-2">
              {(fundData?.accounts || []).map((account) => (
                <div key={`${account.warehouseId}-${account.currency}`} className="grid grid-cols-4 gap-3 border-t border-slate-800 pt-2 text-sm">
                  <div className="text-slate-300">{account.warehouseName}</div>
                  <div><div className="text-xs text-slate-500">累计充值</div><div>{account.currency} {account.totalCredit.toFixed(2)}</div></div>
                  <div><div className="text-xs text-slate-500">累计扣费</div><div className="text-rose-300">{account.currency} {account.totalDebit.toFixed(2)}</div></div>
                  <div><div className="text-xs text-slate-500">可用余额</div><div className="font-medium text-emerald-300">{account.currency} {account.balance.toFixed(2)}</div></div>
                </div>
              ))}
              {!fundData?.accounts?.length && <div className="text-sm text-slate-500">尚无已付款的海外仓预存资金</div>}
            </div>
            {!!fundData?.entries?.length && <div className="mt-4 border-t border-slate-800 pt-3"><div className="mb-2 text-xs text-slate-500">最近资金流水</div><div className="space-y-2">{fundData.entries.slice(0, 3).map((entry) => <div key={entry.id} className="flex items-center justify-between text-xs"><div><span className="text-slate-300">{entry.warehouseName}</span><span className="ml-2 text-slate-500">{new Date(entry.occurredAt).toLocaleDateString("zh-CN")}</span></div><div className={entry.amount >= 0 ? "text-emerald-300" : "text-rose-300"}>{entry.amount >= 0 ? "+" : ""}{entry.currency} {entry.amount.toFixed(2)}<span className="ml-2 text-slate-500">余额 {entry.balanceAfter.toFixed(2)}</span></div></div>)}</div></div>}
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200"><ShieldAlert className="h-4 w-4 text-amber-400" />库存资产状态</div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div><div className="text-xs text-slate-500">已核对资产</div><div className="mt-1 space-y-1 font-semibold text-emerald-300">{Object.entries(totalStats.confirmedAssetByCurrency as Record<string, number>).map(([currency, amount]) => <div key={currency}>{currency} {amount.toFixed(2)}</div>)}</div></div>
              <div><div className="text-xs text-slate-500">账面暂估资产</div><div className="mt-1 space-y-1 font-semibold">{Object.entries(totalStats.overseasAssetByCurrency as Record<string, number>).map(([currency, amount]) => <div key={currency}>{currency} {amount.toFixed(2)}</div>)}</div></div>
              <div><div className="text-xs text-slate-500">待盘点 SKU</div><div className="mt-1 text-xl font-semibold text-amber-300">{totalStats.pendingStocktake}</div></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">待盘点金额仅供核对，不进入已确认库存资产。期初盘点完成后，系统按入库、出库和调整流水持续核对。</p>
          </div>
        </div>

        {totalStats.totalQty === 0 && inTransitVariantTotal > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
            当前国内/海外仓 <strong className="text-amber-50">Stock 账面为 0</strong>，但系统中有{" "}
            <strong className="tabular-nums">{inTransitVariantTotal.toLocaleString("en-US")}</strong>{" "}
            件在<strong className="text-amber-50">海运在途</strong>（产品变体口径）。若曾误将待发数量记在国内仓，可运行脚本{" "}
            <code className="rounded bg-slate-900/80 px-1.5 py-0.5 text-xs">npx tsx scripts/clear-domestic-warehouse-stock.ts</code>{" "}
            仅清空国内仓 Stock，不影响变体海运数量。
          </div>
        )}

        {/* 仓库卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouseStats.map((stat) => {
            const isExpanded = expandedWarehouse === stat.warehouse.id;
            return (
              <div
                key={stat.warehouse.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:bg-slate-800/40 transition-all cursor-pointer"
                onClick={() => toggleWarehouse(stat.warehouse.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <WarehouseIcon className={`h-5 w-5 ${stat.warehouse.type === "OVERSEAS" ? "text-blue-400" : "text-emerald-400"}`} />
                    <span className="font-medium text-slate-200">{stat.warehouse.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      stat.warehouse.type === "OVERSEAS"
                        ? "bg-blue-900 text-blue-300"
                        : "bg-emerald-900 text-emerald-300"
                    }`}>
                      {stat.warehouse.type === "DOMESTIC" ? "国内" : stat.warehouse.type === "OVERSEAS" ? "海外" : stat.warehouse.type}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-slate-500">SKU种类</div>
                    <div className="text-lg font-semibold text-slate-200">{stat.skuCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">库内库存</div>
                    <div className="text-lg font-semibold text-slate-200">{stat.totalQty.toLocaleString("en-US")}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">可用</div>
                    <div className="text-lg font-semibold text-emerald-400">{stat.availableQty.toLocaleString("en-US")}</div>
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-700/30">
                          <th className="pb-1 pr-2 text-left">SKU</th>
                          <th className="pb-1 pr-2 text-left">产品</th>
                          <th className="pb-1 pr-2 text-right">库内库存</th>
                          <th className="pb-1 pr-2 text-right">TikTok出库</th>
                          <th className="pb-1 text-right">可用</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stat.items
                          .slice()
                          .sort((a: StockItem, b: StockItem) => (b.availableQty || 0) - (a.availableQty || 0))
                          .map((item: StockItem) => (
                          <tr key={item.id} className="border-b border-slate-700/20">
                            <td className="py-1.5 pr-2 font-mono text-slate-300">{item.skuId}</td>
                            <td className="py-1.5 pr-2 text-slate-400 truncate max-w-24">{item.productName}</td>
                            <td className="py-1.5 pr-2 text-right text-slate-200">{item.qty?.toLocaleString("en-US") || 0}</td>
                            <td className="py-1.5 pr-2 text-right text-rose-400">{(item.tiktokDeducted || 0).toLocaleString("en-US")}</td>
                            <td className="py-1.5 text-right text-emerald-400">{item.availableQty?.toLocaleString("en-US") || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 筛选（移到明细上面） */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200"
          >
            <option value="all">全部仓库</option>
            {warehouses.map((w: Warehouse) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.type === "DOMESTIC" ? "国内" : w.type === "OVERSEAS" ? "海外" : w.type})
              </option>
            ))}
          </select>
          <select
            value={skuKeyword}
            onChange={(e) => setSkuKeyword(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200"
          >
            <option value="">全部SKU</option>
            {Array.from(new Set<string>(stocks.map((s: StockItem) => s.skuId))).sort().map((sku) => (
              <option key={sku} value={sku}>{sku}</option>
            ))}
          </select>
          <input
            value={productKeyword}
            onChange={(e) => setProductKeyword(e.target.value)}
            placeholder="筛选产品名称（支持模糊）"
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 placeholder:text-slate-500"
          />
        </div>

        {/* 库存明细表 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-lg font-semibold text-slate-200">
              {selectedWarehouseId === "all" 
                ? "全部仓库库存明细" 
                : `${selectedWarehouse?.name || ""} 库存明细`}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              共 {filteredWarehouseStocks.length} 条记录
            </p>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400">加载中...</div>
          ) : filteredWarehouseStocks.length === 0 ? (
            <EmptyState
              icon={Package}
              title="暂无库存数据"
              description="该仓库暂无库存记录"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">仓库</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">产品名称</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">规格</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">库内库存</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">累计入 / 出</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">单位成本 / 暂估资产</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">资产状态</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredWarehouseStocks.map((item: StockItem) => (
                    <tr key={item.id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <WarehouseIcon className={`h-4 w-4 ${item.warehouseType === "OVERSEAS" ? "text-blue-400" : "text-emerald-400"}`} />
                          <span className="text-slate-300">{item.warehouseName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-300">{item.skuId}</td>
                      <td className="px-4 py-3 text-slate-300">{item.productName}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-400">
                        {[item.color, item.size].filter(Boolean).join(" / ") || "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-200">{item.qty?.toLocaleString("en-US") || 0}</td>
                      <td className="px-4 py-3 text-right text-sm"><span className="text-emerald-400">+{item.cumulativeInbound || 0}</span><span className="mx-1 text-slate-600">/</span><span className="text-rose-400">-{item.cumulativeOutbound || 0}</span></td>
                      <td className="px-4 py-3 text-right text-sm"><div>{item.currency || "CNY"} {(item.costPrice || 0).toFixed(2)}</div><div className="text-slate-500">{item.currency || "CNY"} {(item.totalValue || 0).toFixed(2)}</div></td>
                      <td className="px-4 py-3 text-center"><span className={`rounded px-2 py-1 text-xs ${item.assetStatus === "RECONCILED" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{item.assetStatus === "RECONCILED" ? "资产已核对" : item.assetStatus === "PENDING_COST_REVIEW" ? "数量已核对 · 成本待核对" : `待盘点 · 差 ${item.reconciliationDifference}`}</span>{item.hasFormalStocktake && <div className="mt-1 text-[10px] text-slate-500">{item.openingQty} + {item.inboundAfterOpening} - {item.outboundAfterOpening} = {item.ledgerQty}</div>}</td>
                      <td className="px-4 py-3 text-center">{item.warehouseType === "OVERSEAS" && <button type="button" title="正式盘点" onClick={() => { setStocktakeItem(item); setStocktakeQty(String(item.qty)); setStocktakeUnitCost(String(item.costPrice || 0)); setStocktakeCurrency(item.currency || "CNY"); }} className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 hover:bg-slate-800"><ClipboardCheck className="h-4 w-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {stocktakeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between"><div><h2 className="font-semibold">海外仓正式盘点</h2><p className="mt-1 text-sm text-slate-400">{stocktakeItem.warehouseName} · {stocktakeItem.skuId}</p></div><button title="关闭" onClick={() => setStocktakeItem(null)}><X className="h-5 w-5" /></button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1 block text-sm">实际盘点数量</span><input type="number" min="0" step="1" value={stocktakeQty} onChange={(event) => setStocktakeQty(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></label>
              <div className="grid grid-cols-2 gap-3"><label><span className="mb-1 block text-sm">单位采购成本</span><input type="number" min="0" step="0.01" value={stocktakeUnitCost} onChange={(event) => setStocktakeUnitCost(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" /></label><label><span className="mb-1 block text-sm">成本币种</span><select value={stocktakeCurrency} onChange={(event) => setStocktakeCurrency(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"><option value="CNY">CNY</option><option value="BRL">BRL</option><option value="USD">USD</option></select></label></div>
              <label className="block"><span className="mb-1 block text-sm">盘点原因或差异说明</span><textarea value={stocktakeReason} onChange={(event) => setStocktakeReason(event.target.value)} rows={3} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2" placeholder="例如：仓库实盘期初数量，已与仓库库存表核对" /></label>
              <ImageUploader value={stocktakeEvidence} onChange={setStocktakeEvidence} multiple maxImages={5} maxSizeKB={350} label="盘点凭证（必填）" />
              <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">提交后会生成盘点流水，并把当前库存调整为实盘数量；不会删除历史记录。</div>
              <button type="button" disabled={stocktakeSaving} onClick={submitStocktake} className="w-full rounded bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50">{stocktakeSaving ? "正在入账..." : "确认盘点并入账"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
