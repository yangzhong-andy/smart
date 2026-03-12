"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, Eye } from "lucide-react";
import { ActionButton } from "@/components/ui";
import { SkeletonTable } from "@/components/ui/Skeleton";

export type PendingBillsProps<TBill extends { id: string; status: string; agencyName?: string; supplierName?: string; factoryName?: string; billType: string; netAmount: number; currency: string; month: string }> = {
  pendingBillsData: unknown;
  urgentBills: TBill[];
  getStatusColor: (status: string) => { bg: string; text: string; label: string };
  formatCurrency: (amount: number, currency?: string) => string;
};

export function PendingBills<TBill extends { id: string; status: string; agencyName?: string; supplierName?: string; factoryName?: string; billType: string; netAmount: number; currency: string; month: string }>({
  pendingBillsData,
  urgentBills,
  getStatusColor,
  formatCurrency,
}: PendingBillsProps<TBill>) {
  return (
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
                      <div className="text-xs text-slate-500 mt-2">{bill.month}</div>
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
  );
}

