"use client";

import { useMemo, useState, Fragment } from "react";
import useSWR from "swr";
import InventoryDistribution from "@/components/InventoryDistribution";
import { Package, Search, X, Download, History, ChevronDown, ChevronUp } from "lucide-react";
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
      <td colSpan={8} className="px-4 py-4">
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

export default function InventoryPage() {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [expandedSkuIds, setExpandedSkuIds] = useState<Set<string>>(new Set());
  const [movementsBySku, setMovementsBySku] = useState<Record<string, InventoryMovement[]>>({});

  const { data: products = [] } = useSWR<any[]>("/api/products", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });

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

  // 计算库存统计
  const inventoryStats = useMemo(() => {
    let totalValue = 0;
    let factoryQty = 0;
    let factoryValue = 0;
    let domesticQty = 0;
    let domesticValue = 0;
    let transitQty = 0;
    let transitValue = 0;
    
    products.forEach((product) => {
      const atFactory = product.at_factory || 0;
      const atDomestic = product.at_domestic || 0;
      const inTransit = product.in_transit || 0;
      const totalQty = atFactory + atDomestic + inTransit;
      
      if (product.cost_price) {
        // 根据币种转换为RMB（简化处理，实际应该使用汇率）
        const costPrice = product.cost_price;
        const currency = product.currency || "CNY";
        
        // 简单汇率转换（实际应该从账户或配置中获取）
        let exchangeRate = 1;
        if (currency === "USD") exchangeRate = 7.2;
        else if (currency === "HKD") exchangeRate = 0.92;
        else if (currency === "JPY") exchangeRate = 0.048;
        else if (currency === "EUR") exchangeRate = 7.8;
        else if (currency === "GBP") exchangeRate = 9.1;
        
        const unitValue = costPrice * exchangeRate;
        
        if (atFactory > 0) {
          factoryQty += atFactory;
          factoryValue += atFactory * unitValue;
        }
        if (atDomestic > 0) {
          domesticQty += atDomestic;
          domesticValue += atDomestic * unitValue;
        }
        if (inTransit > 0) {
          transitQty += inTransit;
          transitValue += inTransit * unitValue;
        }
        
        if (totalQty > 0) {
          totalValue += totalQty * unitValue;
        }
      }
    });
    
    return {
      totalValue,
      factoryQty,
      factoryValue,
      domesticQty,
      domesticValue,
      transitQty,
      transitValue
    };
  }, [products]);

  // 筛选有库存的产品
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      const totalQty = (p.at_factory || 0) + (p.at_domestic || 0) + (p.in_transit || 0);
      return totalQty > 0;
    });

    // 关键词搜索
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
  }, [products, searchKeyword]);

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
      "总库存",
      "单价",
      "币种",
      "库存总值(RMB)",
      "关联工厂"
    ];

    const rows = filteredProducts.map((p) => {
      const atFactory = p.at_factory || 0;
      const atDomestic = p.at_domestic || 0;
      const inTransit = p.in_transit || 0;
      const totalQty = atFactory + atDomestic + inTransit;
      
      // 计算库存总值（RMB）
      const currency = p.currency || "CNY";
      let exchangeRate = 1;
      if (currency === "USD") exchangeRate = 7.2;
      else if (currency === "HKD") exchangeRate = 0.92;
      else if (currency === "JPY") exchangeRate = 0.048;
      else if (currency === "EUR") exchangeRate = 7.8;
      else if (currency === "GBP") exchangeRate = 9.1;
      
      const totalValue = totalQty * (p.cost_price || 0) * exchangeRate;

      return [
        p.sku_id || "",
        p.name || "",
        String(atFactory),
        String(atDomestic),
        String(inTransit),
        String(totalQty),
        String(p.cost_price || 0),
        currency,
        totalValue.toFixed(2),
        p.factory_name || ""
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
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
          <p className="mt-1 text-sm text-slate-400">查询和管理库存数据，支持多仓库、多SKU维度。</p>
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                总计 {inventoryStats.factoryQty + inventoryStats.domesticQty + inventoryStats.transitQty} 件
              </div>
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
        </div>
      </section>

      {/* 搜索框 */}
      <section className="space-y-3">
        <div className="relative">
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
      </section>

      {/* 库存产品列表 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-medium text-slate-100 mb-4">有库存的产品列表</h3>
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无库存数据</p>
            <p className="text-xs mt-2">请先在采购合同中完成"工厂完工"操作</p>
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
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">总库存</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">库存总值</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                {filteredProducts.map((product) => {
                  const atFactory = product.at_factory || 0;
                  const atDomestic = product.at_domestic || 0;
                  const inTransit = product.in_transit || 0;
                  const totalQty = atFactory + atDomestic + inTransit;
                  
                  // 计算库存总值（RMB）
                  const currency = product.currency || "CNY";
                  let exchangeRate = 1;
                  if (currency === "USD") exchangeRate = 7.2;
                  else if (currency === "HKD") exchangeRate = 0.92;
                  else if (currency === "JPY") exchangeRate = 0.048;
                  else if (currency === "EUR") exchangeRate = 7.8;
                  else if (currency === "GBP") exchangeRate = 9.1;
                  
                  const totalValue = totalQty * (product.cost_price || 0) * exchangeRate;

                  return (
                    <Fragment key={product.sku_id}>
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
                            unitPrice={product.cost_price}
                            size="sm"
                            showValue={false}
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">{atFactory.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{atDomestic.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{inTransit.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-100">{totalQty.toLocaleString("zh-CN")}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-300">
                          {formatCurrency(totalValue, "CNY")}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleExpand(product.sku_id)}
                            className="p-1.5 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
                            title="查看变动历史"
                          >
                            {expandedSkuIds.has(product.sku_id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <History className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedSkuIds.has(product.sku_id) && (
                        <InventoryHistoryRow 
                          product={product}
                          movements={movementsBySku[product.sku_id] || []}
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
