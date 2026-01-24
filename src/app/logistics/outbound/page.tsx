"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Plus, Search, X, Download, Eye, CheckCircle2, Clock, AlertCircle, Warehouse, Truck, ArrowRight } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import useSWR from "swr";

// 出库批次类型
type OutboundBatch = {
  id: string;
  outboundId: string;
  batchNumber: string;
  warehouse: string;
  warehouseId: string;
  qty: number;
  shippedDate: string;
  destination?: string;
  trackingNumber?: string;
  notes?: string;
  createdAt: string;
};

// 出库单类型
type OutboundOrder = {
  id: string;
  outboundNumber: string;
  skuId: string;
  sku: string;
  qty: number;
  shippedQty: number;
  warehouse: string;
  warehouseId: string;
  destination?: string;
  status: "待出库" | "部分出库" | "已出库" | "已取消";
  reason?: string;
  createdAt: string;
  updatedAt: string;
  batches?: OutboundBatch[];
};

type Product = {
  id: string;
  skuId: string;
  name: string;
  [key: string]: any;
};

// SWR fetcher
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "待出库": { bg: "bg-slate-500/20", text: "text-slate-300" },
  "部分出库": { bg: "bg-amber-500/20", text: "text-amber-300" },
  "已出库": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "已取消": { bg: "bg-rose-500/20", text: "text-rose-300" }
};

