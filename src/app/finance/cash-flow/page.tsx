"use client";

import { toast } from "sonner";
import { Download, TrendingUp, TrendingDown, DollarSign, FileText } from "lucide-react";

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
  remark: string;
  relatedId?: string; // 关联的采购单ID等
  businessNumber?: string; // 关联业务单号（如采购单号）
  status: "confirmed" | "pending"; // 已确认/待核对
  isReversal?: boolean; // 是否为冲销记录
  reversedById?: string; // 被冲销的记录ID
  voucher?: string; // 凭证（图片 base64 或 URL）
  createdAt: string;
};

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

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
    return date.toISOString().slice(0, 10);
  } catch (e) {
    return d;
  }
};

export default function CashFlowPage() {
  // 使用 SWR 加载流水数据
  const { data: cashFlowData = [], isLoading: cashFlowLoading } = useSWR<CashFlow[]>('/api/cash-flow', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true
  });
  
  // 使用 SWR 加载账户数据
  const { data: accountsData = [] } = useSWR<BankAccount[]>('/api/accounts', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true
  });
  
  const accounts = accountsData;
  const cashFlowReady = !cashFlowLoading;
  const [activeModal, setActiveModal] = useState<"expense" | "income" | "transfer" | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSubCategory, setFilterSubCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [quickFilter, setQuickFilter] = useState<string>("");
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);

  // 数据已通过 SWR 加载，余额计算在账户页面处理

  // 余额计算已在账户页面通过 SWR 处理，无需在此更新

  const handleAddFlow = async (newFlow: CashFlow, adAccountId?: string, rebateAmount?: number) => {
    try {
      const response = await fetch('/api/cash-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFlow)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建失败');
      }
      
      await swrMutate('/api/cash-flow'); // 重新获取流水列表
      // 账户余额会在账户页面自动重新计算
      
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
    }
  };

  const handleReversal = async (flowId: string) => {
    if (!Array.isArray(cashFlowData)) {
      toast.error("流水数据未加载");
      return;
    }
    const flow = cashFlowData.find((f) => f.id === flowId);
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
      date: new Date().toISOString().slice(0, 10),
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
      
      await swrMutate('/api/cash-flow'); // 重新获取流水列表
      toast.success("冲销成功！已生成红字反冲记录。");
    } catch (error: any) {
      console.error('Failed to create reversal flow:', error);
      toast.error(error.message || '冲销失败');
    }
  };

  const sortedFlow = useMemo(() => {
    if (!Array.isArray(cashFlowData)) {
      return [];
    }
    let filtered = [...cashFlowData];
    if (filterCurrency !== "all") {
      filtered = filtered.filter((f) => f.currency === filterCurrency);
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
      filtered = filtered.filter((f) => f.status === filterStatus);
    }
    
    // 快速筛选（优先级最高）
    if (quickFilter) {
      const today = new Date();
      let fromDate = "";
      let toDate = "";
      
      switch (quickFilter) {
        case "today":
          fromDate = toDate = today.toISOString().slice(0, 10);
          break;
        case "yesterday": {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          fromDate = toDate = yesterday.toISOString().slice(0, 10);
          break;
        }
        case "thisWeek": {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          fromDate = weekStart.toISOString().slice(0, 10);
          toDate = today.toISOString().slice(0, 10);
          break;
        }
        case "lastWeek": {
          const lastWeekEnd = new Date(today);
          lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
          const lastWeekStart = new Date(lastWeekEnd);
          lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
          fromDate = lastWeekStart.toISOString().slice(0, 10);
          toDate = lastWeekEnd.toISOString().slice(0, 10);
          break;
        }
        case "thisMonth": {
          fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
          toDate = today.toISOString().slice(0, 10);
          break;
        }
        case "lastMonth": {
          const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
          fromDate = lastMonth.toISOString().slice(0, 10);
          toDate = lastMonthEnd.toISOString().slice(0, 10);
          break;
        }
        case "thisQuarter": {
          const quarter = Math.floor(today.getMonth() / 3);
          fromDate = `${today.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01`;
          toDate = today.toISOString().slice(0, 10);
          break;
        }
        case "thisYear":
          fromDate = `${today.getFullYear()}-01-01`;
          toDate = today.toISOString().slice(0, 10);
          break;
        case "lastYear": {
          const lastYear = today.getFullYear() - 1;
          fromDate = `${lastYear}-01-01`;
          toDate = `${lastYear}-12-31`;
          break;
        }
      }
      
      if (fromDate) filtered = filtered.filter((f) => f.date >= fromDate);
      if (toDate) filtered = filtered.filter((f) => f.date <= toDate);
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
      
      // 日期范围筛选
      if (filterDateFrom) {
        filtered = filtered.filter((f) => f.date >= filterDateFrom);
      }
      if (filterDateTo) {
        filtered = filtered.filter((f) => f.date <= filterDateTo);
      }
    }
    
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cashFlowData, filterCurrency, filterCategory, filterSubCategory, filterStatus, filterDateFrom, filterDateTo, filterYear, filterMonth, quickFilter]);

  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthFlow = (Array.isArray(cashFlowData) ? cashFlowData : []).filter((f) => {
    const d = new Date(f.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear && !f.isReversal;
  });
  const thisMonthExpense = thisMonthFlow.filter((f) => f.type === "expense").reduce((sum, f) => sum + Math.abs(f.amount), 0);

  // 按货币统计当月总收入，并折算成人民币
  const thisMonthIncomeByCurrency = useMemo(() => {
    const incomeFlows = thisMonthFlow.filter((f) => f.type === "income");
    const stats: Record<string, { original: number; rmb: number; currency: string }> = {};
    
    incomeFlows.forEach((flow) => {
      const curr = flow.currency;
      const amount = Math.abs(flow.amount);
      
      if (!stats[curr]) {
        stats[curr] = { original: 0, rmb: 0, currency: curr };
      }
      
      stats[curr].original += amount;
      
      // 折算成人民币
      const account = accounts.find((a) => a.id === flow.accountId);
      const exchangeRate = account?.exchangeRate || (curr === "RMB" ? 1 : 7.25);
      stats[curr].rmb += curr === "RMB" ? amount : amount * exchangeRate;
    });
    
    return Object.values(stats).filter((stat) => stat.original > 0);
  }, [thisMonthFlow, accounts]);

  // 计算总收入（人民币）
  const thisMonthIncomeRMB = useMemo(() => {
    return thisMonthIncomeByCurrency.reduce((sum, stat) => sum + stat.rmb, 0);
  }, [thisMonthIncomeByCurrency]);

  // 基于筛选后数据的统计
  const filteredStats = useMemo(() => {
    const filtered = sortedFlow.filter(f => !f.isReversal);
    const income = filtered.filter(f => f.type === "income");
    const expense = filtered.filter(f => f.type === "expense");
    
    // 计算总收入（按原币种）
    const totalIncome = income.reduce((sum, f) => {
      const account = accounts.find(a => a.id === f.accountId);
      const amount = Math.abs(f.amount);
      if (account) {
        const exchangeRate = account.exchangeRate || (f.currency === "RMB" ? 1 : 7.25);
        return sum + (f.currency === "RMB" ? amount : amount * exchangeRate);
      }
      return sum + (f.currency === "RMB" ? amount : amount * 7.25);
    }, 0);
    
    // 计算总支出（按原币种）
    const totalExpense = expense.reduce((sum, f) => {
      const account = accounts.find(a => a.id === f.accountId);
      const amount = Math.abs(f.amount);
      if (account) {
        const exchangeRate = account.exchangeRate || (f.currency === "RMB" ? 1 : 7.25);
        return sum + (f.currency === "RMB" ? amount : amount * exchangeRate);
      }
      return sum + (f.currency === "RMB" ? amount : amount * 7.25);
    }, 0);
    
    return {
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
      transactionCount: filtered.length,
      incomeCount: income.length,
      expenseCount: expense.length
    };
  }, [sortedFlow, accounts]);

  // 数据导出功能
  const handleExportData = () => {
    if (sortedFlow.length === 0) {
      toast.error("没有数据可导出");
      return;
    }

    const csvData = sortedFlow.map((flow) => {
      const account = accounts.find(a => a.id === flow.accountId);
      return {
        业务ID: flow.uid || flow.id,
        类型: flow.type === "income" ? "收入" : "支出",
        收付款类型: flow.type === "income" ? "收款" : "付款",
        日期: formatDate(flow.date),
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
    link.setAttribute("download", `流水清单_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("数据已导出");
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
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">筛选总收入</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(filteredStats.totalIncome, "CNY")}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">筛选总支出</p>
              <p className="text-2xl font-bold text-rose-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(filteredStats.totalExpense, "CNY")}
              </p>
            </div>
            <TrendingDown className="h-8 w-8 text-rose-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: filteredStats.netIncome >= 0 
              ? "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)"
              : "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">净收入</p>
              <p 
                className={`text-2xl font-bold ${filteredStats.netIncome >= 0 ? "text-primary-300" : "text-rose-300"}`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {currency(filteredStats.netIncome, "CNY")}
              </p>
            </div>
            <DollarSign className={`h-8 w-8 ${filteredStats.netIncome >= 0 ? "text-primary-300" : "text-rose-300"} opacity-50`} />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">交易笔数</p>
              <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {filteredStats.transactionCount}
              </p>
            </div>
            <FileText className="h-8 w-8 text-purple-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #7c2d12 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">本月总收入</p>
              <p className="text-2xl font-bold text-orange-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(thisMonthIncomeRMB, "CNY")}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-300 opacity-50" />
          </div>
        </div>
      </div>

      {/* 本月统计详情 */}
      {thisMonthIncomeByCurrency.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-sm font-medium text-slate-200 mb-3">本月收入按货币明细</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {thisMonthIncomeByCurrency.map((stat) => (
              <div key={stat.currency} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200 w-12">{stat.currency}</span>
                  <span className="text-xs text-slate-400">{currency(stat.original, stat.currency)}</span>
                </div>
                <span className="text-sm font-semibold text-emerald-300">
                  {currency(stat.rmb, "CNY")}
                </span>
              </div>
            ))}
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
                <label className="text-xs text-slate-400">开始日期</label>
                <input
                  type="date"
                  lang="zh-CN"
                  value={filterDateFrom}
                  onChange={(e) => {
                    setFilterDateFrom(e.target.value);
                    setFilterYear("");
                    setFilterMonth("");
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs text-slate-400">结束日期</label>
                <input
                  type="date"
                  lang="zh-CN"
                  value={filterDateTo}
                  onChange={(e) => {
                    setFilterDateTo(e.target.value);
                    setFilterYear("");
                    setFilterMonth("");
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-800 pt-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">币种</label>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            >
              <option value="all">全部</option>
              <option value="RMB">RMB</option>
              <option value="USD">USD</option>
              <option value="JPY">JPY</option>
              <option value="EUR">EUR</option>
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
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 min-w-[200px]">摘要</th>
                <th className="px-2 py-1.5 text-right font-medium text-slate-400 w-28">金额</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-16">币种</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 min-w-[120px]">账户</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-20">状态</th>
                <th className="px-2 py-1.5 text-center font-medium text-slate-400 w-16">凭证</th>
                <th className="px-2 py-1.5 text-left font-medium text-slate-400 w-16">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {sortedFlow.length === 0 && (
                <tr>
                  <td className="px-2 py-6 text-center text-slate-500" colSpan={10}>
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
                  <td className="px-2 py-1.5 text-slate-300">{formatDate(flow.date)}</td>
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
                      {(flow.businessNumber || (flow.remark && flow.summary && flow.remark !== flow.summary)) && (
                        <div className="space-y-0.5 pt-0.5 border-t border-slate-700/50">
                          {flow.businessNumber && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              <span className="text-slate-500">单号:</span> {flow.businessNumber}
                            </div>
                          )}
                          {flow.remark && flow.summary && flow.remark !== flow.summary && (
                            <div className="text-[10px] text-slate-500 italic leading-relaxed">
                              {flow.remark}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-medium ${
                      flow.isReversal
                        ? "text-rose-400"
                        : flow.type === "income"
                          ? "text-emerald-300"
                          : "text-rose-300"
                    }`}
                  >
                    {flow.type === "income" ? "+" : "-"}
                    {currency(Math.abs(flow.amount), flow.currency)}
                  </td>
                  <td className="px-2 py-1.5 text-slate-300">{flow.currency}</td>
                  <td className="px-2 py-1.5 text-slate-300">{flow.accountName}</td>
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
                  <td className="px-2 py-1.5 text-center">
                    {flow.voucher && flow.voucher.length > 10 ? (
                      <button
                        onClick={() => setVoucherViewModal(flow.voucher || null)}
                        className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                      >
                        查看
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {!flow.isReversal && flow.status === "confirmed" && (
                      <button
                        onClick={async () => {
                          await handleReversal(flow.id);
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 underline"
                      >
                        冲销
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 凭证查看弹窗 */}
      {voucherViewModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 9999 }}
          onClick={() => setVoucherViewModal(null)}
        >
          <div 
            className="relative max-w-5xl max-h-[95vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
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
                  alt="凭证" 
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
    </div>
  );
}
