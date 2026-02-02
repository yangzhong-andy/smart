"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import useSWR, { mutate } from "swr";
import useSWRMutation from "swr/mutation";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Wallet, DollarSign, Clock, CheckCircle2, AlertCircle, ArrowRight, Eye, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import MaintenanceView from "@/components/MaintenanceView";
import Skeleton, { SkeletonDetail, SkeletonTable } from "@/components/ui/Skeleton";
import Link from "next/link";
import type { PendingEntry } from "@/lib/pending-entry-store";
import { getMonthlyBills, saveMonthlyBills, getBillsByStatus, type MonthlyBill, type BillStatus, type BillType } from "@/lib/reconciliation-store";
import { type BankAccount, getAccountStats } from "@/lib/finance-store";
import { getCashFlowFromAPI, type CashFlow as CashFlowType } from "@/lib/cash-flow-store";
import { type FinanceRates } from "@/lib/exchange";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatCurrency as formatCurrencyUtil, formatCurrencyString } from "@/lib/currency-utils";
import type { Agency } from "@/lib/ad-agency-store";
import type { RebateReceivable } from "@/lib/rebate-receivable-store";
import { FileImage } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
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
import ExpenseEntry from "../cash-flow/components/ExpenseEntry";
import IncomeEntry from "../cash-flow/components/IncomeEntry";
import TransferEntry from "../cash-flow/components/TransferEntry";
import { enrichWithUID } from "@/lib/business-utils";

type CashFlow = {
  id: string;
  uid?: string;
  date: string;
  summary: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  accountId: string;
  accountName: string;
  currency: string;
  remark?: string;
  relatedId?: string;
  businessNumber?: string;
  status: "confirmed" | "pending";
  isReversal?: boolean;
  reversedById?: string;
  voucher?: string | string[];
  createdAt?: string;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    // 格式：YYYY/MM/DD HH:mm
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
};

const formatCurrency = (amount: number, currency: string = "CNY") => {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2
  }).format(amount);
};

const getStatusColor = (status: BillStatus | string) => {
  switch (status) {
    case "Pending_Approval":
      return { bg: "bg-amber-500/20", text: "text-amber-300", label: "待审批" };
    case "Approved":
      return { bg: "bg-blue-500/20", text: "text-blue-300", label: "已审批" };
    case "Paid":
      return { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "已支付" };
    case "Draft":
      return { bg: "bg-slate-500/20", text: "text-slate-300", label: "草稿" };
    case "Pending":
      return { bg: "bg-amber-500/20", text: "text-amber-300", label: "待处理" };
    case "Completed":
      return { bg: "bg-emerald-500/20", text: "text-emerald-300", label: "已完成" };
    default:
      return { bg: "bg-slate-500/20", text: "text-slate-300", label: status };
  }
};