export default function OutboundPage() {
  // 使用 SWR 获取数据
  const { data: outboundOrdersData = [], mutate: mutateOutboundOrders } = useSWR<OutboundOrder[]>('/api/outbound-orders', fetcher);
  const { data: warehouses = [] } = useSWR<any[]>('/api/warehouses', fetcher);
  const { data: productsData = [] } = useSWR<any[]>('/api/products', fetcher);
  
  // 从出库单数据中提取批次
  const batches = useMemo(() => {
    const allBatches: OutboundBatch[] = [];
    outboundOrdersData.forEach((order) => {
      if (order.batches) {
        allBatches.push(...order.batches);
      }
    });
    return allBatches;
  }, [outboundOrdersData]);
  
  // 搜索和筛选
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterWarehouse, setFilterWarehouse] = useState<string>("all");
  
  // 模态框状态
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedOutbound, setSelectedOutbound] = useState<OutboundOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    skuId: "",
    qty: "",
    warehouseId: "",
    warehouse: "",
    destination: "",
    reason: ""
  });
  const [batchForm, setBatchForm] = useState({
    qty: "",
    shippedDate: new Date().toISOString().slice(0, 10),
    destination: "",
    trackingNumber: "",
    notes: ""
  });
  
  // 详情模态框
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailOutbound, setDetailOutbound] = useState<OutboundOrder | null>(null);

  // 统计信息
  const stats = useMemo(() => {
    const total = outboundOrdersData.length;
    const pending = outboundOrdersData.filter((o) => o.status === "待出库").length;
    const partial = outboundOrdersData.filter((o) => o.status === "部分出库").length;
    const completed = outboundOrdersData.filter((o) => o.status === "已出库").length;
    const totalQty = outboundOrdersData.reduce((sum, o) => sum + o.qty, 0);
    const shippedQty = outboundOrdersData.reduce((sum, o) => sum + o.shippedQty, 0);
    const pendingQty = totalQty - shippedQty;

    return {
      total,
      pending,
      partial,
      completed,
      totalQty,
      shippedQty,
      pendingQty
    };
  }, [outboundOrdersData]);

  // 获取所有仓库名称列表（用于筛选）
  const warehouseNames = useMemo(() => {
    const warehouseSet = new Set<string>();
    outboundOrdersData.forEach((o) => {
      if (o.warehouse) warehouseSet.add(o.warehouse);
    });
    batches.forEach((b) => {
      if (b.warehouse) warehouseSet.add(b.warehouse);
    });
    return Array.from(warehouseSet).sort();
  }, [outboundOrdersData, batches]);

  // 筛选出库单
  const filteredOutbound = useMemo(() => {
    let result = [...outboundOrdersData];

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((o) => o.status === filterStatus);
    }

    // 仓库筛选
    if (filterWarehouse !== "all") {
      result = result.filter((o) => o.warehouse === filterWarehouse);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((o) => {
        const product = products.find((p) => p.sku_id === o.skuId);
        return (
          o.outboundNumber.toLowerCase().includes(keyword) ||
          o.sku.toLowerCase().includes(keyword) ||
          product?.name?.toLowerCase().includes(keyword) ||
          o.destination?.toLowerCase().includes(keyword) ||
          o.reason?.toLowerCase().includes(keyword)
        );
      });
    }

    // 按创建时间倒序
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [outboundOrdersData, filterStatus, filterWarehouse, searchKeyword]);

  // 创建出库单
  const handleCreateOutbound = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }

    const qty = Number(createForm.qty);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error("请输入有效的出库数量");
      return;
    }

    if (!createForm.warehouseId) {
      toast.error("请选择出库仓库");
      return;
    }

    if (!createForm.skuId) {
      toast.error("请选择产品SKU");
      return;
    }

    setIsSubmitting(true);

    try {
      const body = {
        outboundNumber: `OUT-${Date.now()}`,
        skuId: createForm.skuId,
        qty,
        warehouseId: createForm.warehouseId,
        destination: createForm.destination.trim() || undefined,
        reason: createForm.reason.trim() || undefined,
        status: "待出库"
      };

      const response = await fetch('/api/outbound-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建失败');
      }

      toast.success("出库单创建成功");
      mutateOutboundOrders(); // 刷新数据
      setIsCreateModalOpen(false);
      setCreateForm({
        skuId: "",
        qty: "",
        warehouseId: "",
        warehouse: "",
        destination: "",
        reason: ""
      });
    } catch (error: any) {
      console.error("创建出库单失败:", error);
      toast.error(error.message || "创建失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 打开出库批次模态框
  const handleOpenBatchModal = (outbound: OutboundOrder) => {
    setSelectedOutbound(outbound);
    const remainingQty = outbound.qty - outbound.shippedQty;
    setBatchForm({
      qty: remainingQty > 0 ? remainingQty.toString() : "",
      shippedDate: new Date().toISOString().slice(0, 10),
      destination: outbound.destination || "",
      trackingNumber: "",
      notes: ""
    });
    setIsBatchModalOpen(true);
  };

  // 提交出库批次
  const handleSubmitBatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    
    if (!selectedOutbound) return;

    const qty = Number(batchForm.qty);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error("请输入有效的出库数量");
      return;
    }

    const remainingQty = selectedOutbound.qty - selectedOutbound.shippedQty;
    if (qty > remainingQty) {
      toast.error(`出库数量不能超过剩余数量（${remainingQty}）`);
      return;
    }

    setIsSubmitting(true);

    try {
      const body = {
        outboundId: selectedOutbound.id,
        batchNumber: `BATCH-${Date.now()}`,
        warehouseId: selectedOutbound.warehouseId,
        qty,
        shippedDate: batchForm.shippedDate,
        destination: batchForm.destination.trim() || undefined,
        trackingNumber: batchForm.trackingNumber.trim() || undefined,
        notes: batchForm.notes.trim() || undefined
      };

      const response = await fetch('/api/outbound-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建失败');
      }

      toast.success("出库批次已创建");
      mutateOutboundOrders(); // 刷新数据
      setIsBatchModalOpen(false);
      setBatchForm({
        qty: "",
        shippedDate: new Date().toISOString().slice(0, 10),
        destination: "",
        trackingNumber: "",
        notes: ""
      });
    } catch (error: any) {
      console.error("创建出库批次失败:", error);
      toast.error(error.message || "创建失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 查看详情
  const handleViewDetail = (outbound: OutboundOrder) => {
    setDetailOutbound(outbound);
    setIsDetailModalOpen(true);
  };

  // 导出数据
  const handleExportData = () => {
    const csvRows = [
      ["出库单号", "SKU", "出库数量", "已出库数量", "仓库", "目的地", "状态", "出库原因", "创建时间"].join(",")
    ];

    filteredOutbound.forEach((o) => {
      csvRows.push([
        o.outboundNumber,
        o.sku,
        o.qty.toString(),
        o.shippedQty.toString(),
        o.warehouse,
        o.destination || "",
        o.status,
        o.reason || "",
        formatDate(o.createdAt)
      ].join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `出库单列表_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("数据已导出");
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="出库管理"
        description="管理出库批次，支持分批出库，处理销售订单、调拨等出库需求"
        actions={
          <div className="flex gap-2">
            <ActionButton onClick={() => setIsCreateModalOpen(true)} variant="primary" icon={Plus}>
              创建出库单
            </ActionButton>
            <ActionButton onClick={handleExportData} variant="secondary" icon={Download}>
              导出数据
            </ActionButton>
          </div>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard title="出库单总数" value={stats.total} icon={Package} />
        <StatCard title="待出库" value={stats.pending} icon={Clock} />
        <StatCard title="部分出库" value={stats.partial} icon={AlertCircle} />
        <StatCard title="已完成" value={stats.completed} icon={CheckCircle2} />
        <StatCard title="总数量" value={stats.totalQty} icon={Package} />
        <StatCard title="已出库" value={stats.shippedQty} icon={CheckCircle2} />
        <StatCard title="待出库" value={stats.pendingQty} icon={Clock} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索出库单号、SKU、目的地..."
        />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="待出库">待出库</option>
            <option value="部分出库">部分出库</option>
            <option value="已出库">已出库</option>
            <option value="已取消">已取消</option>
          </select>
        </div>

        {warehouseNames.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">仓库：</span>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
            >
              <option value="all">全部</option>
              {warehouseNames.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 出库单列表 */}
      {filteredOutbound.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无出库单"
          description='点击"创建出库单"按钮创建新的出库单'
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">出库单号</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">SKU</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">仓库</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">目的地</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">出库数量</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">已出库数量</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">状态</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredOutbound.map((outbound) => {
                const remainingQty = outbound.qty - outbound.shippedQty;
                const statusColors = STATUS_COLORS[outbound.status] || STATUS_COLORS["待出库"];

                return (
                  <tr key={outbound.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-200 font-medium">{outbound.outboundNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{outbound.sku}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{outbound.warehouse}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{outbound.destination || "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{outbound.qty}</td>
                    <td className="px-4 py-3 text-sm text-emerald-300 text-right font-medium">
                      {outbound.shippedQty}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors.bg} ${statusColors.text}`}>
                        {outbound.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <ActionButton
                          onClick={() => handleViewDetail(outbound)}
                          variant="secondary"
                          size="sm"
                          icon={Eye}
                        >
                          详情
                        </ActionButton>
                        {remainingQty > 0 && (
                          <ActionButton
                            onClick={() => handleOpenBatchModal(outbound)}
                            variant="primary"
                            size="sm"
                            icon={ArrowRight}
                          >
                            出库
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 创建出库单模态框 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">创建出库单</h2>
                <p className="text-sm text-slate-400 mt-1">创建新的出库单</p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOutbound} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">产品 *</span>
                <select
                  value={createForm.skuId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, skuId: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                >
                  <option value="">请选择产品</option>
                  {productsData.filter((p: any) => (p.at_domestic || 0) > 0).map((p: any) => (
                    <option key={p.sku_id} value={p.sku_id}>
                      {p.sku_id} / {p.name} (可用库存: {p.at_domestic || 0})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">出库数量 *</span>
                <input
                  type="number"
                  min={1}
                  value={createForm.qty}
                  onChange={(e) => setCreateForm((f) => ({ ...f, qty: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">出库仓库 *</span>
                <select
                  value={createForm.warehouseId}
                  onChange={(e) => {
                    const selectedWarehouse = warehouses.find((w: any) => w.id === e.target.value);
                    setCreateForm((f) => ({ 
                      ...f, 
                      warehouseId: e.target.value,
                      warehouse: selectedWarehouse?.name || ""
                    }));
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                >
                  <option value="">请选择仓库</option>
                  {warehouses.filter((w: any) => w.isActive).map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.code ? `(${w.code})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">目的地</span>
                <input
                  type="text"
                  value={createForm.destination}
                  onChange={(e) => setCreateForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选：出库目的地"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">出库原因</span>
                <input
                  type="text"
                  value={createForm.reason}
                  onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选：如销售订单、调拨等"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  创建出库单
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 出库批次模态框 */}
      {isBatchModalOpen && selectedOutbound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">创建出库批次</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {selectedOutbound.outboundNumber} · 剩余数量：{selectedOutbound.qty - selectedOutbound.shippedQty}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsBatchModalOpen(false);
                  setSelectedOutbound(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBatch} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">出库数量 *</span>
                <input
                  type="number"
                  min={1}
                  max={selectedOutbound.qty - selectedOutbound.shippedQty}
                  value={batchForm.qty}
                  onChange={(e) => setBatchForm((f) => ({ ...f, qty: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                />
                <p className="text-xs text-slate-500">
                  最多可出库：{selectedOutbound.qty - selectedOutbound.shippedQty} 件
                </p>
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">出库日期 *</span>
                <input
                  type="date"
                  value={batchForm.shippedDate}
                  onChange={(e) => setBatchForm((f) => ({ ...f, shippedDate: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">物流单号</span>
                <input
                  type="text"
                  value={batchForm.trackingNumber}
                  onChange={(e) => setBatchForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选：物流跟踪单号"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">备注</span>
                <textarea
                  value={batchForm.notes}
                  onChange={(e) => setBatchForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选：记录本次出库的特殊说明"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => {
                    setIsBatchModalOpen(false);
                    setSelectedOutbound(null);
                  }}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  确认出库
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 详情模态框 */}
      {isDetailModalOpen && detailOutbound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">出库单详情</h2>
                <p className="text-sm text-slate-400 mt-1">{detailOutbound.outboundNumber}</p>
              </div>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setDetailOutbound(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">出库单号：</span>
                  <span className="text-slate-200 ml-2">{detailOutbound.outboundNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400">SKU：</span>
                  <span className="text-slate-200 ml-2">{detailOutbound.sku}</span>
                </div>
                <div>
                  <span className="text-slate-400">仓库：</span>
                  <span className="text-slate-200 ml-2">{detailOutbound.warehouse}</span>
                </div>
                <div>
                  <span className="text-slate-400">目的地：</span>
                  <span className="text-slate-200 ml-2">{detailOutbound.destination || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400">出库数量：</span>
                  <span className="text-slate-200 ml-2">{detailOutbound.qty}</span>
                </div>
                <div>
                  <span className="text-slate-400">已出库数量：</span>
                  <span className="text-emerald-300 ml-2 font-medium">{detailOutbound.shippedQty}</span>
                </div>
                <div>
                  <span className="text-slate-400">状态：</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${STATUS_COLORS[detailOutbound.status].bg} ${STATUS_COLORS[detailOutbound.status].text}`}>
                    {detailOutbound.status}
                  </span>
                </div>
                {detailOutbound.reason && (
                  <div>
                    <span className="text-slate-400">出库原因：</span>
                    <span className="text-slate-200 ml-2">{detailOutbound.reason}</span>
                  </div>
                )}
              </div>

              {/* 出库批次列表 */}
              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">出库批次记录</h3>
                {(() => {
                  const outboundBatches = detailOutbound.batches || [];
                  if (outboundBatches.length === 0) {
                    return <p className="text-sm text-slate-500">暂无出库批次</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {outboundBatches.map((batch) => (
                        <div key={batch.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-slate-200">{batch.batchNumber}</div>
                              <div className="text-xs text-slate-400 mt-1">
                                {batch.warehouse} · {formatDate(batch.shippedDate)}
                                {batch.trackingNumber && ` · ${batch.trackingNumber}`}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-emerald-300">{batch.qty} 件</div>
                            </div>
                          </div>
                          {batch.notes && (
                            <div className="mt-2 text-xs text-slate-500">{batch.notes}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
