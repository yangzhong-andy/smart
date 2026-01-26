"use client";

import toast from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";

import { useState, useEffect, useCallback } from "react";
import { getMonthlyBills, saveMonthlyBills, getBillsByStatus, type MonthlyBill, type BillStatus, type BillType, type BillCategory } from "@/lib/reconciliation-store";
import { getAdConsumptions, getAdRecharges, getAgencies, type Agency } from "@/lib/ad-agency-store";
import { formatCurrency, formatCurrencyString } from "@/lib/currency-utils";
import { createPendingEntry, getPendingEntryByRelatedId } from "@/lib/pending-entry-store";
import { 
  getRebateReceivables, 
  saveRebateReceivables, 
  getRebateReceivableByRechargeId,
  type RebateReceivable 
} from "@/lib/rebate-receivable-store";
import { getPurchaseContracts, getPurchaseContractById } from "@/lib/purchase-contracts-store";
import { FileImage } from "lucide-react";
import { 
  getExpenseRequests, 
  getExpenseRequestsByStatus, 
  updateExpenseRequest,
  type ExpenseRequest 
} from "@/lib/expense-income-request-store";
import { 
  getIncomeRequests, 
  getIncomeRequestsByStatus, 
  updateIncomeRequest,
  type IncomeRequest 
} from "@/lib/expense-income-request-store";

