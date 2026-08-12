"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { CheckCircle2, XCircle, Search, Eye, FileCheck, FileText, FileImage, History } from "lucide-react";
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

const formatDateTime = (dateString?: string) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

function getContractApprovalResult(contract: PurchaseContract): "通过" | "拒绝" {
  if (contract.approvalResult === "通过" || contract.approvalResult === "拒绝") {
    return contract.approvalResult;
  }
  return contract.status === "已取消" ? "拒绝" : "通过";
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

// 当前登录用户显示名（用于预填审批人）
function getCurrentApproverName(session: { user?: { name?: string | null; email?: string | null } } | null): string {
  if (!session?.user) return "";
  const u = session.user;
  return (u.name && String(u.name).trim()) || (u.email && String(u.email).trim()) || "";
}

export default function ApprovalPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"orders" | "contracts">("orders");
  const [contractView, setContractView] = useState<"pending" | "history">("pending");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [selectedContract, setSelectedContract] = useState<PurchaseContract | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contractModalMode, setContractModalMode] = useState<"approval" | "history" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalForm, setApprovalForm] = useState({
    result: "通过" as "通过" | "拒绝",
    notes: "",
    approvedBy: ""
  });

  const { data: ordersDataRaw, mutate: mutateOrders } = useSWR<any>(
    "/api/purchase-orders?page=1&pageSize=500",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const { data: contractsDataRaw, mutate: mutateContracts } = useSWR<any>(
    "/api/purchase-contracts?page=1&pageSize=500&includeVouchers=true&noCache=true",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  const ordersData = Array.isArray(ordersDataRaw) ? ordersDataRaw : (ordersDataRaw?.data ?? []);
  const contractsData: PurchaseContract[] = Array.isArray(contractsDataRaw)
    ? contractsDataRaw
    : (contractsDataRaw?.data ?? []);
  const orders = useMemo(
    () => ordersData.filter((o: PurchaseOrder) => o.status === "待审批"),
    [ordersData]
  );
  const pendingContracts = useMemo(
    () => contractsData.filter((c: PurchaseContract) => c.status === "待审批"),
    [contractsData]
  );
  const contractHistory = useMemo(
    () => contractsData.filter((c: PurchaseContract) => Boolean(c.approvedAt)),
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

  const filteredContractHistory = useMemo(() => {
    let result = [...contractHistory];
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((contract) =>
        contract.contractNumber.toLowerCase().includes(keyword) ||
        contract.supplierName.toLowerCase().includes(keyword) ||
        (contract.sku && contract.sku.toLowerCase().includes(keyword)) ||
        (contract.approvedBy && contract.approvedBy.toLowerCase().includes(keyword)) ||
        (contract.approvalNotes && contract.approvalNotes.toLowerCase().includes(keyword))
      );
    }
    result.sort((left, right) => new Date(right.approvedAt || 0).getTime() - new Date(left.approvedAt || 0).getTime());
    return result;
  }, [contractHistory, searchKeyword]);

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: filteredOrders.length,
      totalQuantity: filteredOrders.reduce((sum, o) => sum + o.quantity, 0),
      contractTotal: filteredContracts.length,
      contractAmount: filteredContracts.reduce((sum, c) => sum + (c.totalAmount ?? 0), 0),
      contractApproved: contractHistory.filter((contract) => getContractApprovalResult(contract) === "通过").length,
      contractRejected: contractHistory.filter((contract) => getContractApprovalResult(contract) === "拒绝").length,
    };
  }, [filteredOrders, filteredContracts, contractHistory]);

  // 打开审批模态框（审批人预填当前登录用户）
  const handleOpenModal = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setApprovalForm({
      result: "通过",
      notes: "",
      approvedBy: getCurrentApproverName(session)
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
    setApprovalForm({
      result: "通过",
      notes: "",
      approvedBy: getCurrentApproverName(session)
    });
    setContractModalMode("approval");
  };

  const handleOpenContractHistory = (contract: PurchaseContract) => {
    setSelectedContract(contract);
    setContractModalMode("history");
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
        setContractModalMode(null);
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

      {tab === "contracts" && (
        <div className="inline-flex w-fit rounded-md border border-slate-700 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setContractView("pending")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              contractView === "pending"
                ? "rounded bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            待审批
          </button>
          <button
            type="button"
            onClick={() => setContractView("history")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              contractView === "history"
                ? "rounded bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            审批历史
          </button>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tab === "orders" ? (
          <>
            <StatCard title="待审批订单" value={stats.total} icon={FileCheck} />
            <StatCard title="订单总数量" value={stats.totalQuantity} icon={CheckCircle2} />
            <StatCard title="待审批合同" value={stats.contractTotal} icon={FileText} />
            <StatCard title="合同总金额" value={`¥${stats.contractAmount.toLocaleString("zh-CN")}`} icon={FileText} />
          </>
        ) : (
          <>
            <StatCard title="待审批合同" value={stats.contractTotal} icon={FileText} />
            <StatCard title="待审批金额" value={`¥${stats.contractAmount.toLocaleString("zh-CN")}`} icon={FileText} />
            <StatCard title="审批通过" value={stats.contractApproved} icon={CheckCircle2} />
            <StatCard title="审批拒绝" value={stats.contractRejected} icon={XCircle} />
          </>
        )}
      </div>

      {/* 搜索 */}
      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder={tab === "orders"
            ? "搜索订单编号、SKU、产品名称..."
            : contractView === "history"
              ? "搜索合同编号、供应商、SKU、审批人或备注..."
              : "搜索合同编号、供应商、SKU..."}
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
      {tab === "contracts" && contractView === "pending" && filteredContracts.length === 0 && (
        <EmptyState
          icon={FileText}
          title="暂无待审批合同"
          description="采购在「采购合同」中新建的合同会出现在这里，由公司主管审批"
        />
      )}
      {tab === "contracts" && contractView === "pending" && filteredContracts.length > 0 && (
        <div className="space-y-3">
          {filteredContracts.map((contract) => (
            <div
              key={contract.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-primary-500/50 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-white text-lg">{contract.contractNumber}</h3>
                    <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">待审批</span>
                  </div>
                  <p className="text-sm text-slate-300 mb-3">
                    供应商：<span className="text-slate-100 font-medium">{contract.supplierName}</span>
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm">
                    <div>
                      <span className="text-slate-400">合同总额：</span>
                      <span className="text-slate-200 font-medium">¥{Number(contract.totalAmount).toLocaleString("zh-CN")}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">合同总数：</span>
                      <span className="text-amber-200 font-medium">{contract.totalQty ?? 0}</span>
                      <span className="text-slate-500 text-xs ml-0.5">件</span>
                    </div>
                    <div>
                      <span className="text-slate-400">创建时间：</span>
                      <span className="text-slate-200">{formatDate(contract.createdAt)}</span>
                    </div>
                    {contract.contractVoucher && (
                      <div className="col-span-2 md:col-span-4">
                        <span className="text-slate-400">合同凭证：</span>
                        <span className="text-emerald-300 text-xs">
                          {Array.isArray(contract.contractVoucher)
                            ? `有 ${contract.contractVoucher.length} 张`
                            : "已上传"}
                        </span>
                      </div>
                    )}
                  </div>
                  {contract.items && contract.items.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <p className="text-xs text-slate-400 mb-1.5">下单数量明细</p>
                      <div className="max-h-24 overflow-y-auto space-y-0.5 text-xs">
                        {contract.items.map((item: { id: string; sku: string; skuName?: string; qty: number }) => (
                          <div key={item.id} className="flex justify-between gap-4 text-slate-300">
                            <span className="truncate" title={[item.skuName, item.sku].filter(Boolean).join(" / ")}>
                              {item.skuName ? `${item.skuName} · ${item.sku}` : item.sku}
                            </span>
                            <span className="text-amber-200/90 font-medium shrink-0">数量 {item.qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(!contract.items || contract.items.length === 0) && contract.sku && (
                    <div className="mt-2 text-sm text-slate-400">
                      物料：<span className="text-slate-200">{contract.sku}</span>
                      {contract.totalQty != null && (
                        <span className="ml-2 text-amber-200/90">数量 {contract.totalQty}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
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

      {tab === "contracts" && contractView === "history" && filteredContractHistory.length === 0 && (
        <EmptyState
          icon={History}
          title="暂无合同审批历史"
          description="审批通过或拒绝的合同会保留在这里"
        />
      )}
      {tab === "contracts" && contractView === "history" && filteredContractHistory.length > 0 && (
        <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/40">
          <div className="overflow-x-auto">
            <table className="min-w-[1040px] w-full text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">合同 / 供应商</th>
                  <th className="px-4 py-3 text-right font-medium">合同金额</th>
                  <th className="px-4 py-3 text-center font-medium">审批结果</th>
                  <th className="px-4 py-3 text-left font-medium">审批人</th>
                  <th className="px-4 py-3 text-left font-medium">审批时间</th>
                  <th className="px-4 py-3 text-left font-medium">审批备注</th>
                  <th className="w-16 px-4 py-3 text-center font-medium">详情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredContractHistory.map((contract) => {
                  const result = getContractApprovalResult(contract);
                  return (
                    <tr key={contract.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-100">{contract.contractNumber}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{contract.supplierName}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                        ¥{Number(contract.totalAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                          result === "通过"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-rose-500/15 text-rose-300"
                        }`}>
                          {result === "通过" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {result}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{contract.approvedBy || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDateTime(contract.approvedAt)}</td>
                      <td className="max-w-[280px] px-4 py-3 text-slate-400">
                        <div className="truncate" title={contract.approvalNotes || ""}>{contract.approvalNotes || "-"}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenContractHistory(contract)}
                          title="查看合同审批详情"
                          className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-white"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                  placeholder="默认当前登录用户，可修改"
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
      {contractModalMode && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">
                  {contractModalMode === "history" ? "合同审批记录" : "合同审批"}
                </h2>
                <p className="text-sm text-slate-400 mt-1">{selectedContract.contractNumber}</p>
              </div>
              <button
                onClick={() => {
                  setContractModalMode(null);
                  setSelectedContract(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="mb-6 p-4 rounded-lg border border-slate-700 bg-slate-800/50 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">供应商：</span>
                  <span className="text-slate-200 ml-2 font-medium">{selectedContract.supplierName}</span>
                </div>
                <div>
                  <span className="text-slate-400">合同总额：</span>
                  <span className="text-slate-200 ml-2 font-medium">¥{Number(selectedContract.totalAmount).toLocaleString("zh-CN")}</span>
                </div>
                <div>
                  <span className="text-slate-400">合同总数：</span>
                  <span className="text-amber-200 ml-2 font-medium">{selectedContract.totalQty ?? 0} 件</span>
                </div>
                <div>
                  <span className="text-slate-400">定金比例：</span>
                  <span className="text-slate-200 ml-2">{(selectedContract.depositRate ?? 0)}%</span>
                </div>
                <div>
                  <span className="text-slate-400">定金金额：</span>
                  <span className="text-amber-200 ml-2 font-medium">
                    ¥{Number(selectedContract.depositAmount ?? 0).toLocaleString("zh-CN")}
                    {(selectedContract.depositRate ?? 0) === 0 && Number(selectedContract.depositAmount ?? 0) > 0 && (
                      <span className="text-slate-500 text-xs ml-1">（固定）</span>
                    )}
                  </span>
                </div>
              </div>
              {selectedContract.items && selectedContract.items.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1.5">下单数量明细</p>
                  <div className="max-h-32 overflow-y-auto rounded border border-slate-700 bg-slate-900/50 p-2 space-y-0.5 text-xs">
                    {selectedContract.items.map((item: { id: string; sku: string; skuName?: string; qty: number; unitPrice?: number }) => (
                      <div key={item.id} className="flex justify-between gap-4 text-slate-300">
                        <span className="truncate">{item.skuName ? `${item.skuName} · ${item.sku}` : item.sku}</span>
                        <span className="text-amber-200/90 font-medium shrink-0">数量 {item.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(!selectedContract.items || selectedContract.items.length === 0) && selectedContract.sku && (
                <p className="text-sm text-slate-400">
                  物料：<span className="text-slate-200">{selectedContract.sku}</span>
                  {selectedContract.totalQty != null && (
                    <span className="ml-2 text-amber-200/90">数量 {selectedContract.totalQty}</span>
                  )}
                </p>
              )}
              {selectedContract.contractVoucher && (() => {
                const voucher = selectedContract.contractVoucher;
                const list = Array.isArray(voucher) ? voucher : voucher ? [voucher] : [];
                if (list.length === 0) return null;
                return (
                  <div>
                    <p className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                      <FileImage className="h-3.5 w-3.5" />
                      合同凭证
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto rounded border border-slate-700 bg-slate-900/50 p-2">
                      {list.map((v: string, index: number) => {
                        const isPdf = typeof v === "string" && v.startsWith("data:application/pdf");
                        if (isPdf) {
                          return (
                            <div
                              key={index}
                              className="flex flex-col items-center justify-center rounded border border-slate-600 bg-slate-800 h-20 cursor-pointer hover:border-primary-400"
                              onClick={() => window.open(v, "_blank")}
                            >
                              <FileText className="h-6 w-6 text-rose-400 mb-0.5" />
                              <span className="text-[10px] text-slate-400">PDF</span>
                            </div>
                          );
                        }
                        const imgSrc = typeof v === "string" && !v.startsWith("data:") && !v.startsWith("http") && !v.startsWith("/")
                          ? `data:image/jpeg;base64,${v}`
                          : v;
                        return (
                          <img
                            key={index}
                            src={imgSrc}
                            alt={`凭证 ${index + 1}`}
                            className="w-full h-20 object-cover rounded border border-slate-600 cursor-pointer hover:border-primary-400"
                            onClick={() => window.open(imgSrc, "_blank")}
                            onError={(e) => {
                              const t = e.target as HTMLImageElement;
                              if (typeof v === "string" && !v.startsWith("data:") && !v.startsWith("http")) {
                                t.src = `data:image/png;base64,${v}`;
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            {contractModalMode === "history" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-700 bg-slate-800/40 p-4 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-500">审批结果</div>
                    <div className={`mt-1 font-medium ${
                      getContractApprovalResult(selectedContract) === "通过" ? "text-emerald-300" : "text-rose-300"
                    }`}>
                      {getContractApprovalResult(selectedContract)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">审批人</div>
                    <div className="mt-1 text-slate-200">{selectedContract.approvedBy || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">审批时间</div>
                    <div className="mt-1 text-slate-200">{formatDateTime(selectedContract.approvedAt)}</div>
                  </div>
                  <div className="sm:col-span-3">
                    <div className="text-xs text-slate-500">审批备注</div>
                    <div className="mt-1 whitespace-pre-wrap text-slate-300">{selectedContract.approvalNotes || "无"}</div>
                  </div>
                </div>
                <div className="flex justify-end border-t border-slate-800 pt-4">
                  <ActionButton
                    type="button"
                    onClick={() => {
                      setContractModalMode(null);
                      setSelectedContract(null);
                    }}
                    variant="secondary"
                  >
                    关闭
                  </ActionButton>
                </div>
              </div>
            ) : (
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
                  placeholder="默认当前登录用户，可修改"
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
                    setContractModalMode(null);
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
