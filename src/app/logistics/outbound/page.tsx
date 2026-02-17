"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { 
  Package, Download, Eye, CheckCircle2, 
  Clock, Truck, X, ArrowRight 
} from "lucide-react";
import { 
  PageHeader, StatCard, ActionButton, 
  SearchBar, EmptyState 
} from "@/components/ui";
import {
  useOutboundOrders,
  useWarehouses,
  formatDate
} from "@/logistics/hooks";
import type { OutboundOrder, Warehouse as WarehouseType } from "@/logistics/types";

// 扩展出库单类型（含展示用字段）
interface OutboundItem extends OutboundOrder {
  outboundNumber: string;      // 出库单号
  skuId?: string;             // SKU ID
  destination?: string;       // 目的地
}

// 状态颜色配置
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "待出库": { bg: "bg-slate-500/20", text: "text-slate-300" },
  "部分出库": { bg: "bg-amber-500/20", text: "text-amber-300" },
  "已出库": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "已取消": { bg: "bg-rose-500/20", text: "text-rose-300" }
};

// 状态标签
const STATUS_LABELS: Record<string, string> = {
  "待出库": "待出库",
  "部分出库": "部分出库",
  "已出库": "已出库",
  "已取消": "已取消"
};

export default function OutboundPage() {
  // 使用统一 Hooks
  const { outboundOrders = [], isLoading, mutate } = useOutboundOrders();
  const { warehouses } = useWarehouses();

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // 详情 Modal 状态
  const [detailModal, setDetailModal] = useState<OutboundItem | null>(null);

  // 统计信息
  const stats = useMemo(() => ({
    total: outboundOrders.length,
    pending: outboundOrders.filter(o => o.status === "待出库").length,
    partial: outboundOrders.filter(o => o.status === "部分出库").length,
    shipped: outboundOrders.filter(o => o.status === "已出库").length,
    pendingQty: outboundOrders.reduce((sum, o) => sum + (o.qty - o.shippedQty), 0)
  }), [outboundOrders]);

  // 筛选订单
  const filteredOrders = useMemo(() => {
    let result = [...outboundOrders];

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter(o => o.status === filterStatus);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter(o =>
        o.outboundNumber?.toLowerCase().includes(keyword) ||
        o.sku?.toLowerCase().includes(keyword) ||
        o.warehouseName?.toLowerCase().includes(keyword)
      );
    }

    return result.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [outboundOrders, filterStatus, searchKeyword]);

  // 查看详情
  const handleViewDetail = (order: OutboundOrder) => {
    setDetailModal(order as OutboundItem);
  };

  // 关闭详情
  const handleCloseDetail = () => {
    setDetailModal(null);
  };

  // 出库操作
  const handleShip = async (order: OutboundOrder) => {
    const remaining = order.qty - order.shippedQty;
    const confirmQty = prompt(`当前待出库数量: ${remaining}\n请输入出库数量:`, remaining.toString());
    
    if (!confirmQty || isNaN(Number(confirmQty))) return;
    
    const qty = Math.min(Number(confirmQty), remaining);
    
    try {
      const response = await fetch(`/api/outbound-orders/${order.id}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippedQty: qty })
      });

      if (!response.ok) throw new Error("出库失败");
      
      toast.success(`出库成功，出库数量: ${qty}`);
      mutate();
    } catch (error) {
      toast.error("出库失败，请重试");
    }
  };

  // 导出数据
  const handleExport = () => {
    const headers = ["出库单号", "SKU", "计划数量", "已出库", "待出库", "仓库", "状态", "创建时间"];
    const rows = filteredOrders.map(o => [
      o.outboundNumber || "",
      o.sku,
      o.qty.toString(),
      o.shippedQty.toString(),
      (o.qty - o.shippedQty).toString(),
      o.warehouseName || "",
      o.status,
      formatDate(o.createdAt)
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
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
        description="管理出库批次，跟踪出库进度"
        actions={
          <div className="flex gap-2">
            <ActionButton onClick={handleExport} variant="secondary" icon={Download}>
              导出数据
            </ActionButton>
          </div>
        }
      />

      {/* 统计面板 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="待出库" value={stats.pending} icon={Clock} />
        <StatCard title="部分出库" value={stats.partial} icon={Package} />
        <StatCard title="已出库" value={stats.shipped} icon={CheckCircle2} />
        <StatCard title="待出库数量" value={stats.pendingQty} icon={Truck} />
        <StatCard title="总单数" value={stats.total} icon={Package} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索出库单号、SKU、仓库..."
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部状态</option>
          <option value="待出库">待出库</option>
          <option value="部分出库">部分出库</option>
          <option value="已出库">已出库</option>
          <option value="已取消">已取消</option>
        </select>
      </div>

      {/* 出库单列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无出库单"
          description="暂无符合条件的出库单"
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <OutboundCard
              key={order.id}
              order={order as OutboundItem}
              onView={() => handleViewDetail(order)}
              onShip={() => handleShip(order)}
            />
          ))}
        </div>
      )}

      {/* 详情 Modal */}
      {detailModal && (
        <OutboundDetailModal
          order={detailModal}
          warehouses={warehouses}
          onClose={handleCloseDetail}
          onShip={() => {
            handleShip(detailModal);
            handleCloseDetail();
          }}
        />
      )}
    </div>
  );
}

// ==================== 出库单卡片组件 ====================

interface OutboundCardProps {
  order: OutboundItem;
  onView: () => void;
  onShip: () => void;
}

function OutboundCard({ order, onView, onShip }: OutboundCardProps) {
  const colors = STATUS_COLORS[order.status] || STATUS_COLORS["待出库"];
  const remaining = order.qty - order.shippedQty;
  const progress = order.qty > 0 ? Math.round((order.shippedQty / order.qty) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:bg-slate-800/40 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* 头部信息 */}
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-2 py-1 rounded text-xs ${colors.bg} ${colors.text}`}>
              {STATUS_LABELS[order.status]}
            </span>
            <span className="text-sm text-slate-400">出库单号：</span>
            <span className="text-sm font-medium text-slate-200">{order.outboundNumber || "-"}</span>
          </div>

          {/* 商品信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <span className="text-xs text-slate-500 block">SKU</span>
              <span className="text-sm text-slate-300">{order.sku}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">仓库</span>
              <span className="text-sm text-slate-300">{order.warehouseName || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">目的地</span>
              <span className="text-sm text-slate-300">{order.destination || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">创建时间</span>
              <span className="text-sm text-slate-300">{formatDate(order.createdAt)}</span>
            </div>
          </div>

          {/* 数量进度 */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">出库进度</span>
              <span className="text-slate-300">
                {order.shippedQty} / {order.qty} ({progress}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 ml-4">
          <button
            onClick={onView}
            className="p-2 rounded-lg text-slate-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors"
            title="查看详情"
          >
            <Eye className="h-5 w-5" />
          </button>
          {remaining > 0 && order.status !== "已取消" && order.status !== "已出库" && (
            <button
              onClick={onShip}
              className="p-2 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
              title="出库"
            >
              <CheckCircle2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 详情 Modal ====================

interface OutboundDetailModalProps {
  order: OutboundItem;
  warehouses: WarehouseType[];
  onClose: () => void;
  onShip: () => void;
}

function OutboundDetailModal({ order, warehouses, onClose, onShip }: OutboundDetailModalProps) {
  const colors = STATUS_COLORS[order.status] || STATUS_COLORS["待出库"];
  const remaining = order.qty - order.shippedQty;
  const progress = order.qty > 0 ? Math.round((order.shippedQty / order.qty) * 100) : 0;
  const warehouse = warehouses.find(w => w.id === order.warehouseId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-100">出库单详情</h2>
            <span className={`px-2 py-1 rounded text-xs ${colors.bg} ${colors.text}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <span className="text-xs text-slate-500 block">出库单号</span>
            <span className="text-sm text-slate-200">{order.outboundNumber || "-"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">SKU</span>
            <span className="text-sm text-slate-200">{order.sku}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">仓库</span>
            <span className="text-sm text-slate-200">{warehouse?.name || order.warehouseName || "-"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">目的地</span>
            <span className="text-sm text-slate-200">{order.destination || "-"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">计划数量</span>
            <span className="text-sm text-slate-200">{order.qty}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">已出库</span>
            <span className="text-sm text-slate-200">{order.shippedQty}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">待出库</span>
            <span className="text-sm text-slate-200">{remaining}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">创建时间</span>
            <span className="text-sm text-slate-200">{formatDate(order.createdAt)}</span>
          </div>
        </div>

        {/* 进度条 */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">出库进度</span>
            <span className="text-slate-300">{progress}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 批次信息 */}
        {order.batches && order.batches.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-300 mb-2">出库批次</h3>
            <div className="space-y-2">
              {order.batches.map((batch) => (
                <div key={batch.id} className="p-3 rounded-lg bg-slate-800/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">批次号: {batch.batchNumber}</span>
                    <span className="text-slate-300">{batch.qty} 件</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    出库日期: {formatDate(batch.shippedDate)}
                    {batch.trackingNumber && ` · 物流单号: ${batch.trackingNumber}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
          <ActionButton onClick={onClose} variant="secondary">
            关闭
          </ActionButton>
          {remaining > 0 && order.status !== "已取消" && order.status !== "已出库" && (
            <ActionButton onClick={onShip} variant="primary" icon={CheckCircle2}>
              立即出库 ({remaining})
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}
