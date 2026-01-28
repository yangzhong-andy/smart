"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Package, Plus, Search, X, Download, Eye, CheckCircle2, Clock, AlertCircle, Warehouse, Truck } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import useSWR from "swr";

// 待入库单类型
type PendingInbound = {
  id: string;
  inboundNumber: string;
  deliveryOrderId: string;
  deliveryNumber: string;
  contractId: string;
  contractNumber: string;
  sku: string;
  skuId?: string;
  qty: number;
  receivedQty: number;
  domesticTrackingNumber?: string;
  shippedDate?: string;
  status: "待入库" | "部分入库" | "已入库" | "已取消";
  createdAt: string;
  updatedAt: string;
  batches?: InboundBatch[];
};

// 入库批次类型
type InboundBatch = {
  id: string;
  inboundId: string;
  batchNumber: string;
  warehouse: string;
  warehouseId: string;
  qty: number;
  receivedDate: string;
  notes?: string;
  createdAt: string;
};

type DeliveryOrder = {
  id: string;
  deliveryNumber: string;
  [key: string]: any;
};

type PurchaseContract = {
  id: string;
  contractNumber: string;
  [key: string]: any;
};

type Product = {
  id: string;
  skuId: string;
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
  "待入库": { bg: "bg-slate-500/20", text: "text-slate-300" },
  "部分入库": { bg: "bg-amber-500/20", text: "text-amber-300" },
  "已入库": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "已取消": { bg: "bg-rose-500/20", text: "text-rose-300" }
};

