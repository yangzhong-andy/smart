"use client";

import Link from "next/link";
import { DollarSign, ArrowRight, Eye, TrendingDown } from "lucide-react";
import { ActionButton } from "@/components/ui";

export type PendingExpenseRequestsProps<
  TRequest extends {
    id: string;
    status: string;
    summary: string;
    amount: number;
    currency: string;
    storeName?: string;
    createdAt?: string;
    category?: string;
    approvedAt?: string;
  },
> = {
  approvedExpenseRequests: TRequest[];
  getStatusColor: (status: string) => { bg: string; text: string; label: string };
  formatCurrency: (amount: number, currency?: string) => string;
  formatDate: (dateString?: string) => string;
  onOpenDetail: (requestId: string) => void;
};

export function PendingExpenseRequests<
  TRequest extends {
    id: string;
    status: string;
    summary: string;
    amount: number;
    currency: string;
    storeName?: string;
    createdAt?: string;
    category?: string;
    approvedAt?: string;
  },
>({
  approvedExpenseRequests,
  getStatusColor,
  formatCurrency,
  formatDate,
  onOpenDetail,
}: PendingExpenseRequestsProps<TRequest>) {
  return (
    <>
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
                          <span className="font-medium text-slate-300">
                            {formatCurrency(request.amount, request.currency)}
                          </span>
                          {request.storeName && <span className="ml-2">· {request.storeName}</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-2">创建：{formatDate(request.createdAt)}</div>
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

      {/* 已审批的支出申请（原逻辑保留：点击查看详情打开弹窗） */}
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
                    <div className="text-sm font-medium text-slate-200 mb-2">{request.summary}</div>
                    <div className="text-xs text-slate-400 mb-1">
                      <span className="font-medium text-rose-300">
                        {formatCurrency(request.amount, request.currency)}
                      </span>
                      {request.category && <span className="ml-2">· {request.category}</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">审批：{formatDate(request.approvedAt)}</div>
                  </div>
                  <div className="ml-3">
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
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { DollarSign, ArrowRight, Eye } from "lucide-react";
import { ActionButton } from "@/components/ui";

export type PendingExpenseRequestsProps<TRequest extends { id: string; status: string; summary: string; amount: number; currency: string; storeName?: string; createdAt?: string }> = {
  approvedExpenseRequests: TRequest[];
  getStatusColor: (status: string) => { bg: string; text: string; label: string };
  formatCurrency: (amount: number, currency?: string) => string;
  formatDate: (dateString?: string) => string;
};

export function PendingExpenseRequests<TRequest extends { id: string; status: string; summary: string; amount: number; currency: string; storeName?: string; createdAt?: string }>({
  approvedExpenseRequests,
  getStatusColor,
  formatCurrency,
  formatDate,
}: PendingExpenseRequestsProps<TRequest>) {
  return (
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
  );
}

