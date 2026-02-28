"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getMonthlyBills, saveMonthlyBills, type MonthlyBill, type BillStatus, type BillType, type BillCategory } from "@/lib/reconciliation-store";
import { ReconciliationStats } from "./components/ReconciliationStats";
import { ReconciliationFilters } from "./components/ReconciliationFilters";
import { ReconciliationTable } from "./components/ReconciliationTable";
import { ReconciliationDetailDialog } from "./components/ReconciliationDetailDialog";
import { ReconciliationMatchDialog } from "./components/ReconciliationMatchDialog";
import { getAgencies } from "@/lib/ad-agency-store";
import { getAdConsumptions, getAdRecharges } from "@/lib/ad-agency-store";
import { formatCurrency } from "@/lib/currency-utils";
import ConfirmDialog from "@/components/ConfirmDialog";
import ImageUploader from "@/components/ImageUploader";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { 
  getRebateReceivables, 
  saveRebateReceivables, 
  getTotalUnsettledRebates,
  type RebateReceivable 
} from "@/lib/rebate-receivable-store";
import { 
  getPendingEntries, 
  getPendingEntriesByStatus, 
  completePendingEntry,
  type PendingEntry 
} from "@/lib/pending-entry-store";
import { getAccountsFromAPI, saveAccounts, type BankAccount } from "@/lib/finance-store";
import { createCashFlow } from "@/lib/cash-flow-store";
import { enrichWithUID, createBusinessEntityWithRelations } from "@/lib/business-utils";
import { getDeliveryOrders, type DeliveryOrder } from "@/lib/delivery-orders-store";
import { getPurchaseContracts, type PurchaseContract } from "@/lib/purchase-contracts-store";
import { createPaymentNotification, markNotificationAsRead, findNotificationsByRelated } from "@/lib/notification-store";

