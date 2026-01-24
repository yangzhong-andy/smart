"use client";

import { useState, useEffect } from "react";
import { Wallet, DollarSign, TrendingUp, FileText, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import useSWR from "swr";
import { getExpenseRequestsByStatus, getIncomeRequestsByStatus } from "@/lib/expense-income-request-store";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function FinanceDashboard() {
  const { data: accounts = [] } = useSWR('/api/accounts', fetcher);
  
  // 从 localStorage 获取审批请求
  const [expenseRequests, setExpenseRequests] = useState<any[]>([]);
  const [incomeRequests, setIncomeRequests] = useState<any[]>([]);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pendingExpenses = getExpenseRequestsByStatus('Pending_Approval');
      const pendingIncomes = getIncomeRequestsByStatus('Pending_Approval');
      setExpenseRequests(pendingExpenses);
      setIncomeRequests(pendingIncomes);
    } catch (e) {
      console.error('Failed to load requests', e);
    }
  }, []);

  // 计算总余额
  const totalBalance = accounts.reduce((sum: number, acc: any) => {
    return sum + (parseFloat(acc.balance) || 0);
  }, 0);

  // 统计信息
  const stats = {
    totalBalance,
    totalAccounts: accounts.length,
    pendingApprovals: (expenseRequests?.length || 0) + (incomeRequests?.length || 0),
  };

  const formatCurrency = (amount: number, currency: string = "CNY") => {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* 页面标题 */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
        <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                财经中心
              </h1>
              <p className="text-white/70">资金报表与提成审批流</p>
            </div>
            <div className="flex gap-3">
              <Link href="/finance/cash-flow">
                <button className="px-6 py-3 rounded-xl border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-all duration-300 flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  资金流水
                </button>
              </Link>
              <Link href="/finance/approval">
                <button className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white font-semibold hover:scale-105 transition-all duration-300 shadow-lg shadow-purple-500/30 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  审批中心
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="账户总余额"
          value={formatCurrency(stats.totalBalance)}
          icon={Wallet}
          gradient="from-blue-500/20 to-blue-600/10"
          borderColor="border-blue-500/30"
          isCurrency
        />
        <StatCard
          title="银行账户数"
          value={stats.totalAccounts}
          icon={Wallet}
          gradient="from-purple-500/20 to-purple-600/10"
          borderColor="border-purple-500/30"
        />
        <StatCard
          title="待审批事项"
          value={stats.pendingApprovals}
          icon={AlertCircle}
          gradient="from-amber-500/20 to-amber-600/10"
          borderColor="border-amber-500/30"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 资金报表 */}
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
          <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              资金报表
            </h2>
            
            <div className="space-y-4">
              {accounts.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                  <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无账户数据</p>
                </div>
              ) : (
                <>
                  {accounts.slice(0, 5).map((account: any) => (
                    <AccountCard key={account.id} account={account} formatCurrency={formatCurrency} />
                  ))}
                  {accounts.length > 5 && (
                    <Link href="/finance/accounts">
                      <button className="w-full py-2 px-4 rounded-xl border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all text-sm">
                        查看全部 ({accounts.length})
                      </button>
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 提成审批流 */}
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
          <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              提成审批流
            </h2>
            
            <div className="space-y-3">
              {stats.pendingApprovals === 0 ? (
                <div className="text-center py-12 text-white/50">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>暂无待审批事项</p>
                </div>
              ) : (
                <>
                  {expenseRequests?.slice(0, 3).map((request: any) => (
                    <ApprovalCard key={request.id} request={request} type="expense" formatCurrency={formatCurrency} />
                  ))}
                  {incomeRequests?.slice(0, 3).map((request: any) => (
                    <ApprovalCard key={request.id} request={request} type="income" formatCurrency={formatCurrency} />
                  ))}
                  {stats.pendingApprovals > 6 && (
                    <Link href="/finance/approval">
                      <button className="w-full py-2 px-4 rounded-xl border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all text-sm">
                        查看全部 ({stats.pendingApprovals})
                      </button>
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, gradient, borderColor, isCurrency }: any) {
  return (
    <div className={`rounded-xl border ${borderColor} bg-gradient-to-br ${gradient} p-5 backdrop-blur-sm hover:scale-105 transition-all duration-300 shadow-lg`}>
      <div className="flex items-center justify-between mb-3">
        <Icon className="h-5 w-5 text-white/80" />
        <div className="text-xs text-white/50">{title}</div>
      </div>
      <div className={`text-2xl font-bold text-white ${isCurrency ? 'text-lg' : ''}`}>{value}</div>
    </div>
  );
}

function AccountCard({ account, formatCurrency }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:bg-white/10 transition-all duration-300">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm">{account.name}</h3>
          <p className="text-white/60 text-xs mt-1">{account.bankName || account.accountNumber || '-'}</p>
        </div>
        <span className="text-white font-semibold">
          {formatCurrency(parseFloat(account.balance) || 0, account.currency || 'CNY')}
        </span>
      </div>
      <div className="text-xs text-white/50">
        {account.currency || 'CNY'}
      </div>
    </div>
  );
}

function ApprovalCard({ request, type, formatCurrency }: any) {
  const isExpense = type === 'expense';
  
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:bg-white/10 transition-all duration-300">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm">{request.summary || request.category || '审批事项'}</h3>
          <p className="text-white/60 text-xs mt-1">{request.createdBy || '-'}</p>
        </div>
        <div className="text-right">
          <span className={`text-white font-semibold ${isExpense ? 'text-rose-400' : 'text-emerald-400'}`}>
            {isExpense ? '-' : '+'}{formatCurrency(request.amount || 0, request.currency || 'CNY')}
          </span>
          <span className="block mt-1 px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">
            待审批
          </span>
        </div>
      </div>
      {request.createdAt && (
        <div className="text-xs text-white/50 mt-2">
          {new Date(request.createdAt).toLocaleDateString('zh-CN')}
        </div>
      )}
    </div>
  );
}
