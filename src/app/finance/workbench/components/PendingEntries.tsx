"use client";

import Link from "next/link";
import { FileText, ArrowRight, Eye } from "lucide-react";
import { ActionButton } from "@/components/ui";
import { SkeletonTable } from "@/components/ui/Skeleton";

export type PendingEntriesProps<TEntry extends { id: string; status: string; type?: string; agencyName?: string; supplierName?: string; expenseItem?: string; netAmount: number; currency: string; approvedAt?: string }> = {
  pendingEntriesData: unknown;
  urgentPendingEntries: TEntry[];
  getStatusColor: (status: string) => { bg: string; text: string; label: string };
  formatCurrency: (amount: number, currency?: string) => string;
  formatDate: (dateString?: string) => string;
};

export function PendingEntries<TEntry extends { id: string; status: string; type?: string; agencyName?: string; supplierName?: string; expenseItem?: string; netAmount: number; currency: string; approvedAt?: string }>({
  pendingEntriesData,
  urgentPendingEntries,
  getStatusColor,
  formatCurrency,
  formatDate,
}: PendingEntriesProps<TEntry>) {
  return (
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
                        <span className="font-medium text-slate-300">
                          {formatCurrency(entry.netAmount, entry.currency)}
                        </span>
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
  );
}

