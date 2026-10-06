"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Package, Warehouse as WarehouseIcon, ChevronDown, ChevronUp, Download, Ship, ClipboardCheck, ShieldAlert, WalletCards, X, Gift, Boxes, RefreshCw } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import { toast } from "sonner";
import ImageUploader from "@/components/ImageUploader";
import SkuConversionPanel from "./SkuConversionPanel";

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
  openingDate?: string | null;
  inboundAfterOpening: number;
  outboundAfterOpening: number;
  returnInboundAfterOpening: number;
  adjustmentAfterOpening: number;
  calibrationAdjustment: number;
  hasLedgerCalibration: boolean;
  ledgerQty: number;
  reconciliationDifference: number;
  reconciliationStatus: "RECONCILED" | "SYSTEM_RECONCILED" | "PENDING_STOCKTAKE";
  assetStatus: "RECONCILED" | "PENDING_STOCKTAKE" | "PENDING_COST_REVIEW";
  costContinuous: boolean;
  hasFormalStocktake: boolean;
  totalValue: number;
  confirmedAssetValue: number;
  provisionalAssetValue: number;
  baselineSource: "FORMAL_STOCKTAKE" | "SYSTEM_HISTORY" | "CURRENT_BALANCE";
};

type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: string;
  location?: string;
};

type OverseasStockAuditRow = {
  warehouseId: string;
  variantId: string;
  openingQty: number;
  currentQty: number;
  salesUnits: number;
  sampleUnits: number;
  trueOutboundUnits: number;
  legacyOutboundUnits: number;
  expectedQty: number;
  differenceQty: number;
};

type OverseasStockAudit = {
  summary: {
    openingQty: number;
    currentQty: number;
    salesUnits: number;
    sampleUnits: number;
    trueOutboundUnits: number;
    legacyOutboundUnits: number;
    expectedQty: number;
    differenceQty: number;
  };
  warehouses: Array<{
    id: string;
    salesOrderCount: number;
    sampleOrderCount: number;
    openingQty: number;
    currentQty: number;
    salesUnits: number;
    sampleUnits: number;
    trueOutboundUnits: number;
    legacyOutboundUnits: number;
    expectedQty: number;
    differenceQty: number;
    rows: OverseasStockAuditRow[];
  }>;
  coverage: { missingWarehouseOrders: number; missingSkuOrders: number };
};

type PlatformOutboundSummary = {
  warehouseId: string | null;
  warehouseName: string | null;
  summary: { salesUnits: number; sampleUnits: number; returnUnits: number; totalUnits: number };
  platforms: Array<{
    platform: "TIKTOK" | "SHOPEE" | "AMAZON" | "MERCADO_LIVRE";
    label: string;
    salesUnits: number;
    sampleUnits: number;
    returnUnits: number;
    totalUnits: number;
    orderCount: number;
    warehouseCount: number;
    hasAggregateHistory: boolean;
    enabled: boolean;
    activeFrom: string | null;
    shopsEnabled: number | null;
    warehouses: Array<{ warehouseId: string; warehouseName: string; totalUnits: number }>;
  }>;
  skus: Array<{
    variantId: string;
    skuId: string;
    productName: string;
    salesUnits: number;
    sampleUnits: number;
    returnUnits: number;
    totalUnits: number;
    platforms: Array<{ platform: string; label: string; salesUnits: number; sampleUnits: number; returnUnits: number; totalUnits: number }>;
    warehouses: Array<{ warehouseId: string; warehouseName: string; salesUnits: number; sampleUnits: number; returnUnits: number; totalUnits: number }>;
  }>;
};

type TransitSummary = {
  inTransitTotal?: number;
  skus?: Array<{
    variantId: string | null;
    skuId: string;
    productName: string;
    quantity: number;
    batchCount: number;
  }>;
};

type SummaryDetailType = "current" | "transit" | "available" | "outbound" | "sample";

type SummaryDetailRow = {
  key: string;
  skuId: string;
  productName: string;
  quantity: number;
  warehouseBreakdown?: Array<{ label: string; quantity: number }>;
  platformBreakdown?: Array<{ label: string; quantity: number }>;
  salesUnits?: number;
  sampleUnits?: number;
  returnUnits?: number;
  batchCount?: number;
};