export default function ApprovalCenterPage() {
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending"); // 当前标签：待审批/历史记录
  const [historyFilter, setHistoryFilter] = useState<BillStatus | "all">("all"); // 历史记录状态筛选
  const [billTypeFilter, setBillTypeFilter] = useState<BillType | "all">("all"); // 账单类型筛选（待审批和历史记录共用）
  
  const [pendingBills, setPendingBills] = useState<MonthlyBill[]>([]);
  const [pendingExpenseRequests, setPendingExpenseRequests] = useState<ExpenseRequest[]>([]);
  const [pendingIncomeRequests, setPendingIncomeRequests] = useState<IncomeRequest[]>([]);
  const [historyBills, setHistoryBills] = useState<MonthlyBill[]>([]);
  const [historyExpenseRequests, setHistoryExpenseRequests] = useState<ExpenseRequest[]>([]);
  const [historyIncomeRequests, setHistoryIncomeRequests] = useState<IncomeRequest[]>([]);
  
  const [selectedBill, setSelectedBill] = useState<MonthlyBill | null>(null);
  const [selectedExpenseRequest, setSelectedExpenseRequest] = useState<ExpenseRequest | null>(null);
  const [selectedIncomeRequest, setSelectedIncomeRequest] = useState<IncomeRequest | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState(false);
  const [recharges, setRecharges] = useState<any[]>([]);
  const [consumptions, setConsumptions] = useState<any[]>([]);
  const [rebateReceivables, setRebateReceivables] = useState<RebateReceivable[]>([]);
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; type: "bill" | "expense" | "income" | null; id: string | null }>({
    open: false,
    type: null,
    id: null
  });
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title?: string;
    message: string;
    type?: "danger" | "warning" | "info";
    onConfirm: () => void;
  } | null>(null);
  
  // 模拟用户角色（实际应该从用户系统获取）
  const [userRole] = useState<"finance" | "boss" | "cashier">("boss");

  // 加载历史审批记录
  const loadHistoryRecords = useCallback(async () => {
    const allBills = await getMonthlyBills();
    // 历史记录：所有非草稿且非待审批状态的记录，或者有退回原因的记录
    const history = allBills.filter((b) => {
      // 排除草稿和待审批状态
      if (b.status === "Draft" || b.status === "Pending_Approval") {
        return false;
      }
      // 包含已批准、已支付，或者有退回原因的（即使状态是草稿，但有退回原因说明曾经被退回）
      return b.status === "Approved" || b.status === "Paid" || !!b.rejectionReason;
    });
    setHistoryBills(history);
    
    
    // 加载支出和收入申请历史记录
    getExpenseRequests().then((allExpenseRequests) => {
      const historyExpenseReqs = allExpenseRequests.filter((r) => {
        if (r.status === "Draft" || r.status === "Pending_Approval") {
          return false;
        }
        return r.status === "Approved" || r.status === "Paid" || r.status === "Received" || !!r.rejectionReason;
      });
      setHistoryExpenseRequests(historyExpenseReqs);
    });
    
    getIncomeRequests().then((allIncomeRequests) => {
      const historyIncomeReqs = allIncomeRequests.filter((r) => {
        if (r.status === "Draft" || r.status === "Pending_Approval") {
          return false;
        }
        return r.status === "Approved" || r.status === "Paid" || r.status === "Received" || !!r.rejectionReason;
      });
      setHistoryIncomeRequests(historyIncomeReqs);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    getBillsByStatus("Pending_Approval").then(setPendingBills);
    // 加载支出和收入申请
    getExpenseRequestsByStatus("Pending_Approval").then(setPendingExpenseRequests);
    getIncomeRequestsByStatus("Pending_Approval").then(setPendingIncomeRequests);
    // 加载历史记录
    loadHistoryRecords();
    // 加载充值记录和消耗记录，用于详情显示
    const loadedRecharges = getAdRecharges();
    setRecharges(loadedRecharges);
    const loadedConsumptions = getAdConsumptions();
    setConsumptions(loadedConsumptions);
    // 加载返点应收款记录
    const loadedRebateReceivables = getRebateReceivables();
    setRebateReceivables(loadedRebateReceivables);
  }, [loadHistoryRecords]);

  const handleViewDetail = (bill: MonthlyBill) => {
    setSelectedBill(bill);
    setIsDetailModalOpen(true);
  };

  const handleApprove = async (billId: string) => {
    // 从最新的数据源获取账单信息，确保数据同步
    const allBills = await getMonthlyBills();
    const bill = allBills.find((b) => b.id === billId);
    if (!bill) return;
    
    // 获取账单信息用于弹窗显示
    const billType = bill.billType || "账单";
    const serviceProvider = bill.billCategory === "Payable" 
      ? (bill.agencyName || bill.supplierName || bill.factoryName || "-")
      : (bill.agencyName || "-");
    const billAmount = formatCurrencyString(
      bill.netAmount, 
      bill.currency
    );
    
    setConfirmDialog({
      open: true,
      title: "批准账单",
      message: `确定要批准这笔账单吗？批准后系统将自动推送给财务人员处理入账。\n\n账单信息：\n- 类型：${billType}\n- 金额：${billAmount}\n- 服务方：${serviceProvider}`,
      type: "info",
      onConfirm: () => {
        const updatedBills = allBills.map((b) =>
          b.id === billId
            ? {
                ...b,
                status: "Approved" as BillStatus,
                approvedBy: "老板", // 实际应该从用户系统获取
                approvedAt: new Date().toISOString()
              }
            : b
        );
        saveMonthlyBills(updatedBills).then(() => {
          setPendingBills(updatedBills.filter((b) => b.status === "Pending_Approval"));
          // 刷新历史记录
          loadHistoryRecords();
        });
        
        // 如果是广告账单，且未生成返点应收款，则自动生成
        if (bill.billType === "广告" && bill.agencyId && bill.adAccountId) {
          (async () => {
            try {
              // 获取代理商信息，用于获取返点比例
              const agencies = getAgencies();
              const agency = bill.agencyId ? agencies.find((a: Agency) => a.id === bill.agencyId) : null;
              
              if (agency && bill.agencyId) {
                // 获取返点比例
                const rebateRate = agency?.rebateConfig?.rate || agency?.rebateRate || 0;
                
                // 计算返点金额：基于实付金额（netAmount）
                // 实付金额 = 充值金额，返点金额 = 实付金额 * 返点比例 / 100
                const rebateAmount = (bill.netAmount * rebateRate) / 100;
                
                // 如果有返点金额且大于0，生成返点应收款记录
                if (rebateAmount > 0) {
                  // 获取关联的充值记录（账单应该至少关联一个充值记录）
                  const recharges = getAdRecharges();
                  const relatedRecharges = bill.rechargeIds 
                    ? recharges.filter((r) => bill.rechargeIds?.includes(r.id))
                    : [];
                  
                  // 如果没有关联充值记录，使用账单的月份作为充值日期
                  const rechargeDate = relatedRecharges.length > 0 
                    ? relatedRecharges[0].date 
                    : `${bill.month}-01`;
                  
                  // 获取第一个充值记录ID，如果没有则使用账单ID作为关联ID
                  const rechargeId = relatedRecharges.length > 0 
                    ? relatedRecharges[0].id 
                    : billId;
                  
                  // 检查是否已存在该账单的返点应收款（防止重复创建）
                  const existingReceivables = getRebateReceivables();
                  const existingReceivable = existingReceivables.find(
                    (r) => r.rechargeId === rechargeId || r.rechargeId === billId
                  );
                  
                  if (!existingReceivable) {
                    // 创建新的返点应收款记录
                    const newReceivable: RebateReceivable = {
                      id: `rebate-receivable-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                      rechargeId: rechargeId,
                      rechargeDate: rechargeDate,
                      agencyId: bill.agencyId, // 此时 bill.agencyId 已确保存在
                      agencyName: bill.agencyName || agency.name,
                      adAccountId: bill.adAccountId || "",
                      accountName: bill.accountName || "-",
                      platform: agency.platform || "其他",
                      rebateAmount: rebateAmount,
                      currency: bill.currency,
                      currentBalance: rebateAmount, // 初始余额等于返点金额
                      status: "待核销" as const,
                      writeoffRecords: [],
                      adjustments: [],
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      notes: `审批通过后自动生成：广告账单 ${billId} 的返点应收款（实付金额：${formatCurrency(bill.netAmount, bill.currency, "expense")}，返点比例：${rebateRate}%）`
                    };
                    
                    const updatedReceivables = [...existingReceivables, newReceivable];
                    saveRebateReceivables(updatedReceivables);
                    console.log(`✅ 已生成返点应收款记录：${newReceivable.id}，金额：${formatCurrency(rebateAmount, bill.currency, "income")}`);
                    
                    // 在对账中心生成"广告返点"类型的应收款账单
                    const existingBills = await getMonthlyBills();
                    // 查找同一关联方（代理商+账户）、同一月份、同一类型、同一币种的草稿账单
                    const existingRebateBill = existingBills.find(
                      (b) =>
                        b.month === bill.month &&
                        b.billType === "广告返点" &&
                        b.billCategory === "Receivable" &&
                        b.agencyId === bill.agencyId &&
                        b.adAccountId === bill.adAccountId &&
                        b.currency === bill.currency &&
                        b.status === "Draft"
                    );
                    
                    if (existingRebateBill) {
                      // 合并到现有账单
                      const updatedRebateBill: MonthlyBill = {
                        ...existingRebateBill,
                        totalAmount: existingRebateBill.totalAmount + rebateAmount,
                        rebateAmount: existingRebateBill.rebateAmount + rebateAmount,
                        netAmount: existingRebateBill.netAmount + rebateAmount,
                        rechargeIds: [...(existingRebateBill.rechargeIds || []), rechargeId],
                        notes: `更新：审批通过广告账单 ${billId} 后自动生成返点应收款`
                      };
                      const updatedBills = existingBills.map((b) =>
                        b.id === existingRebateBill.id ? updatedRebateBill : b
                      );
                      await saveMonthlyBills(updatedBills);
                      console.log(`✅ 已更新对账中心应收款账单：${updatedRebateBill.id}`);
                    } else {
                      // 创建新的返点应收款账单
                      const newRebateBill: MonthlyBill = {
                        id: `bill-rebate-approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        month: bill.month,
                        billCategory: "Receivable" as const,
                        billType: "广告返点" as const,
                        agencyId: bill.agencyId || undefined,
                        agencyName: bill.agencyName || agency.name,
                        adAccountId: bill.adAccountId || undefined,
                        accountName: bill.accountName || "-",
                        totalAmount: rebateAmount,
                        currency: bill.currency,
                        rebateAmount: rebateAmount,
                        netAmount: rebateAmount,
                        consumptionIds: [],
                        rechargeIds: [rechargeId],
                        status: "Draft",
                        createdBy: "系统",
                        createdAt: new Date().toISOString(),
                        notes: `自动生成：审批通过广告账单 ${billId} 后生成的返点应收款（关联单据号：${billId}）`
                      };
                      const updatedBills = [...existingBills, newRebateBill];
                      await saveMonthlyBills(updatedBills);
                      console.log(`✅ 已生成对账中心应收款账单并推送到对账中心：${newRebateBill.id}（关联单据号：${billId}）`);
                    }
                  }
                }
              }
            } catch (e) {
              console.error("Failed to generate rebate receivable", e);
            }
          })();
        }
        
        // 推送逻辑：应收款推送到待入账，应付款推送到待付款
        // 只有应收款（Receivable）才创建待入账任务
        // 应付款（Payable）不创建待入账任务，会自动出现在待付款列表中
        if (bill.billCategory === "Receivable") {
          // 应收款：创建待入账任务，推送给财务人员处理入账
          const existingEntry = getPendingEntryByRelatedId("Bill", billId);
          if (!existingEntry) {
            try {
              createPendingEntry({
                type: "Bill",
                relatedId: billId,
                billCategory: bill.billCategory,
                billType: bill.billType,
                month: bill.month,
                agencyName: bill.agencyName,
                supplierName: bill.supplierName,
                factoryName: bill.factoryName,
                accountName: bill.accountName,
                amount: bill.totalAmount,
                currency: bill.currency,
                netAmount: bill.netAmount,
                approvedBy: "老板",
                approvedAt: new Date().toISOString(),
                notes: bill.notes
              });
              console.log(`✅ 应收款账单 ${billId} 审批通过，已创建待入账任务（推送到待入账列表）`);
            } catch (e) {
              console.error(`❌ 创建待入账任务失败：${billId}`, e);
              toast.error("创建待入账任务失败，请手动处理", { icon: "⚠️", duration: 4000 });
            }
          } else {
            console.log(`⚠️ 应收款账单 ${billId} 的待入账任务已存在，跳过创建`);
          }
        } else if (bill.billCategory === "Payable") {
          // 应付款：不创建待入账任务，会自动出现在待付款列表中（通过 status === "Approved" 和 billCategory === "Payable" 筛选）
          console.log(`✅ 应付款账单 ${billId} 审批通过，已推送到待付款列表（status: Approved, billCategory: Payable）`);
        } else {
          // 如果 billCategory 未设置或为其他值，根据账单类型推断
          console.warn(`⚠️ 账单 ${billId} 的 billCategory 为 ${bill.billCategory || "undefined"}，无法确定推送位置`);
        }
        
        setConfirmDialog(null);
        toast.success("已批准，已推送给财务人员处理入账", { icon: "✅", duration: 4000 });
      }
    });
  };

  const handleReject = (billId: string) => {
    setRejectModal({ open: true, type: "bill", id: billId });
  };

  const handleConfirmReject = () => {
    if (!rejectModal.id || !rejectModal.type) return;
    if (!rejectReason.trim()) {
      toast.error("请输入退回原因", { icon: "⚠️", duration: 3000 });
      return;
    }
    
    if (rejectModal.type === "bill") {
      getMonthlyBills().then(async (allBills) => {
        const updatedBills = allBills.map((b) =>
          b.id === rejectModal.id
            ? {
                ...b,
                status: "Draft" as BillStatus,
                rejectionReason: rejectReason.trim()
              }
            : b
        );
        await saveMonthlyBills(updatedBills);
        setPendingBills(updatedBills.filter((b) => b.status === "Pending_Approval"));
        // 刷新历史记录
        loadHistoryRecords();
      });
    } else if (rejectModal.type === "expense") {
      updateExpenseRequest(rejectModal.id, {
        status: "Rejected",
        rejectionReason: rejectReason.trim()
      }).then(async () => {
        const updated = await getExpenseRequestsByStatus("Pending_Approval");
        setPendingExpenseRequests(updated);
        loadHistoryRecords();
        toast.success("已退回修改", { icon: "✅", duration: 3000 });
        setRejectModal({ open: false, type: null, id: null });
        setRejectReason("");
      }).catch((error: any) => {
        toast.error(error.message || "退回失败", { icon: "❌", duration: 3000 });
      });
      return;
    } else if (rejectModal.type === "income") {
      updateIncomeRequest(rejectModal.id, {
        status: "Rejected",
        rejectionReason: rejectReason.trim()
      }).then(async () => {
        const updated = await getIncomeRequestsByStatus("Pending_Approval");
        setPendingIncomeRequests(updated);
        loadHistoryRecords();
        toast.success("已退回修改", { icon: "✅", duration: 3000 });
        setRejectModal({ open: false, type: null, id: null });
        setRejectReason("");
      }).catch((error: any) => {
        toast.error(error.message || "退回失败", { icon: "❌", duration: 3000 });
      });
      return;
    }
    
    toast.success("已退回修改", { icon: "✅", duration: 3000 });
    setRejectModal({ open: false, type: null, id: null });
    setRejectReason("");
  };

  // PaymentRequest 已合并到 ExpenseRequest，相关函数已删除

  // 审批支出申请
  const handleApproveExpenseRequest = async (requestId: string) => {
    const allExpenseRequests = await getExpenseRequests();
    const request = allExpenseRequests.find((r) => r.id === requestId);
    if (!request) return;
    
    setConfirmDialog({
      open: true,
      title: "批准支出申请",
      message: `确定要批准这笔支出申请吗？批准后财务将选择账户并完成出账。\n\n申请信息：\n- 摘要：${request.summary}\n- 分类：${request.category}\n- 金额：${formatCurrencyString(request.amount, request.currency)}`,
      type: "info",
      onConfirm: async () => {
        try {
          await updateExpenseRequest(requestId, {
            status: "Approved",
            approvedBy: "老板",
            approvedAt: new Date().toISOString()
          });
          const updated = await getExpenseRequestsByStatus("Pending_Approval");
          setPendingExpenseRequests(updated);
          loadHistoryRecords();
          // 触发自定义事件，通知财务工作台刷新
          window.dispatchEvent(new CustomEvent("approval-updated"));
          toast.success("已批准，已推送给财务人员处理出账", { icon: "✅", duration: 4000 });
        } catch (error: any) {
          toast.error(error.message || "审批失败", { icon: "❌", duration: 3000 });
        }
      }
    });
  };

  // 审批收入申请
  const handleApproveIncomeRequest = async (requestId: string) => {
    const allIncomeRequests = await getIncomeRequests();
    const request = allIncomeRequests.find((r) => r.id === requestId);
    if (!request) return;
    
    setConfirmDialog({
      open: true,
      title: "批准收入申请",
      message: `确定要批准这笔收入申请吗？批准后财务将选择账户并完成入账。\n\n申请信息：\n- 摘要：${request.summary}\n- 分类：${request.category}\n- 金额：${formatCurrencyString(request.amount, request.currency)}`,
      type: "info",
      onConfirm: async () => {
        try {
          await updateIncomeRequest(requestId, {
            status: "Approved",
            approvedBy: "老板",
            approvedAt: new Date().toISOString()
          });
          const updated = await getIncomeRequestsByStatus("Pending_Approval");
          setPendingIncomeRequests(updated);
          loadHistoryRecords();
          // 触发自定义事件，通知财务工作台刷新
          window.dispatchEvent(new CustomEvent("approval-updated"));
          toast.success("已批准，已推送给财务人员处理入账", { icon: "✅", duration: 4000 });
        } catch (error: any) {
          toast.error(error.message || "审批失败", { icon: "❌", duration: 3000 });
        }
      }
    });
  };

  // 退回支出申请
  const handleRejectExpenseRequest = (requestId: string) => {
    setRejectModal({ open: true, type: "expense", id: requestId });
  };

  // 退回收入申请
  const handleRejectIncomeRequest = (requestId: string) => {
    setRejectModal({ open: true, type: "income", id: requestId });
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

  // 根据筛选条件过滤待审批账单（按类型筛选）
  const filteredPendingBills = billTypeFilter === "all"
    ? pendingBills
    : pendingBills.filter((b) => b.billType === billTypeFilter);

  // 根据筛选条件过滤历史记录（按状态和类型筛选）
  const filteredHistoryBills = historyBills.filter((b) => {
    // 状态筛选
    if (historyFilter !== "all") {
      if (historyFilter === "Draft" && b.rejectionReason) {
        // 如果有退回原因，即使状态是草稿，也视为退回记录
        // 继续检查类型筛选
      } else if (b.status !== historyFilter) {
        return false;
      }
    }
    // 类型筛选
    if (billTypeFilter !== "all" && b.billType !== billTypeFilter) {
      return false;
    }
    return true;
  });

  // 合并支出和收入申请历史记录
  const allHistoryRequests = [...historyExpenseRequests, ...historyIncomeRequests];
  
  const filteredHistoryRequests = historyFilter === "all"
    ? allHistoryRequests
    : allHistoryRequests.filter((r) => {
        if (historyFilter === "Draft" && r.rejectionReason) {
          // 如果有退回原因，即使状态是草稿，也视为退回记录
          return true;
        }
        return r.status === historyFilter;
      });

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">审批中心</h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeTab === "pending" 
              ? `待审批：月账单 ${pendingBills.length} 笔，支出申请 ${pendingExpenseRequests.length} 笔，收入申请 ${pendingIncomeRequests.length} 笔`
              : `历史记录：月账单 ${historyBills.length} 笔，支出申请 ${historyExpenseRequests.length} 笔，收入申请 ${historyIncomeRequests.length} 笔`
            }
          </p>
        </div>
      </div>

      {/* 标签页切换 - 优化样式 */}
      <div className="flex gap-2 border-b border-slate-800/50 bg-slate-900/40 rounded-t-xl p-2">
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
            activeTab === "pending"
              ? "border-primary-500 text-primary-400 bg-primary-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          待审批
          {(pendingBills.length > 0 || pendingExpenseRequests.length > 0 || pendingIncomeRequests.length > 0) && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              activeTab === "pending" ? "bg-primary-500/20 text-primary-300" : "bg-slate-700 text-slate-300"
            }`}>
              {pendingBills.length + pendingExpenseRequests.length + pendingIncomeRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab("history");
            loadHistoryRecords(); // 切换时刷新历史记录
          }}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
            activeTab === "history"
              ? "border-primary-500 text-primary-400 bg-primary-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          历史记录
          {(historyBills.length > 0 || historyExpenseRequests.length > 0 || historyIncomeRequests.length > 0) && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
              activeTab === "history" ? "bg-primary-500/20 text-primary-300" : "bg-slate-700 text-slate-300"
            }`}>
              {historyBills.length + historyExpenseRequests.length + historyIncomeRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* 筛选器 */}
      <div className="flex items-center gap-4">
        {/* 账单类型筛选（待审批和历史记录共用） */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">账单类型：</span>
          <select
            value={billTypeFilter}
            onChange={(e) => setBillTypeFilter(e.target.value as BillType | "all")}
            className="rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
          >
            <option value="all">全部类型</option>
            <option value="广告">广告</option>
            <option value="物流">物流</option>
            <option value="工厂订单">工厂订单</option>
            <option value="店铺回款">店铺回款</option>
            <option value="广告返点">广告返点</option>
            <option value="其他">其他</option>
          </select>
        </div>
        
        {/* 历史记录状态筛选 */}
        {activeTab === "history" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">筛选状态：</span>
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as BillStatus | "all")}
              className="rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            >
              <option value="all">全部状态</option>
              <option value="Approved">已批准</option>
              <option value="Paid">已支付</option>
              <option value="Draft">已退回</option>
            </select>
          </div>
        )}
      </div>

      {/* 待审批内容 */}
      {activeTab === "pending" && (
        <>
          {filteredPendingBills.length === 0 && pendingExpenseRequests.length === 0 && pendingIncomeRequests.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-12 text-center">
              <div className="text-slate-400 text-4xl mb-4">✓</div>
              <p className="text-slate-300 font-medium mb-1">暂无待审批项目</p>
              <p className="text-sm text-slate-500">所有审批已处理完毕</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 月账单 */}
              {filteredPendingBills.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">月账单 ({filteredPendingBills.length})</h2>
              <div className="space-y-4">
                {filteredPendingBills.map((bill) => (
            <div
              key={bill.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">账单月份</div>
                      <div className="text-lg font-semibold text-slate-100">{bill.month}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">代理商</div>
                      <div className="text-slate-200 font-medium">{bill.agencyName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">创建人</div>
                      <div className="text-slate-300 text-sm">{bill.createdBy}</div>
                    </div>
                    {bill.submittedAt && (
                      <div>
                        <div className="text-xs text-slate-400 mb-1">提交时间</div>
                        <div className="text-slate-300 text-sm">
                          {new Date(bill.submittedAt).toLocaleString("zh-CN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">账单金额</div>
                      <div className="text-slate-100">
                        {formatCurrency(bill.totalAmount, bill.currency, "expense")}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">返点金额</div>
                      <div className="text-emerald-300">
                        {formatCurrency(bill.rebateAmount, bill.currency, "income")}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">净应付</div>
                      <div className="text-lg font-semibold text-rose-300">
                        {formatCurrency(bill.netAmount, bill.currency, "expense")}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">币种</div>
                      <div className="text-slate-300">{bill.currency}</div>
                    </div>
                  </div>

                  {bill.notes && (
                    <div className="mb-4">
                      <div className="text-xs text-slate-400 mb-1">备注</div>
                      <div className="text-slate-300 text-sm">{bill.notes}</div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewDetail(bill)}
                      className="px-3 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20"
                    >
                      查看详细清单
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-6">
                  <button
                    onClick={() => handleApprove(bill.id)}
                    className="px-6 py-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 font-medium transition"
                  >
                    ✓ 批准
                  </button>
                  <button
                    onClick={() => handleReject(bill.id)}
                    className="px-6 py-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20 font-medium transition"
                  >
                    ✗ 退回修改
                  </button>
                </div>
              </div>
            </div>
                ))}
              </div>
            </div>
          )}

          {/* 支出申请 */}
          {pendingExpenseRequests.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">支出申请 ({pendingExpenseRequests.length})</h2>
              <div className="space-y-4">
                {pendingExpenseRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">摘要</div>
                            <div className="text-lg font-semibold text-slate-100">{request.summary}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">分类</div>
                            <div className="text-slate-200 font-medium">{request.category}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">发起人</div>
                            <div className="text-slate-300 text-sm">{request.createdBy}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">日期</div>
                            <div className="text-slate-300 text-sm">{request.date}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">金额</div>
                            <div className="text-lg font-semibold text-rose-300">
                              {formatCurrency(request.amount, request.currency, "expense")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">币种</div>
                            <div className="text-slate-300">{request.currency}</div>
                          </div>
                          {request.businessNumber && (
                            <div>
                              <div className="text-xs text-slate-400 mb-1">关联单号</div>
                              <div className="text-slate-300">{request.businessNumber}</div>
                            </div>
                          )}
                        </div>

                        {request.remark && (
                          <div className="mb-4">
                            <div className="text-xs text-slate-400 mb-1">备注</div>
                            <div className="text-slate-300 text-sm">{request.remark}</div>
                          </div>
                        )}

                        {request.voucher && (
                          <div className="mb-4">
                            <div className="text-xs text-slate-400 mb-2">凭证</div>
                            <div className="flex gap-2 flex-wrap">
                              {(Array.isArray(request.voucher) ? request.voucher : [request.voucher]).map((v, idx) => (
                                <div key={idx} className="relative">
                                  <img
                                    src={v}
                                    alt={`凭证 ${idx + 1}`}
                                    className="w-20 h-20 object-cover rounded border border-slate-700 cursor-pointer hover:opacity-80"
                                    onClick={() => {
                                      const modal = document.createElement("div");
                                      modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur";
                                      modal.onclick = () => document.body.removeChild(modal);
                                      const img = document.createElement("img");
                                      img.src = v;
                                      img.className = "max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl";
                                      img.onclick = (e) => e.stopPropagation();
                                      modal.appendChild(img);
                                      document.body.appendChild(modal);
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-6">
                        <button
                          onClick={() => handleApproveExpenseRequest(request.id)}
                          className="px-6 py-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 font-medium transition"
                        >
                          ✓ 批准
                        </button>
                        <button
                          onClick={() => handleRejectExpenseRequest(request.id)}
                          className="px-6 py-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20 font-medium transition"
                        >
                          ✗ 退回修改
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 收入申请 */}
          {pendingIncomeRequests.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-200 mb-4">收入申请 ({pendingIncomeRequests.length})</h2>
              <div className="space-y-4">
                {pendingIncomeRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">摘要</div>
                            <div className="text-lg font-semibold text-slate-100">{request.summary}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">分类</div>
                            <div className="text-slate-200 font-medium">{request.category}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">发起人</div>
                            <div className="text-slate-300 text-sm">{request.createdBy}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">日期</div>
                            <div className="text-slate-300 text-sm">{request.date}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">金额</div>
                            <div className="text-lg font-semibold text-emerald-300">
                              {formatCurrency(request.amount, request.currency, "income")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">币种</div>
                            <div className="text-slate-300">{request.currency}</div>
                          </div>
                          {request.storeName && (
                            <div>
                              <div className="text-xs text-slate-400 mb-1">所属店铺</div>
                              <div className="text-slate-300">{request.storeName}</div>
                            </div>
                          )}
                        </div>

                        {request.remark && (
                          <div className="mb-4">
                            <div className="text-xs text-slate-400 mb-1">备注</div>
                            <div className="text-slate-300 text-sm">{request.remark}</div>
                          </div>
                        )}

                        {request.voucher && (
                          <div className="mb-4">
                            <div className="text-xs text-slate-400 mb-2">凭证</div>
                            <div className="flex gap-2 flex-wrap">
                              {(Array.isArray(request.voucher) ? request.voucher : [request.voucher]).map((v, idx) => (
                                <div key={idx} className="relative">
                                  <img
                                    src={v}
                                    alt={`凭证 ${idx + 1}`}
                                    className="w-20 h-20 object-cover rounded border border-slate-700 cursor-pointer hover:opacity-80"
                                    onClick={() => {
                                      const modal = document.createElement("div");
                                      modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur";
                                      modal.onclick = () => document.body.removeChild(modal);
                                      const img = document.createElement("img");
                                      img.src = v;
                                      img.className = "max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl";
                                      img.onclick = (e) => e.stopPropagation();
                                      modal.appendChild(img);
                                      document.body.appendChild(modal);
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-6">
                        <button
                          onClick={() => handleApproveIncomeRequest(request.id)}
                          className="px-6 py-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 font-medium transition"
                        >
                          ✓ 批准
                        </button>
                        <button
                          onClick={() => handleRejectIncomeRequest(request.id)}
                          className="px-6 py-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20 font-medium transition"
                        >
                          ✗ 退回修改
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

              {/* 历史支出申请记录 */}
              {historyExpenseRequests.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">
                    支出申请历史 ({historyExpenseRequests.length})
                  </h2>
                  <div className="space-y-4">
                    {historyExpenseRequests
                      .sort((a, b) => {
                        const timeA = a.approvedAt || a.submittedAt || a.createdAt || "";
                        const timeB = b.approvedAt || b.submittedAt || b.createdAt || "";
                        return new Date(timeB).getTime() - new Date(timeA).getTime();
                      })
                      .map((request) => (
                        <div
                          key={request.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">摘要</div>
                                  <div className="text-lg font-semibold text-slate-100">{request.summary}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">分类</div>
                                  <div className="text-slate-200 font-medium">{request.category}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">状态</div>
                                  <span className={`px-2 py-1 rounded text-xs border ${
                                    request.status === "Approved" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
                                    request.status === "Paid" ? "bg-purple-500/20 text-purple-300 border-purple-500/40" :
                                    request.status === "Rejected" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                                    "bg-slate-500/20 text-slate-300 border-slate-500/40"
                                  }`}>
                                    {request.status === "Approved" ? "已批准" :
                                     request.status === "Paid" ? "已支付" :
                                     request.status === "Rejected" ? "已拒绝" :
                                     request.status}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">申请金额</div>
                                  <div className="text-rose-300 font-medium text-lg">
                                    {formatCurrency(request.amount, request.currency, "expense")}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">币种</div>
                                  <div className="text-slate-300">{request.currency}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">申请日期</div>
                                  <div className="text-slate-300">{request.date}</div>
                                </div>
                              </div>

                              <div className="flex gap-4 text-xs text-slate-400">
                                {request.createdBy && (
                                  <div>发起人：<span className="text-slate-300">{request.createdBy}</span></div>
                                )}
                                {request.approvedBy && (
                                  <div>审批人：<span className="text-slate-300">{request.approvedBy}</span></div>
                                )}
                                {request.approvedAt && (
                                  <div>审批时间：<span className="text-slate-300">
                                    {new Date(request.approvedAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                                {request.paidBy && (
                                  <div>付款人：<span className="text-slate-300">{request.paidBy}</span></div>
                                )}
                                {request.paidAt && (
                                  <div>付款时间：<span className="text-slate-300">
                                    {new Date(request.paidAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                              </div>

                              {request.rejectionReason && (
                                <div className="mt-3 rounded-md bg-rose-500/10 border border-rose-500/40 p-2">
                                  <div className="text-xs text-rose-300 mb-1">退回原因</div>
                                  <div className="text-rose-200 text-xs">{request.rejectionReason}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 历史收入申请记录 */}
              {historyIncomeRequests.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">
                    收入申请历史 ({historyIncomeRequests.length})
                  </h2>
                  <div className="space-y-4">
                    {historyIncomeRequests
                      .sort((a, b) => {
                        const timeA = a.approvedAt || a.submittedAt || a.createdAt || "";
                        const timeB = b.approvedAt || b.submittedAt || b.createdAt || "";
                        return new Date(timeB).getTime() - new Date(timeA).getTime();
                      })
                      .map((request) => (
                        <div
                          key={request.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">摘要</div>
                                  <div className="text-lg font-semibold text-slate-100">{request.summary}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">分类</div>
                                  <div className="text-slate-200 font-medium">{request.category}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">状态</div>
                                  <span className={`px-2 py-1 rounded text-xs border ${
                                    request.status === "Approved" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
                                    request.status === "Received" ? "bg-purple-500/20 text-purple-300 border-purple-500/40" :
                                    request.status === "Rejected" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
                                    "bg-slate-500/20 text-slate-300 border-slate-500/40"
                                  }`}>
                                    {request.status === "Approved" ? "已批准" :
                                     request.status === "Received" ? "已收款" :
                                     request.status === "Rejected" ? "已拒绝" :
                                     request.status}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">申请金额</div>
                                  <div className="text-emerald-300 font-medium text-lg">
                                    {formatCurrency(request.amount, request.currency, "income")}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">币种</div>
                                  <div className="text-slate-300">{request.currency}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">申请日期</div>
                                  <div className="text-slate-300">{request.date}</div>
                                </div>
                              </div>

                              <div className="flex gap-4 text-xs text-slate-400">
                                {request.createdBy && (
                                  <div>发起人：<span className="text-slate-300">{request.createdBy}</span></div>
                                )}
                                {request.approvedBy && (
                                  <div>审批人：<span className="text-slate-300">{request.approvedBy}</span></div>
                                )}
                                {request.approvedAt && (
                                  <div>审批时间：<span className="text-slate-300">
                                    {new Date(request.approvedAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                                {request.receivedBy && (
                                  <div>收款人：<span className="text-slate-300">{request.receivedBy}</span></div>
                                )}
                                {request.receivedAt && (
                                  <div>收款时间：<span className="text-slate-300">
                                    {new Date(request.receivedAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                              </div>

                              {request.rejectionReason && (
                                <div className="mt-3 rounded-md bg-rose-500/10 border border-rose-500/40 p-2">
                                  <div className="text-xs text-rose-300 mb-1">退回原因</div>
                                  <div className="text-rose-200 text-xs">{request.rejectionReason}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
        </div>
          )}
        </>
      )}

      {/* 历史记录内容 */}
      {activeTab === "history" && (
        <>
          {filteredHistoryBills.length === 0 && filteredHistoryRequests.length === 0 && historyExpenseRequests.length === 0 && historyIncomeRequests.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-12 text-center">
              <div className="text-slate-400 text-4xl mb-4">📋</div>
              <p className="text-slate-300 font-medium mb-1">暂无历史审批记录</p>
              <p className="text-sm text-slate-500">所有审批记录将显示在这里</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 历史账单记录 */}
              {filteredHistoryBills.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">
                    月账单历史 ({filteredHistoryBills.length})
                  </h2>
                  <div className="space-y-4">
                    {filteredHistoryBills
                      .sort((a, b) => {
                        // 按审批时间或提交时间倒序排列
                        const timeA = a.approvedAt || a.submittedAt || a.createdAt || "";
                        const timeB = b.approvedAt || b.submittedAt || b.createdAt || "";
                        return new Date(timeB).getTime() - new Date(timeA).getTime();
                      })
                      .map((bill) => (
                        <div
                          key={bill.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">账单月份</div>
                                  <div className="text-lg font-semibold text-slate-100">{bill.month}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">服务方</div>
                                  <div className="text-slate-200 font-medium">
                                    {bill.agencyName || bill.supplierName || bill.factoryName || "-"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">账单类型</div>
                                  <div className="text-slate-300 text-sm">{bill.billType}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">状态</div>
                                  <span className={`px-2 py-1 rounded text-xs border ${statusColors[bill.status]}`}>
                                    {statusLabels[bill.status]}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">账单金额</div>
                                  <div className="text-slate-100">
                                    {formatCurrency(bill.totalAmount, bill.currency, "expense")}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">返点金额</div>
                                  <div className="text-emerald-300">
                                    {formatCurrency(bill.rebateAmount, bill.currency, "income")}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">
                                    {bill.billCategory === "Receivable" ? "净应收" : "净应付"}
                                  </div>
                                  <div className={`text-lg font-semibold ${
                                    bill.billCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"
                                  }`}>
                                    {formatCurrency(
                                      bill.netAmount,
                                      bill.currency,
                                      bill.billCategory === "Receivable" ? "income" : "expense"
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">币种</div>
                                  <div className="text-slate-300">{bill.currency}</div>
                                </div>
                              </div>

                              <div className="flex gap-4 text-xs text-slate-400">
                                {bill.createdBy && (
                                  <div>创建人：<span className="text-slate-300">{bill.createdBy}</span></div>
                                )}
                                {bill.submittedAt && (
                                  <div>提交时间：<span className="text-slate-300">
                                    {new Date(bill.submittedAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                                {bill.approvedBy && (
                                  <div>审批人：<span className="text-slate-300">{bill.approvedBy}</span></div>
                                )}
                                {bill.approvedAt && (
                                  <div>审批时间：<span className="text-slate-300">
                                    {new Date(bill.approvedAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                                {bill.paidBy && (
                                  <div>付款人：<span className="text-slate-300">{bill.paidBy}</span></div>
                                )}
                                {bill.paidAt && (
                                  <div>付款时间：<span className="text-slate-300">
                                    {new Date(bill.paidAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                              </div>

                              {bill.rejectionReason && (
                                <div className="mt-3 rounded-md bg-rose-500/10 border border-rose-500/40 p-2">
                                  <div className="text-xs text-rose-300 mb-1">退回原因</div>
                                  <div className="text-rose-200 text-xs">{bill.rejectionReason}</div>
                                </div>
                              )}

                              <div className="flex gap-2 mt-4">
                                <button
                                  onClick={() => handleViewDetail(bill)}
                                  className="px-3 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20"
                                >
                                  查看详细清单
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 历史支出和收入申请记录 */}
              {filteredHistoryRequests.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold text-slate-200 mb-4">
                    支出/收入申请历史 ({filteredHistoryRequests.length})
                  </h2>
                  <div className="space-y-4">
                    {filteredHistoryRequests
                      .sort((a, b) => {
                        // 按审批时间或提交时间倒序排列
                        const timeA = a.approvedAt || a.submittedAt || a.createdAt || "";
                        const timeB = b.approvedAt || b.submittedAt || b.createdAt || "";
                        return new Date(timeB).getTime() - new Date(timeA).getTime();
                      })
                      .map((request) => {
                        // 判断是支出申请还是收入申请
                        // ExpenseRequest 有 approvalDocument 和 paymentReceipt 字段，IncomeRequest 没有
                        const isExpense = 'approvalDocument' in request || 'paymentReceipt' in request;
                        const isIncome = !isExpense;
                        
                        return (
                        <div
                          key={request.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">摘要</div>
                                  <div className="text-lg font-semibold text-slate-100">{(request as ExpenseRequest | IncomeRequest).summary}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">分类</div>
                                  <div className="text-slate-200 font-medium">{request.category}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">店铺</div>
                                  <div className="text-slate-300 text-sm">{request.storeName || "-"}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">状态</div>
                                  <span className={`px-2 py-1 rounded text-xs border ${statusColors[request.status]}`}>
                                    {statusLabels[request.status]}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-4 mb-4">
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">申请金额</div>
                                  <div className={`font-medium text-lg ${isExpense ? 'text-rose-300' : 'text-emerald-300'}`}>
                                    {formatCurrency(request.amount, request.currency, isExpense ? "expense" : "income")}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">币种</div>
                                  <div className="text-slate-300">{request.currency}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-400 mb-1">申请日期</div>
                                  <div className="text-slate-300">{request.createdAt ? new Date(request.createdAt).toISOString().slice(0, 10) : "-"}</div>
                                </div>
                              </div>

                              <div className="flex gap-4 text-xs text-slate-400">
                                {request.createdBy && (
                                  <div>创建人：<span className="text-slate-300">{request.createdBy}</span></div>
                                )}
                                {request.submittedAt && (
                                  <div>提交时间：<span className="text-slate-300">
                                    {new Date(request.submittedAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                                {request.approvedBy && (
                                  <div>审批人：<span className="text-slate-300">{request.approvedBy}</span></div>
                                )}
                                {request.approvedAt && (
                                  <div>审批时间：<span className="text-slate-300">
                                    {new Date(request.approvedAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                                {request.paidBy && (
                                  <div>付款人：<span className="text-slate-300">{request.paidBy}</span></div>
                                )}
                                {request.paidAt && (
                                  <div>付款时间：<span className="text-slate-300">
                                    {new Date(request.paidAt).toLocaleString("zh-CN")}
                                  </span></div>
                                )}
                              </div>

                              {request.rejectionReason && (
                                <div className="mt-3 rounded-md bg-rose-500/10 border border-rose-500/40 p-2">
                                  <div className="text-xs text-rose-300 mb-1">退回原因</div>
                                  <div className="text-rose-200 text-xs">{request.rejectionReason}</div>
                                </div>
                              )}

                              {request.notes && (
                                <div className="mt-3">
                                  <div className="text-xs text-slate-400 mb-1">备注</div>
                                  <div className="text-slate-300 text-sm">{request.notes}</div>
                                </div>
                              )}

                              <div className="flex gap-2 mt-4">
                                <button
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setIsRequestDetailOpen(true);
                                  }}
                                  className="px-3 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20"
                                >
                                  查看详情
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 账单详情弹窗 */}
      {isDetailModalOpen && selectedBill && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#0B0C10]/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">账单详细清单 - {selectedBill.month}</h2>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 基本信息卡片 */}
              <div className="bg-slate-800/60 rounded-lg p-4 border border-white/10">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单ID</div>
                    <div className="text-slate-300 text-xs font-mono">{selectedBill.id.slice(0, 20)}...</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单月份</div>
                    <div className="text-slate-100 font-medium">{selectedBill.month}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单类型</div>
                    <div className="text-slate-100">{selectedBill.billType || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单分类</div>
                    <div className={`px-2 py-1 rounded text-xs border inline-block ${
                      selectedBill.billCategory === "Receivable" 
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                    }`}>
                      {selectedBill.billCategory === "Receivable" ? "应收款" : "应付款"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">服务方</div>
                    <div className="text-slate-100 font-medium">{selectedBill.agencyName || selectedBill.supplierName || selectedBill.factoryName || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">状态</div>
                    <span className={`px-2 py-1 rounded text-xs border ${statusColors[selectedBill.status]}`}>
                      {statusLabels[selectedBill.status]}
                    </span>
                  </div>
                </div>
              </div>

              {/* 金额信息卡片 */}
              <div className="bg-slate-800/60 rounded-lg p-4 border border-white/10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">币种</div>
                    <div className="text-slate-100 font-medium">{selectedBill.currency}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单金额</div>
                    <div className="text-slate-100 font-medium">
                      {formatCurrency(selectedBill.totalAmount, selectedBill.currency, "expense")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">返点金额</div>
                    <div className="text-emerald-300 font-medium">
                      {selectedBill.billType === "广告" ? "-" : formatCurrency(selectedBill.rebateAmount, selectedBill.currency, "income")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">
                      {selectedBill.billCategory === "Receivable" ? "净应收" : "净应付"}
                    </div>
                    <div className={`font-bold text-lg ${
                      selectedBill.billCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"
                    }`}>
                      {formatCurrency(
                        selectedBill.netAmount, 
                        selectedBill.currency, 
                        selectedBill.billCategory === "Receivable" ? "income" : "expense"
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 关联记录统计 */}
              <div className="bg-slate-800/60 rounded-lg p-4 border border-white/10">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {selectedBill.rechargeIds && selectedBill.rechargeIds.length > 0 && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">关联充值记录</div>
                      <div className="text-slate-100 font-medium">{selectedBill.rechargeIds.length} 笔</div>
                    </div>
                  )}
                  {selectedBill.consumptionIds && selectedBill.consumptionIds.length > 0 && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">关联消耗记录</div>
                      <div className="text-slate-100 font-medium">{selectedBill.consumptionIds.length} 笔</div>
                    </div>
                  )}
                </div>
              </div>

              {selectedBill.notes && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">备注</div>
                  <div className="text-slate-300 text-sm">{selectedBill.notes}</div>
                </div>
              )}

              {selectedBill.rejectionReason && (
                <div className="rounded-md bg-rose-500/10 border border-rose-500/40 p-3">
                  <div className="text-xs text-rose-300 mb-1">退回原因</div>
                  <div className="text-rose-200 text-sm">{selectedBill.rejectionReason}</div>
                </div>
              )}

              {/* 广告账户信息 */}
              {selectedBill.adAccountId && selectedBill.accountName && (
                <div className="border-t border-white/10 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-2">广告账户信息</div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <div className="text-sm text-slate-100">{selectedBill.accountName}</div>
                  </div>
                </div>
              )}

              {/* 关联的充值记录（广告账单和广告返点账单） */}
              {((selectedBill.billType === "广告" || selectedBill.billType === "广告返点") && selectedBill.rechargeIds && selectedBill.rechargeIds.length > 0) && (
                <div className="border-t border-white/10 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">关联充值记录</div>
                  <div className="rounded-lg border border-white/10 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/60">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-300">充值日期</th>
                          <th className="px-3 py-2 text-left text-slate-300">账户名称</th>
                          <th className="px-3 py-2 text-right text-slate-300">充值金额</th>
                          <th className="px-3 py-2 text-right text-slate-300">返点金额</th>
                          <th className="px-3 py-2 text-left text-slate-300">返点比例</th>
                          <th className="px-3 py-2 text-center text-slate-300">凭证</th>
                          <th className="px-3 py-2 text-left text-slate-300">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedBill.rechargeIds.map((rechargeId) => {
                          const recharge = recharges.find((r) => r.id === rechargeId);
                          if (!recharge) {
                            return (
                              <tr key={rechargeId} className="hover:bg-slate-800/40">
                                <td colSpan={7} className="px-3 py-2 text-slate-500 text-xs text-center">
                                  充值记录 {rechargeId} 不存在或已被删除
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={rechargeId} className="hover:bg-slate-800/40">
                              <td className="px-3 py-2 text-slate-300">{recharge.date}</td>
                              <td className="px-3 py-2 text-slate-100 font-medium">{recharge.accountName || "-"}</td>
                              <td className="px-3 py-2 text-right text-slate-100 font-medium">
                                {formatCurrency(recharge.amount || 0, recharge.currency || "USD", "expense")}
                              </td>
                              <td className="px-3 py-2 text-right text-emerald-300 font-medium">
                                {formatCurrency(recharge.rebateAmount || 0, recharge.currency || "USD", "income")}
                              </td>
                              <td className="px-3 py-2 text-slate-400 text-xs">
                                {recharge.rebateRate ? `${recharge.rebateRate}%` : "-"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {recharge.voucher && recharge.voucher.length > 10 ? (
                                  <button
                                    onClick={() => setVoucherViewModal(recharge.voucher || null)}
                                    className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                                  >
                                    查看
                                  </button>
                                ) : (
                                  <span className="text-slate-500 text-xs">无</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-400 text-xs">{recharge.notes || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 广告返点账单：显示返点明细 */}
              {selectedBill.billType === "广告返点" && selectedBill.adAccountId && (
                <div className="border-t border-white/10 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">返点明细</div>
                  {(() => {
                    // 查找关联的返点应收款记录
                    const receivable = rebateReceivables.find((r) => 
                      r.adAccountId === selectedBill.adAccountId && 
                      selectedBill.rechargeIds?.some(rechargeId => r.rechargeId === rechargeId)
                    );
                    
                    if (!receivable) {
                      return (
                        <div className="text-center py-4 text-slate-500 bg-slate-800/60 rounded-lg">
                          未找到关联的返点应收款记录
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-4">
                        {/* 返点基本信息 */}
                        <div className="grid grid-cols-2 gap-4 bg-slate-800/60 rounded-lg p-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">返点总额</div>
                            <div className="text-emerald-300 font-bold text-lg">
                              {formatCurrency(receivable.rebateAmount, receivable.currency, "income")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">当前余额</div>
                            <div className={`font-bold text-lg ${
                              receivable.currentBalance > 0 ? "text-emerald-300" : "text-slate-400"
                            }`}>
                              {formatCurrency(receivable.currentBalance, receivable.currency, "income")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">状态</div>
                            <div className={`px-2 py-1 rounded text-xs border inline-block ${
                              receivable.status === "已结清" 
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : receivable.status === "核销中"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : "bg-slate-500/20 text-slate-300 border-slate-500/40"
                            }`}>
                              {receivable.status}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">产生日期</div>
                            <div className="text-slate-100">{receivable.rechargeDate}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">所属板块</div>
                            <div className="text-slate-100">{receivable.platform}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">代理商</div>
                            <div className="text-slate-100">{receivable.agencyName}</div>
                          </div>
                        </div>

                        {/* 核销流水 */}
                        {receivable.writeoffRecords.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-slate-300 mb-2">核销流水</div>
                            <div className="rounded-lg border border-white/10 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-800/60">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-slate-300">消耗日期</th>
                                    <th className="px-3 py-2 text-left text-slate-300">关联消耗ID</th>
                                    <th className="px-3 py-2 text-right text-slate-300">核销金额</th>
                                    <th className="px-3 py-2 text-right text-slate-300">剩余余额</th>
                                    <th className="px-3 py-2 text-left text-slate-300">核销时间</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {receivable.writeoffRecords.map((record) => {
                                    // 查找关联的消耗记录
                                    const relatedConsumption = consumptions.find((c) => c.id === record.consumptionId);
                                    return (
                                      <tr key={record.id} className="hover:bg-slate-800/40">
                                        <td className="px-3 py-2 text-slate-300">{record.consumptionDate}</td>
                                        <td className="px-3 py-2 text-slate-400 text-xs font-mono">
                                          {record.consumptionId.slice(0, 8)}...
                                          {relatedConsumption && (
                                            <div className="text-slate-500 mt-1">
                                              {relatedConsumption.storeName || relatedConsumption.campaignName || "-"}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-amber-300 font-medium">
                                          {formatCurrency(record.writeoffAmount, receivable.currency, "expense")}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-300">
                                          {formatCurrency(record.remainingBalance, receivable.currency, "income")}
                                        </td>
                                        <td className="px-3 py-2 text-slate-400 text-xs">
                                          {new Date(record.createdAt).toLocaleString("zh-CN")}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 手动修正记录 */}
                        {receivable.adjustments.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-slate-300 mb-2">手动修正记录</div>
                            <div className="rounded-lg border border-white/10 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-800/60">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-slate-300">修正金额</th>
                                    <th className="px-3 py-2 text-left text-slate-300">修正原因</th>
                                    <th className="px-3 py-2 text-left text-slate-300">修正人</th>
                                    <th className="px-3 py-2 text-left text-slate-300">修正时间</th>
                                    <th className="px-3 py-2 text-right text-slate-300">修正前余额</th>
                                    <th className="px-3 py-2 text-right text-slate-300">修正后余额</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {receivable.adjustments.map((adj) => (
                                    <tr key={adj.id} className="hover:bg-slate-800/40">
                                      <td className={`px-3 py-2 font-medium ${
                                        adj.amount > 0 ? "text-emerald-300" : "text-rose-300"
                                      }`}>
                                        {adj.amount > 0 ? "+" : ""}
                                        {formatCurrency(adj.amount, receivable.currency, adj.amount > 0 ? "income" : "expense")}
                                      </td>
                                      <td className="px-3 py-2 text-slate-300">{adj.reason}</td>
                                      <td className="px-3 py-2 text-slate-300 text-xs">{adj.adjustedBy}</td>
                                      <td className="px-3 py-2 text-slate-400 text-xs">
                                        {new Date(adj.adjustedAt).toLocaleString("zh-CN")}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-300">
                                        {formatCurrency(adj.balanceBefore, receivable.currency, "income")}
                                      </td>
                                      <td className="px-3 py-2 text-right text-emerald-300">
                                        {formatCurrency(adj.balanceAfter, receivable.currency, "income")}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* 如果没有核销和修正记录 */}
                        {receivable.writeoffRecords.length === 0 && receivable.adjustments.length === 0 && (
                          <div className="text-center py-4 text-slate-500 bg-slate-800/60 rounded-lg">
                            暂无核销记录和修正记录
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 关联的消耗记录 */}
              {selectedBill.consumptionIds && selectedBill.consumptionIds.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">关联消耗记录 ({selectedBill.consumptionIds.length} 条)</div>
                  <div className="rounded-lg border border-white/10 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/60">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-300">日期</th>
                          <th className="px-3 py-2 text-left text-slate-300">账户</th>
                          <th className="px-3 py-2 text-left text-slate-300">店铺</th>
                          <th className="px-3 py-2 text-left text-slate-300">广告系列</th>
                          <th className="px-3 py-2 text-right text-slate-300">消耗金额</th>
                          <th className="px-3 py-2 text-right text-slate-300">预估返点</th>
                          <th className="px-3 py-2 text-center text-slate-300">凭证</th>
                          <th className="px-3 py-2 text-left text-slate-300">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedBill.consumptionIds.map((consumptionId) => {
                          const consumption = consumptions.find((c) => c.id === consumptionId);
                          if (!consumption) {
                            return (
                              <tr key={consumptionId} className="hover:bg-slate-800/40">
                                <td colSpan={8} className="px-3 py-2 text-slate-500 text-xs text-center">
                                  消耗记录 {consumptionId.slice(0, 16)}... 不存在或已被删除
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={consumptionId} className="hover:bg-slate-800/40">
                              <td className="px-3 py-2 text-slate-300">{consumption.date}</td>
                              <td className="px-3 py-2 text-slate-100 font-medium">{consumption.accountName || "-"}</td>
                              <td className="px-3 py-2 text-slate-300 text-xs">{consumption.storeName || "-"}</td>
                              <td className="px-3 py-2 text-slate-300 text-xs">{consumption.campaignName || "-"}</td>
                              <td className="px-3 py-2 text-right text-slate-100 font-medium">
                                {formatCurrency(consumption.amount || 0, consumption.currency || "USD", "expense")}
                              </td>
                              <td className="px-3 py-2 text-right text-emerald-300">
                                {formatCurrency(consumption.estimatedRebate || 0, consumption.currency || "USD", "income")}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {consumption.voucher && consumption.voucher.length > 10 ? (
                                  <button
                                    onClick={() => setVoucherViewModal(consumption.voucher || null)}
                                    className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                                  >
                                    查看
                                  </button>
                                ) : (
                                  <span className="text-slate-500 text-xs">无</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-400 text-xs">{consumption.notes || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 审批流程时间线 */}
              <div className="border-t border-white/10 pt-4">
                <div className="text-sm font-medium text-slate-300 mb-3">审批流程</div>
                <div className="bg-slate-800/60 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500"></div>
                    <div className="flex-1">
                      <div className="text-xs text-slate-400">创建</div>
                      <div className="text-sm text-slate-200">{selectedBill.createdBy}</div>
                      {selectedBill.createdAt && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {new Date(selectedBill.createdAt).toLocaleString("zh-CN")}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {selectedBill.submittedAt && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500"></div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-400">提交审批</div>
                        <div className="text-sm text-slate-200">提交至审批中心</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {new Date(selectedBill.submittedAt).toLocaleString("zh-CN")}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {selectedBill.approvedBy && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500"></div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-400">审批通过</div>
                        <div className="text-sm text-slate-200">{selectedBill.approvedBy}</div>
                        {selectedBill.approvedAt && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(selectedBill.approvedAt).toLocaleString("zh-CN")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {selectedBill.paidBy && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500"></div>
                      <div className="flex-1">
                        <div className="text-xs text-slate-400">已完成付款</div>
                        <div className="text-sm text-slate-200">{selectedBill.paidBy}</div>
                        {selectedBill.paidAt && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(selectedBill.paidAt).toLocaleString("zh-CN")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {selectedBill.rejectionReason && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-rose-500"></div>
                      <div className="flex-1">
                        <div className="text-xs text-rose-400">退回修改</div>
                        <div className="text-sm text-rose-200">{selectedBill.rejectionReason}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 付款申请详情弹窗 */}
      {isRequestDetailOpen && selectedRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">付款申请详情</h2>
              <button
                onClick={() => {
                  setIsRequestDetailOpen(false);
                  setSelectedRequest(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">支出项目</div>
                  <div className="text-slate-100">{selectedRequest.expenseItem}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">金额</div>
                  <div className="text-slate-100">
                    {formatCurrency(selectedRequest.amount, selectedRequest.currency, "expense")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">分类</div>
                  <div className="text-slate-100">{selectedRequest.category}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">店铺/国家</div>
                  <div className="text-slate-100">{selectedRequest.storeName || selectedRequest.country || "-"}</div>
                </div>
              </div>

              {selectedRequest.approvalDocument && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">老板签字申请单</div>
                  <img
                    src={Array.isArray(selectedRequest.approvalDocument) ? selectedRequest.approvalDocument[0] : selectedRequest.approvalDocument}
                    alt="申请单"
                    className="max-w-full max-h-96 rounded-md border border-slate-700"
                  />
                </div>
              )}

              {selectedRequest.notes && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">备注</div>
                  <div className="text-slate-300">{selectedRequest.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                    setRejectModal({ open: false, type: null, id: null });
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
                />
              );
            })()}
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
    </div>
  );
}
