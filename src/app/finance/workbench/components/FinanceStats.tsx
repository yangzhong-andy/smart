"use client";

import { TrendingUp, TrendingDown, Clock, FileText, AlertCircle } from "lucide-react";

export type FinanceStatsProps = {
  stats: {
    expense: { pending: number; total: number };
    entry: { pending: number; total: number };
    bill: { pending: number; approved: number; total: number };
    finance: { totalBalance: number; thisMonthIncome: number; thisMonthExpense: number; netIncome: number };
  };
  formatCurrency: (amount: number, currency?: string) => string;
};

export function FinanceStats({ stats, formatCurrency }: FinanceStatsProps) {
  return (
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
  );
}

