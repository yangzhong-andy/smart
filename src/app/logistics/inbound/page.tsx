"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { 
  Package, Plus, Download, Eye, CheckCircle2, 
  Clock, AlertCircle, Warehouse, X 
} from "lucide-react";
import { 
  PageHeader, StatCard, ActionButton, 
  SearchBar, EmptyState 
} from "@/components/ui";
import {
  useInboundOrders,
  useWarehouses,
  formatDate
} from "@/logistics/hooks";
import type { InboundOrder, Warehouse as WarehouseType } from "@/logistics/types";
import { INBOUND_STATUS_LABELS } from "@/logistics/constants";

// 待入库单类型（扩展）
interface InboundItem extends InboundOrder {
  deliveryNumber: string;      // 拿货单号
  contractNumber?: string;     // 合同编号
  skuId?: string;             // SKU ID
}

// 表单数据类型
interface InboundFormData {
  inboundNumber: string;
  deliveryNumber: string;
  sku: string;
  skuId?: string;
  qty: string;
  receivedQty: string;
  warehouseId: string;
  warehouseName: string;
  expectedDate: string;
  notes: string;
}

// 初始表单数据
const initialFormData: InboundFormData = {
  inboundNumber: "",
  deliveryNumber: "",
  sku: "",
  skuId: "",
  qty: "",
  receivedQty: "0",
  warehouseId: "",
  warehouseName: "",
  expectedDate: "",
  notes: ""
};

// 状态颜色配置
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "待入库": { bg: "bg-slate-500/20", text: "text-slate-300" },
  "部分入库": { bg: "bg-amber-500/20", text: "text-amber-300" },
  "已入库": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "已取消": { bg: "bg-rose-500/20", text: "text-rose-300" }
};

