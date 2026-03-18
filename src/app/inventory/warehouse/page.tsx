"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Package, Warehouse as WarehouseIcon, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

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
  costPrice?: number;
};

type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: string;
  location?: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDate(iso: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}

export default function WarehouseInventoryPage() {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all");
  const [expandedWarehouse, setExpandedWarehouse] = useState<string | null>(null);

  // 获取仓库列表
  const { data: warehousesRaw } = useSWR<Warehouse[]>("/api/warehouses", fetcher, {
    revalidateOnFocus: false,
  });
  const warehouses = Array.isArray(warehousesRaw)
    ? warehousesRaw
    : (warehousesRaw as any)?.data || [];

  // 获取库存数据
  const { data: stocksRaw, isLoading } = useSWR<StockItem[]>(
    selectedWarehouseId === "all" 
      ? "/api/stock" 
      : `/api/stock?warehouseId=${selectedWarehouseId}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const stocks = Array.isArray(stocksRaw) 
    ? stocksRaw 
    : (stocksRaw as any)?.data || [];

  // 按仓库分组统计
  const warehouseStats = useMemo(() => {
    const map = new Map<string, { 
      warehouse: Warehouse; 
      totalQty: number; 
      availableQty: number;
      skuCount: number;
      items: StockItem[];
    }>();

    // 先添加所有仓库
    warehouses.forEach((w: Warehouse) => {
      map.set(w.id, { 
        warehouse: w, 
        totalQty: 0, 
        availableQty: 0, 
        skuCount: 0,
        items: [] 
      });
    });

    // 累加库存
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

  // 当前选中的仓库详情
  const selectedWarehouse = warehouses.find((w: Warehouse) => w.id === selectedWarehouseId);
  const selectedWarehouseStocks = selectedWarehouseId === "all" 
    ? stocks 
    : stocks.filter((s: StockItem) => s.warehouseId === selectedWarehouseId);

  const toggleWarehouse = (id: string) => {
    setExpandedWarehouse(expandedWarehouse === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-7xl p-6">
        {/* 页面头部 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <WarehouseIcon className="h-8 w-8 text-primary-400" />
              仓库库存
            </h1>
            <p className="text-slate-400 mt-1">按仓库查看库存明细</p>
          </div>
          
          {/* 仓库筛选 */}
          <div className="flex items-center gap-3">
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
          </div>
        </div>

        {/* 仓库汇总卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
                    <div className="text-slate-500">总库存</div>
                    <div className="text-lg font-semibold text-slate-200">{stat.totalQty.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">可用</div>
                    <div className="text-lg font-semibold text-emerald-400">{stat.availableQty.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            );
          })}
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
              共 {selectedWarehouseStocks.length} 条记录
            </p>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400">加载中...</div>
          ) : selectedWarehouseStocks.length === 0 ? (
            <div className="p-8 text-center text-slate-400">暂无库存数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">仓库</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">产品名称</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">规格</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">总库存</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">可用</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">锁定</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {selectedWarehouseStocks.map((item: StockItem) => (
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
                      <td className="px-4 py-3 text-right font-medium text-slate-200">{item.qty?.toLocaleString() || 0}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{item.availableQty?.toLocaleString() || 0}</td>
                      <td className="px-4 py-3 text-right text-amber-400">{item.lockedQty || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