const platformOutboundStyle = {
  TIKTOK: { border: "border-cyan-500/30", background: "bg-cyan-500/5", value: "text-cyan-200", dot: "bg-cyan-400" },
  SHOPEE: { border: "border-orange-500/30", background: "bg-orange-500/5", value: "text-orange-200", dot: "bg-orange-400" },
  AMAZON: { border: "border-amber-500/30", background: "bg-amber-500/5", value: "text-amber-200", dot: "bg-amber-400" },
  MERCADO_LIVRE: { border: "border-sky-500/30", background: "bg-sky-500/5", value: "text-sky-200", dot: "bg-sky-400" },
} as const;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function WarehouseInventoryPage() {
  const [activeView, setActiveView] = useState<"overview" | "conversion" | "records">("overview");
  const [conversionWarehouseId, setConversionWarehouseId] = useState<string>("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [skuKeyword, setSkuKeyword] = useState<string>("");
  const [productKeyword, setProductKeyword] = useState<string>("");
  const [expandedWarehouse, setExpandedWarehouse] = useState<string | null>(null);
  const [summaryDetail, setSummaryDetail] = useState<SummaryDetailType | null>(null);

  // 获取仓库列表
  const { data: warehousesRaw } = useSWR<Warehouse[]>("/api/warehouses?noCache=true", fetcher, {
    revalidateOnFocus: false,
  });
  const warehouses = useMemo(
    () => Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw as any)?.data || [],
    [warehousesRaw],
  );

  // 变体「海运中」合计（发运离境后、未入海外仓前；与国内仓 Stock 无关）
  const { data: transitRaw } = useSWR<TransitSummary>(
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
  const stocks = useMemo(
    () => Array.isArray(stocksRaw) ? stocksRaw : (stocksRaw as any)?.data || [],
    [stocksRaw],
  );
  const platformOutboundUrl = selectedWarehouseId === "all"
    ? "/api/inventory/platform-outbound"
    : `/api/inventory/platform-outbound?warehouseId=${encodeURIComponent(selectedWarehouseId)}`;
  const {
    data: platformOutbound,
    error: platformOutboundError,
    isLoading: isPlatformOutboundLoading,
    mutate: mutatePlatformOutbound,
  } = useSWR<PlatformOutboundSummary>(platformOutboundUrl, fetcher, { revalidateOnFocus: false });
  const { data: overseasStockAudit, isLoading: isAuditLoading } = useSWR<OverseasStockAudit>(
    "/api/inventory/overseas-stock-audit",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const auditWarehouseById = useMemo(
    () => new Map((overseasStockAudit?.warehouses || []).map((warehouse) => [warehouse.id, warehouse])),
    [overseasStockAudit]
  );
  const auditRowByStockKey = useMemo(
    () => new Map((overseasStockAudit?.warehouses || []).flatMap((warehouse) => warehouse.rows.map((row) => [`${row.warehouseId}_${row.variantId}`, row]))),
    [overseasStockAudit]
  );
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
      openingQty: number;
      inboundQty: number;
      outboundQty: number;
      differenceQty: number;
      items: StockItem[];
    }>();

    warehouses.forEach((w: Warehouse) => {
      map.set(w.id, { 
        warehouse: w, 
        totalQty: 0, 
        availableQty: 0, 
        skuCount: 0,
        openingQty: 0,
        inboundQty: 0,
        outboundQty: 0,
        differenceQty: 0,
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
        stat.openingQty += item.openingQty || 0;
        stat.inboundQty += item.inboundAfterOpening || 0;
        stat.outboundQty += item.outboundAfterOpening || 0;
        stat.differenceQty += item.reconciliationDifference || 0;
        stat.items.push(item);
      }
    });

    return Array.from(map.values()).filter(w => w.totalQty > 0);
  }, [stocks, warehouses]);

  // 总体统计
  const totalStats = useMemo(() => {
    const overseas = warehouseStats.filter(w => w.warehouse.type === "OVERSEAS");
    return {
      totalWarehouses: warehouseStats.length,
      overseasWarehouses: overseas.length,
      totalQty: overseas.reduce((sum, w) => sum + w.totalQty, 0),
      availableQty: overseas.reduce((sum, w) => sum + w.availableQty, 0),
      totalSku: overseas.reduce((sum, w) => sum + w.skuCount, 0),
      openingQty: overseas.reduce((sum, w) => sum + w.openingQty, 0),
      inboundQty: overseas.reduce((sum, w) => sum + w.inboundQty, 0),
      outboundQty: overseas.reduce((sum, w) => sum + w.outboundQty, 0),
      differenceQty: overseas.reduce((sum, w) => sum + w.differenceQty, 0),
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
      pendingStocktake: stocks.filter((item: StockItem) => item.warehouseType === "OVERSEAS" && !item.hasFormalStocktake).length,
      ledgerCalibrated: stocks.filter((item: StockItem) => item.warehouseType === "OVERSEAS" && item.reconciliationStatus === "SYSTEM_RECONCILED").length,
    };
  }, [warehouseStats, stocks]);

  // 当前选中的仓库
  const selectedWarehouse = warehouses.find((w: Warehouse) => w.id === selectedWarehouseId);
  const selectedWarehouseStocks = useMemo(
    () => selectedWarehouseId === "all"
      ? stocks.filter((s: StockItem) => s.warehouseType === "OVERSEAS")
      : stocks.filter((s: StockItem) => s.warehouseId === selectedWarehouseId),
    [selectedWarehouseId, stocks],
  );
  const filteredWarehouseStocks = useMemo(() => {
    const sku = skuKeyword.trim();
    const product = productKeyword.trim().toLowerCase();
    return selectedWarehouseStocks.filter((item: StockItem) => {
      const hitSku = !sku || (item.skuId || "") === sku;
      const hitProduct = !product || (item.productName || "").toLowerCase().includes(product);
      return hitSku && hitProduct;
    });
  }, [selectedWarehouseStocks, skuKeyword, productKeyword]);

  const inventorySkuDetails = useMemo(() => {
    const details = new Map<string, {
      key: string;
      skuId: string;
      productName: string;
      currentQty: number;
      availableQty: number;
      warehouses: Map<string, { name: string; currentQty: number; availableQty: number }>;
    }>();
    for (const item of stocks.filter((stock: StockItem) => stock.warehouseType === "OVERSEAS")) {
      const row = details.get(item.variantId) || {
        key: item.variantId,
        skuId: item.skuId,
        productName: item.productName,
        currentQty: 0,
        availableQty: 0,
        warehouses: new Map<string, { name: string; currentQty: number; availableQty: number }>(),
      };
      row.currentQty += item.qty || 0;
      row.availableQty += item.availableQty || 0;
      const warehouse = row.warehouses.get(item.warehouseId) || { name: item.warehouseName, currentQty: 0, availableQty: 0 };
      warehouse.currentQty += item.qty || 0;
      warehouse.availableQty += item.availableQty || 0;
      row.warehouses.set(item.warehouseId, warehouse);
      details.set(item.variantId, row);
    }
    return [...details.values()];
  }, [stocks]);

  const summaryDetailConfig = useMemo((): {
    title: string;
    description: string;
    quantityLabel: string;
    total: number;
    rows: SummaryDetailRow[];
  } | null => {
    if (!summaryDetail) return null;
    if (summaryDetail === "current" || summaryDetail === "available") {
      const isCurrent = summaryDetail === "current";
      const rows = inventorySkuDetails.map((item) => ({
        key: item.key,
        skuId: item.skuId,
        productName: item.productName,
        quantity: isCurrent ? item.currentQty : item.availableQty,
        warehouseBreakdown: [...item.warehouses.values()].map((warehouse) => ({
          label: warehouse.name,
          quantity: isCurrent ? warehouse.currentQty : warehouse.availableQty,
        })),
      })).sort((a, b) => b.quantity - a.quantity || a.skuId.localeCompare(b.skuId));
      return {
        title: isCurrent ? "当前库存 SKU 明细" : "可用库存 SKU 明细",
        description: `${selectedWarehouseId === "all" ? "全部海外仓" : selectedWarehouse?.name || "所选仓库"} · ${isCurrent ? "当前库内实物库存" : "当前库存扣除锁定数量"}`,
        quantityLabel: isCurrent ? "当前库存" : "可用库存",
        total: isCurrent ? totalStats.totalQty : totalStats.availableQty,
        rows,
      };
    }
    if (summaryDetail === "transit") {
      return {
        title: "真实海运在途 SKU 明细",
        description: "已发运离境、尚未确认进入海外仓的批次",
        quantityLabel: "在途数量",
        total: inTransitVariantTotal,
        rows: (transitRaw?.skus || []).map((item) => ({
          key: item.variantId || item.skuId,
          skuId: item.skuId,
          productName: item.productName,
          quantity: item.quantity,
          batchCount: item.batchCount,
        })),
      };
    }
    const isSample = summaryDetail === "sample";
    return {
      title: isSample ? "达人寄样出库 SKU 明细" : "平台有效出库 SKU 明细",
      description: `${platformOutbound?.warehouseName || "全部海外仓"} · 已写入库存台账的多平台订单`,
      quantityLabel: isSample ? "寄样数量" : "有效出库",
      total: isSample ? platformOutbound?.summary.sampleUnits || 0 : platformOutbound?.summary.totalUnits || 0,
      rows: (platformOutbound?.skus || []).map((item) => ({
        key: item.variantId,
        skuId: item.skuId,
        productName: item.productName,
        quantity: isSample ? item.sampleUnits : item.totalUnits,
        salesUnits: item.salesUnits,
        sampleUnits: item.sampleUnits,
        returnUnits: item.returnUnits,
        warehouseBreakdown: item.warehouses
          .map((warehouse) => ({ label: warehouse.warehouseName, quantity: isSample ? warehouse.sampleUnits : warehouse.totalUnits }))
          .filter((warehouse) => warehouse.quantity > 0),
        platformBreakdown: item.platforms
          .map((platform) => ({ label: platform.label, quantity: isSample ? platform.sampleUnits : platform.totalUnits }))
          .filter((platform) => platform.quantity > 0),
      })).filter((item) => item.quantity > 0).sort((a, b) => b.quantity - a.quantity || a.skuId.localeCompare(b.skuId)),
    };
  }, [inTransitVariantTotal, inventorySkuDetails, platformOutbound, selectedWarehouse, selectedWarehouseId, summaryDetail, totalStats.availableQty, totalStats.totalQty, transitRaw?.skus]);

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
              const headers = ["仓库", "SKU", "产品名称", "规格", "期初库存", "期后入库", "有效出库", "当前库存", "账面差异", "单位成本", "暂估资产", "对账状态"];
              const rows = filteredWarehouseStocks.map((item: StockItem) => [
                item.warehouseName,
                item.skuId,
                item.productName,
                [item.color, item.size].filter(Boolean).join("/") || "-",
                String(item.openingQty || 0), String(item.inboundAfterOpening || 0), String(item.outboundAfterOpening || 0), String(item.qty || 0), String(item.reconciliationDifference || 0),
                `${item.currency || "CNY"} ${(item.costPrice || 0).toFixed(2)}`,
                `${item.currency || "CNY"} ${(item.totalValue || 0).toFixed(2)}`,
                item.reconciliationStatus === "RECONCILED" ? "实盘已核对" : item.reconciliationStatus === "SYSTEM_RECONCILED" ? "系统账已校准" : "待核对",
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

      <div className="border-b border-slate-800 bg-slate-950 px-6">
        <div className="flex flex-wrap gap-1">
          {([
            { key: "overview", label: "库存总览" },
            { key: "conversion", label: "SKU拆装" },
            { key: "records", label: "拆装记录" },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => { setActiveView(item.key); setSummaryDetail(null); }}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${activeView === item.key ? "text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}
            >
              {item.label}
              {activeView === item.key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-cyan-400" />}
            </button>
          ))}
        </div>
      </div>

      <div className={activeView === "overview" ? "p-6 space-y-6" : "hidden"}>
        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatCard
            title="海外仓数量"
            value={totalStats.overseasWarehouses}
            icon={WarehouseIcon}
            iconColor="text-blue-400"
          />
          <StatCard
            title="海外仓 SKU"
            value={totalStats.totalSku}
            icon={Package}
            iconColor="text-amber-400"
          />
          <button type="button" onClick={() => setSummaryDetail("current")} className="h-full text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70" aria-label="查看当前库存 SKU 明细">
            <StatCard title="当前库存" value={totalStats.totalQty.toLocaleString("en-US")} icon={Package} iconColor="text-green-400" className="h-full cursor-pointer">
              <span className="text-[11px] text-emerald-300/80">点击查看 SKU 明细</span>
            </StatCard>
          </button>
          <button type="button" onClick={() => setSummaryDetail("transit")} className="h-full text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70" aria-label="查看真实海运在途 SKU 明细">
            <StatCard title="真实海运在途" value={inTransitVariantTotal.toLocaleString("en-US")} icon={Ship} iconColor="text-orange-400" className="h-full cursor-pointer">
              <span className="text-[11px] text-orange-300/80">点击查看 SKU 明细</span>
            </StatCard>
          </button>
          <button type="button" onClick={() => setSummaryDetail("available")} className="h-full text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70" aria-label="查看可用库存 SKU 明细">
            <StatCard title="可用库存" value={totalStats.availableQty.toLocaleString("en-US")} icon={Package} iconColor="text-cyan-400" className="h-full cursor-pointer">
              <span className="text-[11px] text-cyan-300/80">点击查看 SKU 明细</span>
            </StatCard>
          </button>
          <button type="button" onClick={() => setSummaryDetail("outbound")} disabled={isPlatformOutboundLoading} className="h-full text-left outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:cursor-wait" aria-label="查看平台有效出库 SKU 明细">
            <StatCard title="平台有效出库" value={isPlatformOutboundLoading ? "..." : (platformOutbound?.summary.totalUnits || 0).toLocaleString("en-US")} icon={Package} iconColor="text-rose-400" className="h-full cursor-pointer">
              <span className="text-[11px] text-rose-300/80">点击查看 SKU 明细</span>
            </StatCard>
          </button>
          <button type="button" onClick={() => setSummaryDetail("sample")} disabled={isPlatformOutboundLoading} className="h-full text-left outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 disabled:cursor-wait" aria-label="查看达人寄样出库 SKU 明细">
            <StatCard title="达人寄样出库" value={isPlatformOutboundLoading ? "..." : (platformOutbound?.summary.sampleUnits || 0).toLocaleString("en-US")} icon={Gift} iconColor="text-pink-400" className="h-full cursor-pointer">
              <span className="text-[11px] text-pink-300/80">点击查看 SKU 明细</span>
            </StatCard>
          </button>
        </div>

        <section className="border-y border-slate-800 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-emerald-400" />
              <div>
                <h2 className="text-base font-semibold text-slate-100">多平台销售出库</h2>
                <div className="mt-0.5 text-xs text-slate-500">{platformOutbound?.warehouseName || "全部海外仓"} · 有效库存流水</div>
              </div>
            </div>
            <button type="button" onClick={() => void mutatePlatformOutbound()} title="刷新平台出库" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {platformOutboundError && <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">平台出库统计加载失败</div>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(platformOutbound?.platforms || []).map((platform) => {
              const style = platformOutboundStyle[platform.platform];
              return (
                <div key={platform.platform} className={`min-h-[176px] rounded-lg border p-4 ${style.border} ${style.background}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${platform.enabled ? style.dot : "bg-slate-600"}`} />
                      <span className="truncate text-sm font-medium text-slate-100">{platform.label}</span>
                    </div>
                    <span className={`text-xs ${platform.enabled ? "text-emerald-300" : "text-slate-500"}`}>{platform.enabled ? "已接入" : "待接入"}</span>
                  </div>
                  <div className={`mt-4 text-3xl font-semibold tabular-nums ${style.value}`}>{platform.totalUnits.toLocaleString("en-US")}</div>
                  <div className="mt-1 text-xs text-slate-500">有效出库件数</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-3 text-xs">
                    <div><div className="text-slate-500">销售</div><div className="mt-1 tabular-nums text-slate-200">{platform.salesUnits.toLocaleString("en-US")}</div></div>
                    <div><div className="text-slate-500">寄样</div><div className="mt-1 tabular-nums text-pink-200">{platform.sampleUnits.toLocaleString("en-US")}</div></div>
                    <div><div className="text-slate-500">取消回补</div><div className="mt-1 tabular-nums text-emerald-300">{platform.returnUnits.toLocaleString("en-US")}</div></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>{platform.hasAggregateHistory ? `历史汇总 + 新增逐单 ${platform.orderCount.toLocaleString("en-US")}` : `逐单流水 ${platform.orderCount.toLocaleString("en-US")}`}</span>
                    <span>出库仓 {platform.warehouseCount}</span>
                    {platform.activeFrom && <span>启用 {new Date(platform.activeFrom).toLocaleDateString("zh-CN")}</span>}
                  </div>
                </div>
              );
            })}
            {isPlatformOutboundLoading && !platformOutbound && [0, 1, 2, 3].map((index) => <div key={index} className="h-44 animate-pulse rounded-lg border border-slate-800 bg-slate-900/50" />)}
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500">历史期初库存</div><div className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{totalStats.openingQty.toLocaleString("en-US")}</div><div className="mt-1 text-xs text-slate-500">来自首笔出库前余额或正式盘点</div></div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"><div className="text-xs text-slate-500">期后正式入库</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-300">+{totalStats.inboundQty.toLocaleString("en-US")}</div><div className="mt-1 text-xs text-slate-500">不再重复计算历史到仓批次</div></div>
          <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-4"><div className="text-xs text-slate-400">多平台销售订单出库</div><div className="mt-1 text-xl font-semibold tabular-nums text-sky-200">-{isPlatformOutboundLoading ? "..." : (platformOutbound?.summary.salesUnits || 0).toLocaleString("en-US")}</div><div className="mt-1 text-xs text-slate-500">已入库存流水，组合 SKU 按实物件数扣减</div></div>
          <div className="rounded-lg border border-pink-500/25 bg-pink-500/5 p-4"><div className="text-xs text-slate-400">达人寄样出库</div><div className="mt-1 text-xl font-semibold tabular-nums text-pink-200">-{isPlatformOutboundLoading ? "..." : (platformOutbound?.summary.sampleUnits || 0).toLocaleString("en-US")}</div><div className="mt-1 text-xs text-slate-500">免费样品单独扣库存，不混入销售</div></div>
          <div className={`rounded-lg border p-4 ${(overseasStockAudit?.summary.differenceQty || 0) === 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}><div className="text-xs text-slate-400">TikTok 订单审计差异</div><div className={`mt-1 text-xl font-semibold tabular-nums ${(overseasStockAudit?.summary.differenceQty || 0) === 0 ? "text-emerald-300" : "text-amber-300"}`}>{isAuditLoading ? "..." : `${(overseasStockAudit?.summary.differenceQty || 0) > 0 ? "+" : ""}${(overseasStockAudit?.summary.differenceQty || 0).toLocaleString("en-US")}`}</div><div className="mt-1 text-xs text-slate-400">TikTok 历史订单专项审计，不代表其他平台</div></div>
        </div>

        {overseasStockAudit && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-slate-300">
            <span className="font-medium text-amber-200">TikTok 历史订单审计：</span>
            期初 {overseasStockAudit.summary.openingQty.toLocaleString("en-US")} - 销售 {overseasStockAudit.summary.salesUnits.toLocaleString("en-US")} - 达人寄样 {overseasStockAudit.summary.sampleUnits.toLocaleString("en-US")} = 应有库存 {overseasStockAudit.summary.expectedQty.toLocaleString("en-US")}，当前账面 {overseasStockAudit.summary.currentQty.toLocaleString("en-US")}。
            {overseasStockAudit.coverage.missingWarehouseOrders + overseasStockAudit.coverage.missingSkuOrders > 0 && <span className="ml-2 text-amber-300">另有 {overseasStockAudit.coverage.missingWarehouseOrders + overseasStockAudit.coverage.missingSkuOrders} 笔订单待补充映射。</span>}
          </div>
        )}

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
              <div><div className="text-xs text-slate-500">系统账已校准 / 待实盘</div><div className="mt-1 text-xl font-semibold text-amber-300">{totalStats.ledgerCalibrated} / {totalStats.pendingStocktake}</div></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">系统账校准表示数量已按历史订单链核对；只有上传仓库实盘凭证后，才进入已确认库存资产。</p>
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
            const audit = auditWarehouseById.get(stat.warehouse.id);
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
                  <div className="flex items-center gap-2">
                    {stat.warehouse.type === "OVERSEAS" && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConversionWarehouseId(stat.warehouse.id);
                          setActiveView("conversion");
                        }}
                        className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                      >
                        发起拆装
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2 text-sm">
                  <div>
                    <div className="text-slate-500">SKU种类</div>
                    <div className="text-lg font-semibold text-slate-200">{stat.skuCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">期初</div>
                    <div className="text-lg font-semibold text-slate-200">{stat.openingQty.toLocaleString("en-US")}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">有效出库</div>
                    <div className="text-lg font-semibold text-rose-300">{stat.outboundQty.toLocaleString("en-US")}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">当前库存</div>
                    <div className="text-lg font-semibold text-slate-200">{stat.totalQty.toLocaleString("en-US")}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">可用</div>
                    <div className="text-lg font-semibold text-emerald-400">{stat.availableQty.toLocaleString("en-US")}</div>
                  </div>
                </div>
                {stat.warehouse.type === "OVERSEAS" && audit && (
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700/50 pt-3 text-xs">
                    <div><div className="text-slate-500">真实销售出库</div><div className="mt-0.5 font-semibold tabular-nums text-sky-300">{audit.salesUnits.toLocaleString("en-US")} 件 / {audit.salesOrderCount.toLocaleString("en-US")} 单</div></div>
                    <div><div className="text-slate-500">达人寄样出库</div><div className="mt-0.5 font-semibold tabular-nums text-pink-300">{audit.sampleUnits.toLocaleString("en-US")} 件 / {audit.sampleOrderCount.toLocaleString("en-US")} 单</div></div>
                    <div><div className="text-slate-500">应有库存 / 差异</div><div className={audit.differenceQty === 0 ? "mt-0.5 font-semibold tabular-nums text-emerald-300" : "mt-0.5 font-semibold tabular-nums text-amber-300"}>{audit.expectedQty.toLocaleString("en-US")} / {audit.differenceQty > 0 ? "+" : ""}{audit.differenceQty.toLocaleString("en-US")}</div></div>
                  </div>
                )}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-700/30">
                          <th className="pb-1 pr-2 text-left">SKU</th>
                          <th className="pb-1 pr-2 text-left">产品</th>
                          <th className="pb-1 pr-2 text-right">库内库存</th>
                          <th className="pb-1 pr-2 text-right">销售出库</th>
                          <th className="pb-1 pr-2 text-right">达人寄样</th>
                          <th className="pb-1 text-right">可用</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stat.items
                          .slice()
                          .sort((a: StockItem, b: StockItem) => (b.availableQty || 0) - (a.availableQty || 0))
                          .map((item: StockItem) => {
                            const itemAudit = auditRowByStockKey.get(`${item.warehouseId}_${item.variantId}`);
                            return (
                          <tr key={item.id} className="border-b border-slate-700/20">
                            <td className="py-1.5 pr-2 font-mono text-slate-300">{item.skuId}</td>
                            <td className="py-1.5 pr-2 text-slate-400 truncate max-w-24">{item.productName}</td>
                            <td className="py-1.5 pr-2 text-right text-slate-200">{item.qty?.toLocaleString("en-US") || 0}</td>
                            <td className="py-1.5 pr-2 text-right text-sky-300">{(itemAudit?.salesUnits || 0).toLocaleString("en-US")}</td>
                            <td className="py-1.5 pr-2 text-right text-pink-300">{(itemAudit?.sampleUnits || 0).toLocaleString("en-US")}</td>
                            <td className="py-1.5 text-right text-emerald-400">{item.availableQty?.toLocaleString("en-US") || 0}</td>
                          </tr>
                            );
                          })}
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
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">当前库存</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">期初 / 入库 / 出库</th>
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
                      <td className="px-4 py-3 text-right text-sm tabular-nums"><span className="text-slate-300">{item.openingQty || 0}</span><span className="mx-1 text-slate-600">/</span><span className="text-emerald-400">+{item.inboundAfterOpening || 0}</span><span className="mx-1 text-slate-600">/</span><span className="text-rose-400">-{item.outboundAfterOpening || 0}</span></td>
                      <td className="px-4 py-3 text-right text-sm"><div>{item.currency || "CNY"} {(item.costPrice || 0).toFixed(2)}</div><div className="text-slate-500">{item.currency || "CNY"} {(item.totalValue || 0).toFixed(2)}</div></td>
                      <td className="px-4 py-3 text-center"><span className={`rounded px-2 py-1 text-xs ${item.reconciliationStatus === "RECONCILED" ? "bg-emerald-500/15 text-emerald-300" : item.reconciliationStatus === "SYSTEM_RECONCILED" ? "bg-blue-500/15 text-blue-300" : "bg-amber-500/15 text-amber-300"}`}>{item.reconciliationStatus === "RECONCILED" ? "实盘已核对" : item.reconciliationStatus === "SYSTEM_RECONCILED" ? "系统账已校准 · 待实盘" : `账面待核对 · 差 ${item.reconciliationDifference}`}</span><div className="mt-1 text-[10px] text-slate-500">{item.openingQty} + {item.inboundAfterOpening} - {item.outboundAfterOpening} = {item.ledgerQty}</div>{item.calibrationAdjustment !== 0 && <div className="mt-1 text-[10px] text-blue-400">历史并发漂移已校准 {item.calibrationAdjustment > 0 ? "+" : ""}{item.calibrationAdjustment}</div>}</td>
                      <td className="px-4 py-3 text-center">{item.warehouseType === "OVERSEAS" && <button type="button" title="正式盘点" onClick={() => { setStocktakeItem(item); setStocktakeQty(String(item.qty)); setStocktakeUnitCost(String(item.costPrice || 0)); setStocktakeCurrency(item.currency || "CNY"); }} className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-700 hover:bg-slate-800"><ClipboardCheck className="h-4 w-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {activeView === "conversion" && <SkuConversionPanel view="create" initialWarehouseId={conversionWarehouseId} onStocksChanged={mutateStocks} />}
      {activeView === "records" && <SkuConversionPanel view="records" onStocksChanged={mutateStocks} />}
      {summaryDetailConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={() => setSummaryDetail(null)}>
          <div className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{summaryDetailConfig.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{summaryDetailConfig.description}</p>
              </div>
              <button type="button" title="关闭" onClick={() => setSummaryDetail(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 border-b border-slate-800 bg-slate-950/50 px-5 py-3 sm:grid-cols-3">
              <div><div className="text-xs text-slate-500">SKU 种类</div><div className="mt-1 text-xl font-semibold tabular-nums text-slate-100">{summaryDetailConfig.rows.length}</div></div>
              <div><div className="text-xs text-slate-500">{summaryDetailConfig.quantityLabel}合计</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-300">{summaryDetailConfig.total.toLocaleString("en-US")}</div></div>
              <div className="hidden sm:block"><div className="text-xs text-slate-500">明细合计校验</div><div className={`mt-1 text-sm font-medium ${summaryDetailConfig.rows.reduce((sum, row) => sum + row.quantity, 0) === summaryDetailConfig.total ? "text-emerald-300" : "text-amber-300"}`}>{summaryDetailConfig.rows.reduce((sum, row) => sum + row.quantity, 0) === summaryDetailConfig.total ? "已与卡片一致" : "明细与汇总待核对"}</div></div>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[820px]">
                <thead className="sticky top-0 z-10 bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">产品名称</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">{summaryDetailConfig.quantityLabel}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">仓库明细</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">平台 / 批次</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {summaryDetailConfig.rows.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-800/35">
                      <td className="px-4 py-3 font-mono text-sm text-slate-200">{row.skuId}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{row.productName}</td>
                      <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-emerald-300">{row.quantity.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(row.warehouseBreakdown || []).map((warehouse) => <span key={warehouse.label} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">{warehouse.label} <strong className="ml-1 tabular-nums text-slate-100">{warehouse.quantity.toLocaleString("en-US")}</strong></span>)}
                          {!row.warehouseBreakdown?.length && <span className="text-xs text-slate-600">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(row.platformBreakdown || []).map((platform) => <span key={platform.label} className="rounded bg-sky-500/10 px-2 py-1 text-xs text-sky-200">{platform.label} <strong className="ml-1 tabular-nums">{platform.quantity.toLocaleString("en-US")}</strong></span>)}
                          {row.batchCount != null && <span className="rounded bg-orange-500/10 px-2 py-1 text-xs text-orange-200">{row.batchCount.toLocaleString("en-US")} 个在途批次</span>}
                          {!row.platformBreakdown?.length && row.batchCount == null && <span className="text-xs text-slate-600">—</span>}
                        </div>
                        {summaryDetail === "outbound" && <div className="mt-1.5 text-[11px] text-slate-500">销售 {row.salesUnits?.toLocaleString("en-US") || 0} · 寄样 {row.sampleUnits?.toLocaleString("en-US") || 0} · 取消回补 {row.returnUnits?.toLocaleString("en-US") || 0}</div>}
                      </td>
                    </tr>
                  ))}
                  {summaryDetailConfig.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">暂无 SKU 明细</td></tr>}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-950">
                  <tr className="border-t border-slate-700">
                    <td colSpan={2} className="px-4 py-3 text-right text-sm font-medium text-slate-300">合计</td>
                    <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-emerald-300">{summaryDetailConfig.rows.reduce((sum, row) => sum + row.quantity, 0).toLocaleString("en-US")}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
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
