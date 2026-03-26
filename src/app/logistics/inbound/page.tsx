"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { 
  Package, Plus, Download, Eye, CheckCircle2, 
  Clock, AlertCircle, Warehouse, X, Truck 
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
  items?: InboundItemSKU[];    // 多SKU明细
}

// 多SKU明细类型
interface InboundItemSKU {
  id: string;
  variantId?: string;
  sku: string;
  skuName?: string;
  spec?: string;
  qty: number;
  receivedQty: number;
  unitPrice?: number;
}

// 表单数据类型
interface InboundFormData {
  orderId: string;
  inboundNumber: string;
  deliveryNumber: string;
  sku: string;
  skuId?: string;
  qty: string;
  itemQtys: Record<string, number>;  // 多SKU实收数量
  warehouseId: string;
  warehouseName: string;
  expectedDate: string;
  notes: string;
}

// 初始表单数据
const initialFormData: InboundFormData = {
  orderId: "",
  inboundNumber: "",
  deliveryNumber: "",
  sku: "",
  skuId: "",
  qty: "",
  itemQtys: {},
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
  const [creatingOutboundId, setCreatingOutboundId] = useState<string | null>(null);

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
        i.sku?.toLowerCase().includes(keyword) ||
        i.productName?.toLowerCase().includes(keyword)
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

  // 处理入库 - 打开入库弹窗
  const handleReceive = (order: InboundOrder) => {
    const orderItems = (order as InboundItem).items;
    const itemQtys: Record<string, number> = {};
    
    if (orderItems && orderItems.length > 0) {
      // 多SKU：初始化每个SKU的数量为待入库数量
      for (const item of orderItems) {
        const remaining = item.qty - item.receivedQty;
        itemQtys[item.id] = remaining;
      }
    } else {
      // 单SKU
      const remaining = order.qty - order.receivedQty;
      itemQtys['single'] = remaining;
    }
    
    setForm({
      ...initialFormData,
      orderId: order.id,
      inboundNumber: order.inboundNumber,
      deliveryNumber: order.deliveryNumber || "",
      sku: order.sku,
      skuId: (order as any).skuId,
      qty: String(order.qty),
      itemQtys,
      warehouseId: warehouses[0]?.id ?? "",
      warehouseName: warehouses[0]?.name ?? "",
    });
    setIsModalOpen(true);
  };

  // 提交入库
  const handleReceiveSubmit = async () => {
    const order = inboundOrders.find((i: InboundOrder) => i.id === form.orderId);
    if (!order) return;

    // 检查是否填写了实收数量
    const hasValidQty = Object.values(form.itemQtys).some(qty => qty > 0);
    if (!hasValidQty) {
      toast.error("请填写至少一个SKU的实收数量");
      return;
    }

    setIsSubmitting(true);
    try {
      const body: { itemQtys: Record<string, number>; warehouseId?: string } = { 
        itemQtys: form.itemQtys 
      };
      if (form.warehouseId) body.warehouseId = form.warehouseId;

      const response = await fetch(`/api/pending-inbound/${order.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || "入库失败");
      }

      toast.success(`入库成功，库存已增加，待入库单已更新。`);
      setIsModalOpen(false);
      // 进度条/数量立即更新：SWR 在 dedupe 窗口内可能不立刻重拉，这里先做一次本地乐观更新
      const receivedDelta = Object.values(form.itemQtys).reduce(
        (sum, v) => sum + (Number(v) || 0),
        0
      );
      mutate(
        (current) => {
          const list = Array.isArray(current) ? current : [];
          return list.map((it) => {
            if (!it || (it as any).id !== order.id) return it;
            const oldReceived = Number((it as any).receivedQty) || 0;
            const planQty = Number((it as any).qty) || 0;
            const newReceivedQty = oldReceived + receivedDelta;
            const newStatus =
              newReceivedQty >= planQty ? "已入库" : (newReceivedQty > 0 ? "部分入库" : (it as any).status);
            const next: any = { ...(it as any), receivedQty: newReceivedQty, status: newStatus };
            if (Array.isArray((it as any).items)) {
              next.items = (it as any).items.map((row: any) => {
                const inc = Number(form.itemQtys?.[row.id]) || 0;
                if (inc <= 0) return row;
                return { ...row, receivedQty: (Number(row.receivedQty) || 0) + inc };
              });
            }
            return next;
          });
        },
        { revalidate: true }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "入库失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 一键生成出库单（已入库的单据）
  const handleCreateOutbound = async (order: InboundOrder) => {
    if (order.status !== "已入库") {
      toast.error("仅已入库的单据可生成出库单");
      return;
    }
    setCreatingOutboundId(order.id);
    try {
      const batchRes = await fetch(
        `/api/inbound-batches?pendingInboundId=${encodeURIComponent(order.id)}&pageSize=1`
      );
      const batchData = await batchRes.json().catch(() => ({}));
      const batches = Array.isArray(batchData?.data) ? batchData.data : [];
      if (batches.length === 0) {
        toast.error("该入库单暂无入库批次，无法生成出库单");
        return;
      }
      const batchId = batches[0].id;
      const res = await fetch(`/api/inbound-batches/${batchId}/create-outbound`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "生成出库单失败");
      }
      const ob = (data as { outboundOrder?: { outboundNumber?: string } }).outboundOrder;
      toast.success(ob?.outboundNumber ? `出库单已生成：${ob.outboundNumber}` : "出库单已生成");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成出库单失败");
    } finally {
      setCreatingOutboundId(null);
    }
  };

  // 导出数据
  const handleExport = () => {
    const headers = ["入库单号", "拿货单号", "产品名称", "SKU", "计划数量", "已入库", "待入库", "状态", "创建时间"];
    const rows = filteredOrders.map((i: InboundOrder) => [
      i.inboundNumber,
      i.deliveryNumber || "",
      i.productName ?? "",
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
              isCreatingOutbound={creatingOutboundId === order.id}
              onView={() => handleViewDetail(order)}
              onReceive={() => handleReceive(order)}
              onCreateOutbound={() => handleCreateOutbound(order)}
            />
          ))}
        </div>
      )}

      {/* 入库弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <h3 className="text-lg font-semibold text-slate-100">入库</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-slate-400">入库单号</span>
                  <span className="font-medium text-slate-100">{form.inboundNumber}</span>
                  <span className="text-slate-400">拿货单号</span>
                  <span className="font-medium text-slate-100">{form.deliveryNumber || "-"}</span>
                </div>
              </div>
              
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">实收数量（按SKU分别填写）</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(() => {
                    const order = inboundOrders.find((i: InboundOrder) => i.id === form.inboundNumber);
                    const orderItems = (order as InboundItem)?.items;
                    if (orderItems && orderItems.length > 0) {
                      // 多SKU：每个SKU显示输入框
                      return orderItems.map((item) => {
                        const planQty = item.qty - item.receivedQty;
                        return (
                          <div key={item.id} className="flex items-center gap-2">
                            <span className="flex-1 font-mono text-sm text-slate-200 truncate" title={item.sku}>{item.sku}</span>
                            <span className="text-xs text-slate-500 w-12 text-right">待入库: {planQty}</span>
                            <input
                              type="number"
                              min={0}
                              max={planQty}
                              value={form.itemQtys[item.id] || 0}
                              onChange={(e) => {
                                const val = Math.min(Math.max(0, Number(e.target.value) || 0), planQty);
                                setForm(prev => ({ ...prev, itemQtys: { ...prev.itemQtys, [item.id]: val } }));
                              }}
                              className="w-20 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-right text-sm text-slate-100 outline-none focus:border-primary-500"
                            />
                          </div>
                        );
                      });
                    } else {
                      // 单SKU：显示单个输入框
                      const remaining = Number(form.qty);
                      return (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 text-sm text-slate-200">实收数量</span>
                          <input
                            type="number"
                            min={0}
                            value={form.itemQtys['single'] || 0}
                            onChange={(e) => setForm(prev => ({ ...prev, itemQtys: { single: Math.max(0, Number(e.target.value) || 0) } }))}
                            className="w-32 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-right text-slate-100 outline-none focus:border-primary-500"
                          />
                        </div>
                      );
                    }
                  })()}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-700 text-sm">
                  <span className="text-slate-400">实收合计：</span>
                  <span className="font-medium text-emerald-400">
                    {(() => {
                      const order = inboundOrders.find((i: InboundOrder) => i.id === form.inboundNumber);
                      const orderItems = (order as InboundItem)?.items;
                      if (orderItems && orderItems.length > 0) {
                        return Object.values(form.itemQtys).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
                      }
                      return form.itemQtys['single'] || 0;
                    })()}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">入库仓库</label>
                <select
                  value={form.warehouseId}
                  onChange={(e) => setForm(prev => ({ ...prev, warehouseId: e.target.value, warehouseName: warehouses.find((w: WarehouseType) => w.id === e.target.value)?.name || '' }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary-500"
                >
                  <option value="">请选择仓库</option>
                  {warehouses.map((w: WarehouseType) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-700 px-4 py-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleReceiveSubmit}
                disabled={isSubmitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSubmitting ? "处理中…" : "确认入库"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情 Modal */}
      {detailModal && (
        <InboundDetailModal
          order={detailModal}
          warehouses={warehouses}
          isSubmitting={isSubmitting}
          isCreatingOutbound={creatingOutboundId === detailModal.id}
          onClose={handleCloseDetail}
          onReceive={() => {
            handleReceive(detailModal);
            handleCloseDetail();
          }}
          onCreateOutbound={() => handleCreateOutbound(detailModal)}
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
  isCreatingOutbound?: boolean;
  onView: () => void;
  onReceive: () => void;
  onCreateOutbound?: () => void;
}

function InboundCard({ order, warehouses, isSubmitting, isCreatingOutbound, onView, onReceive, onCreateOutbound }: InboundCardProps) {
  const colors = STATUS_COLORS[order.status] || STATUS_COLORS["待入库"];
  const remaining = order.qty - order.receivedQty;
  const warehouse = warehouses.find((w: WarehouseType) => w.id === order.warehouseId);
  const displayProductName =
    order.productName ||
    order.items?.[0]?.sku ||
    "-";

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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-3">
            <div>
              <span className="text-xs text-slate-500 block">合同号</span>
              <span className="text-sm text-slate-300">{order.contractNumber || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">拿货单号</span>
              <span className="text-sm text-slate-300">{order.deliveryNumber || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">产品名称</span>
              <span className="text-sm text-slate-300">{displayProductName}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">SKU</span>
              {order.items && order.items.length > 0 ? (
                (() => {
                  const visibleItems = order.items
                    .map((item) => {
                      // 已入库列表优先展示“实收数量”；实收为 0 的 SKU 不展示
                      const displayQty = Number(item.receivedQty || 0);
                      return { item, displayQty };
                    })
                    .filter(({ displayQty }) => displayQty > 0);

                  if (visibleItems.length === 0) {
                    return <span className="text-sm text-slate-500">-</span>;
                  }

                  return (
                    <div className="text-xs text-slate-300 space-y-0.5">
                      {visibleItems.slice(0, 3).map(({ item, displayQty }) => (
                        <div key={item.id} className="font-mono">
                          {item.sku} × {displayQty}
                          {item.spec && <span className="text-slate-500">({item.spec})</span>}
                        </div>
                      ))}
                      {visibleItems.length > 3 && (
                        <div className="text-slate-500">+{visibleItems.length - 3} more</div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <span className="text-sm text-slate-300">{order.sku}</span>
              )}
            </div>
            <div>
              <span className="text-xs text-slate-500 block">仓库</span>
              <span className="text-sm text-slate-300">{order.warehouseName || warehouse?.name || "入库时指定"}</span>
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
          {order.status === "已入库" && onCreateOutbound && (
            <button
              onClick={onCreateOutbound}
              disabled={isCreatingOutbound}
              className="p-2 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="生成出库单"
            >
              <Truck className="h-5 w-5" />
            </button>
          )}
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
  isCreatingOutbound?: boolean;
  onClose: () => void;
  onReceive: () => void;
  onCreateOutbound?: () => void;
}

function InboundDetailModal({ order, warehouses, isSubmitting, isCreatingOutbound, onClose, onReceive, onCreateOutbound }: InboundDetailModalProps) {
  const colors = STATUS_COLORS[order.status] || STATUS_COLORS["待入库"];
  const remaining = order.qty - order.receivedQty;
  const warehouse = warehouses.find((w: WarehouseType) => w.id === order.warehouseId);
  const displayProductName =
    order.productName ||
    order.items?.[0]?.sku ||
    "-";

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
            <span className="text-xs text-slate-500 block">合同号</span>
            <span className="text-sm text-slate-200">{order.contractNumber || "-"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">拿货单号</span>
            <span className="text-sm text-slate-200">{order.deliveryNumber || "-"}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">产品名称</span>
            <span className="text-sm text-slate-200">{displayProductName}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">SKU</span>
            <span className="text-sm text-slate-200">{order.sku}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">仓库</span>
            <span className="text-sm text-slate-200">{order.warehouseName || warehouse?.name || "入库时指定"}</span>
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
          {order.status === "已入库" && onCreateOutbound && (
            <ActionButton
              onClick={onCreateOutbound}
              variant="secondary"
              icon={Truck}
              disabled={isCreatingOutbound}
            >
              {isCreatingOutbound ? "生成中..." : "生成出库单"}
            </ActionButton>
          )}
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
