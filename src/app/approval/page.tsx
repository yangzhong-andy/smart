"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle, Search, Eye, FileCheck } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import {
  getPurchaseOrders,
  getPendingApprovalOrders,
  approvePurchaseOrder,
  type PurchaseOrder
} from "@/lib/purchase-orders-store";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

export default function ApprovalPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [approvalForm, setApprovalForm] = useState({
    result: "通过" as "通过" | "拒绝",
    notes: "",
    approvedBy: ""
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrders(getPendingApprovalOrders());
  }, []);

  // 筛选订单
  const filteredOrders = useMemo(() => {
    let result = [...orders];
    
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((o) =>
        o.orderNumber.toLowerCase().includes(keyword) ||
        o.sku.toLowerCase().includes(keyword) ||
        o.productName?.toLowerCase().includes(keyword) ||
        o.createdBy.toLowerCase().includes(keyword)
      );
    }
    
    result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return result;
  }, [orders, searchKeyword]);

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: filteredOrders.length,
      totalQuantity: filteredOrders.reduce((sum, o) => sum + o.quantity, 0)
    };
  }, [filteredOrders]);

  // 打开审批模态框
  const handleOpenModal = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setApprovalForm({
      result: "通过",
      notes: "",
      approvedBy: ""
    });
    setIsModalOpen(true);
  };

  // 提交审批
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedOrder) return;
    
    if (!approvalForm.approvedBy.trim()) {
      toast.error("请填写审批人姓名");
      return;
    }
    
    const success = approvePurchaseOrder(
      selectedOrder.id,
      approvalForm.result,
      approvalForm.notes,
      approvalForm.approvedBy.trim()
    );
    
    if (success) {
      toast.success(`审批${approvalForm.result === "通过" ? "通过" : "拒绝"}`);
      setOrders(getPendingApprovalOrders());
      setIsModalOpen(false);
      setSelectedOrder(null);
      setApprovalForm({
        result: "通过",
        notes: "",
        approvedBy: ""
      });
    } else {
      toast.error("审批失败，请重试");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="订单审批"
        description="审批已通过风控的采购订单"
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard title="待审批订单" value={stats.total} icon={FileCheck} />
        <StatCard title="总需求数量" value={stats.totalQuantity} icon={CheckCircle2} />
      </div>

      {/* 搜索 */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索订单编号、SKU、产品名称..."
        />
      </div>

      {/* 订单列表 */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="暂无待审批订单"
          description="当订单通过风控评估后，会出现在这里等待审批"
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-primary-500/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-white text-lg">{order.orderNumber}</h3>
                    <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">
                      风控已通过
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      order.urgency === "加急" ? "bg-rose-500/20 text-rose-300" :
                      order.urgency === "紧急" ? "bg-amber-500/20 text-amber-300" :
                      "bg-slate-700/50 text-slate-400"
                    }`}>
                      {order.urgency}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">下单人：</span>
                      <span className="text-slate-200 ml-2">{order.createdBy}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">平台：</span>
                      <span className="text-slate-200 ml-2">{order.platform}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">SKU：</span>
                      <span className="text-slate-200 ml-2">{order.sku}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">需求数量：</span>
                      <span className="text-slate-200 ml-2 font-medium">{order.quantity}</span>
                    </div>
                    {order.riskControlBy && (
                      <div>
                        <span className="text-slate-400">风控评估人：</span>
                        <span className="text-slate-200 ml-2">{order.riskControlBy}</span>
                      </div>
                    )}
                    {order.riskControlNotes && (
                      <div className="col-span-2">
                        <span className="text-slate-400">风控备注：</span>
                        <span className="text-slate-300 ml-2">{order.riskControlNotes}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="ml-4">
                  <ActionButton
                    onClick={() => handleOpenModal(order)}
                    variant="primary"
                    icon={CheckCircle2}
                  >
                    审批
                  </ActionButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 审批模态框 */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">订单审批</h2>
                <p className="text-sm text-slate-400 mt-1">{selectedOrder.orderNumber}</p>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedOrder(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* 订单信息 */}
            <div className="mb-6 p-4 rounded-lg border border-slate-700 bg-slate-800/50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">下单人：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.createdBy}</span>
                </div>
                <div>
                  <span className="text-slate-400">平台：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.platform}</span>
                </div>
                <div>
                  <span className="text-slate-400">SKU：</span>
                  <span className="text-slate-200 ml-2">{selectedOrder.sku}</span>
                </div>
                <div>
                  <span className="text-slate-400">需求数量：</span>
                  <span className="text-slate-200 ml-2 font-medium">{selectedOrder.quantity}</span>
                </div>
                {selectedOrder.riskControlSnapshot && (
                  <>
                    <div>
                      <span className="text-slate-400">总可用库存：</span>
                      <span className="text-slate-200 ml-2">{selectedOrder.riskControlSnapshot.totalAvailable}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">风控评估人：</span>
                      <span className="text-slate-200 ml-2">{selectedOrder.riskControlBy}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">审批结果 *</span>
                <select
                  value={approvalForm.result}
                  onChange={(e) => setApprovalForm((f) => ({ ...f, result: e.target.value as typeof f.result }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                >
                  <option value="通过">通过</option>
                  <option value="拒绝">拒绝</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">审批人 *</span>
                <input
                  type="text"
                  value={approvalForm.approvedBy}
                  onChange={(e) => setApprovalForm((f) => ({ ...f, approvedBy: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="审批人姓名"
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">审批备注</span>
                <textarea
                  value={approvalForm.notes}
                  onChange={(e) => setApprovalForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={4}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选：说明审批理由、注意事项等"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedOrder(null);
                  }}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  提交审批
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
