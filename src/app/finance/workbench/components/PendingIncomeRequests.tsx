"use client";

import { TrendingUp, Eye } from "lucide-react";

export type PendingIncomeRequestsProps<TRequest extends { id: string; summary: string; amount: number; currency: string; category: string; storeName?: string; approvedAt?: string }> = {
  approvedIncomeRequests: TRequest[];
  formatCurrency: (amount: number, currency?: string) => string;
  formatDate: (dateString?: string) => string;
  onOpenDetail: (requestId: string) => void;
};

export function PendingIncomeRequests<TRequest extends { id: string; summary: string; amount: number; currency: string; category: string; storeName?: string; approvedAt?: string }>({
  approvedIncomeRequests,
  formatCurrency,
  formatDate,
  onOpenDetail,
}: PendingIncomeRequestsProps<TRequest>) {
  if (approvedIncomeRequests.length === 0) return null;

  return (
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
          <span className="text-xs text-slate-500 ml-1">（选择账户入账后将从本列表移除）</span>
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
                <div className="text-sm font-medium text-slate-200 mb-2">{request.summary}</div>
                <div className="text-xs text-slate-400 mb-1">
                  <span className="font-medium text-emerald-300">
                    {formatCurrency(request.amount, request.currency)}
                  </span>
                  <span className="ml-2">· {request.category}</span>
                  {request.storeName && <span className="ml-2">· {request.storeName}</span>}
                </div>
                <div className="text-xs text-slate-500 mt-2">审批：{formatDate(request.approvedAt)}</div>
              </div>
              <div className="ml-3 flex gap-2">
                <button
                  onClick={() => onOpenDetail(request.id)}
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
  );
}

