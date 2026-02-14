"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Package, Search, X, Download, Warehouse as WarehouseIcon, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// 格式化货币
const formatCurrency = (n: number, curr: string = "CNY") => {
  if (!Number.isFinite(n)) return "¥0.00";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr === "CNY" ? "CNY" : curr,
    maximumFractionDigits: 2,
  }).format(n);
};

// SWR fetcher - 添加错误处理和数据验证
const fetcher = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    // 确保返回的是数组，如果不是则返回空数组
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Fetcher error:', error);
    // 返回空数组而不是抛出错误，避免页面崩溃
    return [];
  }
};

type StockItem = {
  id: string;
  variantId: string;
  warehouseId: string;
  skuId: string;
  productName: string;
  warehouseCode: string;
  warehouseName: string;
  location: string;
  qty: number;
  reservedQty: number;
  availableQty: number;
  costPrice: number;
  currency: string;
  totalValue: number;
  updatedAt: string;
  createdAt: string;
};

type Warehouse = {
  id: string;
  code: string;
  name: string;
  location: string;
  isActive: boolean;
};

export default function InventoryDashboardPage() {
  // 使用 SWR 加载数据
  const { data: stockDataRaw, isLoading: stockLoading, error: stockError } = useSWR<any>("/api/stock?page=1&pageSize=5000", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const { data: warehousesDataRaw, error: warehousesError } = useSWR<any>("/api/warehouses?page=1&pageSize=500", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const stockData = Array.isArray(stockDataRaw) ? stockDataRaw : (stockDataRaw?.data ?? []);
  const warehousesData = Array.isArray(warehousesDataRaw) ? warehousesDataRaw : (warehousesDataRaw?.data ?? []);

  // 筛选状态
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [searchSku, setSearchSku] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_stock" | "in_transit">("all");

  // 计算总库存价值
  const totalInventoryValue = useMemo(() => {
    if (!Array.isArray(stockData) || stockData.length === 0) {
      return 0;
    }
    return stockData.reduce((sum, item) => {
      if (!item || typeof item.totalValue !== 'number') {
        return sum;
      }
      // 根据币种转换为 RMB
      let exchangeRate = 1;
      if (item.currency === "USD") exchangeRate = 7.2;
      else if (item.currency === "HKD") exchangeRate = 0.92;
      else if (item.currency === "JPY") exchangeRate = 0.048;
      else if (item.currency === "EUR") exchangeRate = 7.8;
      else if (item.currency === "GBP") exchangeRate = 9.1;

      return sum + (item.totalValue || 0) * exchangeRate;
    }, 0);
  }, [stockData]);

  // 计算总库存数量
  const totalStockQty = useMemo(() => {
    if (!Array.isArray(stockData) || stockData.length === 0) {
      return 0;
    }
    return stockData.reduce((sum, item) => {
      if (!item || typeof item.availableQty !== 'number') {
        return sum;
      }
      return sum + (item.availableQty || 0);
    }, 0);
  }, [stockData]);

  // 筛选后的库存数据
  const filteredStock = useMemo(() => {
    if (!Array.isArray(stockData) || stockData.length === 0) {
      return [];
    }
    let filtered = [...stockData];

    // 仓库筛选
    if (selectedWarehouse !== "all") {
      filtered = filtered.filter((item) => item.warehouseId === selectedWarehouse);
    }

    // 关键词筛选（SKU、品名）
    if (searchSku.trim()) {
      const keyword = searchSku.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.skuId.toLowerCase().includes(keyword) ||
          (item.productName && item.productName.toLowerCase().includes(keyword))
      );
    }

    // 状态筛选（在库/在途）
    if (statusFilter !== "all") {
      if (statusFilter === "in_stock") {
        // 在库：location 为 FACTORY 或 DOMESTIC
        filtered = filtered.filter(
          (item) => item.location === "FACTORY" || item.location === "DOMESTIC"
        );
      } else if (statusFilter === "in_transit") {
        // 在途：location 为 TRANSIT
        filtered = filtered.filter((item) => item.location === "TRANSIT");
      }
    }

    return filtered;
  }, [stockData, selectedWarehouse, searchSku, statusFilter]);

  // 导出数据
  const handleExportData = () => {
    if (filteredStock.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    const headers = [
      "变体SKU",
      "产品名称",
      "仓库编码",
      "仓库名称",
      "位置",
      "库存数量",
      "预留数量",
      "可用数量",
      "单价",
      "币种",
      "库存总值(RMB)",
      "更新时间",
    ];

    const rows = filteredStock.map((item) => {
      let exchangeRate = 1;
      if (item.currency === "USD") exchangeRate = 7.2;
      else if (item.currency === "HKD") exchangeRate = 0.92;
      else if (item.currency === "JPY") exchangeRate = 0.048;
      else if (item.currency === "EUR") exchangeRate = 7.8;
      else if (item.currency === "GBP") exchangeRate = 9.1;

      const rmbValue = item.totalValue * exchangeRate;
      const locationMap: Record<string, string> = {
        FACTORY: "工厂",
        DOMESTIC: "国内",
        TRANSIT: "在途",
        OVERSEAS: "海外",
      };

      return [
        item.skuId,
        item.productName,
        item.warehouseCode,
        item.warehouseName,
        locationMap[item.location] || item.location,
        String(item.qty),
        String(item.reservedQty),
        String(item.availableQty),
        String(item.costPrice),
        item.currency,
        rmbValue.toFixed(2),
        new Date(item.updatedAt).toLocaleString("zh-CN"),
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `库存看板_${new Date().toISOString().slice(0, 10)}.csv`);
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
          <h1 className="text-2xl font-semibold text-slate-100">库存看板</h1>
          <p className="mt-1 text-sm text-slate-400">
            实时查看库存价值、库存分布和库存明细，支持多仓库、多 SKU 维度管理。
          </p>
        </div>
        <button
          onClick={handleExportData}
          className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <Download className="h-4 w-4" />
          导出数据
        </button>
      </header>

      {/* 总库存价值卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">总库存价值</p>
              <p
                className="text-2xl font-bold text-purple-300"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {formatCurrency(totalInventoryValue)}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">所有仓库库存总值（RMB）</p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">总库存数量</p>
              <p
                className="text-2xl font-bold text-emerald-300"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {totalStockQty.toLocaleString("zh-CN")}
              </p>
              <p className="text-[10px] text-slate-500 mt-2">所有仓库可用库存总数</p>
            </div>
            <Package className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 仓库筛选 */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">仓库</label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
            >
              <option value="all">全部仓库</option>
              {warehousesData.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
          </div>

          {/* SKU 编码筛选 */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">SKU 编码</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索变体 SKU 或产品名称..."
                value={searchSku}
                onChange={(e) => setSearchSku(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900 pl-10 pr-10 py-2 text-sm text-slate-300 placeholder-slate-500 outline-none focus:border-primary-400"
              />
              {searchSku && (
                <button
                  onClick={() => setSearchSku("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* 状态筛选 */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">状态</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "in_stock" | "in_transit")}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
            >
              <option value="all">全部状态</option>
              <option value="in_stock">在库</option>
              <option value="in_transit">在途</option>
            </select>
          </div>
        </div>
      </section>

      {/* 库存明细表格 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-slate-100">库存明细</h2>
            <p className="text-xs text-slate-500 mt-0.5">每行一条：单个 SKU 在单个仓库的数量，下面表格即全部明细。</p>
          </div>
          <span className="text-xs text-slate-400">
            共 {filteredStock.length} 条
          </span>
        </div>
        {stockLoading ? (
          <div className="text-center py-12 text-slate-500">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50 animate-pulse" />
            <p className="text-sm">加载中...</p>
          </div>
        ) : stockError ? (
          <div className="text-center py-12 text-slate-500">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-rose-400">加载失败</p>
            <p className="text-xs mt-2 text-slate-400">
              {stockError.message || "请检查数据库连接或重启开发服务器"}
            </p>
            <p className="text-xs mt-1 text-slate-500">
              提示：如果刚运行了数据库迁移，请重启开发服务器
            </p>
          </div>
        ) : filteredStock.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无库存数据</p>
            <p className="text-xs mt-2">请先创建仓库并添加库存记录</p>
            <p className="text-xs mt-1 text-slate-400">
              访问路径：供应链 → 库存看板
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 w-32">SKU</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 w-28">数量</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">产品名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">仓库</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">位置</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">预留</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">可用</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">单价</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">库存总值</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredStock.map((item) => {
                  // 计算 RMB 价值
                  let exchangeRate = 1;
                  if (item.currency === "USD") exchangeRate = 7.2;
                  else if (item.currency === "HKD") exchangeRate = 0.92;
                  else if (item.currency === "JPY") exchangeRate = 0.048;
                  else if (item.currency === "EUR") exchangeRate = 7.8;
                  else if (item.currency === "GBP") exchangeRate = 9.1;

                  const rmbValue = item.totalValue * exchangeRate;
                  const locationMap: Record<string, string> = {
                    FACTORY: "工厂",
                    DOMESTIC: "国内",
                    TRANSIT: "在途",
                    OVERSEAS: "海外",
                  };

                  const locationColor: Record<string, string> = {
                    FACTORY: "text-blue-400",
                    DOMESTIC: "text-emerald-400",
                    TRANSIT: "text-amber-400",
                    OVERSEAS: "text-purple-400",
                  };

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-slate-200">{item.skuId}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-base font-semibold tabular-nums text-slate-100">{item.qty.toLocaleString("zh-CN")}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-100">{item.productName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <WarehouseIcon className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-300">{item.warehouseName}</span>
                        </div>
                        <span className="text-xs text-slate-500">{item.warehouseCode}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${locationColor[item.location] || "text-slate-400"}`}>
                          {locationMap[item.location] || item.location}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {item.reservedQty.toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-100">
                        {item.availableQty.toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatCurrency(item.costPrice, item.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-300">
                        {formatCurrency(rmbValue)}
                      </td>
                    </tr>
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
