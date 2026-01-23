"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Wallet, DollarSign, Clock, CheckCircle2, AlertCircle, ArrowRight, Eye, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import Link from "next/link";
import { getPaymentRequests, savePaymentRequests, getPaymentRequestsByStatus, type PaymentRequest } from "@/lib/payment-request-store";
import { getPendingEntries, type PendingEntry } from "@/lib/pending-entry-store";
import { getMonthlyBills, saveMonthlyBills, getBillsByStatus, type MonthlyBill, type BillStatus, type BillType } from "@/lib/reconciliation-store";
import { getAccounts, type BankAccount } from "@/lib/finance-store";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatCurrency as formatCurrencyUtil, formatCurrencyString } from "@/lib/currency-utils";
import { getAdConsumptions, getAdRecharges, getAgencies, type Agency } from "@/lib/ad-agency-store";
import { getRebateReceivables, type RebateReceivable } from "@/lib/rebate-receivable-store";
import { FileImage } from "lucide-react";

type CashFlow = {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  currency?: string;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
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
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [monthlyBills, setMonthlyBills] = useState<MonthlyBill[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [pendingBills, setPendingBills] = useState<MonthlyBill[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PaymentRequest[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadedPaymentRequests = getPaymentRequests();
    setPaymentRequests(loadedPaymentRequests);
    setPendingEntries(getPendingEntries());
    const loadedBills = getMonthlyBills();
    setMonthlyBills(loadedBills);
    setAccounts(getAccounts());
    
    // 加载审批相关数据
    setPendingBills(getBillsByStatus("Pending_Approval"));
    setPendingRequests(getPaymentRequestsByStatus("Pending_Approval"));
    
    // 加载现金流数据
    const stored = window.localStorage.getItem("cashFlow");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCashFlow(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        console.error("Failed to parse cash flow", e);
        setCashFlow([]);
      }
    } else {
      setCashFlow([]);
    }
    
    setInitialized(true);
  }, []);

  // 统计信息
  const stats = useMemo(() => {
    // 支付申请统计
    const paymentPending = paymentRequests.filter((p) => p.status === "Pending_Approval").length;
    const paymentApproved = paymentRequests.filter((p) => p.status === "Approved").length;
    const paymentTotal = paymentRequests.length;

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

    // 账户总余额（使用RMB余额，已按汇率转换）
    // originalBalance 已经包含了 initialCapital + 所有流水
    const totalBalance = accounts.reduce((sum, acc) => {
      // 只统计主账户和独立账户，不统计虚拟子账户（已被主账户汇总）
      if (acc.accountCategory === "VIRTUAL") {
        return sum;
      }
      // originalBalance 已经包含了 initialCapital + 所有流水
      // 转换为RMB
      const rmbBal = acc.currency === "RMB" 
        ? (acc.originalBalance || 0)
        : (acc.originalBalance || 0) * (acc.exchangeRate || 1);
      return sum + rmbBal;
    }, 0);

    return {
      payment: {
        pending: paymentPending,
        approved: paymentApproved,
        total: paymentTotal
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
  }, [paymentRequests, pendingEntries, monthlyBills, accounts, cashFlow]);

  // 待审批的支付申请
  const urgentPaymentRequests = useMemo(() => {
    return paymentRequests
      .filter((p) => p.status === "Pending_Approval")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [paymentRequests]);

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

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <PageHeader
        title="财务工作台"
        description="待审批事项、待入账任务、财务指标"
        actions={
          <>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 backdrop-blur-sm hover:border-blue-500/50 transition-all duration-300 shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between mb-3">
            <Wallet className="h-5 w-5 text-blue-400" />
            <div className="text-xs text-slate-400">账户总余额</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{formatCurrency(stats.finance.totalBalance)}</div>
        </div>
        
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
            <div className="text-xs text-slate-400">待审批支付申请</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats.payment.pending}</div>
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
              <h2 className="text-lg font-semibold text-slate-100">待审批支付申请</h2>
              {urgentPaymentRequests.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 font-medium">
                  {urgentPaymentRequests.length}
                </span>
              )}
            </div>
            <Link href="/finance/approval">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {urgentPaymentRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <div className="rounded-full bg-slate-800/50 p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <DollarSign className="h-8 w-8 opacity-30" />
              </div>
              <p className="text-sm">暂无待审批申请</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentPaymentRequests.map((request) => {
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
                            {request.expenseItem}
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

          {urgentPendingEntries.length === 0 ? (
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

          {urgentBills.length === 0 ? (
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
                  {(pendingBills.length > 0 || pendingRequests.length > 0) && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-xs bg-rose-500 text-white font-bold animate-pulse shadow-lg">
                      {pendingBills.length + pendingRequests.length}
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
    </div>
  );
}