export default function InboundPage() {
  // 使用 SWR 获取数据
  const { data: pendingInboundData = [], mutate: mutatePendingInbound } = useSWR<PendingInbound[]>('/api/pending-inbound', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  const { data: deliveryOrders = [] } = useSWR<DeliveryOrder[]>('/api/delivery-orders', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  const { data: contracts = [] } = useSWR<PurchaseContract[]>('/api/purchase-contracts', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  const { data: warehouses = [] } = useSWR<any[]>('/api/warehouses', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000, // 10分钟内去重
  });
  
  // 从待入库单数据中提取批次
  const batches = useMemo(() => {
    const allBatches: InboundBatch[] = [];
    pendingInboundData.forEach((inbound) => {
      if (inbound.batches) {
        allBatches.push(...inbound.batches);
      }
    });
    return allBatches;
  }, [pendingInboundData]);
  
  // 搜索和筛选
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterWarehouse, setFilterWarehouse] = useState<string>("all");
  
  // 模态框状态
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedInbound, setSelectedInbound] = useState<PendingInbound | null>(null);
  const [batchForm, setBatchForm] = useState({
    warehouseId: "",
    warehouse: "",
    qty: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    notes: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 详情模态框
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailInbound, setDetailInbound] = useState<PendingInbound | null>(null);

  // 统计信息
  const stats = useMemo(() => {
    const total = pendingInboundData.length;
    const pending = pendingInboundData.filter((i) => i.status === "待入库").length;
    const partial = pendingInboundData.filter((i) => i.status === "部分入库").length;
    const completed = pendingInboundData.filter((i) => i.status === "已入库").length;
    const totalQty = pendingInboundData.reduce((sum, i) => sum + i.qty, 0);
    const receivedQty = pendingInboundData.reduce((sum, i) => sum + i.receivedQty, 0);
    const pendingQty = totalQty - receivedQty;

    return {
      total,
      pending,
      partial,
      completed,
      totalQty,
      receivedQty,
      pendingQty
    };
  }, [pendingInboundData]);

  // 获取所有仓库名称列表（用于筛选）
  const warehouseNames = useMemo(() => {
    const warehouseSet = new Set<string>();
    batches.forEach((b) => {
      if (b.warehouse) warehouseSet.add(b.warehouse);
    });
    return Array.from(warehouseSet).sort();
  }, [batches]);

  // 筛选待入库单
  const filteredInbound = useMemo(() => {
    let result = [...pendingInboundData];

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((i) => i.status === filterStatus);
    }

    // 仓库筛选（通过批次）
    if (filterWarehouse !== "all") {
      const inboundIdsWithWarehouse = new Set(
        batches.filter((b) => b.warehouse === filterWarehouse).map((b) => b.inboundId)
      );
      result = result.filter((i) => inboundIdsWithWarehouse.has(i.id));
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((i) => {
        const contract = contracts.find((c) => c.id === i.contractId);
        return (
          i.inboundNumber.toLowerCase().includes(keyword) ||
          i.deliveryNumber.toLowerCase().includes(keyword) ||
          i.contractNumber.toLowerCase().includes(keyword) ||
          i.sku.toLowerCase().includes(keyword) ||
          contract?.supplierName?.toLowerCase().includes(keyword) ||
          i.domesticTrackingNumber?.toLowerCase().includes(keyword)
        );
      });
    }

    // 按创建时间倒序
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [pendingInboundData, contracts, batches, filterStatus, filterWarehouse, searchKeyword]);

  // 打开入库批次模态框
  const handleOpenBatchModal = (inbound: PendingInbound) => {
    setSelectedInbound(inbound);
    const remainingQty = inbound.qty - inbound.receivedQty;
    setBatchForm({
      warehouseId: "",
      warehouse: "",
      qty: remainingQty > 0 ? remainingQty.toString() : "",
      receivedDate: new Date().toISOString().slice(0, 10),
      notes: ""
    });
    setIsBatchModalOpen(true);
  };

  // 提交入库批次
  const handleSubmitBatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    
    if (!selectedInbound) return;

    const qty = Number(batchForm.qty);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error("请输入有效的入库数量");
      return;
    }

    const remainingQty = selectedInbound.qty - selectedInbound.receivedQty;
    if (qty > remainingQty) {
      toast.error(`入库数量不能超过剩余数量（${remainingQty}）`);
      return;
    }

    if (!batchForm.warehouseId) {
      toast.error("请选择入库仓库");
      return;
    }

    setIsSubmitting(true);

    try {
      const body = {
        inboundId: selectedInbound.id,
        batchNumber: `BATCH-${Date.now()}`,
        warehouseId: batchForm.warehouseId,
        qty,
        receivedDate: batchForm.receivedDate,
        notes: batchForm.notes.trim() || undefined
      };

      const response = await fetch('/api/inbound-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建失败');
      }

      toast.success("入库批次已创建");
      mutatePendingInbound(); // 刷新数据
      setIsBatchModalOpen(false);
      setBatchForm({
        warehouseId: "",
        warehouse: "",
        qty: "",
        receivedDate: new Date().toISOString().slice(0, 10),
        notes: ""
      });
    } catch (error: any) {
      console.error("创建入库批次失败:", error);
      toast.error(error.message || "创建失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 查看详情
  const handleViewDetail = (inbound: PendingInbound) => {
    setDetailInbound(inbound);
    setIsDetailModalOpen(true);
  };

  // 导出数据
  const handleExportData = () => {
    const csvRows = [
      ["入库单号", "拿货单号", "合同编号", "SKU", "待入库数量", "已入库数量", "状态", "国内物流单号", "创建时间"].join(",")
    ];

    filteredInbound.forEach((i) => {
      csvRows.push([
        i.inboundNumber,
        i.deliveryNumber,
        i.contractNumber,
        i.sku,
        i.qty.toString(),
        i.receivedQty.toString(),
        i.status,
        i.domesticTrackingNumber || "",
        formatDate(i.createdAt)
      ].join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `入库单列表_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast.success("数据已导出");
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="国内入库"
        description="管理入库批次，支持分批入库，将采购单与国内仓、海外仓、TikTok Shop 销售联动起来"
        actions={
          <ActionButton onClick={handleExportData} variant="secondary" icon={Download}>
            导出数据
          </ActionButton>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard title="待入库单总数" value={stats.total} icon={Package} />
        <StatCard title="待入库" value={stats.pending} icon={Clock} />
        <StatCard title="部分入库" value={stats.partial} icon={AlertCircle} />
        <StatCard title="已完成" value={stats.completed} icon={CheckCircle2} />
        <StatCard title="总数量" value={stats.totalQty} icon={Package} />
        <StatCard title="已入库" value={stats.receivedQty} icon={CheckCircle2} />
        <StatCard title="待入库" value={stats.pendingQty} icon={Clock} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索入库单号、拿货单号、合同编号、SKU..."
        />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="待入库">待入库</option>
            <option value="部分入库">部分入库</option>
            <option value="已入库">已入库</option>
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

      {/* 待入库单列表 */}
      {filteredInbound.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无待入库单"
          description="当创建拿货单后，系统会自动生成待入库单"
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">入库单号</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">拿货单号</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">合同编号</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">SKU</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">待入库数量</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">已入库数量</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">状态</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredInbound.map((inbound) => {
                const contract = contracts.find((c) => c.id === inbound.contractId);
                const inboundBatches = inbound.batches || [];
                const remainingQty = inbound.qty - inbound.receivedQty;
                const statusColors = STATUS_COLORS[inbound.status] || STATUS_COLORS["待入库"];

                return (
                  <tr key={inbound.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-200 font-medium">{inbound.inboundNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{inbound.deliveryNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{inbound.contractNumber}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{inbound.sku}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 text-right">{inbound.qty}</td>
                    <td className="px-4 py-3 text-sm text-emerald-300 text-right font-medium">
                      {inbound.receivedQty}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${statusColors.bg} ${statusColors.text}`}>
                        {inbound.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <ActionButton
                          onClick={() => handleViewDetail(inbound)}
                          variant="secondary"
                          size="sm"
                          icon={Eye}
                        >
                          详情
                        </ActionButton>
                        {remainingQty > 0 && (
                          <ActionButton
                            onClick={() => handleOpenBatchModal(inbound)}
                            variant="primary"
                            size="sm"
                            icon={Plus}
                          >
                            入库
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

      {/* 入库批次模态框 */}
      {isBatchModalOpen && selectedInbound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">创建入库批次</h2>
                <p className="text-sm text-slate-400 mt-1">
                  {selectedInbound.inboundNumber} · 剩余数量：{selectedInbound.qty - selectedInbound.receivedQty}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsBatchModalOpen(false);
                  setSelectedInbound(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBatch} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">入库仓库 *</span>
                <select
                  value={batchForm.warehouseId}
                  onChange={(e) => {
                    const selectedWarehouse = warehouses.find((w: any) => w.id === e.target.value);
                    setBatchForm((f) => ({ 
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
                <span className="text-sm text-slate-300">入库数量 *</span>
                <input
                  type="number"
                  min={1}
                  max={selectedInbound.qty - selectedInbound.receivedQty}
                  value={batchForm.qty}
                  onChange={(e) => setBatchForm((f) => ({ ...f, qty: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                />
                <p className="text-xs text-slate-500">
                  最多可入库：{selectedInbound.qty - selectedInbound.receivedQty} 件
                </p>
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">入库日期 *</span>
                <input
                  type="date"
                  value={batchForm.receivedDate}
                  onChange={(e) => setBatchForm((f) => ({ ...f, receivedDate: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">备注</span>
                <textarea
                  value={batchForm.notes}
                  onChange={(e) => setBatchForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选：记录本次入库的特殊说明"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => {
                    setIsBatchModalOpen(false);
                    setSelectedInbound(null);
                  }}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  确认入库
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 详情模态框 */}
      {isDetailModalOpen && detailInbound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">入库单详情</h2>
                <p className="text-sm text-slate-400 mt-1">{detailInbound.inboundNumber}</p>
              </div>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setDetailInbound(null);
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
                  <span className="text-slate-400">入库单号：</span>
                  <span className="text-slate-200 ml-2">{detailInbound.inboundNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400">拿货单号：</span>
                  <span className="text-slate-200 ml-2">{detailInbound.deliveryNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400">合同编号：</span>
                  <span className="text-slate-200 ml-2">{detailInbound.contractNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400">SKU：</span>
                  <span className="text-slate-200 ml-2">{detailInbound.sku}</span>
                </div>
                <div>
                  <span className="text-slate-400">待入库数量：</span>
                  <span className="text-slate-200 ml-2">{detailInbound.qty}</span>
                </div>
                <div>
                  <span className="text-slate-400">已入库数量：</span>
                  <span className="text-emerald-300 ml-2 font-medium">{detailInbound.receivedQty}</span>
                </div>
                <div>
                  <span className="text-slate-400">状态：</span>
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${STATUS_COLORS[detailInbound.status].bg} ${STATUS_COLORS[detailInbound.status].text}`}>
                    {detailInbound.status}
                  </span>
                </div>
                {detailInbound.domesticTrackingNumber && (
                  <div>
                    <span className="text-slate-400">国内物流单号：</span>
                    <span className="text-slate-200 ml-2">{detailInbound.domesticTrackingNumber}</span>
                  </div>
                )}
              </div>

              {/* 入库批次列表 */}
              <div className="pt-4 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">入库批次记录</h3>
                {(() => {
                  const inboundBatches = detailInbound.batches || [];
                  if (inboundBatches.length === 0) {
                    return <p className="text-sm text-slate-500">暂无入库批次</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {inboundBatches.map((batch) => (
                        <div key={batch.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-slate-200">{batch.batchNumber}</div>
                              <div className="text-xs text-slate-400 mt-1">
                                {batch.warehouse} · {formatDate(batch.receivedDate)}
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