export default function InboundPage() {
  // 使用统一 Hooks
  const { inboundOrders, isLoading, mutate } = useInboundOrders();
  const { warehouses } = useWarehouses();

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Modal 状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<InboundItem | null>(null);
  const [form, setForm] = useState<InboundFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 统计信息
  const stats = useMemo(() => ({
    total: inboundOrders.length,
    pending: inboundOrders.filter((i: InboundOrder) => i.status === "待入库").length,
    partial: inboundOrders.filter((i: InboundOrder) => i.status === "部分入库").length,
    completed: inboundOrders.filter((i: InboundOrder) => i.status === "已入库").length,
    pendingQty: inboundOrders.reduce((sum: number, i: InboundOrder) => sum + (i.qty - i.receivedQty), 0)
  }), [inboundOrders]);

  // 筛选订单
  const filteredOrders = useMemo(() => {
    let result = [...inboundOrders];

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((i: InboundOrder) => i.status === filterStatus);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((i: InboundOrder) =>
        i.inboundNumber.toLowerCase().includes(keyword) ||
        i.deliveryNumber?.toLowerCase().includes(keyword) ||
        i.sku?.toLowerCase().includes(keyword)
      );
    }

    return result.sort((a: InboundOrder, b: InboundOrder) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [inboundOrders, filterStatus, searchKeyword]);

  // 打开详情 Modal
  const handleViewDetail = (order: InboundOrder) => {
    setDetailModal(order as InboundItem);
  };

  // 关闭详情 Modal
  const handleCloseDetail = () => {
    setDetailModal(null);
  };

  // 处理入库
  const handleReceive = async (order: InboundOrder) => {
    const remaining = order.qty - order.receivedQty;
    const confirmQty = prompt(`当前待入库数量: ${remaining}\n请输入入库数量:`, remaining.toString());

    if (!confirmQty || isNaN(Number(confirmQty))) return;

    const qty = Math.min(Math.max(0, Number(confirmQty)), remaining);
    if (qty <= 0) {
      toast.error("入库数量需大于 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const body: { receivedQty: number; warehouseId?: string } = { receivedQty: qty };
      if (warehouses.length > 0) body.warehouseId = warehouses[0].id;

      const response = await fetch(`/api/pending-inbound/${order.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error((data as { error?: string }).error || "入库失败");
      }

      toast.success(`入库成功，入库数量: ${qty}。库存已增加，待入库单已更新。`);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "入库失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 导出数据
  const handleExport = () => {
    const headers = ["入库单号", "拿货单号", "SKU", "计划数量", "已入库", "待入库", "状态", "创建时间"];
    const rows = filteredOrders.map((i: InboundOrder) => [
      i.inboundNumber,
      i.deliveryNumber || "",
      i.sku,
      i.qty.toString(),
      i.receivedQty.toString(),
      (i.qty - i.receivedQty).toString(),
      i.status,
      formatDate(i.createdAt)
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
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
        description="管理入库批次，跟踪入库进度"
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
        <StatCard title="待入库总数" value={stats.pending} icon={Clock} />
        <StatCard title="部分入库" value={stats.partial} icon={Package} />
        <StatCard title="已入库" value={stats.completed} icon={CheckCircle2} />
        <StatCard title="待入库数量" value={stats.pendingQty} icon={Package} />
        <StatCard title="总单数" value={stats.total} icon={Package} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索入库单号、拿货单号、SKU..."
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部状态</option>
          <option value="待入库">待入库</option>
          <option value="部分入库">部分入库</option>
          <option value="已入库">已入库</option>
          <option value="已取消">已取消</option>
        </select>
      </div>

      {/* 入库单列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无入库单"
          description="暂无符合条件的入库单"
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <InboundCard
              key={order.id}
              order={order as InboundItem}
              warehouses={warehouses}
              isSubmitting={isSubmitting}
              onView={() => handleViewDetail(order)}
              onReceive={() => handleReceive(order)}
            />
          ))}
        </div>
      )}

      {/* 详情 Modal */}
      {detailModal && (
        <InboundDetailModal
          order={detailModal}
          warehouses={warehouses}
          isSubmitting={isSubmitting}
          onClose={handleCloseDetail}
          onReceive={() => {
            handleReceive(detailModal);
            handleCloseDetail();
          }}
        />
      )}
    </div>
  );
}

// ==================== 入库单卡片组件 ====================

interface InboundCardProps {
  order: InboundItem;
  warehouses: WarehouseType[];
  isSubmitting?: boolean;
  onView: () => void;
  onReceive: () => void;
}

function InboundCard({ order, warehouses, isSubmitting, onView, onReceive }: InboundCardProps) {
  const colors = STATUS_COLORS[order.status] || STATUS_COLORS["待入库"];
  const remaining = order.qty - order.receivedQty;
  const warehouse = warehouses.find((w: WarehouseType) => w.id === order.warehouseId);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:bg-slate-800/40 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* 头部信息 */}
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-2 py-1 rounded text-xs ${colors.bg} ${colors.text}`}>
              {order.status}
            </span>
            <span className="text-sm text-slate-400">入库单号：</span>
            <span className="text-sm font-medium text-slate-200">{order.inboundNumber}</span>
          </div>

          {/* 商品信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <span className="text-xs text-slate-500 block">拿货单号</span>
              <span className="text-sm text-slate-300">{order.deliveryNumber || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">SKU</span>
              <span className="text-sm text-slate-300">{order.sku}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">仓库</span>
              <span className="text-sm text-slate-300">{warehouse?.name || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">创建时间</span>
              <span className="text-sm text-slate-300">{formatDate(order.createdAt)}</span>
            </div>
          </div>

          {/* 数量进度 */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">入库进度</span>
              <span className="text-slate-300">
                {order.receivedQty} / {order.qty} ({Math.round((order.receivedQty / order.qty) * 100) || 0}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${(order.receivedQty / order.qty) * 100}%` }}
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
          {remaining > 0 && order.status !== "已取消" && (
            <button
              onClick={onReceive}
              disabled={isSubmitting}
              className="p-2 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="入库"
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

interface InboundDetailModalProps {
  order: InboundItem;
  warehouses: WarehouseType[];
  isSubmitting?: boolean;
  onClose: () => void;
  onReceive: () => void;
}

function InboundDetailModal({ order, warehouses, isSubmitting, onClose, onReceive }: InboundDetailModalProps) {
  const colors = STATUS_COLORS[order.status] || STATUS_COLORS["待入库"];
  const remaining = order.qty - order.receivedQty;
  const warehouse = warehouses.find((w: WarehouseType) => w.id === order.warehouseId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-100">入库单详情</h2>
            <span className={`px-2 py-1 rounded text-xs ${colors.bg} ${colors.text}`}>
              {order.status}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <span className="text-xs text-slate-500 block">入库单号</span>
            <span className="text-sm text-slate-200">{order.inboundNumber}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">拿货单号</span>
            <span className="text-sm text-slate-200">{order.deliveryNumber || "-"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">SKU</span>
            <span className="text-sm text-slate-200">{order.sku}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">仓库</span>
            <span className="text-sm text-slate-200">{warehouse?.name || "-"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">计划数量</span>
            <span className="text-sm text-slate-200">{order.qty}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">已入库</span>
            <span className="text-sm text-slate-200">{order.receivedQty}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">待入库</span>
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
            <span className="text-slate-400">入库进度</span>
            <span className="text-slate-300">
              {Math.round((order.receivedQty / order.qty) * 100) || 0}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
            <div 
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${(order.receivedQty / order.qty) * 100}%` }}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
          <ActionButton onClick={onClose} variant="secondary">
            关闭
          </ActionButton>
          {remaining > 0 && order.status !== "已取消" && (
            <ActionButton
              onClick={onReceive}
              variant="primary"
              icon={CheckCircle2}
              disabled={isSubmitting}
            >
              {isSubmitting ? "处理中..." : `立即入库 (${remaining})`}
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}
