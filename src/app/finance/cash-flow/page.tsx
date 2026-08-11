"use client";

import { toast } from "sonner";
import { Download, TrendingUp, TrendingDown, DollarSign, FileText, Trash2 } from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { type BankAccount, calculatePrimaryAccountBalance } from "@/lib/finance-store";
import { getStores, type Store } from "@/lib/store-store";
import ExpenseEntry from "./components/ExpenseEntry";
import IncomeEntry from "./components/IncomeEntry";
import TransferEntry from "./components/TransferEntry";
import { enrichWithUID } from "@/lib/business-utils";
import { EXPENSE_CATEGORIES, formatCategoryDisplay, parseCategory } from "@/lib/expense-categories";
import { INCOME_CATEGORIES, formatIncomeCategoryDisplay, parseIncomeCategory } from "@/lib/income-categories";
import { formatMoney } from "@/lib/constants/currency";
import MoneyDisplay from "@/components/ui/MoneyDisplay";
import ImageUploader from "@/components/ImageUploader";
import DateInput from "@/components/DateInput";
import { useSystemConfirm } from "@/hooks/use-system-confirm";
import { Pagination, usePaginationState } from "@/components/Pagination";
import type { CashFlowSummary } from "@/lib/cash-flow-summary";

export type CashFlow = {
  id: string;
  uid?: string; // 全局唯一业务ID（业财一体化）
  date: string; // ISO date
  summary: string; // 摘要
  category: string; // 分类：采购/物流/回款/划拨/手续费等
  type: "income" | "expense";
  amount: number;
  accountId: string;
  accountName: string;
  currency: string;
  exchangeRate?: number; // 创建时的汇率快照
  remark: string;
  relatedId?: string; // 关联的采购单ID等
  businessNumber?: string; // 关联业务单号（如采购单号）
  status: "confirmed" | "pending"; // 已确认/待核对
  isReversal?: boolean; // 是否为冲销记录
  reversedById?: string; // 被冲销的记录ID
  voucher?: string; // 旧凭证（兼容）
  paymentVoucher?: string; // 付款凭证（发起付款时，JSON 或多图）
  transferVoucher?: string; // 转账成功凭证（财务打款后）
  hasPaymentVoucher?: boolean;
  hasTransferVoucher?: boolean;
  createdAt: string;
};

type CashFlowListResponse = {
  data: CashFlow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary?: CashFlowSummary;
  monthSummary?: CashFlowSummary;
  accountBalanceDeltas?: Record<string, number>;
};

// SWR fetcher
const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `请求失败 (${response.status})`);
  return data;
};

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatDate = (d: string) => {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    // 如果包含时间信息（ISO 字符串长度 > 10），显示完整日期时间
    if (d.length > 10 && d.includes('T')) {
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    }
    // 如果只有日期，也显示日期（兼容旧数据）
    return toLocalDateKey(date);
  } catch (e) {
    return d;
  }
};

const toLocalDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const flowDateKey = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return toLocalDateKey(d);
  return (dateStr || "").slice(0, 10);
};

const EMPTY_SUMMARY: CashFlowSummary = {
  totalIncome: 0,
  totalExpense: 0,
  netIncome: 0,
  transactionCount: 0,
  incomeCount: 0,
  expenseCount: 0,
  incomeByCurrency: {},
  expenseByCurrency: {},
};