export default function FinanceWorkbenchPage() {
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [selectedExpenseRequest, setSelectedExpenseRequest] = useState<ExpenseRequest | null>(null);
  const [selectedIncomeRequest, setSelectedIncomeRequest] = useState<IncomeRequest | null>(null);
  const [expenseAccountModal, setExpenseAccountModal] = useState<{ open: boolean; requestId: string | null }>({ open: false, requestId: null });
  const [incomeAccountModal, setIncomeAccountModal] = useState<{ open: boolean; requestId: string | null }>({ open: false, requestId: null });
  // 重构：详情查看改为按需加载，只存储 ID
  const [expenseDetailModal, setExpenseDetailModal] = useState<{ open: boolean; requestId: string | null }>({ open: false, requestId: null });
  const [incomeDetailModal, setIncomeDetailModal] = useState<{ open: boolean; requestId: string | null }>({ open: false, requestId: null });
  
  // 使用 useSWRMutation 按需获取详情
  const { trigger: fetchExpenseDetail, data: expenseDetailData, isMutating: isLoadingExpenseDetail } = useSWRMutation(
    expenseDetailModal.requestId ? `/api/expense-requests/${expenseDetailModal.requestId}` : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch expense request');
      return res.json();
    }
  );
  
  const { trigger: fetchIncomeDetail, data: incomeDetailData, isMutating: isLoadingIncomeDetail } = useSWRMutation(
    incomeDetailModal.requestId ? `/api/income-requests/${incomeDetailModal.requestId}` : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch income request');
      return res.json();
    }
  );
  
  // 当详情弹窗打开时，触发数据获取
  useEffect(() => {
    if (expenseDetailModal.open && expenseDetailModal.requestId) {
      fetchExpenseDetail();
    }
  }, [expenseDetailModal.open, expenseDetailModal.requestId, fetchExpenseDetail]);
  
  useEffect(() => {
    if (incomeDetailModal.open && incomeDetailModal.requestId) {
      fetchIncomeDetail();
    }
  }, [incomeDetailModal.open, incomeDetailModal.requestId, fetchIncomeDetail]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [paymentVoucher, setPaymentVoucher] = useState<string | string[]>(""); // 转账凭证
  const [activeModal, setActiveModal] = useState<"expense" | "income" | "transfer" | null>(null);
  const [isSavingFlow, setIsSavingFlow] = useState(false);

  // SWR fetcher 函数：API 报错时抛出异常，由 SWR 捕获并触发 error 状态（不重试，显示系统维护中）
  const fetcher = useCallback(async (key: string) => {
    if (typeof window === "undefined") return null;
    switch (key) {
      case "pending-entries": {
        const res = await fetch("/api/pending-entries");
        if (!res.ok) throw new Error(`API 错误: ${res.status}`);
        return res.json();
      }
      case "monthly-bills":
        return await getMonthlyBills();
      case "bank-accounts": {
        const response = await fetch("/api/accounts");
        if (!response.ok) {
          throw new Error(`API 错误: ${response.status}`);
        }
        return await response.json();
      }
      case "cash-flow": {
        const cashFlowResponse = await fetch("/api/cash-flow");
        if (!cashFlowResponse.ok) {
          throw new Error(`API 错误: ${cashFlowResponse.status}`);
        }
        return await cashFlowResponse.json();
      }
      case "pending-bills":
        return await getBillsByStatus("Pending_Approval");
      case "approved-expense-requests":
        return await getExpenseRequestsByStatus("Approved");
      case "approved-income-requests":
        return await getIncomeRequestsByStatus("Approved");
      default:
        // 处理 URL 形式的 key（如 /api/finance/rates）
        if (typeof key === "string" && key.startsWith("/api/")) {
          const res = await fetch(key);
          if (!res.ok) throw new Error(`API 错误: ${res.status}`);
          return res.json();
        }
        return null;
    }
  }, []);

  const swrOptions = {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false as const,
    errorRetryCount: 0,
  };

  // 使用 SWR 获取数据（优化：大幅增加去重间隔以减少数据库访问）
  const { data: pendingEntriesData, error: pendingEntriesError } = useSWR("pending-entries", fetcher, {
    ...swrOptions,
    dedupingInterval: 300000,
  });
  const { data: monthlyBillsData, error: monthlyBillsError } = useSWR("monthly-bills", fetcher, {
    ...swrOptions,
    dedupingInterval: 600000,
  });
  const { data: accountsData, error: accountsError } = useSWR("bank-accounts", fetcher, {
    ...swrOptions,
    dedupingInterval: 600000,
  });
  const { data: cashFlowData, error: cashFlowError } = useSWR("cash-flow", fetcher, {
    ...swrOptions,
    dedupingInterval: 300000,
  });
  const { data: pendingBillsData, error: pendingBillsError } = useSWR("pending-bills", fetcher, {
    ...swrOptions,
    dedupingInterval: 600000,
  });
  const { data: approvedExpenseRequestsData, error: approvedExpenseError } = useSWR(
    "approved-expense-requests",
    fetcher,
    { ...swrOptions, dedupingInterval: 300000 }
  );
  const { data: approvedIncomeRequestsData, error: approvedIncomeError } = useSWR(
    "approved-income-requests",
    fetcher,
    { ...swrOptions, dedupingInterval: 300000 }
  );

  // 使用 SWR 获取实时汇率（与账户中心保持一致）
  const { data: financeRatesData, error: financeRatesError } = useSWR<{
    success: boolean;
    data?: FinanceRates;
    error?: string;
    errorCode?: string;
  }>("/api/finance-rates", fetcher, {
    ...swrOptions,
    keepPreviousData: true,
    dedupingInterval: 300000,
  });

  // 任一核心 API 报错时显示「系统维护中」（汇率接口失败不计入，不影响工作台主流程）
  const hasApiError =
    pendingEntriesError ||
    monthlyBillsError ||
    accountsError ||
    cashFlowError ||
    pendingBillsError ||
    approvedExpenseError ||
    approvedIncomeError;
  
  // 提取汇率数据
  const exchangeRates = useMemo(() => {
    if (!financeRatesData) return null;
    if (financeRatesData.success && financeRatesData.data) {
      return financeRatesData.data;
    }
    return null;
  }, [financeRatesData]);

  // 确保数据是数组并指定类型
  const pendingEntries: PendingEntry[] = Array.isArray(pendingEntriesData) ? (pendingEntriesData as PendingEntry[]) : [];
  const monthlyBills: MonthlyBill[] = Array.isArray(monthlyBillsData) ? (monthlyBillsData as MonthlyBill[]) : [];
  const pendingBills: MonthlyBill[] = Array.isArray(pendingBillsData) ? (pendingBillsData as MonthlyBill[]) : [];
  const approvedExpenseRequests: ExpenseRequest[] = Array.isArray(approvedExpenseRequestsData) ? (approvedExpenseRequestsData as ExpenseRequest[]) : [];
  const approvedIncomeRequests: IncomeRequest[] = Array.isArray(approvedIncomeRequestsData) ? (approvedIncomeRequestsData as IncomeRequest[]) : [];

  // 重新计算账户余额（包含 initialCapital 和流水记录）
  const accounts: BankAccount[] = useMemo(() => {
    if (!Array.isArray(accountsData) || !accountsData.length) return [];
    if (!Array.isArray(cashFlowData)) return accountsData as BankAccount[];

    // 从 initialCapital 开始重新计算余额
    let updatedAccounts = (accountsData as BankAccount[]).map((acc) => {
      const hasChildren = accountsData.some((a: any) => a.parentId === acc.id);
      if (acc.accountCategory === "PRIMARY" && hasChildren) {
        // 主账户有子账户，余额应该从子账户汇总，先重置为0
        return {
          ...acc,
          originalBalance: 0,
          rmbBalance: 0,
          initialCapital: acc.initialCapital || 0
        };
      } else {
        // 其他账户（独立账户、没有子账户的主账户、虚拟子账户）
        // 从 initialCapital 开始计算
        const initialCapital = acc.initialCapital || 0;
        return {
          ...acc,
          originalBalance: initialCapital, // 从初始资金开始
          rmbBalance: acc.currency === "CNY" || acc.currency === "RMB" 
            ? initialCapital 
            : initialCapital * (acc.exchangeRate || 1),
          initialCapital: initialCapital
        };
      }
    });

    // 遍历所有流水记录，更新账户余额（在 initialCapital 基础上累加）
    if (cashFlowData.length > 0) {
      cashFlowData.forEach((flow: any) => {
        if (flow.status === "confirmed" && !flow.isReversal && flow.accountId) {
          const account = updatedAccounts.find((a) => a.id === flow.accountId);
          if (account) {
            const hasChildren = updatedAccounts.some((a) => a.parentId === account.id);
            
            // 如果账户不是主账户，或者主账户没有子账户，则直接更新余额
            if (account.accountCategory !== "PRIMARY" || !hasChildren) {
              // 直接使用 flow.amount，因为：
              // - 收入类型：amount 是正数
              // - 支出类型：amount 是负数（包括划拨转出）
              const change = Number(flow.amount);
              const newBalance = account.originalBalance + change;
              
              account.originalBalance = newBalance;
              account.rmbBalance = account.currency === "CNY" || account.currency === "RMB"
                ? newBalance
                : newBalance * (account.exchangeRate || 1);
            }
          }
        }
      });
    }
    
    // 重新计算所有主账户的余额（汇总子账户，如果有子账户的话）
    updatedAccounts = updatedAccounts.map((acc) => {
      if (acc.accountCategory === "PRIMARY") {
        const hasChildren = updatedAccounts.some((a) => a.parentId === acc.id);
        if (hasChildren) {
          // 汇总子账户余额
          const childAccounts = updatedAccounts.filter((a) => a.parentId === acc.id);
          const totalOriginalBalance = childAccounts.reduce((sum, child) => sum + (child.originalBalance || 0), 0);
          const totalRmbBalance = childAccounts.reduce((sum, child) => {
            const childRmb = child.currency === "CNY" || child.currency === "RMB" 
              ? (child.originalBalance || 0)
              : (child.originalBalance || 0) * (child.exchangeRate || 1);
            return sum + childRmb;
          }, 0);
          
          return {
            ...acc,
            originalBalance: totalOriginalBalance,
            rmbBalance: totalRmbBalance
          };
        }
      }
      return acc;
    });
    
    return updatedAccounts;
  }, [accountsData, cashFlowData]);

  // 加载现金流数据
  useEffect(() => {
    if (typeof window === "undefined") return;
    getCashFlowFromAPI()
      .then((data) => {
        setCashFlow(Array.isArray(data) ? (data as unknown as CashFlow[]) : []);
        setInitialized(true);
      })
      .catch((e) => {
        console.error("Failed to fetch cash flow", e);
        setCashFlow([]);
        setInitialized(true);
      });
  }, []);

  // 刷新审批数据（修复：添加 mutate 到依赖项，避免无限循环）
  const refreshApprovalData = useCallback(() => {
    mutate("approved-expense-requests");
    mutate("approved-income-requests");
    mutate("pending-bills");
  }, [mutate]);

  // 处理流水记录创建
  const handleAddFlow = async (newFlow: CashFlow, adAccountId?: string, rebateAmount?: number) => {
    if (isSavingFlow) {
      return;
    }

    setIsSavingFlow(true);
    try {
      // 自动生成唯一业务ID
      const flowWithUID = enrichWithUID(newFlow, "CASH_FLOW");
      
      const response = await fetch('/api/cash-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flowWithUID)
      });
      
      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.details ? `${error.error}: ${error.details}` : (error.error || '创建失败');
        throw new Error(errorMessage);
      }
      
      // 刷新相关数据
      await mutate('/api/cash-flow');
      await mutate('/api/accounts');
      await mutate("pending-entries");
      await mutate("monthly-bills");
      
      // 如果是广告充值，更新广告账户余额（包括返点）
      if (newFlow.category === "广告费" && adAccountId && typeof window !== "undefined") {
        try {
          const { getAdAccounts, saveAdAccounts } = require("@/lib/ad-agency-store");
          const adAccounts = getAdAccounts();
          
          const adAccount = adAccounts.find((a: any) => a.id === adAccountId);
          if (adAccount) {
            const rechargeAmount = Math.abs(newFlow.amount) + (rebateAmount || 0);
            const updatedAdAccounts = adAccounts.map((acc: any) => {
              if (acc.id === adAccountId) {
                return {
                  ...acc,
                  currentBalance: acc.currentBalance + rechargeAmount
                };
              }
              return acc;
            });
            saveAdAccounts(updatedAdAccounts);
          }
        } catch (e) {
          console.error("Failed to update ad account balance", e);
        }
      }
      
      toast.success("流水记录创建成功");
      setActiveModal(null);
    } catch (error: any) {
      console.error('Failed to create cash flow:', error);
      toast.error(error.message || '创建流水记录失败');
    } finally {
      setIsSavingFlow(false);
    }
  };

  useEffect(() => {
    // 优化：完全移除自动轮询，改为完全手动刷新，减少数据库访问
    
    // 监听 localStorage 变化（当审批状态更新时）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "expenseRequests" || e.key === "incomeRequests") {
        refreshApprovalData();
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    
    // 监听自定义事件（当审批通过时触发）
    const handleApprovalUpdate = () => {
      refreshApprovalData();
    };
    
    window.addEventListener("approval-updated", handleApprovalUpdate);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("approval-updated", handleApprovalUpdate);
    };
  }, [refreshApprovalData, mutate]); // 修复：添加 mutate 到依赖项

  // 统计信息
  const stats = useMemo(() => {
    // 支出申请统计（统一使用 ExpenseRequest）
    const expensePending = approvedExpenseRequests.filter((p) => p.status === "Approved").length;
    const expenseTotal = approvedExpenseRequests.length;

    // 待入账任务统计
    const entryPending = pendingEntries.filter((e) => e.status === "Pending").length;
    const entryTotal = pendingEntries.length;

    // 账单统计
    const billPending = monthlyBills.filter((b) => b.status === "Pending_Approval").length;
    const billApproved = monthlyBills.filter((b) => b.status === "Approved").length;
    const billTotal = monthlyBills.length;

    // 财务指标
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const thisMonthIncome = cashFlow
      .filter((f) => f.type === "income" && f.date.startsWith(currentMonth))
      .reduce((sum, f) => sum + (f.amount || 0), 0);
    const thisMonthExpense = cashFlow
      .filter((f) => f.type === "expense" && f.date.startsWith(currentMonth))
      .reduce((sum, f) => sum + (f.amount || 0), 0);

    // 账户总余额：使用与账户中心相同的计算逻辑（使用实时汇率）
    const totalBalance = accounts.reduce((sum, acc) => {
      if (acc.currency === "CNY" || acc.currency === "RMB") {
        // CNY 账户直接使用原币余额
        return sum + (acc.originalBalance || 0);
      } else if (acc.currency === "USD") {
        // USD 账户使用实时汇率
        const rate = exchangeRates?.USD || acc.exchangeRate || 1;
        return sum + (acc.originalBalance || 0) * rate;
      } else if (acc.currency === "JPY") {
        // JPY 账户使用实时汇率
        const rate = exchangeRates?.JPY || acc.exchangeRate || 1;
        return sum + (acc.originalBalance || 0) * rate;
      } else {
        // 其他币种使用账户中存储的汇率
        return sum + (acc.originalBalance || 0) * (acc.exchangeRate || 1);
      }
    }, 0);

    return {
      expense: {
        pending: expensePending,
        total: expenseTotal
      },
      entry: {
        pending: entryPending,
        total: entryTotal
      },
      bill: {
        pending: billPending,
        approved: billApproved,
        total: billTotal
      },
      finance: {
        totalBalance,
        thisMonthIncome,
        thisMonthExpense,
        netIncome: thisMonthIncome - thisMonthExpense
      }
    };
  }, [approvedExpenseRequests, pendingEntries, monthlyBills, accounts, cashFlow, exchangeRates]);

  // 待入账任务
  const urgentPendingEntries = useMemo(() => {
    return pendingEntries
      .filter((e) => e.status === "Pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [pendingEntries]);

  // 待审批的账单
  const urgentBills = useMemo(() => {
    return monthlyBills
      .filter((b) => b.status === "Pending_Approval")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [monthlyBills]);

  // 处理支出申请（选择账户并创建现金流）
  const handleProcessExpenseRequest = async (requestId: string) => {
    if (!selectedAccountId) {
      toast.error("请选择出款账户");
      return;
    }
    
    const request = approvedExpenseRequests.find((r) => r.id === requestId);
    if (!request) {
      toast.error("申请不存在");
      return;
    }
    
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (!account) {
      toast.error("账户不存在");
      return;
    }
    
    // 检查账户余额
    const totalBalance = account.originalBalance || 0;
    if (totalBalance < request.amount) {
      toast.error("账户余额不足");
      return;
    }
    
    try {
      // 处理凭证：如果是数组，保持数组格式；如果是字符串，保持字符串格式
      const voucherValue = paymentVoucher || request.voucher || null;
      
      // 创建现金流记录
      const cashFlowData = {
        date: request.date,
        summary: request.summary,
        category: request.category,
        type: "expense" as const,
        amount: -request.amount, // 支出为负数
        accountId: selectedAccountId,
        accountName: account.name,
        currency: request.currency || "CNY",
        remark: request.remark || "",
        businessNumber: ('businessNumber' in request ? request.businessNumber : null) || null,
        relatedId: ('relatedId' in request ? request.relatedId : null) || null,
        status: "confirmed" as const,
        voucher: voucherValue, // 优先使用上传的转账凭证
        // 不包含 createdAt，由 API 自动处理
      };
      
      // 调用 API 创建现金流
      const response = await fetch('/api/cash-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cashFlowData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建现金流失败');
      }
      
      // 获取创建的现金流ID
      const cashFlowResult = await response.json();
      
      // 更新申请状态为已支付
      await updateExpenseRequest(requestId, {
        status: "Paid",
        financeAccountId: selectedAccountId,
        financeAccountName: account.name,
        paidBy: "财务人员", // TODO: 从用户系统获取
        paidAt: new Date().toISOString(),
        paymentFlowId: cashFlowResult.id
      });
      
      // 刷新数据
      const updated = await getExpenseRequestsByStatus("Approved");
        mutate("approved-expense-requests");
      mutate('/api/cash-flow');
      mutate('/api/accounts');
      
      toast.success("支出已成功出账");
      setExpenseAccountModal({ open: false, requestId: null });
      setSelectedAccountId("");
      setPaymentVoucher(""); // 清空凭证
    } catch (error: any) {
      console.error("处理支出申请失败:", error);
      toast.error(error?.message || "处理失败，请重试");
      throw error; // 重新抛出错误，让按钮的 onClick 也能捕获
    }
  };

  // 处理收入申请（选择账户并创建现金流）
  const handleProcessIncomeRequest = async (requestId: string) => {
    if (!selectedAccountId) {
      toast.error("请选择收款账户");
      return;
    }
    
    const request = approvedIncomeRequests.find((r) => r.id === requestId);
    if (!request) {
      toast.error("申请不存在");
      return;
    }
    
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (!account) {
      toast.error("账户不存在");
      return;
    }
    
    try {
      // 处理凭证：如果是数组，保持数组格式；如果是字符串，保持字符串格式
      const voucherValue = paymentVoucher || request.voucher || null;
      
      // 创建现金流记录
      const cashFlowData = {
        date: request.date,
        summary: request.summary,
        category: request.category,
        type: "income" as const,
        amount: request.amount, // 收入为正数
        accountId: selectedAccountId,
        accountName: account.name,
        currency: request.currency || "CNY",
        remark: request.remark || "",
        businessNumber: ('businessNumber' in request ? request.businessNumber : null) || null,
        relatedId: ('relatedId' in request ? request.relatedId : null) || null,
        status: "confirmed" as const,
        voucher: voucherValue, // 优先使用上传的转账凭证
        // 不包含 createdAt，由 API 自动处理
      };
      
      // 调用 API 创建现金流
      const response = await fetch('/api/cash-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cashFlowData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建现金流失败');
      }
      
      // 获取创建的现金流ID
      const cashFlowResult = await response.json();
      
      // 更新申请状态为已收款
      await updateIncomeRequest(requestId, {
        status: "Received",
        financeAccountId: selectedAccountId,
        financeAccountName: account.name,
        receivedBy: "财务人员", // TODO: 从用户系统获取
        receivedAt: new Date().toISOString(),
        paymentFlowId: cashFlowResult.id
      });
      
      // 刷新数据
      const updated = await getIncomeRequestsByStatus("Approved");
      mutate("approved-income-requests");
      mutate('/api/cash-flow');
      mutate('/api/accounts');
      
      toast.success("收入已成功入账");
      setIncomeAccountModal({ open: false, requestId: null });
      setSelectedAccountId("");
      setPaymentVoucher(""); // 清空凭证
    } catch (error: any) {
      toast.error(error.message || "处理失败，请重试");
    }
  };

  const handleRetryFromMaintenance = useCallback(() => {
    mutate("pending-entries");
    mutate("monthly-bills");
    mutate("bank-accounts");
    mutate("cash-flow");
    mutate("pending-bills");
    mutate("approved-expense-requests");
    mutate("approved-income-requests");
    mutate("/api/finance-rates");
  }, [mutate]);

  if (hasApiError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <MaintenanceView
          description="数据加载失败，可能是系统维护或网络异常，请稍后再试"
          onRetry={handleRetryFromMaintenance}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <PageHeader
        title="财务工作台"
        description="待审批事项、待入账任务、财务指标"
        actions={
          <>
            <div className="flex items-center gap-2">
              <InteractiveButton
                onClick={() => setActiveModal("expense")}
                variant="danger"
                size="md"
                className="rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-rose-500/20 hover:from-rose-600 hover:to-rose-700"
              >
                登记支出
              </InteractiveButton>
              <InteractiveButton
                onClick={() => setActiveModal("income")}
                variant="success"
                size="md"
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700"
              >
                登记收入
              </InteractiveButton>
              <InteractiveButton
                onClick={() => setActiveModal("transfer")}
                variant="primary"
                size="md"
                className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-blue-700"
              >
                内部划拨
              </InteractiveButton>
            </div>
            <InteractiveButton
              onClick={async () => {
                // 强制重新验证所有数据，忽略缓存
                await Promise.all([
                  mutate("pending-entries", undefined, { revalidate: true }),
                  mutate("monthly-bills", undefined, { revalidate: true }),
                  mutate("pending-bills", undefined, { revalidate: true }),
                  mutate("bank-accounts", undefined, { revalidate: true }),
                  mutate("cash-flow", undefined, { revalidate: true }),
                  mutate("approved-expense-requests", undefined, { revalidate: true }),
                  mutate("approved-income-requests", undefined, { revalidate: true }),
                ]);
                refreshApprovalData();
                toast.success("数据已刷新");
              }}
              variant="secondary"
              size="md"
              className="rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-300 hover:from-cyan-500/30 hover:to-blue-500/30 hover:border-cyan-400/50"
              title="刷新数据"
            >
              <span>🔄</span>
              <span>刷新数据</span>
            </InteractiveButton>
            <Link href="/finance/reconciliation">
              <ActionButton variant="secondary" icon={FileText}>
                对账中心
              </ActionButton>
            </Link>
            <Link href="/finance/cash-flow">
              <ActionButton variant="secondary" icon={DollarSign}>
                流水明细
              </ActionButton>
            </Link>
          </>
        }
      />

      {/* 统计面板 - 优化样式 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 backdrop-blur-sm hover:border-emerald-500/50 transition-all duration-300 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <div className="text-xs text-slate-400">本月收入</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{formatCurrency(stats.finance.thisMonthIncome)}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-rose-500/10 to-rose-600/5 p-5 backdrop-blur-sm hover:border-rose-500/50 transition-all duration-300 shadow-lg shadow-rose-500/5">
          <div className="flex items-center justify-between mb-3">
            <TrendingDown className="h-5 w-5 text-rose-400" />
            <div className="text-xs text-slate-400">本月支出</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{formatCurrency(stats.finance.thisMonthExpense)}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-5 backdrop-blur-sm hover:border-amber-500/50 transition-all duration-300 shadow-lg shadow-amber-500/5">
          <div className="flex items-center justify-between mb-3">
            <Clock className="h-5 w-5 text-amber-400" />
            <div className="text-xs text-slate-400">待处理支出申请</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.expense.pending}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-5 backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300 shadow-lg shadow-purple-500/5">
          <div className="flex items-center justify-between mb-3">
            <FileText className="h-5 w-5 text-purple-400" />
            <div className="text-xs text-slate-400">待入账任务</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.entry.pending}</div>
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-5 backdrop-blur-sm hover:border-orange-500/50 transition-all duration-300 shadow-lg shadow-orange-500/5">
          <div className="flex items-center justify-between mb-3">
            <AlertCircle className="h-5 w-5 text-orange-400" />
            <div className="text-xs text-slate-400">待审批账单</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.bill.pending}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 待审批支付申请 */}
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/20 p-2">
                <DollarSign className="h-5 w-5 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">待处理支出申请</h2>
              {approvedExpenseRequests.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 font-medium">
                  {approvedExpenseRequests.length}
                </span>
              )}
            </div>
            <Link href="/finance/approval">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {approvedExpenseRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <div className="rounded-full bg-slate-800/50 p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <DollarSign className="h-8 w-8 opacity-30" />
              </div>
              <p className="text-sm">暂无待处理申请</p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvedExpenseRequests.slice(0, 5).map((request) => {
                const colors = getStatusColor(request.status);
                return (
                  <Link key={request.id} href="/finance/approval">
                    <div className="rounded-lg border border-slate-800/50 bg-slate-900/40 p-4 hover:border-amber-500/50 hover:bg-slate-900/60 transition-all duration-200 group cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                              {colors.label}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-slate-200 mb-2 group-hover:text-amber-300 transition-colors">
                            {request.summary}
                          </div>
                          <div className="text-xs text-slate-400 mb-1">
                            <span className="font-medium text-slate-300">{formatCurrency(request.amount, request.currency)}</span>
                            {request.storeName && <span className="ml-2">· {request.storeName}</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-2">
                            创建：{formatDate(request.createdAt)}
                          </div>
                        </div>
                        <div className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="rounded-lg bg-amber-500/10 p-2">
                            <Eye className="h-4 w-4 text-amber-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 待入账任务 */}
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/20 p-2">
                <FileText className="h-5 w-5 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">待入账任务</h2>
              {urgentPendingEntries.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300 font-medium">
                  {urgentPendingEntries.length}
                </span>
              )}
            </div>
            <Link href="/finance/reconciliation">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {!pendingEntriesData ? (
            <SkeletonTable rows={3} cols={2} />
          ) : urgentPendingEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <div className="rounded-full bg-slate-800/50 p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <FileText className="h-8 w-8 opacity-30" />
              </div>
              <p className="text-sm">暂无待入账任务</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentPendingEntries.map((entry) => {
                const colors = getStatusColor(entry.status);
                return (
                  <Link key={entry.id} href="/finance/reconciliation">
                    <div className="rounded-lg border border-slate-800/50 bg-slate-900/40 p-4 hover:border-purple-500/50 hover:bg-slate-900/60 transition-all duration-200 group cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                              {colors.label}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-slate-200 mb-2 group-hover:text-purple-300 transition-colors">
                            {entry.type === "Bill" ? entry.agencyName || entry.supplierName : entry.expenseItem}
                          </div>
                          <div className="text-xs text-slate-400 mb-1">
                            <span className="font-medium text-slate-300">{formatCurrency(entry.netAmount, entry.currency)}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-2">
                            审批：{formatDate(entry.approvedAt)}
                          </div>
                        </div>
                        <div className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="rounded-lg bg-purple-500/10 p-2">
                            <Eye className="h-4 w-4 text-purple-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 已审批的支出申请 */}
        {approvedExpenseRequests.length > 0 && (
          <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-rose-500/20 p-2">
                  <TrendingDown className="h-5 w-5 text-rose-400" />
                </div>
                <h2 className="text-lg font-semibold text-slate-100">已审批支出申请</h2>
                <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500/20 text-rose-300 font-medium">
                  {approvedExpenseRequests.length}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {approvedExpenseRequests.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-slate-800/50 bg-slate-900/40 p-4 hover:border-rose-500/50 hover:bg-slate-900/60 transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 mb-2">
                        {request.summary}
                      </div>
                      <div className="text-xs text-slate-400 mb-1">
                        <span className="font-medium text-rose-300">{formatCurrency(request.amount, request.currency)}</span>
                        <span className="ml-2">· {request.category}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        审批：{formatDate(request.approvedAt)}
                      </div>
                    </div>
                    <div className="ml-3">
                      <button
                        onClick={() => {
                          setExpenseDetailModal({ open: true, requestId: request.id });
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium text-sm transition flex items-center gap-1"
                      >
                        <Eye className="h-4 w-4" />
                        查看详情
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 已审批的收入申请 */}
        {approvedIncomeRequests.length > 0 && (
          <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300">
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/20 p-2">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                </div>
                <h2 className="text-lg font-semibold text-slate-100">已审批收入申请</h2>
                <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 font-medium">
                  {approvedIncomeRequests.length}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {approvedIncomeRequests.slice(0, 5).map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-slate-800/50 bg-slate-900/40 p-4 hover:border-emerald-500/50 hover:bg-slate-900/60 transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 mb-2">
                        {request.summary}
                      </div>
                      <div className="text-xs text-slate-400 mb-1">
                        <span className="font-medium text-emerald-300">{formatCurrency(request.amount, request.currency)}</span>
                        <span className="ml-2">· {request.category}</span>
                        {request.storeName && <span className="ml-2">· {request.storeName}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        审批：{formatDate(request.approvedAt)}
                      </div>
                    </div>
                    <div className="ml-3 flex gap-2">
                      <button
                        onClick={() => {
                          setIncomeDetailModal({ open: true, requestId: request.id });
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium text-sm transition flex items-center gap-1"
                      >
                        <Eye className="h-4 w-4" />
                        查看详情
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 待审批账单 */}
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/20 p-2">
                <AlertCircle className="h-5 w-5 text-orange-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100">待审批账单</h2>
              {urgentBills.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-orange-500/20 text-orange-300 font-medium">
                  {urgentBills.length}
                </span>
              )}
            </div>
            <Link href="/finance/reconciliation">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {!pendingBillsData ? (
            <SkeletonTable rows={3} cols={2} />
          ) : urgentBills.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <div className="rounded-full bg-slate-800/50 p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 opacity-30" />
              </div>
              <p className="text-sm">暂无待审批账单</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentBills.map((bill) => {
                const colors = getStatusColor(bill.status);
                return (
                  <Link key={bill.id} href="/finance/reconciliation">
                    <div className="rounded-lg border border-slate-800/50 bg-slate-900/40 p-4 hover:border-orange-500/50 hover:bg-slate-900/60 transition-all duration-200 group cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                              {colors.label}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-slate-200 mb-2 group-hover:text-orange-300 transition-colors">
                            {bill.agencyName || bill.supplierName || bill.factoryName}
                          </div>
                          <div className="text-xs text-slate-400 mb-1">
                            <span className="font-medium text-slate-300">{bill.billType}</span>
                            <span className="mx-2">·</span>
                            <span className="font-medium text-slate-300">{formatCurrency(bill.netAmount, bill.currency)}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-2">
                            {bill.month}
                          </div>
                        </div>
                        <div className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="rounded-lg bg-orange-500/10 p-2">
                            <Eye className="h-4 w-4 text-orange-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 快速操作 */}
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary-500/20 p-2">
            <FileText className="h-5 w-5 text-primary-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100">快速操作</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Link href="/finance/reconciliation">
            <div className="group rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-5 hover:border-primary-500/50 hover:from-primary-500/10 hover:to-primary-600/5 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-primary-500/10">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-xl bg-primary-500/20 p-3 group-hover:bg-primary-500/30 group-hover:scale-110 transition-all duration-300">
                  <FileText className="h-6 w-6 text-primary-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-primary-300 transition-colors">对账中心</div>
                  <div className="text-xs text-slate-400 mt-1">管理月账单</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/finance/cash-flow">
            <div className="group rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-5 hover:border-emerald-500/50 hover:from-emerald-500/10 hover:to-emerald-600/5 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-emerald-500/10">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-xl bg-emerald-500/20 p-3 group-hover:bg-emerald-500/30 group-hover:scale-110 transition-all duration-300">
                  <DollarSign className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">流水清单</div>
                  <div className="text-xs text-slate-400 mt-1">查看财务流水</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/finance/payment-request">
            <div className="group rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-5 hover:border-blue-500/50 hover:from-blue-500/10 hover:to-blue-600/5 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-blue-500/10">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-xl bg-blue-500/20 p-3 group-hover:bg-blue-500/30 group-hover:scale-110 transition-all duration-300">
                  <Wallet className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-blue-300 transition-colors">支付申请</div>
                  <div className="text-xs text-slate-400 mt-1">管理付款申请</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/finance/accounts">
            <div className="group rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-5 hover:border-purple-500/50 hover:from-purple-500/10 hover:to-purple-600/5 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-purple-500/10">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-xl bg-purple-500/20 p-3 group-hover:bg-purple-500/30 group-hover:scale-110 transition-all duration-300">
                  <Wallet className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">账户列表</div>
                  <div className="text-xs text-slate-400 mt-1">管理银行账户</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/finance/approval">
            <div className="group rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-5 hover:border-amber-500/50 hover:from-amber-500/10 hover:to-amber-600/5 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:shadow-amber-500/10 relative">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="rounded-xl bg-amber-500/20 p-3 group-hover:bg-amber-500/30 group-hover:scale-110 transition-all duration-300 relative">
                  <CheckCircle2 className="h-6 w-6 text-amber-400" />
                  {pendingBills.length > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-xs bg-rose-500 text-white font-bold animate-pulse shadow-lg">
                      {pendingBills.length}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">审批中心</div>
                  <div className="text-xs text-slate-400 mt-1">审批账单和支付申请</div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* 选择账户出账弹窗（支出申请） */}
      {expenseAccountModal.open && expenseAccountModal.requestId && (() => {
        // 如果没有 selectedExpenseRequest，尝试从 approvedExpenseRequests 中查找
        const request = selectedExpenseRequest || approvedExpenseRequests.find(r => r.id === expenseAccountModal.requestId);
        if (!request) {
          console.error("找不到申请信息，requestId:", expenseAccountModal.requestId);
          return null;
        }
        
        // 计算匹配的账户数量
        const matchingAccounts = Array.isArray(accounts) ? accounts.filter((acc) => {
          const requestCurrency = request.currency as string;
          const accountCurrency = acc.currency as string;
          return accountCurrency === requestCurrency || 
                 (requestCurrency === "CNY" && (accountCurrency === "CNY" || accountCurrency === "RMB")) ||
                 ((requestCurrency === "CNY" || requestCurrency === "RMB") && accountCurrency === "CNY");
        }) : [];
        
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">选择出款账户</h2>
              <button
                onClick={() => {
                  setExpenseAccountModal({ open: false, requestId: null });
                  setSelectedAccountId("");
                  setPaymentVoucher(""); // 清空凭证
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="mb-4 p-4 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-300 mb-2">申请信息</div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>摘要：{request.summary}</div>
                <div>金额：{formatCurrency(request.amount, request.currency)}</div>
                <div>分类：{request.category}</div>
                <div>币种：{request.currency}</div>
              </div>
            </div>
            <label className="block mb-4">
              <span className="text-sm text-slate-300 mb-2 block">
                选择账户
                <span className="ml-2 text-xs text-slate-500">
                  ({matchingAccounts.length} 个可用)
                </span>
                {!Array.isArray(accounts) || accounts.length === 0 && (
                  <span className="ml-2 text-xs text-rose-400">(账户数据加载中...)</span>
                )}
              </span>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                disabled={!Array.isArray(accounts) || accounts.length === 0}
              >
                <option value="">{!Array.isArray(accounts) || accounts.length === 0 ? "暂无可用账户" : "请选择账户"}</option>
                {matchingAccounts.map((acc) => {
                  const displayBalance = acc.originalBalance || 0;
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} - 余额: {formatCurrency(displayBalance, acc.currency)}
                    </option>
                  );
                })}
              </select>
              {matchingAccounts.length === 0 && (
                <p className="mt-2 text-xs text-amber-400">
                  没有匹配币种 {request.currency} 的账户，请先创建账户
                  {Array.isArray(accounts) && accounts.length > 0 && (
                    <span className="block mt-1 text-slate-500">
                      当前系统共有 {accounts.length} 个账户，币种包括：{Array.from(new Set(accounts.map(a => a.currency))).join(", ")}
                    </span>
                  )}
                </p>
              )}
            </label>
            
            {/* 转账凭证上传 */}
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-2">
                转账凭证 <span className="text-slate-500 text-xs">(可选)</span>
              </label>
              <ImageUploader
                value={paymentVoucher}
                onChange={(value) => setPaymentVoucher(value)}
                multiple={true}
                label="上传转账凭证"
                placeholder="点击上传或直接 Ctrl + V 粘贴转账凭证图片"
                maxImages={5}
                onError={(error) => toast.error(error)}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setExpenseAccountModal({ open: false, requestId: null });
                  setSelectedAccountId("");
                  setPaymentVoucher(""); // 清空凭证
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
              <InteractiveButton
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!request) {
                    toast.error("申请信息丢失，请重新选择");
                    return;
                  }
                  if (!selectedAccountId) {
                    toast.error("请选择出款账户");
                    return;
                  }
                  try {
                    console.log("开始执行出账操作，requestId:", request.id);
                    await handleProcessExpenseRequest(request.id);
                    console.log("出账操作完成");
                  } catch (error: any) {
                    console.error("出账处理失败:", error);
                    // 错误已在 handleProcessExpenseRequest 中处理，这里只记录日志
                  }
                }}
                variant="danger"
                size="md"
                className="px-4 py-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600"
                disabled={!selectedAccountId || !request}
              >
                确认出账
              </InteractiveButton>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 选择账户入账弹窗（收入申请） */}
      {incomeAccountModal.open && incomeAccountModal.requestId && (() => {
        // 如果没有 selectedIncomeRequest，尝试从 approvedIncomeRequests 中查找
        const request = selectedIncomeRequest || approvedIncomeRequests.find(r => r.id === incomeAccountModal.requestId);
        if (!request) {
          console.error("找不到申请信息，requestId:", incomeAccountModal.requestId);
          return null;
        }
        
        // 计算匹配的账户数量
        const matchingAccounts = Array.isArray(accounts) ? accounts.filter((acc) => {
          const requestCurrency = request.currency as string;
          const accountCurrency = acc.currency as string;
          return accountCurrency === requestCurrency || 
                 (requestCurrency === "CNY" && (accountCurrency === "CNY" || accountCurrency === "RMB")) ||
                 ((requestCurrency === "CNY" || requestCurrency === "RMB") && accountCurrency === "CNY");
        }) : [];
        
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">选择收款账户</h2>
              <button
                onClick={() => {
                  setIncomeAccountModal({ open: false, requestId: null });
                  setSelectedAccountId("");
                  setPaymentVoucher(""); // 清空凭证
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="mb-4 p-4 rounded-lg bg-slate-800/50">
              <div className="text-sm text-slate-300 mb-2">申请信息</div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>摘要：{request.summary}</div>
                <div>金额：{formatCurrency(request.amount, request.currency)}</div>
                <div>分类：{request.category}</div>
                <div>币种：{request.currency}</div>
              </div>
            </div>
            <label className="block mb-4">
              <span className="text-sm text-slate-300 mb-2 block">
                选择账户
                <span className="ml-2 text-xs text-slate-500">
                  ({matchingAccounts.length} 个可用)
                </span>
                {!Array.isArray(accounts) || accounts.length === 0 && (
                  <span className="ml-2 text-xs text-rose-400">(账户数据加载中...)</span>
                )}
              </span>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                disabled={!Array.isArray(accounts) || accounts.length === 0}
              >
                <option value="">{!Array.isArray(accounts) || accounts.length === 0 ? "暂无可用账户" : "请选择账户"}</option>
                {matchingAccounts.map((acc) => {
                  const displayBalance = acc.originalBalance || 0;
                  return (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} - 余额: {formatCurrency(displayBalance, acc.currency)}
                    </option>
                  );
                })}
              </select>
              {matchingAccounts.length === 0 && (
                <p className="mt-2 text-xs text-amber-400">
                  没有匹配币种 {request.currency} 的账户，请先创建账户
                  {Array.isArray(accounts) && accounts.length > 0 && (
                    <span className="block mt-1 text-slate-500">
                      当前系统共有 {accounts.length} 个账户，币种包括：{Array.from(new Set(accounts.map(a => a.currency))).join(", ")}
                    </span>
                  )}
                </p>
              )}
            </label>
            
            {/* 转账凭证上传 */}
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-2">
                转账凭证 <span className="text-slate-500 text-xs">(可选)</span>
              </label>
              <ImageUploader
                value={paymentVoucher}
                onChange={(value) => setPaymentVoucher(value)}
                multiple={true}
                label="上传转账凭证"
                placeholder="点击上传或直接 Ctrl + V 粘贴转账凭证图片"
                maxImages={5}
                onError={(error) => toast.error(error)}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIncomeAccountModal({ open: false, requestId: null });
                  setSelectedAccountId("");
                  setPaymentVoucher(""); // 清空凭证
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
              <InteractiveButton
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!request) {
                    toast.error("申请信息丢失，请重新选择");
                    return;
                  }
                  if (!selectedAccountId) {
                    toast.error("请选择入款账户");
                    return;
                  }
                  try {
                    await handleProcessIncomeRequest(request.id);
                  } catch (error: any) {
                    console.error("入账处理失败:", error);
                    // 错误已在 handleProcessIncomeRequest 中处理
                  }
                }}
                variant="success"
                size="md"
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                disabled={!selectedAccountId || !request}
              >
                确认入账
              </InteractiveButton>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 支出申请详情弹窗 - 重构为按需加载 */}
      {expenseDetailModal.open && expenseDetailModal.requestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">支出申请详情</h2>
              <button
                onClick={() => {
                  setExpenseDetailModal({ open: false, requestId: null });
                }}
                className="text-slate-400 hover:text-slate-200 text-2xl"
              >
                ✕
              </button>
            </div>

            {isLoadingExpenseDetail ? (
              <SkeletonDetail />
            ) : expenseDetailData ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">摘要：</span>
                    <span className="text-slate-200 ml-2">{expenseDetailData.summary}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">金额：</span>
                    <span className="text-rose-300 font-medium ml-2">{formatCurrency(expenseDetailData.amount, expenseDetailData.currency)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">分类：</span>
                    <span className="text-slate-200 ml-2">{expenseDetailData.category}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">币种：</span>
                    <span className="text-slate-200 ml-2">{expenseDetailData.currency}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">日期：</span>
                    <span className="text-slate-200 ml-2">{formatDate(expenseDetailData.date)}</span>
                  </div>
                  {expenseDetailData.businessNumber && (
                    <div>
                      <span className="text-slate-400">关联单号：</span>
                      <span className="text-slate-200 ml-2">{expenseDetailData.businessNumber}</span>
                    </div>
                  )}
                  {expenseDetailData.storeName && (
                    <div>
                      <span className="text-slate-400">店铺：</span>
                      <span className="text-slate-200 ml-2">{expenseDetailData.storeName}</span>
                    </div>
                  )}
                  {expenseDetailData.departmentName && (
                    <div>
                      <span className="text-slate-400">部门：</span>
                      <span className="text-slate-200 ml-2">{expenseDetailData.departmentName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 备注 */}
              {expenseDetailData.remark && (
                <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">备注</h3>
                  <p className="text-sm text-slate-300">{expenseDetailData.remark}</p>
                </div>
              )}

              {/* 凭证 */}
              {expenseDetailData.voucher && (
                <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">凭证</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Array.isArray(expenseDetailData.voucher) ? (
                      expenseDetailData.voucher.map((v: string, idx: number) => (
                        <img key={idx} src={v} alt={`凭证${idx + 1}`} className="rounded-lg max-h-48 object-contain bg-slate-900" />
                      ))
                    ) : (
                      <img src={expenseDetailData.voucher} alt="凭证" className="rounded-lg max-h-48 object-contain bg-slate-900" />
                    )}
                  </div>
                </div>
              )}

              {/* 审批信息 */}
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">审批信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">发起人：</span>
                    <span className="text-slate-200 ml-2">{expenseDetailData.createdBy}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">创建时间：</span>
                    <span className="text-slate-200 ml-2">{formatDate(expenseDetailData.createdAt)}</span>
                  </div>
                  {expenseDetailData.approvedBy && (
                    <>
                      <div>
                        <span className="text-slate-400">审批人：</span>
                        <span className="text-slate-200 ml-2">{expenseDetailData.approvedBy}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">审批时间：</span>
                        <span className="text-slate-200 ml-2">{formatDate(expenseDetailData.approvedAt)}</span>
                      </div>
                    </>
                  )}
                  {expenseDetailData.rejectionReason && (
                    <div className="col-span-2">
                      <span className="text-slate-400">退回原因：</span>
                      <span className="text-red-400 ml-2">{expenseDetailData.rejectionReason}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 付款信息（如果已付款） */}
              {expenseDetailData.paidBy && (
                <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
                  <h3 className="text-sm font-semibold text-emerald-300 mb-3">付款信息</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">付款人：</span>
                      <span className="text-emerald-300 ml-2">{expenseDetailData.paidBy}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">付款时间：</span>
                      <span className="text-emerald-300 ml-2">{formatDate(expenseDetailData.paidAt)}</span>
                    </div>
                    {expenseDetailData.financeAccountName && (
                      <div>
                        <span className="text-slate-400">付款账户：</span>
                        <span className="text-emerald-300 ml-2">{expenseDetailData.financeAccountName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <p>加载失败，请重试</p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setExpenseDetailModal({ open: false, requestId: null });
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                关闭
              </button>
              {expenseDetailData && !expenseDetailData.paidBy && (
                <button
                  onClick={() => {
                    setSelectedExpenseRequest(expenseDetailData as ExpenseRequest);
                    setExpenseDetailModal({ open: false, requestId: null });
                    if (expenseDetailData) {
                      setExpenseAccountModal({ open: true, requestId: expenseDetailData.id });
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-rose-500 text-white hover:bg-rose-600"
                >
                  选择账户出账
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 收入申请详情弹窗 - 重构为按需加载 */}
      {incomeDetailModal.open && incomeDetailModal.requestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">收入申请详情</h2>
              <button
                onClick={() => {
                  setIncomeDetailModal({ open: false, requestId: null });
                }}
                className="text-slate-400 hover:text-slate-200 text-2xl"
              >
                ✕
              </button>
            </div>

            {isLoadingIncomeDetail ? (
              <SkeletonDetail />
            ) : incomeDetailData ? (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">摘要：</span>
                    <span className="text-slate-200 ml-2">{incomeDetailData.summary}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">金额：</span>
                    <span className="text-emerald-300 font-medium ml-2">{formatCurrency(incomeDetailData.amount, incomeDetailData.currency)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">分类：</span>
                    <span className="text-slate-200 ml-2">{incomeDetailData.category}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">币种：</span>
                    <span className="text-slate-200 ml-2">{incomeDetailData.currency}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">日期：</span>
                    <span className="text-slate-200 ml-2">{formatDate(incomeDetailData.date)}</span>
                  </div>
                  {incomeDetailData.storeName && (
                    <div>
                      <span className="text-slate-400">店铺：</span>
                      <span className="text-slate-200 ml-2">{incomeDetailData.storeName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 备注 */}
              {incomeDetailData.remark && (
                <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">备注</h3>
                  <p className="text-sm text-slate-300">{incomeDetailData.remark}</p>
                </div>
              )}

              {/* 凭证 */}
              {incomeDetailData.voucher && (
                <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3">凭证</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Array.isArray(incomeDetailData.voucher) ? (
                      incomeDetailData.voucher.map((v: string, idx: number) => (
                        <img key={idx} src={v} alt={`凭证${idx + 1}`} className="rounded-lg max-h-48 object-contain bg-slate-900" />
                      ))
                    ) : (
                      <img src={incomeDetailData.voucher} alt="凭证" className="rounded-lg max-h-48 object-contain bg-slate-900" />
                    )}
                  </div>
                </div>
              )}

              {/* 审批信息 */}
              <div className="rounded-lg border border-slate-800/50 bg-slate-800/30 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">审批信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">发起人：</span>
                    <span className="text-slate-200 ml-2">{incomeDetailData.createdBy}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">创建时间：</span>
                    <span className="text-slate-200 ml-2">{formatDate(incomeDetailData.createdAt)}</span>
                  </div>
                  {incomeDetailData.approvedBy && (
                    <>
                      <div>
                        <span className="text-slate-400">审批人：</span>
                        <span className="text-slate-200 ml-2">{incomeDetailData.approvedBy}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">审批时间：</span>
                        <span className="text-slate-200 ml-2">{formatDate(incomeDetailData.approvedAt)}</span>
                      </div>
                    </>
                  )}
                  {incomeDetailData.rejectionReason && (
                    <div className="col-span-2">
                      <span className="text-slate-400">退回原因：</span>
                      <span className="text-red-400 ml-2">{incomeDetailData.rejectionReason}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 收款信息（如果已收款） */}
              {incomeDetailData.receivedBy && (
                <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
                  <h3 className="text-sm font-semibold text-emerald-300 mb-3">收款信息</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">收款人：</span>
                      <span className="text-emerald-300 ml-2">{incomeDetailData.receivedBy}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">收款时间：</span>
                      <span className="text-emerald-300 ml-2">{formatDate(incomeDetailData.receivedAt)}</span>
                    </div>
                    {incomeDetailData.financeAccountName && (
                      <div>
                        <span className="text-slate-400">收款账户：</span>
                        <span className="text-emerald-300 ml-2">{incomeDetailData.financeAccountName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <p>加载失败，请重试</p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setIncomeDetailModal({ open: false, requestId: null });
                }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                关闭
              </button>
              {incomeDetailData && !incomeDetailData.receivedBy && (
                <button
                  onClick={() => {
                    setSelectedIncomeRequest(incomeDetailData as IncomeRequest);
                    setIncomeDetailModal({ open: false, requestId: null });
                    if (incomeDetailData) {
                      setIncomeAccountModal({ open: true, requestId: incomeDetailData.id });
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  选择账户入账
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 流水录入组件 */}
      {activeModal === "expense" && (
        <ExpenseEntry
          accounts={Array.isArray(accounts) ? accounts : []}
          onClose={() => setActiveModal(null)}
          onSave={handleAddFlow}
        />
      )}
      {activeModal === "income" && (
        <IncomeEntry
          accounts={Array.isArray(accounts) ? accounts : []}
          onClose={() => setActiveModal(null)}
          onSave={handleAddFlow}
        />
      )}
      {activeModal === "transfer" && (
        <TransferEntry
          accounts={Array.isArray(accounts) ? accounts : []}
          onClose={() => setActiveModal(null)}
          onSave={handleAddFlow}
        />
      )}
    </div>
  );
}