export default function ReconciliationPage() {
  const [filterStatus, setFilterStatus] = useState<BillStatus | "all">("all");
  const [filterType, setFilterType] = useState<BillType | "all">("all");
  const [activeCategory, setActiveCategory] = useState<BillCategory | "PendingEntry" | "PendingFinanceReview" | "PendingPayment">(() => {
    // 从 localStorage 读取上次选择的标签，如果是从财务中心跳转过来的，自动切换到待入账
    if (typeof window !== "undefined") {
      const savedTab = window.localStorage.getItem("reconciliationActiveTab");
      if (savedTab === "PendingEntry") {
        window.localStorage.removeItem("reconciliationActiveTab"); // 清除标记
        return "PendingEntry";
      }
    }
    return "Payable";
  }); // 当前激活的板块：应付款/应收款/待入账/待付款
  const [selectedBill, setSelectedBill] = useState<MonthlyBill | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [pendingEntriesState, setPendingEntries] = useState<PendingEntry[]>([]);
  const [selectedPendingEntry, setSelectedPendingEntry] = useState<PendingEntry | null>(null);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({
    accountId: "",
    entryDate: new Date().toISOString().slice(0, 10),
    voucher: "" as string | string[]
  });
  const [bankAccountsState, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedPendingPaymentBill, setSelectedPendingPaymentBill] = useState<MonthlyBill | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    accountId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: "转账",
    voucher: "" as string | string[]
  });
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null
  });
  const [rejectReason, setRejectReason] = useState("");
  const [submitApprovalModal, setSubmitApprovalModal] = useState<{ open: boolean; billId: string | null }>({
    open: false,
    billId: null
  });
  const [paymentApplicationVoucher, setPaymentApplicationVoucher] = useState<string | string[]>("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title?: string;
    message: string;
    type?: "danger" | "warning" | "info";
    onConfirm: () => void;
  } | null>(null);
  const [selectedRebateReceivable, setSelectedRebateReceivable] = useState<RebateReceivable | null>(null);
  const [isRebateDetailModalOpen, setIsRebateDetailModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    amount: "",
    reason: ""
  });
  const [isEntrySubmitting, setIsEntrySubmitting] = useState(false);
  
  // 模拟用户角色（实际应该从用户系统获取）
  // "dept" = 部门同事, "finance" = 财务, "boss" = 公司主管, "cashier" = 出纳
  const [userRole] = useState<"dept" | "finance" | "boss" | "cashier">("dept");

  // SWR fetcher 函数
  const fetcher = useCallback(async (key: string) => {
    if (typeof window === "undefined") return null;
    const apiMap: Record<string, string> = {
      agencies: "/api/ad-agencies",
      recharges: "/api/ad-recharges",
      consumptions: "/api/ad-consumptions",
      "rebate-receivables": "/api/rebate-receivables",
      "pending-entries": "/api/pending-entries",
      "bank-accounts": "/api/accounts",
      products: "/api/products",
    };
    if (apiMap[key]) {
      const url = key === "pending-entries" ? "/api/pending-entries" : apiMap[key];
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API 错误: ${res.status}`);
      const data = await res.json();
      if (key === "pending-entries") return data.filter((e: { status: string }) => e.status === "Pending");
      return data;
    }
    if (key === "monthly-bills") return await getMonthlyBills();
    if (key === "delivery-orders") {
      const res = await fetch("/api/delivery-orders");
      if (!res.ok) throw new Error(`API 错误: ${res.status}`);
      return res.json();
    }
    if (key === "contracts") {
      const res = await fetch("/api/purchase-contracts");
      if (!res.ok) throw new Error(`API 错误: ${res.status}`);
      return res.json();
    }
    return null;
  }, []);

  // 使用 SWR 获取数据（优化：关闭焦点刷新，增加去重间隔以减少数据库访问）
  const { data: billsData } = useSWR("monthly-bills", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 优化：增加到10分钟内去重
  });
  const { data: agenciesData } = useSWR("agencies", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: rechargesData } = useSWR("recharges", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: consumptionsData } = useSWR("consumptions", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: deliveryOrdersData } = useSWR("delivery-orders", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: contractsData } = useSWR("contracts", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: rebateReceivablesData } = useSWR("rebate-receivables", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 优化：增加到10分钟内去重
  });
  const { data: pendingEntriesData } = useSWR("pending-entries", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300000 // 优化：增加到5分钟内去重
  });
  const { data: bankAccountsData } = useSWR("bank-accounts", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: productsData } = useSWR("products", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });

  // 确保数据是数组并指定类型
  const bills: MonthlyBill[] = Array.isArray(billsData) ? (billsData as MonthlyBill[]) : [];
  const agencies: any[] = Array.isArray(agenciesData) ? agenciesData : [];
  const recharges: any[] = Array.isArray(rechargesData) ? rechargesData : [];
  const consumptions: any[] = Array.isArray(consumptionsData) ? consumptionsData : [];
  const deliveryOrders: DeliveryOrder[] = Array.isArray(deliveryOrdersData) ? (deliveryOrdersData as DeliveryOrder[]) : [];
  const contracts: PurchaseContract[] = Array.isArray(contractsData) ? (contractsData as PurchaseContract[]) : [];
  const rebateReceivables: RebateReceivable[] = Array.isArray(rebateReceivablesData) ? (rebateReceivablesData as RebateReceivable[]) : [];
  const pendingEntriesFromSWR: PendingEntry[] = Array.isArray(pendingEntriesData) ? (pendingEntriesData as PendingEntry[]) : [];
  const bankAccountsFromSWR: BankAccount[] = Array.isArray(bankAccountsData) ? (bankAccountsData as BankAccount[]) : [];
  const products: Array<{ sku_id?: string; at_factory?: number; at_domestic?: number; in_transit?: number; cost_price?: number; currency?: string }> = Array.isArray(productsData) ? productsData : [];

  // 更新本地状态（用于兼容现有代码）
  useEffect(() => {
    setPendingEntries(pendingEntriesFromSWR);
    setBankAccounts(bankAccountsFromSWR);
  }, [pendingEntriesFromSWR, bankAccountsFromSWR]);

  // 使用本地状态变量（从 SWR 数据同步）
  const pendingEntries = pendingEntriesState;
  const bankAccounts = bankAccountsState;

  const filteredBills = useMemo(() => {
    // 如果是待入账标签，不筛选账单
    if (activeCategory === "PendingEntry") {
      return [];
    }
    // 如果是待财务审批标签，筛选状态为待财务审批且为应付款的账单
    if (activeCategory === "PendingFinanceReview") {
      return bills.filter((b) => 
        b.status === "Pending_Finance_Review" && 
        (b.billCategory === "Payable" || (!b.billCategory && ["广告", "物流", "工厂订单"].includes(b.billType)))
      );
    }
    // 如果是待付款标签，筛选状态为已批准且为应付款的账单（审批通过后直接推给出纳打款）
    if (activeCategory === "PendingPayment") {
      return bills.filter((b) => 
        b.status === "Approved" && 
        (b.billCategory === "Payable" || (!b.billCategory && ["广告", "物流", "工厂订单"].includes(b.billType)))
      );
    }
    
    let result = bills;
    // 按分类筛选（应付款/应收款）
    result = result.filter((b) => {
      // 兼容旧数据：如果没有 billCategory 字段，根据 billType 推断
      if (!b.billCategory) {
        // 默认广告、物流、工厂订单为应付款
        return (activeCategory === "Payable" && ["广告", "物流", "工厂订单"].includes(b.billType));
      }
      return b.billCategory === activeCategory;
    });
    // 按状态筛选
    if (filterStatus !== "all") {
      result = result.filter((b) => b.status === filterStatus);
    }
    // 按类型筛选
    if (filterType !== "all") {
      result = result.filter((b) => b.billType === filterType);
    }
    return result;
  }, [bills, filterStatus, filterType, activeCategory]);

  const handleViewDetail = (bill: MonthlyBill) => {
    setSelectedBill(bill);
    setIsDetailModalOpen(true);
  };

  // 部门同事提交给财务审批
  const handleSubmitForApproval = (billId: string) => {
    // 打开提交审批模态框，让用户上传付款申请书凭证
    setSubmitApprovalModal({ open: true, billId });
    setPaymentApplicationVoucher(""); // 重置凭证
  };

  const handleConfirmSubmitApproval = () => {
    if (!submitApprovalModal.billId) return;
    
    // 验证是否上传了凭证
    const voucherValue = Array.isArray(paymentApplicationVoucher)
      ? (paymentApplicationVoucher.length > 0 ? paymentApplicationVoucher[0] : "")
      : paymentApplicationVoucher;
    
    if (!voucherValue || voucherValue.trim() === "") {
      toast.error("请上传付款申请书凭证", {
        icon: "⚠️",
        duration: 3000,
      });
      return;
    }

    (async () => {
      const allBills = await getMonthlyBills();
      const updatedBills = allBills.map((b) =>
        b.id === submitApprovalModal.billId
          ? {
              ...b,
              status: "Pending_Finance_Review" as BillStatus,
              submittedToFinanceAt: new Date().toISOString(),
              paymentApplicationVoucher: paymentApplicationVoucher
            }
          : b
      );
      mutate("monthly-bills");
      await saveMonthlyBills(updatedBills);
    })();
    setSubmitApprovalModal({ open: false, billId: null });
    setPaymentApplicationVoucher("");
    toast.success("已提交给财务审批（已上传付款申请书凭证）", {
      icon: "✅",
      duration: 3000,
    });
  };

  // 财务审批通过，提交给主管审批
  const handleFinanceApprove = (billId: string) => {
    setConfirmDialog({
      open: true,
      title: "财务审批通过",
      message: "确定要通过财务审批吗？审批通过后将自动提交给公司主管审批。",
      type: "info",
      onConfirm: async () => {
        const allBills = await getMonthlyBills();
        const updatedBills = allBills.map((b) =>
          b.id === billId
            ? {
                ...b,
                status: "Pending_Approval" as BillStatus,
                financeReviewedBy: "财务", // 实际应该从用户系统获取
                financeReviewedAt: new Date().toISOString(),
                submittedAt: new Date().toISOString()
              }
            : b
        );
        mutate("monthly-bills");
        await saveMonthlyBills(updatedBills);
        setConfirmDialog(null);
        toast.success("财务审批通过，已提交给公司主管审批", {
          icon: "✅",
          duration: 3000,
        });
      }
    });
  };

  const handleApprove = (billId: string) => {
    setConfirmDialog({
      open: true,
      title: "批准账单",
      message: "确定要批准这笔账单吗？审批通过后将自动通知出纳进行付款。",
      type: "info",
      onConfirm: async () => {
        const allBills = await getMonthlyBills();
        const bill = allBills.find((b) => b.id === billId);
        if (!bill) {
          toast.error("账单不存在");
          return;
        }

        const updatedBills = allBills.map((b) =>
          b.id === billId
            ? {
                ...b,
                status: "Approved" as BillStatus,
                approvedBy: "公司主管", // 实际应该从用户系统获取
                approvedAt: new Date().toISOString()
              }
            : b
        );
        mutate("monthly-bills");
        await saveMonthlyBills(updatedBills);
        
        // 创建出纳打款通知（仅对应付款账单，异步不阻塞）
        if (bill.billCategory === "Payable" || (!bill.billCategory && ["广告", "物流", "工厂订单"].includes(bill.billType))) {
          const payeeName = bill.agencyName || bill.supplierName || bill.factoryName || "未知";
          void createPaymentNotification(
            bill.id,
            bill.billType,
            bill.month,
            bill.netAmount,
            bill.currency,
            payeeName
          );
        }
        
        setConfirmDialog(null);
        toast.success("已批准，已通知出纳进行打款", {
          icon: "✅",
          duration: 4000,
        });
      }
    });
  };

  const handleReject = (billId: string) => {
    setRejectModal({ open: true, id: billId });
  };

  const handleConfirmReject = () => {
    if (!rejectModal.id) return;
    if (!rejectReason.trim()) {
      toast.error("请输入退回原因", {
        icon: "⚠️",
        duration: 3000,
      });
      return;
    }
    
    (async () => {
      const allBills = await getMonthlyBills();
      const updatedBills = allBills.map((b) =>
        b.id === rejectModal.id
          ? {
              ...b,
              status: "Draft" as BillStatus,
              rejectionReason: rejectReason.trim()
            }
          : b
      );
      mutate("monthly-bills");
      await saveMonthlyBills(updatedBills);
    })();
    toast.success("已退回修改", {
      icon: "✅",
      duration: 3000,
    });
    setRejectModal({ open: false, id: null });
    setRejectReason("");
  };

  // 出纳打款（审批通过后直接打款）
  const handlePay = (billId: string) => {
    setConfirmDialog({
      open: true,
      title: "确认打款",
      message: "确定要打款这笔账单吗？打款后将生成付款单号和财务流水。",
      type: "info",
      onConfirm: () => {
        // 打开付款模态框，让出纳填写付款信息
        const bill = bills.find((b) => b.id === billId);
        if (bill) {
          setSelectedPendingPaymentBill(bill);
          setIsPaymentModalOpen(true);
        }
        setConfirmDialog(null);
      }
    });
  };

  const statusColors: Record<BillStatus, string> = {
    Draft: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    Pending_Finance_Review: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    Pending_Approval: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    Approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    Cashier_Approved: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    Paid: "bg-purple-500/20 text-purple-300 border-purple-500/40"
  };

  const statusLabels: Record<BillStatus, string> = {
    Draft: "草稿",
    Pending_Finance_Review: "待财务审批",
    Pending_Approval: "待主管审批",
    Approved: "已核准",
    Cashier_Approved: "出纳已审核",
    Paid: "已支付"
  };

  const handleOpenRebateDetail = (bill: MonthlyBill) => {
    const receivable = rebateReceivables.find((r) =>
      r.adAccountId === bill.adAccountId &&
      (bill.rechargeIds?.includes(r.rechargeId) || r.agencyId === bill.agencyId)
    );
    if (receivable) {
      setSelectedRebateReceivable(receivable);
      setIsRebateDetailModalOpen(true);
    } else {
      toast.error("未找到关联的返点应收款记录", { icon: "⚠️", duration: 3000 });
    }
  };

  const handleEntryConfirm = useCallback(async () => {
    if (!selectedPendingEntry) return;
    if (!entryForm.accountId) {
      toast.error("请选择入账账户");
      return;
    }
    if (!entryForm.entryDate) {
      toast.error("请选择入账日期");
      return;
    }
    const account = bankAccounts.find((a) => a.id === entryForm.accountId);
    if (!account) {
      toast.error("账户不存在");
      return;
    }
    setIsEntrySubmitting(true);
    try {
      const flowType: "income" | "expense" = selectedPendingEntry.billCategory === "Receivable" ? "income" : "expense";
      const flowAmount = selectedPendingEntry.billCategory === "Receivable"
        ? selectedPendingEntry.netAmount
        : -selectedPendingEntry.netAmount;
      const summary = selectedPendingEntry.type === "Bill"
        ? `${selectedPendingEntry.billType || "账单"} - ${selectedPendingEntry.billCategory === "Payable" ? (selectedPendingEntry.agencyName || selectedPendingEntry.supplierName || selectedPendingEntry.factoryName) : selectedPendingEntry.agencyName}`
        : `付款申请 - ${selectedPendingEntry.expenseItem}`;
      const voucherValue = Array.isArray(entryForm.voucher) ? (entryForm.voucher.length > 0 ? entryForm.voucher[0] : "") : entryForm.voucher;
      const entryDateTime = entryForm.entryDate ? `${entryForm.entryDate}T${new Date().toTimeString().slice(0, 8)}` : new Date().toISOString();
      const newFlow = {
        date: entryDateTime,
        summary,
        category: selectedPendingEntry.type === "Bill"
          ? (selectedPendingEntry.billType === "广告" ? "运营-广告" : selectedPendingEntry.billType === "物流" ? "运营-物流" : selectedPendingEntry.billType === "工厂订单" ? "运营-工厂订单" : selectedPendingEntry.billType === "广告返点" ? "运营-广告返点" : "其他")
          : (selectedPendingEntry.expenseItem || "其他"),
        type: flowType,
        amount: flowAmount,
        accountId: entryForm.accountId,
        accountName: account.name,
        currency: selectedPendingEntry.currency,
        remark: `审批通过后入账 - ${selectedPendingEntry.month || ""} - ${selectedPendingEntry.approvedBy}`,
        relatedId: selectedPendingEntry.relatedId,
        businessNumber: selectedPendingEntry.type === "Bill" ? `BILL-${selectedPendingEntry.month?.replace("-", "") || ""}-${selectedPendingEntry.relatedId.slice(0, 8)}` : `REQ-${selectedPendingEntry.relatedId.slice(0, 8)}`,
        status: "confirmed" as const,
        isReversal: false,
        voucher: voucherValue || undefined
      };
      const createdFlow = await createCashFlow(newFlow);
      const updatedAccounts = bankAccounts.map((a) => {
        if (a.id === entryForm.accountId) {
          const amount = Math.abs(flowAmount);
          const change = flowType === "income" ? amount : -amount;
          const newBalance = (a.originalBalance || 0) + change;
          return { ...a, originalBalance: newBalance, rmbBalance: a.currency === "RMB" ? newBalance : newBalance * (a.exchangeRate || 1) };
        }
        return a;
      });
      setBankAccounts(updatedAccounts);
      await saveAccounts(updatedAccounts);
      await completePendingEntry(selectedPendingEntry.id, entryForm.accountId, account.name, entryForm.entryDate, "财务人员", createdFlow.id);
      if (selectedPendingEntry.type === "Bill") {
        const allBills = await getMonthlyBills();
        const updatedBills = allBills.map((b) =>
          b.id === selectedPendingEntry.relatedId ? { ...b, status: "Paid" as BillStatus, paidBy: "出纳", paidAt: new Date().toISOString(), paymentFlowId: createdFlow.id } : b
        );
        await saveMonthlyBills(updatedBills);
        mutate("monthly-bills");
      } else {
        const { getPaymentRequests, savePaymentRequests } = require("@/lib/payment-request-store");
        const allRequests = getPaymentRequests();
        const updatedRequests = allRequests.map((r: any) =>
          r.id === selectedPendingEntry.relatedId ? { ...r, status: "Paid" as BillStatus, paidBy: "出纳", paidAt: new Date().toISOString(), paymentFlowId: createdFlow.id } : r
        );
        savePaymentRequests(updatedRequests);
      }
      mutate("pending-entries");
      setIsEntryModalOpen(false);
      setSelectedPendingEntry(null);
      setEntryForm({ accountId: "", entryDate: new Date().toISOString().slice(0, 10), voucher: "" });
      toast.success("入账成功！");
    } catch (e) {
      console.error("Failed to complete entry", e);
      toast.error("入账失败，请重试");
    } finally {
      setIsEntrySubmitting(false);
    }
  }, [selectedPendingEntry, entryForm, bankAccounts]);

  // 根据板块获取可用的账单类型
  const availableBillTypes = useMemo(() => {
    if (activeCategory === "Payable") {
      return ["广告", "物流", "工厂订单", "其他"];
    } else {
      return ["店铺回款", "广告返点", "其他"];
    }
  }, [activeCategory]);

  // 统计各板块的账单数量
  const payableBills = useMemo(() => 
    bills.filter((b) => !b.billCategory || b.billCategory === "Payable" || ["广告", "物流", "工厂订单"].includes(b.billType)),
    [bills]
  );
  const receivableBills = useMemo(() => 
    bills.filter((b) => b.billCategory === "Receivable" || ["店铺回款", "广告返点"].includes(b.billType)),
    [bills]
  );
  // 待财务审批的账单（部门同事已提交，等待财务审批）
  const pendingFinanceReviewBills = useMemo(() => 
    bills.filter((b) => 
      b.status === "Pending_Finance_Review" && 
      (b.billCategory === "Payable" || (!b.billCategory && ["广告", "物流", "工厂订单"].includes(b.billType)))
    ),
    [bills]
  );
  // 待出纳打款的账单（主管已批准，等待出纳打款）
  const pendingPaymentBills = useMemo(() => 
    bills.filter((b) => 
      b.status === "Approved" && 
      (b.billCategory === "Payable" || (!b.billCategory && ["广告", "物流", "工厂订单"].includes(b.billType)))
    ),
    [bills]
  );

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

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">对账中心</h1>
          <p className="text-sm text-slate-400 mt-1">管理月账单审批、对账、付款流程</p>
        </div>
        <Link href="/finance/monthly-bills">
          <button className="px-4 py-2 rounded-lg border border-primary-500/40 bg-primary-500/10 text-primary-100 hover:bg-primary-500/20 hover:border-primary-500/60 font-medium transition-all duration-200 flex items-center gap-2 shadow-lg shadow-primary-500/10">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            月账单管理
          </button>
        </Link>
      </div>

      <ReconciliationStats stats={inventoryStats} />

      {/* 应收款/应付款/待入账选项卡 - 优化样式 */}
      <div className="flex gap-2 border-b border-slate-800/50 bg-slate-900/40 rounded-t-xl p-2">
        <button
          onClick={() => {
            setActiveCategory("Payable");
            setFilterType("all"); // 切换板块时重置类型筛选
          }}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
            activeCategory === "Payable"
              ? "border-blue-500 text-blue-400 bg-blue-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          应付款
          {payableBills.length > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              activeCategory === "Payable" ? "bg-blue-500/20 text-blue-300" : "bg-slate-700 text-slate-300"
            }`}>
              {payableBills.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveCategory("Receivable");
            setFilterType("all"); // 切换板块时重置类型筛选
          }}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
            activeCategory === "Receivable"
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          应收款
          {receivableBills.length > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              activeCategory === "Receivable" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"
            }`}>
              {receivableBills.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveCategory("PendingPayment");
            setFilterType("all"); // 切换板块时重置类型筛选
          }}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 relative ${
            activeCategory === "PendingPayment"
              ? "border-rose-500 text-rose-400 bg-rose-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          待出纳打款
          {pendingPaymentBills.length > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              activeCategory === "PendingPayment" ? "bg-rose-500/20 text-rose-300" : "bg-rose-500/20 text-rose-400"
            }`}>
              {pendingPaymentBills.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveCategory("PendingEntry");
            setFilterType("all"); // 切换板块时重置类型筛选
            mutate("pending-entries"); // 刷新待入账任务列表（API）
          }}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 relative ${
            activeCategory === "PendingEntry"
              ? "border-amber-500 text-amber-400 bg-amber-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          待入账
          {pendingEntries.length > 0 && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              activeCategory === "PendingEntry" ? "bg-amber-500/20 text-amber-300" : "bg-amber-500/20 text-amber-400"
            }`}>
              {pendingEntries.length}
            </span>
          )}
        </button>
      </div>

      {/* 待财务审批账单列表 */}
      {activeCategory === "PendingFinanceReview" && (
        <>
          {filteredBills.length === 0 ? (
            <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-12 text-center text-slate-400 backdrop-blur-sm shadow-xl">
              <div className="rounded-full bg-slate-800/50 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <FileText className="h-8 w-8 opacity-30" />
              </div>
              <p>暂无待财务审批账单</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 overflow-hidden backdrop-blur-sm shadow-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">类型</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">服务方</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">净应付</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">创建人</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">提交时间</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredBills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-slate-100">{bill.month}</td>
                      <td className="px-4 py-3 text-slate-300">{bill.billType}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {bill.agencyName || bill.supplierName || bill.factoryName || "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-rose-300">
                        {formatCurrency(bill.netAmount, bill.currency, "expense")}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{bill.currency}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{bill.createdBy || "-"}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {bill.submittedToFinanceAt ? new Date(bill.submittedToFinanceAt).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleViewDetail(bill)}
                          className="px-3 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-primary-100 hover:bg-primary-500/20 text-sm transition"
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 待付款账单列表 */}
      {activeCategory === "PendingPayment" && (
        <>
          {filteredBills.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
              暂无待付款账单
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">类型</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">服务方</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">净应付</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">审批人</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">审批时间</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredBills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-slate-100">{bill.month}</td>
                      <td className="px-4 py-3 text-slate-300">{bill.billType}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {bill.agencyName || bill.supplierName || bill.factoryName || "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-rose-300">
                        {formatCurrency(bill.netAmount, bill.currency, "expense")}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{bill.currency}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{bill.approvedBy || "-"}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">
                        {bill.approvedAt ? new Date(bill.approvedAt).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedPendingPaymentBill(bill);
                            // 刷新账户列表（API）
                            getAccountsFromAPI().then(setBankAccounts);
                            setPaymentForm({
                              accountId: "",
                              paymentDate: new Date().toISOString().slice(0, 10),
                              paymentMethod: "转账",
                              voucher: ""
                            });
                            setIsPaymentModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20 transition"
                        >
                          付款
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 待入账任务列表 */}
      {activeCategory === "PendingEntry" && (
        <>
          {pendingEntries.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
              暂无待入账任务
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">类型</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">服务方/项目</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">金额</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">净金额</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">审批人</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">审批时间</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {pendingEntries.map((entry) => {
                    const serviceProvider = entry.type === "Bill"
                      ? (entry.billCategory === "Payable" 
                          ? (entry.agencyName || entry.supplierName || entry.factoryName || "-")
                          : (entry.agencyName || "-"))
                      : (entry.expenseItem || "-");
                    
                    return (
                      <tr key={entry.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs border ${
                            entry.type === "Bill"
                              ? entry.billCategory === "Payable"
                                ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : "bg-purple-500/20 text-purple-300 border-purple-500/40"
                          }`}>
                            {entry.type === "Bill" 
                              ? (entry.billType || "账单")
                              : "付款申请"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-100">{serviceProvider}</td>
                        <td className="px-4 py-3 text-slate-300">{entry.month || "-"}</td>
                        <td className="px-4 py-3 text-right text-slate-100">
                          {formatCurrency(entry.amount, entry.currency, "expense")}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${
                          entry.billCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"
                        }`}>
                          {formatCurrency(
                            entry.netAmount, 
                            entry.currency, 
                            entry.billCategory === "Receivable" ? "income" : "expense"
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">{entry.approvedBy}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {new Date(entry.approvedAt).toLocaleString("zh-CN")}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setSelectedPendingEntry(entry);
                              setIsEntryModalOpen(true);
                              // 刷新账户列表（API）
                              getAccountsFromAPI().then(setBankAccounts);
                              // 如果有账单，预填充入账日期为账单月份的第一天
                              if (entry.month) {
                                setEntryForm({
                                  accountId: "",
                                  entryDate: `${entry.month}-01`,
                                  voucher: ""
                                });
                              } else {
                                setEntryForm({
                                  accountId: "",
                                  entryDate: new Date().toISOString().slice(0, 10),
                                  voucher: ""
                                });
                              }
                            }}
                            className="px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-100 hover:bg-amber-500/20 transition"
                          >
                            处理入账
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* 应收返点汇总卡片（仅在应收款板块显示） */}
      {activeCategory === "Receivable" && (
        <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/20 to-slate-900/60 p-6 shadow-lg">
          <h2 className="text-lg font-semibold text-emerald-300 mb-4">应收返点总资产</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const totals = getTotalUnsettledRebates();
              return (
                <>
                  <div className="bg-slate-800/60 rounded-lg p-4 border border-emerald-500/20">
                    <div className="text-sm text-slate-400 mb-1">USD 未核销</div>
                    <div className="text-2xl font-bold text-emerald-300">
                      {formatCurrency(totals.USD, "USD", "income")}
                    </div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-4 border border-emerald-500/20">
                    <div className="text-sm text-slate-400 mb-1">CNY 未核销</div>
                    <div className="text-2xl font-bold text-emerald-300">
                      {formatCurrency(totals.CNY, "CNY", "income")}
                    </div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-4 border border-emerald-500/20">
                    <div className="text-sm text-slate-400 mb-1">HKD 未核销</div>
                    <div className="text-2xl font-bold text-emerald-300">
                      {formatCurrency(totals.HKD, "HKD", "income")}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {activeCategory !== "PendingEntry" && activeCategory !== "PendingPayment" && (
        <ReconciliationFilters
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          availableBillTypes={availableBillTypes}
        />
      )}

      {activeCategory !== "PendingEntry" && activeCategory !== "PendingPayment" && (
        <ReconciliationTable
          bills={filteredBills}
          activeCategory={activeCategory as "Payable" | "Receivable"}
          userRole={userRole}
          onViewDetail={handleViewDetail}
          onOpenRebateDetail={handleOpenRebateDetail}
          onSubmitForApproval={handleSubmitForApproval}
          onFinanceApprove={handleFinanceApprove}
          onReject={handleReject}
          onApprove={handleApprove}
          onPay={handlePay}
        />
      )}

      <ReconciliationDetailDialog
        open={isDetailModalOpen && !!selectedBill}
        bill={selectedBill}
        recharges={recharges}
        rebateReceivables={rebateReceivables}
        deliveryOrders={deliveryOrders}
        contracts={contracts}
        consumptions={consumptions}
        onClose={() => setIsDetailModalOpen(false)}
        onViewVoucher={setVoucherViewModal}
      />


      {/* 退回原因输入弹窗 */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">退回原因</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">请输入退回原因 *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="请详细说明退回原因..."
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setRejectModal({ open: false, id: null });
                    setRejectReason("");
                  }}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmReject}
                  className="px-4 py-2 rounded-md bg-rose-500 text-white hover:bg-rose-600"
                >
                  确认退回
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 提交审批弹窗（上传付款申请书凭证） */}
      {submitApprovalModal.open && submitApprovalModal.billId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md" style={{ position: "relative", zIndex: 51 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-100">提交给财务审批</h2>
              <button
                onClick={() => {
                  setSubmitApprovalModal({ open: false, billId: null });
                  setPaymentApplicationVoucher("");
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-2">提示</div>
                <div className="text-sm text-slate-300">
                  提交给财务审批前，请上传付款申请书凭证。提交后将无法修改。
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  付款申请书凭证 <span className="text-red-400">*</span>
                </label>
                <ImageUploader
                  value={paymentApplicationVoucher}
                  onChange={(value) => setPaymentApplicationVoucher(value)}
                  multiple={false}
                  label="上传付款申请书凭证"
                  placeholder="点击上传付款申请书凭证或直接 Ctrl + V 粘贴图片"
                />
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => {
                    setSubmitApprovalModal({ open: false, billId: null });
                    setPaymentApplicationVoucher("");
                  }}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmSubmitApproval}
                  className="px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600"
                >
                  确认提交给财务
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 凭证查看弹窗 */}
      {voucherViewModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 9999 }}
          onClick={() => setVoucherViewModal(null)}
        >
          <div className="relative max-w-5xl max-h-[95vh] p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setVoucherViewModal(null)}
              className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300 z-10 bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
            >
              ✕
            </button>
            {(() => {
              const isBase64 = voucherViewModal && (
                voucherViewModal.startsWith('data:image/') ||
                /^data:[^;]*;base64,/.test(voucherViewModal) ||
                /^[A-Za-z0-9+/=]+$/.test(voucherViewModal) && voucherViewModal.length > 100
              );
              const isUrl = voucherViewModal && (
                voucherViewModal.startsWith('http://') ||
                voucherViewModal.startsWith('https://') ||
                voucherViewModal.startsWith('/')
              );
              let imageSrc = voucherViewModal;
              if (voucherViewModal && /^[A-Za-z0-9+/=]+$/.test(voucherViewModal) && voucherViewModal.length > 100 && !voucherViewModal.startsWith('data:')) {
                imageSrc = `data:image/jpeg;base64,${voucherViewModal}`;
              }
              return (
                <img 
                  src={imageSrc || voucherViewModal} 
                  alt="充值凭证" 
                  className="max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.error-message')) {
                      const errorDiv = document.createElement("div");
                      errorDiv.className = "error-message text-white text-center p-8 bg-rose-500/20 rounded-lg border border-rose-500/40";
                      errorDiv.innerHTML = `<div class="text-rose-300 text-lg mb-2">❌ 图片加载失败</div><div class="text-slate-300 text-sm">请检查图片格式或数据是否正确</div>`;
                      parent.appendChild(errorDiv);
                    }
                  }}
                  onLoad={(e) => {
                    const target = e.target as HTMLImageElement;
                    const errorDiv = target.parentElement?.querySelector('.error-message');
                    if (errorDiv) {
                      errorDiv.remove();
                    }
                  }}
                />
              );
            })()}
          </div>
        </div> 
      )}

      <ReconciliationMatchDialog
        open={isEntryModalOpen && !!selectedPendingEntry}
        pendingEntry={selectedPendingEntry}
        form={entryForm}
        setForm={setEntryForm}
        bankAccounts={bankAccounts}
        onClose={() => {
          setIsEntryModalOpen(false);
          setSelectedPendingEntry(null);
          setEntryForm({ accountId: "", entryDate: new Date().toISOString().slice(0, 10), voucher: "" });
        }}
        onConfirm={handleEntryConfirm}
        isSubmitting={isEntrySubmitting}
      />


      {/* 付款弹窗 */}
      {isPaymentModalOpen && selectedPendingPaymentBill && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md" style={{ position: "relative", zIndex: 51 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-100">付款</h2>
              <button
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setSelectedPendingPaymentBill(null);
                  setPaymentForm({ accountId: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "转账", voucher: "" });
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* 账单信息 */}
            <div className="bg-slate-800/60 rounded-lg p-4 space-y-2 mb-4">
              <div className="text-sm text-slate-400">账单信息</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-400">类型：</span>
                  <span className="text-slate-100 ml-2">{selectedPendingPaymentBill.billType}</span>
                </div>
                <div>
                  <span className="text-slate-400">金额：</span>
                  <span className="text-rose-300 font-medium ml-2">
                    {formatCurrency(selectedPendingPaymentBill.netAmount, selectedPendingPaymentBill.currency, "expense")}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">服务方：</span>
                  <span className="text-slate-100 ml-2">
                    {selectedPendingPaymentBill.agencyName || selectedPendingPaymentBill.supplierName || selectedPendingPaymentBill.factoryName || "-"}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-700">
                  <span className="text-slate-400">付款单号（生成后显示）：</span>
                  <span className="text-primary-300 font-mono ml-2">
                    {(() => {
                      const now = new Date();
                      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
                      const randomStr = Math.random().toString(36).slice(2, 8).toUpperCase();
                      return `PAY-${dateStr}-${randomStr}`;
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* 付款表单 */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">付款账户 *</label>
                <select
                  value={paymentForm.accountId}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, accountId: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                >
                  <option value="">请选择付款账户</option>
                  {bankAccounts
                    .filter((acc) => {
                      const billCurrency = selectedPendingPaymentBill.currency;
                      return acc.currency === billCurrency || acc.currency === "CNY" || acc.currency === "RMB";
                    })
                    .sort((a, b) => {
                      const aMatch = a.currency === selectedPendingPaymentBill.currency;
                      const bMatch = b.currency === selectedPendingPaymentBill.currency;
                      if (aMatch && !bMatch) return -1;
                      if (!aMatch && bMatch) return 1;
                      return a.name.localeCompare(b.name, "zh-CN");
                    })
                    .map((acc) => {
                      const accountTypeLabel = acc.accountCategory === "PRIMARY" ? "主账户" : 
                                               acc.accountCategory === "VIRTUAL" ? "虚拟子账号" : "独立账户";
                      const parentAccount = acc.parentId 
                        ? bankAccounts.find((a) => a.id === acc.parentId)
                        : null;
                      const displayName = parentAccount 
                        ? `${acc.name} (${parentAccount.name}的子账号)`
                        : acc.name;
                      
                      return (
                        <option key={acc.id} value={acc.id}>
                          {displayName} - {accountTypeLabel} - {acc.currency} - 余额: {formatCurrency(
                            acc.originalBalance || 0, 
                            acc.currency, 
                            "balance"
                          )}
                        </option>
                      );
                    })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">付款日期 *</label>
                <input
                  type="date"
                  lang="zh-CN"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400 cursor-pointer"
                  style={{ colorScheme: "dark", position: "relative", zIndex: 10 }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">付款方式 *</label>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  required
                >
                  <option value="转账">转账</option>
                  <option value="支票">支票</option>
                  <option value="现金">现金</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1">付款凭证</label>
                <ImageUploader
                  value={paymentForm.voucher}
                  onChange={(value) => setPaymentForm((f) => ({ ...f, voucher: value }))}
                  multiple={false}
                  label="上传付款凭证"
                  placeholder="点击上传付款凭证或直接 Ctrl + V 粘贴图片"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setSelectedPendingPaymentBill(null);
                  setPaymentForm({ accountId: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "转账", voucher: "" });
                }}
                className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (!paymentForm.accountId) {
                    toast.error("请选择付款账户");
                    return;
                  }
                  if (!paymentForm.paymentDate) {
                    toast.error("请选择付款日期");
                    return;
                  }

                  const account = bankAccounts.find((a) => a.id === paymentForm.accountId);
                  if (!account) {
                    toast.error("账户不存在");
                    return;
                  }

                  // 检查账户余额
                  if ((account.originalBalance || 0) < selectedPendingPaymentBill.netAmount) {
                    toast.error("账户余额不足");
                    return;
                  }

                  // 生成财务流水记录
                  try {
                    const voucherValue = Array.isArray(paymentForm.voucher) 
                      ? (paymentForm.voucher.length > 0 ? paymentForm.voucher[0] : "") 
                      : paymentForm.voucher;

                    // 生成付款单号（格式：PAY-YYYYMMDD-XXXXXX）
                    const now = new Date();
                    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
                    const randomStr = Math.random().toString(36).slice(2, 8).toUpperCase();
                    const paymentVoucherNumber = `PAY-${dateStr}-${randomStr}`;

                    // 将用户选择的日期与当前时间组合，使用完整的日期时间（包括时分秒）
                    const paymentDateTime = paymentForm.paymentDate 
                      ? `${paymentForm.paymentDate}T${new Date().toTimeString().slice(0, 8)}`
                      : new Date().toISOString();

                    const newFlow = {
                      date: paymentDateTime,
                      summary: `${selectedPendingPaymentBill.billType} - ${selectedPendingPaymentBill.agencyName || selectedPendingPaymentBill.supplierName || selectedPendingPaymentBill.factoryName}`,
                      category: selectedPendingPaymentBill.billType === "广告" ? "运营-广告" :
                               selectedPendingPaymentBill.billType === "物流" ? "运营-物流" :
                               selectedPendingPaymentBill.billType === "工厂订单" ? "运营-工厂订单" :
                               "其他",
                      type: "expense" as const,
                      amount: -selectedPendingPaymentBill.netAmount,
                      accountId: paymentForm.accountId,
                      accountName: account.name,
                      currency: selectedPendingPaymentBill.currency,
                      remark: `付款单号：${paymentVoucherNumber} - ${selectedPendingPaymentBill.month} - ${paymentForm.paymentMethod}`,
                      relatedId: selectedPendingPaymentBill.id,
                      businessNumber: paymentVoucherNumber,
                      status: "confirmed" as const,
                      isReversal: false,
                      voucher: voucherValue || undefined
                    };
                    const createdFlow = await createCashFlow(newFlow);

                    // 更新账户余额
                    // 逻辑：待付款是支出操作 → expense 类型 → 余额减少
                    const updatedAccounts = bankAccounts.map((a) => {
                      if (a.id === paymentForm.accountId) {
                        // 与现金流水页面保持一致：待付款是 expense 类型
                        const amount = Math.abs(selectedPendingPaymentBill.netAmount);
                        const change = -amount; // expense 类型，change 为负数
                        const newBalance = (a.originalBalance || 0) + change;
                        return {
                          ...a,
                          originalBalance: newBalance,
                          rmbBalance: a.currency === "RMB"
                            ? newBalance
                            : newBalance * (a.exchangeRate || 1)
                        };
                      }
                      return a;
                    });
                    setBankAccounts(updatedAccounts);
                    await saveAccounts(updatedAccounts);

                    // 更新账单状态为已支付，保存付款明细
                    const allBills = await getMonthlyBills();
                    const updatedBills = allBills.map((b) =>
                      b.id === selectedPendingPaymentBill.id
                        ? {
                            ...b,
                            status: "Paid" as BillStatus,
                            paidBy: "财务人员",
                            paidAt: paymentDateTime,
                            paymentMethod: paymentForm.paymentMethod,
                            paymentAccountId: paymentForm.accountId,
                            paymentAccountName: account.name,
                            paymentVoucher: paymentForm.voucher,
                            paymentVoucherNumber: paymentVoucherNumber,
                            paymentFlowId: createdFlow.id,
                            paymentRemarks: `付款单号：${paymentVoucherNumber}`
                          }
                        : b
                    );
                    await saveMonthlyBills(updatedBills);
                    const refreshedBills = await getMonthlyBills();
                    mutate("monthly-bills");

                    // 标记相关通知为已读
                    const relatedNotifications = await findNotificationsByRelated(selectedPendingPaymentBill.id, "monthly_bill");
                    await Promise.all(relatedNotifications.map((notif) => markNotificationAsRead(notif.id)));

                    setIsPaymentModalOpen(false);
                    setSelectedPendingPaymentBill(null);
                    setPaymentForm({ accountId: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "转账", voucher: "" });
                    
                    toast.success(`付款成功！付款单号：${paymentVoucherNumber}`);
                  } catch (e) {
                    console.error("Failed to process payment", e);
                    toast.error("付款失败，请重试");
                  }
                }}
                className="px-4 py-2 rounded-md bg-rose-500 text-white hover:bg-rose-600"
              >
                确认付款
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type || "warning"}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* 返点明细查看弹窗 */}
      {isRebateDetailModalOpen && selectedRebateReceivable && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto" style={{ position: "relative", zIndex: 51 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-100">返点应收款明细</h2>
              <button
                onClick={() => {
                  setIsRebateDetailModalOpen(false);
                  setSelectedRebateReceivable(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">代理商</div>
                <div className="text-slate-100 font-medium">{selectedRebateReceivable.agencyName}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">广告账户</div>
                <div className="text-slate-100 font-medium">{selectedRebateReceivable.accountName}</div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">返点金额</div>
                <div className="text-emerald-300 font-bold text-lg">
                  {formatCurrency(selectedRebateReceivable.rebateAmount, selectedRebateReceivable.currency, "income")}
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">当前余额</div>
                <div className={`font-bold text-lg ${
                  selectedRebateReceivable.currentBalance > 0 ? "text-emerald-300" : "text-slate-400"
                }`}>
                  {formatCurrency(selectedRebateReceivable.currentBalance, selectedRebateReceivable.currency, "income")}
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">状态</div>
                <div className={`px-2 py-1 rounded text-xs border inline-block ${
                  selectedRebateReceivable.status === "已结清" 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : selectedRebateReceivable.status === "核销中"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-slate-500/20 text-slate-300 border-slate-500/40"
                }`}>
                  {selectedRebateReceivable.status}
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">产生日期</div>
                <div className="text-slate-100">{selectedRebateReceivable.rechargeDate}</div>
              </div>
            </div>

            {/* 核销流水 */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-3">核销流水</h3>
              {selectedRebateReceivable.writeoffRecords.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-800/60 rounded-lg">
                  暂无核销记录
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-slate-300">消耗日期</th>
                        <th className="px-4 py-2 text-right font-medium text-slate-300">核销金额</th>
                        <th className="px-4 py-2 text-right font-medium text-slate-300">剩余余额</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-300">核销时间</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedRebateReceivable.writeoffRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-2 text-slate-300">{record.consumptionDate}</td>
                          <td className="px-4 py-2 text-right text-amber-300">
                            {formatCurrency(record.writeoffAmount, selectedRebateReceivable.currency, "expense")}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            {formatCurrency(record.remainingBalance, selectedRebateReceivable.currency, "income")}
                          </td>
                          <td className="px-4 py-2 text-slate-400 text-xs">
                            {new Date(record.createdAt).toLocaleString("zh-CN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 手动修正记录 */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-100">手动修正记录</h3>
                {userRole === "finance" && (
                  <button
                    onClick={() => setIsAdjustmentModalOpen(true)}
                    className="px-3 py-1.5 rounded border border-blue-500/40 bg-blue-500/10 text-xs text-blue-100 hover:bg-blue-500/20"
                  >
                    + 手动平账
                  </button>
                )}
              </div>
              {selectedRebateReceivable.adjustments.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-800/60 rounded-lg">
                  暂无修正记录
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800/60">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-slate-300">修正金额</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-300">修正原因</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-300">修正人</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-300">修正时间</th>
                        <th className="px-4 py-2 text-right font-medium text-slate-300">修正前余额</th>
                        <th className="px-4 py-2 text-right font-medium text-slate-300">修正后余额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedRebateReceivable.adjustments.map((adj) => (
                        <tr key={adj.id} className="hover:bg-slate-800/40">
                          <td className={`px-4 py-2 font-medium ${
                            adj.amount > 0 ? "text-emerald-300" : "text-rose-300"
                          }`}>
                            {adj.amount > 0 ? "+" : ""}
                            {formatCurrency(adj.amount, selectedRebateReceivable.currency, adj.amount > 0 ? "income" : "expense")}
                          </td>
                          <td className="px-4 py-2 text-slate-300">{adj.reason}</td>
                          <td className="px-4 py-2 text-slate-300 text-xs">{adj.adjustedBy}</td>
                          <td className="px-4 py-2 text-slate-400 text-xs">
                            {new Date(adj.adjustedAt).toLocaleString("zh-CN")}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            {formatCurrency(adj.balanceBefore, selectedRebateReceivable.currency, "income")}
                          </td>
                          <td className="px-4 py-2 text-right text-emerald-300">
                            {formatCurrency(adj.balanceAfter, selectedRebateReceivable.currency, "income")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 手动平账弹窗 */}
      {isAdjustmentModalOpen && selectedRebateReceivable && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md" style={{ position: "relative", zIndex: 52 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-100">手动平账</h2>
              <button
                onClick={() => {
                  setIsAdjustmentModalOpen(false);
                  setAdjustmentForm({ amount: "", reason: "" });
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const amount = Number(adjustmentForm.amount);
                if (Number.isNaN(amount) || amount === 0) {
                  toast.error("修正金额不能为零");
                  return;
                }
                if (!adjustmentForm.reason.trim()) {
                  toast.error("请输入修正原因");
                  return;
                }

                // 执行修正
                const updatedReceivables = rebateReceivables.map((r) => {
                  if (r.id === selectedRebateReceivable.id) {
                    const balanceBefore = r.currentBalance;
                    const balanceAfter = Math.max(0, balanceBefore + amount); // 允许扣减为0，但不允许负数
                    
                    const adjustment = {
                      id: crypto.randomUUID(),
                      amount,
                      reason: adjustmentForm.reason.trim(),
                      adjustedBy: "财务", // 实际应该从用户系统获取
                      adjustedAt: new Date().toISOString(),
                      balanceBefore,
                      balanceAfter
                    };

                    const newStatus: RebateReceivable["status"] = 
                      balanceAfter <= 0.01 ? "已结清" : 
                      (r.status === "待核销" ? "核销中" : r.status);

                    return {
                      ...r,
                      currentBalance: balanceAfter,
                      status: newStatus,
                      adjustments: [...r.adjustments, adjustment],
                      updatedAt: new Date().toISOString()
                    };
                  }
                  return r;
                });

                try {
                  await saveRebateReceivables(updatedReceivables);
                  mutate("rebate-receivables");
                  setSelectedRebateReceivable(updatedReceivables.find((r) => r.id === selectedRebateReceivable.id) || null);
                  setIsAdjustmentModalOpen(false);
                  setAdjustmentForm({ amount: "", reason: "" });
                  toast.success("已手动平账");
                } catch (err) {
                  console.error("保存平账失败", err);
                  toast.error("操作失败，请重试");
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">当前余额</label>
                <div className="text-emerald-300 font-bold text-lg">
                  {formatCurrency(selectedRebateReceivable.currentBalance, selectedRebateReceivable.currency, "income")}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  修正金额 *（正数表示增加，负数表示扣减）
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustmentForm.amount}
                  onChange={(e) => setAdjustmentForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="例如：-10.50 或 10.50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">修正原因 *</label>
                <textarea
                  value={adjustmentForm.reason}
                  onChange={(e) => setAdjustmentForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={4}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="请详细说明修正原因（必填）"
                  required
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdjustmentModalOpen(false);
                    setAdjustmentForm({ amount: "", reason: "" });
                  }}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-blue-500 text-white hover:bg-blue-600"
                >
                  确认修正
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div> 
  ); 
}