function activeDateRange(options: {
  quickFilter: string;
  filterYear: string;
  filterMonth: string;
  filterDateFrom: string;
  filterDateTo: string;
}): { startDate: string; endDate: string } {
  const today = new Date();
  let startDate = options.filterDateFrom;
  let endDate = options.filterDateTo;

  switch (options.quickFilter) {
    case "today":
      startDate = endDate = toLocalDateKey(today);
      break;
    case "yesterday": {
      const date = new Date(today);
      date.setDate(date.getDate() - 1);
      startDate = endDate = toLocalDateKey(date);
      break;
    }
    case "thisWeek": {
      const date = new Date(today);
      date.setDate(today.getDate() - today.getDay());
      startDate = toLocalDateKey(date);
      endDate = toLocalDateKey(today);
      break;
    }
    case "lastWeek": {
      const lastWeekEnd = new Date(today);
      lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
      startDate = toLocalDateKey(lastWeekStart);
      endDate = toLocalDateKey(lastWeekEnd);
      break;
    }
    case "thisMonth":
      startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
      endDate = toLocalDateKey(today);
      break;
    case "lastMonth": {
      startDate = toLocalDateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      endDate = toLocalDateKey(new Date(today.getFullYear(), today.getMonth(), 0));
      break;
    }
    case "thisQuarter": {
      const quarter = Math.floor(today.getMonth() / 3);
      startDate = `${today.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
      endDate = toLocalDateKey(today);
      break;
    }
    case "thisYear":
      startDate = `${today.getFullYear()}-01-01`;
      endDate = toLocalDateKey(today);
      break;
    case "lastYear":
      startDate = `${today.getFullYear() - 1}-01-01`;
      endDate = `${today.getFullYear() - 1}-12-31`;
      break;
    default:
      if (options.filterMonth) {
        const [year, month] = options.filterMonth.split("-").map(Number);
        startDate = `${options.filterMonth}-01`;
        endDate = toLocalDateKey(new Date(year, month, 0));
      } else if (options.filterYear) {
        startDate = `${options.filterYear}-01-01`;
        endDate = `${options.filterYear}-12-31`;
      }
  }

  return { startDate, endDate };
}

function voucherImages(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim() || raw.trim() === "null") return [];
  const value = raw.trim();
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string" && item.length > 10);
    if (typeof parsed === "string" && parsed.length > 10) return [parsed];
  } catch {
    // Legacy rows may store one data URL directly instead of JSON.
  }
  return value.length > 10 ? [value] : [];
}

export default function CashFlowPage() {
  const { confirm, confirmDialog } = useSystemConfirm();
  const [activeModal, setActiveModal] = useState<"expense" | "income" | "transfer" | null>(null);
  const [relatedFlows, setRelatedFlows] = useState<{ open: boolean; businessNumber: string; flows: any[] }>({ open: false, businessNumber: "", flows: [] });
  const [editBN, setEditBN] = useState<string | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const { page: pgPage, pageSize: pgPageSize, setPage: setPgPage, setPageSize: setPgPageSize } = usePaginationState(20);
  const [filterPaymentType, setFilterPaymentType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSubCategory, setFilterSubCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [quickFilter, setQuickFilter] = useState<string>("");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);
  const [voucherRotation, setVoucherRotation] = useState(0);
  const [voucherViewLabel, setVoucherViewLabel] = useState<string>("凭证");
  const [currentVoucherIndex, setCurrentVoucherIndex] = useState(0);
  const [voucherLoadingKey, setVoucherLoadingKey] = useState<string | null>(null);
  const [supplementVoucherFlow, setSupplementVoucherFlow] = useState<CashFlow | null>(null);
  const [supplementPaymentVoucher, setSupplementPaymentVoucher] = useState<string | string[]>("");
  const [supplementTransferVoucher, setSupplementTransferVoucher] = useState<string | string[]>("");

  const dateRange = useMemo(() => activeDateRange({
    quickFilter,
    filterYear,
    filterMonth,
    filterDateFrom,
    filterDateTo,
  }), [quickFilter, filterYear, filterMonth, filterDateFrom, filterDateTo]);

  const cashFlowFilterParams = useMemo(() => {
    const query = new URLSearchParams({
      noCache: "true",
      includeVouchers: "false",
      excludeInternal: "true",
    });
    if (filterCurrency !== "all") query.set("currency", filterCurrency);
    if (filterPaymentType !== "all") query.set("type", filterPaymentType);
    if (filterStatus !== "all") query.set("status", filterStatus);
    if (filterCategory !== "all") query.set("category", filterCategory);
    if (filterSubCategory !== "all") query.set("subCategory", filterSubCategory);
    if (dateRange.startDate) query.set("startDate", dateRange.startDate);
    if (dateRange.endDate) query.set("endDate", dateRange.endDate);
    if (searchKeyword.trim()) query.set("search", searchKeyword.trim());
    return query;
  }, [filterCurrency, filterPaymentType, filterStatus, filterCategory, filterSubCategory, dateRange, searchKeyword]);

  const cashFlowListKey = useMemo(() => {
    const query = new URLSearchParams(cashFlowFilterParams);
    query.set("page", String(pgPage));
    query.set("pageSize", String(pgPageSize));
    query.set("includeSummary", "true");
    query.set("includeBalances", "true");
    return `/api/cash-flow?${query.toString()}`;
  }, [cashFlowFilterParams, pgPage, pgPageSize]);

  const { data: cashFlowData, mutate: refreshCashFlows } = useSWR<CashFlowListResponse>(cashFlowListKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: false,
    dedupingInterval: 2000
  });

  // 兼容 API 返回 { data, pagination } 或直接数组；并统一 description->summary、flowStatus->status、type（API 返回 INCOME/EXPENSE/TRANSFER 和 CONFIRMED/PENDING，需转小写）
  const cashFlowListRaw = useMemo(() => {
    const list = cashFlowData?.data ?? [];
    return list.map((f: any) => {
      const typeStr = String(f.type ?? "").toLowerCase();
      const type = (typeStr === "income" ? "income" : "expense") as "income" | "expense";
      return {
        ...f,
        summary: f.summary ?? f.description,
        status: (String(f.flowStatus ?? f.status ?? "").toLowerCase() || "pending") as "confirmed" | "pending",
        type,
      };
    });
  }, [cashFlowData]);

  // 使用 SWR 加载账户数据（分页接口返回 { data, pagination }）
  const { data: accountsData } = useSWR<BankAccount[] | { data: BankAccount[]; pagination: unknown }>('/api/accounts?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
    dedupingInterval: 600000
  });
  // 店铺列表（供下拉关联店铺使用）
  const { data: storesData } = useSWR<any[] | { data: any[]; pagination: unknown }>('/api/stores?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
    dedupingInterval: 600000
  });
  const stores = Array.isArray(storesData) ? storesData : (storesData?.data ?? []);

  const accountsListRaw = Array.isArray(accountsData) ? accountsData : (accountsData?.data ?? []);

  // The API returns signed, confirmed deltas without transferring full rows.
  const accounts = useMemo(() => {
    if (!accountsListRaw.length) return [];
    const balanceDeltas = cashFlowData?.accountBalanceDeltas || {};

    // 重置所有账户的余额，从 initialCapital 开始重新计算（从流水记录重新计算）
    let updatedAccounts = accountsListRaw.map((acc) => {
      const hasChildren = accountsListRaw.some((a) => a.parentId === acc.id);
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
        // 从 initialCapital 开始计算，originalBalance 会通过流水记录累加
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

    updatedAccounts.forEach((account) => {
      const hasChildren = updatedAccounts.some((item) => item.parentId === account.id);
      if (account.accountCategory === "PRIMARY" && hasChildren) return;
      const newBalance = Number(account.initialCapital || 0) + Number(balanceDeltas[account.id] || 0);
      account.originalBalance = newBalance;
      account.rmbBalance = account.currency === "CNY" || account.currency === "RMB"
        ? newBalance
        : newBalance * (account.exchangeRate || 1);
    });
    
    // 重新计算所有主账户的余额（汇总子账户，如果有子账户的话）
    updatedAccounts = updatedAccounts.map((acc) => {
      if (acc.accountCategory === "PRIMARY") {
        const hasChildren = updatedAccounts.some((a) => a.parentId === acc.id);
        if (hasChildren) {
          const calculated = calculatePrimaryAccountBalance(acc, updatedAccounts);
          return {
            ...acc,
            originalBalance: calculated.originalBalance,
            rmbBalance: calculated.rmbBalance
          };
        }
      }
      return acc;
    });
    
    return updatedAccounts;
  }, [accountsListRaw, cashFlowData?.accountBalanceDeltas]);

  useEffect(() => {
    setPgPage(1);
  }, [filterCurrency, filterPaymentType, filterCategory, filterSubCategory, filterStatus, dateRange, searchKeyword, setPgPage]);

  // 数据已通过 SWR 加载，余额计算在账户页面处理

  // 余额计算已在账户页面通过 SWR 处理，无需在此更新

  const [isSavingFlow, setIsSavingFlow] = useState(false);

  const handleViewVoucher = async (flowId: string, kind: "payment" | "transfer") => {
    const loadingKey = `${flowId}:${kind}`;
    setVoucherLoadingKey(loadingKey);
    try {
      const data = await fetcher(`/api/cash-flow/${flowId}/vouchers`);
      const images = voucherImages(kind === "payment" ? data.paymentVoucher : data.transferVoucher);
      if (!images.length) {
        toast.info("该流水没有可查看的凭证");
        await refreshCashFlows();
        return;
      }
      setVoucherViewModal(JSON.stringify(images));
      setVoucherRotation(0);
      setVoucherViewLabel(kind === "payment" ? "发起付款凭证" : "转账成功凭证");
      setCurrentVoucherIndex(0);
    } catch (error: any) {
      toast.error(error?.message || "凭证读取失败");
    } finally {
      setVoucherLoadingKey(null);
    }
  };

  const handleOpenRelatedFlows = async (businessNumber: string) => {
    try {
      const query = new URLSearchParams({
        businessNumber,
        page: "1",
        pageSize: "200",
        noCache: "true",
        includeVouchers: "false",
      });
      const response = await fetcher(`/api/cash-flow?${query.toString()}`) as CashFlowListResponse;
      if (response.data.length <= 1) {
        toast.info("该单号下只有当前这笔流水");
        return;
      }
      setRelatedFlows({ open: true, businessNumber, flows: response.data });
    } catch (error: any) {
      toast.error(error?.message || "关联流水读取失败");
    }
  };

  const handleAddFlow = async (newFlow: CashFlow, adAccountId?: string, rebateAmount?: number, warehouseId?: string) => {
    // 防止重复提交
    if (isSavingFlow) {
      toast.loading("正在保存，请勿重复点击");
      return;
    }

    setIsSavingFlow(true);
    try {
      const response = await fetch('/api/cash-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newFlow, warehouseId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.details ? `${error.error}: ${error.details}` : (error.error || '创建失败');
        throw new Error(errorMessage);
      }
      
      await refreshCashFlows(); // 重新获取当前分页和统计
      await swrMutate('/api/accounts?page=1&pageSize=500'); // 重新获取账户列表，更新余额显示
      
      // 如果是广告充值，更新广告账户余额（包括返点）
      if (newFlow.category === "广告费" && adAccountId && typeof window !== "undefined") {
        try {
          const { getAdAccounts, saveAdAccounts } = require("@/lib/ad-agency-store");
          const adAccounts = getAdAccounts();
          
          const adAccount = adAccounts.find((a: any) => a.id === adAccountId);
          if (adAccount) {
            // 计算充值金额（原金额 + 返点）
            const rechargeAmount = Math.abs(newFlow.amount) + (rebateAmount || 0);
            
            // 更新广告账户余额
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
            console.log(`✅ 广告账户 ${adAccount.accountName} 充值成功，充值金额：${rechargeAmount.toFixed(2)}（含返点：${rebateAmount?.toFixed(2) || 0}）`);
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

  const handleReversal = async (flowId: string) => {
    if (!cashFlowListRaw.length) {
      toast.error("流水数据未加载");
      return;
    }
    const flow = cashFlowListRaw.find((f) => f.id === flowId);
    if (!flow) return;

    if (flow.isReversal) {
      toast.error("冲销记录不能再被冲销");
      return;
    }

    if (flow.status === "pending") {
      toast.error("待核对状态的记录不能冲销，请先确认或删除");
      return;
    }

    const reversalFlow: CashFlow = {
      id: crypto.randomUUID(),
      date: toLocalDateKey(new Date()),
      summary: `[冲销] ${flow.summary}`,
      type: flow.type,
      category: flow.category,
      amount: -flow.amount, // 反向金额
      accountId: flow.accountId,
      accountName: flow.accountName,
      currency: flow.currency,
      remark: `冲销记录：${flow.id}`,
      businessNumber: flow.businessNumber,
      status: "confirmed",
      isReversal: true,
      reversedById: flowId,
      createdAt: new Date().toISOString()
    };

    // 自动生成唯一业务ID
    const reversalFlowWithUID = enrichWithUID(reversalFlow, "CASH_FLOW");
    
    try {
      const response = await fetch('/api/cash-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reversalFlowWithUID)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '冲销失败');
      }
      
      await refreshCashFlows(); // 重新获取当前分页和统计
      await swrMutate('/api/accounts?page=1&pageSize=500'); // 重新获取账户列表，更新余额显示
      toast.success("冲销成功！已生成红字反冲记录。");
    } catch (error: any) {
      console.error('Failed to create reversal flow:', error);
      toast.error(error.message || '冲销失败');
    }
  };

  const handleSupplementVoucher = async () => {
    if (!supplementVoucherFlow) return;
    const toStr = (v: string | string[]): string | null => {
      if (Array.isArray(v)) return v.length > 0 ? JSON.stringify(v) : null;
      return typeof v === "string" && v.length > 10 ? v : null;
    };
    const paymentVal = toStr(supplementPaymentVoucher);
    const transferVal = toStr(supplementTransferVoucher);
    if (!paymentVal && !transferVal) {
      toast.error("请上传付款凭证或转账凭证");
      return;
    }
    try {
      const body: { paymentVoucher?: string; transferVoucher?: string } = {};
      if (paymentVal) body.paymentVoucher = paymentVal;
      if (transferVal) body.transferVoucher = transferVal;
      const res = await fetch(`/api/cash-flow/${supplementVoucherFlow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "保存失败");
      }
      await refreshCashFlows();
      toast.success("凭证已保存");
      setSupplementVoucherFlow(null);
      setSupplementPaymentVoucher("");
      setSupplementTransferVoucher("");
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };

  const sortedFlow = useMemo(() => {
    if (!cashFlowListRaw.length) return [];
    let filtered = [...cashFlowListRaw].filter((f) => f.category !== "内部划拨" && f.category !== "换汇");
    if (filterCurrency !== "all") {
      filtered = filtered.filter((f) => f.currency === filterCurrency);
    }
    if (filterPaymentType !== "all") {
      filtered = filtered.filter((f) => f.type === filterPaymentType);
    }
    if (filterCategory !== "all") {
      if (filterSubCategory !== "all") {
        // 筛选二级分类
        filtered = filtered.filter((f) => f.category === filterSubCategory);
      } else {
        // 筛选一级分类（包含所有二级分类）
        filtered = filtered.filter((f) => {
          try {
            // 根据类型使用不同的解析函数
            if (f.type === "expense") {
              const { primary } = parseCategory(f.category);
              return primary === filterCategory;
            } else {
              const { primary } = parseIncomeCategory(f.category);
              return primary === filterCategory;
            }
          } catch (e) {
            console.error("Failed to parse category for filtering:", e);
            return false;
          }
        });
      }
    }
    if (filterStatus !== "all") {
      filtered = filtered.filter((f) => (f.status ?? (f as any).flowStatus) === filterStatus);
    }
    
    // 快速筛选（优先级最高）
    if (quickFilter) {
      const today = new Date();
      let fromDate = "";
      let toDate = "";
      
      switch (quickFilter) {
        case "today":
          fromDate = toDate = toLocalDateKey(today);
          break;
        case "yesterday": {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          fromDate = toDate = toLocalDateKey(yesterday);
          break;
        }
        case "thisWeek": {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          fromDate = toLocalDateKey(weekStart);
          toDate = toLocalDateKey(today);
          break;
        }
        case "lastWeek": {
          const lastWeekEnd = new Date(today);
          lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
          const lastWeekStart = new Date(lastWeekEnd);
          lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
          fromDate = toLocalDateKey(lastWeekStart);
          toDate = toLocalDateKey(lastWeekEnd);
          break;
        }
        case "thisMonth": {
          fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
          toDate = toLocalDateKey(today);
          break;
        }
        case "lastMonth": {
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
          fromDate = toLocalDateKey(lastMonth);
          toDate = toLocalDateKey(lastMonthEnd);
          break;
        }
        case "thisQuarter": {
          const quarter = Math.floor(today.getMonth() / 3);
          fromDate = `${today.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
          toDate = toLocalDateKey(today);
          break;
        }
        case "thisYear":
          fromDate = `${today.getFullYear()}-01-01`;
          toDate = toLocalDateKey(today);
          break;
        case "lastYear": {
          const lastYear = today.getFullYear() - 1;
          fromDate = `${lastYear}-01-01`;
          toDate = `${lastYear}-12-31`;
          break;
        }
      }
      
      // API 返回的 date 为 ISO 字符串（含时间），比较时取日期部分 YYYY-MM-DD
      const toDateOnly = (d: string) => flowDateKey(d);
      if (fromDate) filtered = filtered.filter((f) => toDateOnly(f.date) >= fromDate);
      if (toDate) filtered = filtered.filter((f) => toDateOnly(f.date) <= toDate);
    } else {
      // 按年筛选
      if (filterYear) {
        filtered = filtered.filter((f) => {
          const year = new Date(f.date).getFullYear();
          return year === parseInt(filterYear);
        });
      }
      
      // 按月筛选
      if (filterMonth) {
        filtered = filtered.filter((f) => {
          const date = new Date(f.date);
          const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          return monthStr === filterMonth;
        });
      }
      
      // 日期范围筛选（API 返回的 date 可能含时间，取日期部分比较）
      const toDateOnly = (d: string) => flowDateKey(d);
      if (filterDateFrom) {
        filtered = filtered.filter((f) => toDateOnly(f.date) >= filterDateFrom);
      }
      if (filterDateTo) {
        filtered = filtered.filter((f) => toDateOnly(f.date) <= filterDateTo);
      }
    }
    
    // 关键词搜索（金额、摘要、备注、账户、单号）
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase().trim();
      filtered = filtered.filter((f) => {
        return (
          String(f.summary || "").toLowerCase().includes(keyword) ||
          String(f.remark || "").toLowerCase().includes(keyword) ||
          String(f.accountName || "").toLowerCase().includes(keyword) ||
          String(f.businessNumber || "").toLowerCase().includes(keyword) ||
          String(f.category || "").toLowerCase().includes(keyword) ||
          String(Math.abs(f.amount || 0)).includes(keyword) ||
          String(f.amount || "").includes(keyword)
        );
      });
    }

    // 按业务日期倒序排列，最新的日期显示在第1条
    return filtered.sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      if (bTime !== aTime) return bTime - aTime; // 日期倒序
      // 同一天的按创建时间倒序
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });
  }, [cashFlowListRaw, filterCurrency, filterPaymentType, filterCategory, filterSubCategory, filterStatus, filterDateFrom, filterDateTo, filterYear, filterMonth, quickFilter, searchKeyword]);

  const filteredStats = cashFlowData?.summary || EMPTY_SUMMARY;
  const monthSummary = cashFlowData?.monthSummary || EMPTY_SUMMARY;
  const thisMonthIncomeByCurrency = Object.entries(monthSummary.incomeByCurrency)
    .map(([currencyCode, value]) => ({ ...value, currency: currencyCode }))
    .filter((value) => value.original > 0);
  const thisMonthIncomeRMB = monthSummary.totalIncome;

  // 数据导出功能
  const handleExportData = async () => {
    let exportFlows: CashFlow[] = [];
    try {
      const query = new URLSearchParams(cashFlowFilterParams);
      query.set("page", "1");
      query.set("pageSize", "10000");
      const response = await fetcher(`/api/cash-flow?${query.toString()}`) as CashFlowListResponse;
      exportFlows = response.data || [];
    } catch (error: any) {
      toast.error(error?.message || "导出数据读取失败");
      return;
    }
    if (exportFlows.length === 0) {
      toast.error("没有数据可导出");
      return;
    }

    const csvData = exportFlows.map((flow) => {
      const account = accounts.find(a => a.id === flow.accountId);
      return {
        业务ID: flow.uid || flow.id,
        类型: flow.type === "income" ? "收入" : "支出",
        收付款类型: flow.type === "income" ? "收款" : "付款",
        日期: formatDate(flow.date || flow.createdAt),
        摘要: flow.summary || "",
        一级分类: (() => {
          try {
            return flow.type === "expense"
              ? parseCategory(flow.category || "").primary || ""
              : parseIncomeCategory(flow.category || "").primary || "";
          } catch {
            return "";
          }
        })(),
        二级分类: (() => {
          try {
            return flow.type === "expense"
              ? parseCategory(flow.category || "").sub || ""
              : parseIncomeCategory(flow.category || "").sub || "";
          } catch {
            return "";
          }
        })(),
        完整分类: (() => {
          try {
            return flow.type === "expense"
              ? formatCategoryDisplay(flow.category || "")
              : formatIncomeCategoryDisplay(flow.category || "");
          } catch {
            return flow.category || "";
          }
        })(),
        金额: Math.abs(flow.amount),
        币种: flow.currency || "",
        账户: flow.accountName || "",
        状态: flow.status === "confirmed" ? "已确认" : "待核对",
        是否冲销: flow.isReversal ? "是" : "否",
        备注: flow.remark || "",
        业务单号: flow.businessNumber || "",
        创建时间: new Date(flow.createdAt).toLocaleString("zh-CN")
      };
    });

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(","),
      ...csvData.map((row) => headers.map((h) => `"${row[h as keyof typeof row]}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `流水明细_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("数据已导出");
  };

  const handleClearAll = async () => {
    if (
      !(await confirm({
        title: "危险操作确认",
        message: "确定要删除所有流水记录吗？此操作不可恢复！",
        type: "danger",
      }))
    ) {
      return;
    }

    try {
      const response = await fetch('/api/cash-flow/clear-all', {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }

      const result = await response.json();
      toast.success(`已删除 ${result.deletedCount} 条流水记录，账户余额已重置为初始资金`);
      
      // 刷新数据
      refreshCashFlows();
      swrMutate('/api/accounts?page=1&pageSize=500');
    } catch (error: any) {
      console.error('Failed to clear cash flows:', error);
      toast.error(error.message || '删除失败');
    }
  };

  const categories = {
    expense: ["采购", "物流", "广告费", "手续费", "退款", "其他支出"],
    income: ["回款", "销售收入", "退款收入", "其他收入"]
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">收支流水明细</h1>
          <p className="mt-1 text-sm text-slate-400">统一管理所有资金变动，支持独立录入、自动平账与冲销功能</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleClearAll}
            disabled={sortedFlow.length === 0}
            className="flex items-center gap-2 rounded-lg border border-rose-800/50 bg-rose-900/30 px-4 py-2 text-sm font-medium text-rose-300 shadow-lg hover:bg-rose-900/50 hover:border-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Trash2 className="h-4 w-4" />
            清空所有记录
          </button>
          <button
            onClick={handleExportData}
            disabled={sortedFlow.length === 0}
            className="flex items-center gap-2 rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 shadow-lg hover:bg-slate-800/50 hover:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <Download className="h-4 w-4" />
            导出数据
          </button>
          <button
            onClick={() => setActiveModal("expense")}
            className="rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-rose-500/20 hover:from-rose-600 hover:to-rose-700 hover:shadow-xl transition-all duration-200"
          >
            登记支出
          </button>
          <button
            onClick={() => setActiveModal("income")}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl transition-all duration-200"
          >
            登记收入
          </button>
        <button
            onClick={() => setActiveModal("transfer")}
            className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-blue-700 hover:shadow-xl transition-all duration-200"
        >
            内部划拨
        </button>
        </div>
      </header>

      {/* 统计面板 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-emerald-500/20"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(16, 185, 129, 0.2)"
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-2 font-medium">筛选总收入</p>
              <p className="text-2xl font-bold text-emerald-300 mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(filteredStats.totalIncome, "CNY")}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-emerald-300/60 flex-shrink-0" />
          </div>
          {/* 货币明细 */}
          {Object.keys(filteredStats.incomeByCurrency).length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-500/20">
              <div className="space-y-1.5">
                {Object.entries(filteredStats.incomeByCurrency).map(([curr, stat]) => (
                  <div key={curr} className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-200">
                      {curr}
                    </span>
                    <span className="text-xs font-semibold text-emerald-200" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {curr === "RMB" ? currency(stat.original, "CNY") : `${curr} ${stat.original.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-rose-500/20"
          style={{
            background: "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)",
            border: "1px solid rgba(244, 63, 94, 0.2)"
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-2 font-medium">筛选总支出</p>
              <p className="text-2xl font-bold text-rose-300 mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(filteredStats.totalExpense, "CNY")}
              </p>
            </div>
            <TrendingDown className="h-8 w-8 text-rose-300/60 flex-shrink-0" />
          </div>
          {/* 货币明细 */}
          {Object.keys(filteredStats.expenseByCurrency).length > 0 && (
            <div className="mt-3 pt-3 border-t border-rose-500/20">
              <div className="space-y-1.5">
                {Object.entries(filteredStats.expenseByCurrency).map(([curr, stat]) => (
                  <div key={curr} className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-200">
                      {curr}
                    </span>
                    <span className="text-xs font-semibold text-rose-200" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {curr === "RMB" ? currency(stat.original, "CNY") : `${curr} ${stat.original.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-lg"
          style={{
            background: filteredStats.netIncome >= 0 
              ? "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)"
              : "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)",
            border: filteredStats.netIncome >= 0 
              ? "1px solid rgba(59, 130, 246, 0.2)"
              : "1px solid rgba(244, 63, 94, 0.2)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium">净收入</p>
              <p 
                className={`text-2xl font-bold ${filteredStats.netIncome >= 0 ? "text-primary-300" : "text-rose-300"}`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                title="筛选总收入 − 筛选总支出，与下方列表范围一致"
              >
                {currency(filteredStats.netIncome, "CNY")}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">总收入 − 总支出（当前筛选）</p>
            </div>
            <DollarSign className={`h-8 w-8 ${filteredStats.netIncome >= 0 ? "text-primary-300" : "text-rose-300"} opacity-60`} />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/20"
          style={{
            background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
            border: "1px solid rgba(168, 85, 247, 0.2)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium">交易笔数</p>
              <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {filteredStats.transactionCount}
              </p>
            </div>
            <FileText className="h-8 w-8 text-purple-300/60" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-orange-500/20"
          style={{
            background: "linear-gradient(135deg, #7c2d12 0%, #0f172a 100%)",
            border: "1px solid rgba(251, 146, 60, 0.2)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium">本月总收入</p>
              <p className="text-2xl font-bold text-orange-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(thisMonthIncomeRMB, "CNY")}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-300/60" />
          </div>
        </div>
      </div>

      {/* 本月统计详情 */}
      {thisMonthIncomeByCurrency.length > 0 && (
        <section className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-1 rounded-full bg-emerald-400"></div>
            <h3 className="text-sm font-semibold text-slate-200">本月收入按货币明细</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {thisMonthIncomeByCurrency.map((stat, index) => {
              // 为不同货币分配不同的颜色主题
              const colorThemes = [
                { 
                  name: "emerald", 
                  bg: "from-emerald-500/10 to-emerald-600/5", 
                  border: "border-emerald-500/30", 
                  hoverBorder: "hover:border-emerald-400/50",
                  hoverShadow: "hover:shadow-emerald-500/20",
                  badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
                  amount: "text-emerald-300",
                  gradient: "from-emerald-500/8"
                },
                { 
                  name: "blue", 
                  bg: "from-blue-500/10 to-blue-600/5", 
                  border: "border-blue-500/30", 
                  hoverBorder: "hover:border-blue-400/50",
                  hoverShadow: "hover:shadow-blue-500/20",
                  badge: "bg-blue-500/15 border-blue-500/30 text-blue-300",
                  amount: "text-blue-300",
                  gradient: "from-blue-500/8"
                },
                { 
                  name: "purple", 
                  bg: "from-purple-500/10 to-purple-600/5", 
                  border: "border-purple-500/30", 
                  hoverBorder: "hover:border-purple-400/50",
                  hoverShadow: "hover:shadow-purple-500/20",
                  badge: "bg-purple-500/15 border-purple-500/30 text-purple-300",
                  amount: "text-purple-300",
                  gradient: "from-purple-500/8"
                },
                { 
                  name: "orange", 
                  bg: "from-orange-500/10 to-orange-600/5", 
                  border: "border-orange-500/30", 
                  hoverBorder: "hover:border-orange-400/50",
                  hoverShadow: "hover:shadow-orange-500/20",
                  badge: "bg-orange-500/15 border-orange-500/30 text-orange-300",
                  amount: "text-orange-300",
                  gradient: "from-orange-500/8"
                },
                { 
                  name: "cyan", 
                  bg: "from-cyan-500/10 to-cyan-600/5", 
                  border: "border-cyan-500/30", 
                  hoverBorder: "hover:border-cyan-400/50",
                  hoverShadow: "hover:shadow-cyan-500/20",
                  badge: "bg-cyan-500/15 border-cyan-500/30 text-cyan-300",
                  amount: "text-cyan-300",
                  gradient: "from-cyan-500/8"
                },
                { 
                  name: "pink", 
                  bg: "from-pink-500/10 to-pink-600/5", 
                  border: "border-pink-500/30", 
                  hoverBorder: "hover:border-pink-400/50",
                  hoverShadow: "hover:shadow-pink-500/20",
                  badge: "bg-pink-500/15 border-pink-500/30 text-pink-300",
                  amount: "text-pink-300",
                  gradient: "from-pink-500/8"
                }
              ];
              
              const theme = colorThemes[index % colorThemes.length];
              
              return (
                <div 
                  key={stat.currency} 
                  className={`group relative overflow-hidden rounded-xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 ${theme.hoverBorder} hover:bg-slate-800/70 transition-all duration-200 hover:shadow-lg ${theme.hoverShadow}`}
                >
                  {/* 背景装饰 */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                  
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* 货币标签 */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${theme.badge} border`}>
                        <span className="text-xs font-bold">{stat.currency}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-400 mb-0.5">原币金额</span>
                        <span className="text-sm font-semibold text-slate-200" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {currency(stat.original, stat.currency)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-slate-400 mb-0.5">折合人民币</span>
                      <span className={`text-base font-bold ${theme.amount}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {currency(stat.rmb, "CNY")}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 筛选器 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        {/* 快速筛选 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-200">快速筛选</label>
            {quickFilter && (
              <button
                onClick={() => setQuickFilter("")}
                className="text-xs text-slate-400 hover:text-primary-400 transition-colors"
              >
                清除
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "today", label: "今天" },
              { value: "yesterday", label: "昨天" },
              { value: "thisWeek", label: "本周" },
              { value: "lastWeek", label: "上周" },
              { value: "thisMonth", label: "本月" },
              { value: "lastMonth", label: "上月" },
              { value: "thisQuarter", label: "本季度" },
              { value: "thisYear", label: "本年" },
              { value: "lastYear", label: "去年" }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setQuickFilter(option.value);
                  setFilterYear("");
                  setFilterMonth("");
                  setFilterDateFrom("");
                  setFilterDateTo("");
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  quickFilter === option.value
                    ? "bg-primary-500 text-white shadow-md"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* 多维度时间筛选 */}
        {!quickFilter && (
          <div className="space-y-3 border-t border-slate-800 pt-3">
            <label className="text-sm font-medium text-slate-200">自定义时间筛选</label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">按年筛选</label>
                <select
                  value={filterYear}
                  onChange={(e) => {
                    setFilterYear(e.target.value);
                    if (e.target.value) {
                      setFilterMonth("");
                      setFilterDateFrom("");
                      setFilterDateTo("");
                    }
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="">全部年份</option>
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option key={year} value={year}>
                        {year}年
                      </option>
                    );
                  })}
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs text-slate-400">按月筛选</label>
                <select
                  value={filterMonth}
                  onChange={(e) => {
                    setFilterMonth(e.target.value);
                    if (e.target.value) {
                      setFilterDateFrom("");
                      setFilterDateTo("");
                    }
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!filterYear}
                >
                  <option value="">全部月份</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1;
                    const monthStr = filterYear ? `${filterYear}-${String(month).padStart(2, "0")}` : "";
                    return (
                      <option key={month} value={monthStr}>
                        {month}月
                      </option>
                    );
                  })}
                </select>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs text-slate-400">关键词搜索</label>
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="金额/摘要/账户/单号..."
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">日期范围</label>
                <div className="flex items-center gap-1">
                  <DateInput
                    value={filterDateFrom}
                    onChange={(v) => {
                      setFilterDateFrom(v);
                      setFilterYear("");
                      setFilterMonth("");
                    }}
                    placeholder="开始日期"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  />
                  <span className="text-slate-500 text-xs shrink-0">~</span>
                  <DateInput
                    value={filterDateTo}
                    onChange={(v) => {
                      setFilterDateTo(v);
                      setFilterYear("");
                      setFilterMonth("");
                    }}
                    placeholder="结束日期"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  />
                </div>
              </div>
            </div>
            {(filterYear || filterMonth || filterDateFrom || filterDateTo) && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setFilterYear("");
                    setFilterMonth("");
                    setFilterDateFrom("");
                    setFilterDateTo("");
                  }}
                  className="text-xs text-slate-400 hover:text-primary-400 transition-colors underline"
                >
                  清除时间筛选
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* 其他筛选条件 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 border-t border-slate-800 pt-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">币种</label>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            >
              <option value="all">全部</option>
              <option value="CNY">CNY</option>
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
              <option value="JPY">JPY</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">收付款类型</label>
            <select
              value={filterPaymentType}
              onChange={(e) => setFilterPaymentType(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            >
              <option value="all">全部</option>
              <option value="income">收款</option>
              <option value="expense">付款</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">一级分类</label>
            <select
              value={filterCategory}
              onChange={(e) => {
                setFilterCategory(e.target.value);
                setFilterSubCategory("all"); // 清空二级分类筛选
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            >
              <option value="all">全部</option>
              <optgroup label="支出分类">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="收入分类">
                {INCOME_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          {filterCategory !== "all" && (() => {
            // 查找支出分类
            let selectedCategory = EXPENSE_CATEGORIES.find(cat => cat.value === filterCategory);
            let subCategories = selectedCategory?.subCategories || [];
            
            // 如果没找到，查找收入分类
            if (!selectedCategory) {
              const incomeCategory = INCOME_CATEGORIES.find(cat => cat.value === filterCategory);
              subCategories = incomeCategory?.subCategories || [];
            }
            
            if (subCategories.length > 0) {
              return (
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">二级分类</label>
                  <select
                    value={filterSubCategory}
                    onChange={(e) => setFilterSubCategory(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="all">全部二级分类</option>
                    {subCategories.map((sub) => (
                      <option key={sub.value} value={sub.value}>
                        {sub.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            return null;
          })()}
          <div className="space-y-1">
            <label className="text-xs text-slate-400">状态</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            >
              <option value="all">全部</option>
              <option value="confirmed">已确认</option>
              <option value="pending">待核对</option>
            </select>
        </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-xs">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-12">类型</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-20">收付款类型</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-32">日期</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-28">平台</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 min-w-[140px]">店铺</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 min-w-[200px]">摘要</th>
                <th className="px-2 py-1.5 text-right font-medium text-slate-400 w-28">金额</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-16">币种</th>
                <th className="px-2 py-1.5 text-right font-medium text-slate-400 w-20">汇率</th>
                <th className="px-2 py-1.5 text-right font-medium text-slate-400 w-28">折合人民币</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 min-w-[120px]">账户</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-20">状态</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 min-w-[120px]">备注</th>
                <th className="px-2 py-1.5 text-center font-medium text-slate-400 w-28" title="发起付款时上传的凭证">发起付款凭证</th>
                <th className="px-2 py-1.5 text-center font-medium text-slate-400 w-28" title="财务打款后上传的凭证">转账成功凭证</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-20">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {sortedFlow.length === 0 && (
                <tr>
                  <td className="px-2 py-6 text-center text-slate-500" colSpan={14}>
                    暂无收支记录
                  </td>
                </tr>
              )}
              {sortedFlow.map((flow) => (
                <tr
                  key={flow.id}
                  className={`hover:bg-slate-800/40 ${flow.isReversal ? "opacity-60 bg-rose-500/5" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    {flow.isReversal ? (
                      <span className="text-rose-400" title="冲销记录">↺</span>
                    ) : flow.type === "income" ? (
                      <span className="text-emerald-400" title="收入">↑</span>
                    ) : (
                      <span className="text-rose-400" title="支出">↓</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        flow.type === "income"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {flow.type === "income" ? "收款" : "付款"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-300" title="业务日期（与筛选、统计一致）">{formatDate(flow.date || flow.createdAt)}</td>
                  <td className="px-2 py-1.5 text-slate-400 text-xs">
                    <select
                      value={flow.platform || ""}
                      onChange={async (e) => {
                        const val = e.target.value;
                        try {
                          const res = await fetch(`/api/cash-flow/${flow.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ platform: val || null }),
                            credentials: "same-origin",
                          });
                          if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            throw new Error(err.error || "失败");
                          }
                          refreshCashFlows();
                          toast.success("平台已更新");
                        } catch (e: any) {
                          toast.error(e?.message || "更新平台失败");
                        }
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-500"
                    >
                      <option value="">-</option>
                      {[...new Set((stores as any[]).map((s) => s.platform).filter(Boolean))].sort().map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-slate-300 text-xs">
                    <select
                      value={flow.storeId || ""}
                      onChange={async (e) => {
                        const val = e.target.value;
                        const store = (stores as any[]).find((s) => s.id === val);
                        try {
                          await fetch("/api/cash-flow", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: flow.id, storeId: val, storeName: store?.name || "" }),
                          });
                          refreshCashFlows();
                        } catch {}
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs text-slate-300 cursor-pointer hover:border-slate-500"
                    >
                      <option value="">不关联</option>
                      {(stores as any[]).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <div className="space-y-1.5">
                      {/* 分类标签 */}
                      {flow.category && (() => {
                        try {
                          // 根据类型使用不同的解析函数
                          const { primary, sub } = flow.type === "expense" 
                            ? parseCategory(flow.category)
                            : parseIncomeCategory(flow.category);
                          if (!primary) return null;
                          return (
                            <div className="flex flex-wrap gap-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/60 text-slate-200 border border-slate-600/50">
                                {primary}
                              </span>
                              {sub && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-600/60 text-slate-300 border border-slate-500/50">
                                  {sub}
                                </span>
                              )}
                            </div>
                          );
                        } catch (e) {
                          console.error("Failed to parse category:", e);
                          return (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/60 text-slate-200 border border-slate-600/50">
                              {flow.category}
                            </span>
                          );
                        }
                      })()}
                      {/* 摘要文本 */}
                      <div className="text-slate-100 text-xs leading-relaxed break-words font-medium">
                        {flow.summary || flow.remark || "-"}
                      </div>
                      {/* 业务单号和备注 */}
                      <div className="space-y-0.5 pt-0.5 border-t border-slate-700/50">
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            {flow.businessNumber && <span className="text-slate-500">单号:</span>}
                              <button
                                onClick={() => flow.businessNumber && handleOpenRelatedFlows(flow.businessNumber)}
                                className="text-primary-400 hover:text-primary-300 underline cursor-pointer"
                                title="点击查看关联流水（同合同/合并打款）"
                              >
                                {flow.businessNumber}
                              </button>
                              {editBN === flow.id ? (
                                <span className="flex items-center gap-0.5 ml-1">
                                  <input
                                    type="text"
                                    defaultValue={flow.businessNumber || ""}
                                    className="w-28 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-100 outline-none focus:border-primary-400"
                                    placeholder="关联单号"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                      if (e.key === "Escape") setEditBN(null);
                                    }}
                                    onBlur={async (e) => {
                                      const val = e.target.value.trim();
                                      if (val !== (flow.businessNumber || "")) {
                                        try {
                                          await fetch(`/api/cash-flow/${flow.id}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ businessNumber: val || null }),
                                          });
                                          toast.success(val ? "单号已更新" : "单号已清除");
                                          refreshCashFlows();
                                        } catch { toast.error("更新失败"); }
                                      }
                                      setEditBN(null);
                                    }}
                                  />
                                </span>
                              ) : (
                                <button
                                  onClick={() => setEditBN(flow.id)}
                                  className="text-slate-600 hover:text-primary-400 text-[10px]"
                                  title="添加关联单号"
                                >+ 添加单号</button>
                              )}
                          </div>
                          {flow.remark && flow.summary && flow.remark !== flow.summary && (
                            <div className="text-[10px] text-slate-500 italic leading-relaxed">
                              {flow.remark}
                            </div>
                          )}
                        </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className={flow.isReversal ? "text-rose-400" : flow.type === "income" ? "text-emerald-300" : "text-rose-300"}>
                        {flow.type === "income" ? "+" : "-"}
                      </span>
                      {flow.currency === "CNY" || flow.currency === "RMB" ? (
                        <MoneyDisplay
                          amount={Math.abs(flow.amount)}
                          currency="CNY"
                          variant="highlight"
                          className="font-semibold"
                          amountClassName={flow.isReversal ? "text-rose-400" : flow.type === "income" ? "text-emerald-300" : "text-rose-300"}
                        />
                      ) : (
                        <span className={flow.type === "income" ? "text-emerald-300" : "text-rose-300"}>
                          {currency(Math.abs(flow.amount), flow.currency)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-slate-500 text-xs">
                    {flow.currency === "RMB" ? "CNY" : flow.currency}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-400 text-xs">
                    {(() => {
                      if (flow.currency === "CNY" || flow.currency === "RMB") return "1.00";
                      // 优先用流水自带的汇率快照，没有则回退到账户当前汇率
                      const rate = flow.exchangeRate ?? accountsListRaw.find((a: any) => a.id === flow.accountId)?.exchangeRate;
                      return rate != null ? Number(rate).toFixed(4) : "—";
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs">
                    {(() => {
                      const isCNY = flow.currency === "CNY" || flow.currency === "RMB";
                      const rate = isCNY ? 1 : (flow.exchangeRate ?? accountsListRaw.find((a: any) => a.id === flow.accountId)?.exchangeRate ?? 1);
                      const rmb = Math.abs(flow.amount) * (Number(rate) || 1);
                      const isIncome = flow.type === "income" && !flow.isReversal;
                      const colorClass = flow.isReversal
                        ? "text-rose-400"
                        : isIncome
                          ? "text-emerald-300"
                          : "text-rose-300";
                      const sign = isIncome ? "+" : "-";
                      return (
                        <span className={colorClass}>
                          {sign}{currency(rmb, "CNY")}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5">
                    <a
                      href={`/finance/accounts?accountId=${flow.accountId}`}
                      className="text-slate-300 hover:text-primary-400 hover:underline cursor-pointer"
                    >
                      {accountsListRaw.find((a: any) => a.id === flow.accountId)?.name || flow.accountName}
                    </a>
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        flow.status === "confirmed"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {flow.status === "confirmed" ? "已确认" : "待核对"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-400">
                    {flow.remark && flow.remark !== flow.summary ? flow.remark : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {flow.hasPaymentVoucher ? (
                      <button
                        type="button"
                        disabled={voucherLoadingKey === `${flow.id}:payment`}
                        onClick={() => handleViewVoucher(flow.id, "payment")}
                        className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 hover:bg-amber-500/20 transition disabled:cursor-wait disabled:opacity-60"
                      >
                        {voucherLoadingKey === `${flow.id}:payment` ? "加载中" : "查看"}
                      </button>
                    ) : <span className="text-slate-500 text-xs">-</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {flow.hasTransferVoucher ? (
                      <button
                        type="button"
                        disabled={voucherLoadingKey === `${flow.id}:transfer`}
                        onClick={() => handleViewVoucher(flow.id, "transfer")}
                        className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-200 hover:bg-emerald-500/20 transition disabled:cursor-wait disabled:opacity-60"
                      >
                        {voucherLoadingKey === `${flow.id}:transfer` ? "加载中" : "查看"}
                      </button>
                    ) : <span className="text-slate-500 text-xs">-</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1 items-center">
                      {!flow.isReversal && flow.status === "confirmed" && (
                        <button
                          type="button"
                          onClick={async () => {
                            await handleReversal(flow.id);
                          }}
                          className="text-xs text-rose-400 hover:text-rose-300 underline"
                        >
                          冲销
                        </button>
                      )}
                      {!flow.isReversal && (
                        <button
                          type="button"
                          onClick={() => {
                            setSupplementVoucherFlow(flow);
                            setSupplementPaymentVoucher("");
                            setSupplementTransferVoucher("");
                          }}
                          className="text-xs text-primary-400 hover:text-primary-300 underline"
                        >
                          补充凭证
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            total={cashFlowData?.pagination.total || 0}
            page={pgPage}
            pageSize={pgPageSize}
            onPageChange={setPgPage}
            onPageSizeChange={setPgPageSize}
            showAllOption={false}
          />
        </div>
      </section>

      {/* 关联流水弹窗 */}
      {relatedFlows.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur" onClick={() => setRelatedFlows({ open: false, businessNumber: "", flows: [] })}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {relatedFlows.businessNumber.startsWith("SDFY-BAXI") || relatedFlows.businessNumber.startsWith("BAXI-") || relatedFlows.businessNumber.startsWith("SDFY-") ? "同合同/订单关联流水" : "合并打款关联流水"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  单号：{relatedFlows.businessNumber}（共 {relatedFlows.flows.length} 笔）
                  {relatedFlows.businessNumber.startsWith("SDFY-BAXI") || relatedFlows.businessNumber.startsWith("BAXI-") || relatedFlows.businessNumber.startsWith("SDFY-") ? " · 同一合同/订单的多笔付款" : " · 合并打款的关联记录"}
                </p>
              </div>
              <button onClick={() => setRelatedFlows({ open: false, businessNumber: "", flows: [] })} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-300">日期</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-300">类型</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-300">摘要</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-300">分类</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-300">账户</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-300">金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {relatedFlows.flows.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-800/40">
                      <td className="px-3 py-2 text-slate-300">{f.date ? new Date(f.date).toLocaleDateString("zh-CN") : "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${String(f.type || "").toLowerCase() === "income" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                          {String(f.type || "").toLowerCase() === "income" ? "收入" : "支出"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{f.summary || f.description || "-"}</td>
                      <td className="px-3 py-2 text-slate-400">{f.category || "-"}</td>
                      <td className="px-3 py-2 text-slate-400">{f.accountName || "-"}</td>
                      <td className={`px-3 py-2 text-right font-medium ${String(f.type || "").toLowerCase() === "income" ? "text-emerald-300" : "text-rose-300"}`}>
                        {f.currency === "CNY" || f.currency === "RMB" ? `¥${Math.abs(f.amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : f.currency === "USD" ? `$${Math.abs(f.amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` : `${Math.abs(f.amount).toLocaleString()} ${f.currency}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 实际转账金额统计 */}
            {(() => {
              const expenses = relatedFlows.flows.filter((f) => String(f.type || "").toLowerCase() === "expense");
              const incomes = relatedFlows.flows.filter((f) => String(f.type || "").toLowerCase() === "income");
              // 按币种分组：支出和收入分别累计
              const expenseByCur: Record<string, number> = {};
              const incomeByCur: Record<string, number> = {};
              expenses.forEach((f) => {
                const cur = f.currency || "CNY";
                expenseByCur[cur] = (expenseByCur[cur] || 0) + Math.abs(f.amount);
              });
              incomes.forEach((f) => {
                const cur = f.currency || "CNY";
                incomeByCur[cur] = (incomeByCur[cur] || 0) + Math.abs(f.amount);
              });
              // 合并所有币种
              const allCurrencies = new Set([...Object.keys(expenseByCur), ...Object.keys(incomeByCur)]);
              if (allCurrencies.size === 0) return null;
              const fmtAmt = (cur: string, amt: number) => {
                if (cur === "CNY" || cur === "RMB") return `¥${amt.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (cur === "USD") return `$${amt.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                return `${amt.toLocaleString()} ${cur}`;
              };
              return (
                <div className="mt-4 space-y-2">
                  {/* 明细 */}
                  <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 space-y-1.5">
                    {Array.from(allCurrencies).sort().map((cur) => {
                      const exp = expenseByCur[cur] || 0;
                      const inc = incomeByCur[cur] || 0;
                      const net = exp - inc;
                      return (
                        <div key={cur} className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">{cur}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">支出 {fmtAmt(cur, exp)}</span>
                            {inc > 0 && <span className="text-emerald-400">- 抵扣 {fmtAmt(cur, inc)}</span>}
                            <span className="font-bold text-amber-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              = {fmtAmt(cur, net)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* 实际转账总额 */}
                  <div className="flex items-center justify-between rounded-xl border border-amber-600/40 bg-amber-900/20 px-4 py-3">
                    <div className="text-sm text-slate-200">
                      实际转账总额
                      <span className="ml-2 text-xs text-slate-400">（支出{expenses.length}笔{incomes.length > 0 ? ` - 抵扣${incomes.length}笔` : ""}）</span>
                    </div>
                    <div className="text-right">
                      {Array.from(allCurrencies).sort().map((cur) => {
                        const net = (expenseByCur[cur] || 0) - (incomeByCur[cur] || 0);
                        if (net === 0) return null;
                        return (
                          <div key={cur} className="text-lg font-bold text-amber-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {fmtAmt(cur, net)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setRelatedFlows({ open: false, businessNumber: "", flows: [] })} className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 凭证查看弹窗 */}
      {voucherViewModal && (() => {
        // 解析凭证数据
        let voucherImages: string[] = [];
        try {
          const parsed = JSON.parse(voucherViewModal);
          if (Array.isArray(parsed)) {
            voucherImages = parsed.filter((x: unknown) => typeof x === "string" && x.trim().length > 0);
          } else if (typeof parsed === "string" && parsed.trim().length > 0) {
            voucherImages = [parsed];
          } else {
            if (typeof voucherViewModal === "string" && voucherViewModal.trim().length > 0) {
              voucherImages = [voucherViewModal];
            }
          }
        } catch {
          if (typeof voucherViewModal === "string" && voucherViewModal.trim().length > 0) {
            voucherImages = [voucherViewModal];
          }
        }
        if (voucherImages.length === 0) voucherImages = [];

        const currentImage = voucherImages[currentVoucherIndex] || voucherImages[0];

        // 处理图片源（支持 data URL、http、base64 无前缀）
        const getImageSrc = (img: string): string => {
          if (!img || typeof img !== "string") return "";
          const s = img.trim();
          if (s.startsWith("data:image/") || s.startsWith("data:application/pdf") || s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) {
            return s;
          }
          if (/^[A-Za-z0-9+/=]+$/.test(s) && s.length > 50) {
            return `data:image/jpeg;base64,${s}`;
          }
          return s;
        };
        
        return (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
            style={{ zIndex: 9999 }}
            onClick={() => {
              setVoucherViewModal(null);
              setCurrentVoucherIndex(0);
            }}
          >
            <div 
              className="relative max-w-5xl max-h-[95vh] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button
                  onClick={() => setVoucherRotation((r) => (r - 90) % 360)}
                  className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                  title="向左旋转"
                >↺</button>
                <button
                  onClick={() => setVoucherRotation((r) => (r + 90) % 360)}
                  className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                  title="向右旋转"
                >↻</button>
                <button
                  onClick={() => {
                    setVoucherViewModal(null);
                    setCurrentVoucherIndex(0);
                    setVoucherRotation(0);
                  }}
                  className="text-white text-2xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                >✕</button>
              </div>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/90 text-sm font-medium">
                {voucherViewLabel}
              </div>
              
              {/* 多图导航 */}
              {voucherImages.length > 1 && (
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/70 rounded-lg px-3 py-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentVoucherIndex((prev) => (prev > 0 ? prev - 1 : voucherImages.length - 1));
                    }}
                    className="text-white hover:text-slate-300 transition"
                    disabled={voucherImages.length <= 1}
                  >
                    ←
                  </button>
                  <span className="text-white text-sm">
                    {currentVoucherIndex + 1} / {voucherImages.length}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentVoucherIndex((prev) => (prev < voucherImages.length - 1 ? prev + 1 : 0));
                    }}
                    className="text-white hover:text-slate-300 transition"
                    disabled={voucherImages.length <= 1}
                  >
                    →
                  </button>
                </div>
              )}
              
              {/* 图片显示 */}
              {currentImage ? (
                <CashFlowBlobImage
                  key={currentVoucherIndex}
                  src={getImageSrc(currentImage)}
                  alt={`凭证 ${currentVoucherIndex + 1}`}
                  rotation={voucherRotation}
                />
              ) : (
                <div className="text-white/80 text-center py-12">暂无有效凭证图片</div>
              )}
              
              {/* 缩略图导航（多图时显示） */}
              {voucherImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex gap-2 bg-black/70 rounded-lg p-2 max-w-[90%] overflow-x-auto">
                  {voucherImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentVoucherIndex(idx);
                      }}
                      className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition ${
                        idx === currentVoucherIndex 
                          ? 'border-primary-400 ring-2 ring-primary-400/50' 
                          : 'border-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <img 
                        src={getImageSrc(img)} 
                        alt={`缩略图 ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 补充凭证弹窗 */}
      {supplementVoucherFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">补充凭证</h3>
              <button
                type="button"
                onClick={() => {
                  setSupplementVoucherFlow(null);
                  setSupplementPaymentVoucher("");
                  setSupplementTransferVoucher("");
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              流水：{supplementVoucherFlow.summary} · {formatDate(supplementVoucherFlow.date)}
            </p>
            <div className="space-y-4 mb-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">付款凭证（发起付款时）</label>
                <ImageUploader
                  value={supplementPaymentVoucher}
                  onChange={(v) => setSupplementPaymentVoucher(v)}
                  multiple
                  label="上传付款凭证"
                  placeholder="点击上传或 Ctrl+V 粘贴，支持多张"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">转账成功凭证（财务打款后）</label>
                <ImageUploader
                  value={supplementTransferVoucher}
                  onChange={(v) => setSupplementTransferVoucher(v)}
                  multiple
                  label="上传转账成功凭证"
                  placeholder="点击上传或 Ctrl+V 粘贴，支持多张"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">付款凭证与转账凭证可只填一项或两项都填，保存后生效。</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSupplementVoucherFlow(null);
                  setSupplementPaymentVoucher("");
                  setSupplementTransferVoucher("");
                }}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSupplementVoucher}
                className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 录入组件 */}
      {activeModal === "expense" && (
        <ExpenseEntry
          accounts={accounts}
          onClose={() => setActiveModal(null)}
          onSave={handleAddFlow}
        />
      )}
      {activeModal === "income" && (
        <IncomeEntry
          accounts={accounts}
          onClose={() => setActiveModal(null)}
          onSave={handleAddFlow}
        />
      )}
      {activeModal === "transfer" && (
        <TransferEntry
          accounts={accounts}
          onClose={() => setActiveModal(null)}
          onSave={handleAddFlow}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/** Blob URL 凭证图片组件：将 data URL 转为 Blob 渲染，避免超长 base64 字符串渲染问题 */
function CashFlowBlobImage({ src, alt, rotation = 0 }: { src: string; alt: string; rotation?: number }) {
  const [renderSrc, setRenderSrc] = useState<string>(src);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    let revoked = false;
    let blobUrl: string | null = null;
    if (src.startsWith("data:")) {
      try {
        const match = src.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const byteChars = atob(match[2]);
          const ba = new Uint8Array(byteChars.length);
          for (let j = 0; j < byteChars.length; j++) ba[j] = byteChars.charCodeAt(j);
          const blob = new Blob([ba], { type: match[1] });
          blobUrl = URL.createObjectURL(blob);
          if (!revoked) setRenderSrc(blobUrl);
        }
      } catch {
        /* fallback */
      }
    }
    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  return (
    <>
      {status === "loading" && (
        <div className="flex items-center justify-center w-96 h-64">
          <div className="text-slate-400 text-sm animate-pulse">图片加载中...</div>
        </div>
      )}
      {status === "error" && (
        <div className="flex flex-col items-center justify-center gap-2 p-8 bg-rose-500/10 rounded-lg border border-rose-500/30">
          <div className="text-rose-300 text-lg">❌ 图片加载失败</div>
          <div className="text-slate-400 text-xs">数据长度: {src.length} 字符</div>
        </div>
      )}
      <img
        src={renderSrc}
        alt={alt}
        className={`max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5 transition-transform duration-300 ${
          status === "loaded" ? "" : "hidden"
        }`}
        style={{ transform: `rotate(${rotation}deg)` }}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
    </>
  );
}
