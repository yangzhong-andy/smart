"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { CheckCircle2, XCircle, Search, Eye, FileCheck, FileText } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import { approvePurchaseOrder, type PurchaseOrder } from "@/lib/purchase-orders-store";
import { approvePurchaseContract, type PurchaseContract } from "@/lib/purchase-contracts-store";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

export default function ApprovalPage() {
  const [tab, setTab] = useState<"orders" | "contracts">("orders");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [selectedContract, setSelectedContract] = useState<PurchaseContract | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalForm, setApprovalForm] = useState({
    result: "通过" as "通过" | "拒绝",
    notes: "",
    approvedBy: ""
  });

  const { data: ordersData = [], mutate: mutateOrders } = useSWR<PurchaseOrder[]>(
    "/api/purchase-orders",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const { data: contractsData = [], mutate: mutateContracts } = useSWR<PurchaseContract[]>(
    "/api/purchase-contracts",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const orders = useMemo(
    () => ordersData.filter((o) => o.status === "待审批"),
    [ordersData]
  );
  const pendingContracts = useMemo(
    () => contractsData.filter((c) => c.status === "待审批"),
    [contractsData]
  );

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

  // 筛选合同
  const filteredContracts = useMemo(() => {
    let result = [...pendingContracts];
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((c) =>
        c.contractNumber.toLowerCase().includes(keyword) ||
        c.supplierName.toLowerCase().includes(keyword) ||
        (c.sku && c.sku.toLowerCase().includes(keyword))
      );
    }
    result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return result;
  }, [pendingContracts, searchKeyword]);

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: filteredOrders.length,
      totalQuantity: filteredOrders.reduce((sum, o) => sum + o.quantity, 0),
      contractTotal: filteredContracts.length,
      contractAmount: filteredContracts.reduce((sum, c) => sum + (c.totalAmount ?? 0), 0)
    };
  }, [filteredOrders, filteredContracts]);

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

  // 提交订单审批
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrder) return;
    if (!approvalForm.approvedBy.trim()) {
      toast.error("请填写审批人姓名");
      return;
    }
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    setIsSubmitting(true);
    try {
      const success = await approvePurchaseOrder(
        selectedOrder.id,
        approvalForm.result,
        approvalForm.notes,
        approvalForm.approvedBy.trim()
      );
      if (success) {
        toast.success(`审批${approvalForm.result === "通过" ? "通过" : "拒绝"}`);
        mutateOrders();
        setIsModalOpen(false);
        setSelectedOrder(null);
        setApprovalForm({ result: "通过", notes: "", approvedBy: "" });
      } else {
        toast.error("审批失败，请重试");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenContractModal = (contract: PurchaseContract) => {
    setSelectedContract(contract);
    setApprovalForm({ result: "通过", notes: "", approvedBy: "" });
    setIsContractModalOpen(true);
  };

  const handleContractSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedContract) return;
    if (!approvalForm.approvedBy.trim()) {
      toast.error("请填写审批人姓名");
      return;
    }
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    setIsSubmitting(true);
    try {
      const success = await approvePurchaseContract(
        selectedContract.id,
        approvalForm.result,
        approvalForm.notes,
        approvalForm.approvedBy.trim()
      );
      if (success) {
        toast.success(`合同审批${approvalForm.result === "通过" ? "通过" : "已拒绝"}`);
        mutateContracts();
        setIsContractModalOpen(false);
        setSelectedContract(null);
        setApprovalForm({ result: "通过", notes: "", approvedBy: "" });
      } else {
        toast.error("审批失败，请重试");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="审批工作台"
        description="审批已通过风控的采购订单、以及采购发起的新建合同（公司主管审批）"
      />

      {/* 选项卡 */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setTab("orders")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "orders"
              ? "bg-primary-500/20 text-primary-300 border border-primary-500/50"
              : "text-slate-400 hover:text-slate-200 border border-transparent"
          }`}
        >
          订单审批
        </button>
        <button
          type="button"
          onClick={() => setTab("contracts")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "contracts"
              ? "bg-primary-500/20 text-primary-300 border border-primary-500/50"
              : "text-slate-400 hover:text-slate-200 border border-transparent"
          }`}
        >
          合同审批
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="待审批订单" value={stats.total} icon={FileCheck} />
        <StatCard title="订单总数量" value={stats.totalQuantity} icon={CheckCircle2} />
        <StatCard title="待审批合同" value={stats.contractTotal} icon={FileText} />
        <StatCard title="合同总金额" value={`¥${stats.contractAmount.toLocaleString("zh-CN")}`} icon={FileText} />
      </div>

      {/* 搜索 */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder={tab === "orders" ? "搜索订单编号、SKU、产品名称..." : "搜索合同编号、供应商、SKU..."}
        />
      </div>

      {/* 订单列表 */}
      {tab === "orders" && filteredOrders.length === 0 && (
        <EmptyState
          icon={FileCheck}
          title="暂无待审批订单"
          description="当订单通过风控评估后，会出现在这里等待审批"
        />
      )}
      {tab === "orders" && filteredOrders.length > 0 && (
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

      {/* 合同审批列表 */}
      {tab === "contracts" && filteredContracts.length === 0 && (
        <EmptyState
          icon={FileText}
          title="暂无待审批合同"
          description="采购在「采购合同」中新建的合同会出现在这里，由公司主管审批"
        />
      )}
      {tab === "contracts" && filteredContracts.length > 0 && (
        <div className="space-y-3">
          {filteredContracts.map((contract) => (
            <div
              key={contract.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-primary-500/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-white text-lg">{contract.contractNumber}</h3>
                    <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">待审批</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">供应商：</span>
                      <span className="text-slate-200 ml-2">{contract.supplierName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">合同总额：</span>
                      <span className="text-slate-200 ml-2 font-medium">¥{Number(contract.totalAmount).toLocaleString("zh-CN")}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">物料：</span>
                      <span className="text-slate-200 ml-2 truncate max-w-[180px] inline-block" title={contract.sku}>{contract.sku}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">创建时间：</span>
                      <span className="text-slate-200 ml-2">{formatDate(contract.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <ActionButton
                    onClick={() => handleOpenContractModal(contract)}
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

      {/* 订单审批模态框 */}
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
                <ActionButton type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting}>
                  {isSubmitting ? "处理中..." : "提交审批"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 合同审批模态框 */}
      {isContractModalOpen && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">合同审批</h2>
                <p className="text-sm text-slate-400 mt-1">{selectedContract.contractNumber}</p>
              </div>
              <button
                onClick={() => {
                  setIsContractModalOpen(false);
                  setSelectedContract(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="mb-6 p-4 rounded-lg border border-slate-700 bg-slate-800/50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">供应商：</span>
                  <span className="text-slate-200 ml-2">{selectedContract.supplierName}</span>
                </div>
                <div>
                  <span className="text-slate-400">合同总额：</span>
                  <span className="text-slate-200 ml-2 font-medium">¥{Number(selectedContract.totalAmount).toLocaleString("zh-CN")}</span>
                </div>
                <div>
                  <span className="text-slate-400">定金比例：</span>
                  <span className="text-slate-200 ml-2">{selectedContract.depositRate}%</span>
                </div>
                <div>
                  <span className="text-slate-400">物料：</span>
                  <span className="text-slate-200 ml-2 break-all">{selectedContract.sku}</span>
                </div>
              </div>
            </div>
            <form onSubmit={handleContractSubmit} className="space-y-4">
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
                  placeholder="审批人姓名（公司主管）"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-slate-300">审批备注</span>
                <textarea
                  value={approvalForm.notes}
                  onChange={(e) => setApprovalForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="可选"
                />
              </label>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => {
                    setIsContractModalOpen(false);
                    setSelectedContract(null);
                  }}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting}>
                  {isSubmitting ? "处理中..." : "提交审批"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
