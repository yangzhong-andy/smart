"use client";

import { ClipboardCheck, CheckCircle, XCircle } from "lucide-react";
import type { MonthlyBill } from "@/lib/reconciliation-store";
import type { ExpenseRequest, IncomeRequest } from "@/lib/expense-income-request-store";

interface ApprovalStatsProps {
  pendingBills: MonthlyBill[];
  pendingExpenseRequests: ExpenseRequest[];
  pendingIncomeRequests: IncomeRequest[];
  historyBills: MonthlyBill[];
  historyExpenseRequests: ExpenseRequest[];
  historyIncomeRequests: IncomeRequest[];
}

function countApproved(records: Array<{ status: string }>): number {
  return records.filter(
    (r) => r.status === "Approved" || r.status === "Paid" || r.status === "Received"
  ).length;
}

function countRejected(records: Array<{ status?: string; rejectionReason?: string }>): number {
  return records.filter((r) => r.status === "Rejected" || !!r.rejectionReason).length;
}

export function ApprovalStats({
  pendingBills,
  pendingExpenseRequests,
  pendingIncomeRequests,
  historyBills,
  historyExpenseRequests,
  historyIncomeRequests,
}: ApprovalStatsProps) {
  const pendingCount =
    pendingBills.length + pendingExpenseRequests.length + pendingIncomeRequests.length;
  const approvedCount =
    countApproved(historyBills) +
    countApproved(historyExpenseRequests) +
    countApproved(historyIncomeRequests);
  const rejectedCount =
    countRejected(historyBills) +
    countRejected(historyExpenseRequests) +
    countRejected(historyIncomeRequests);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20">
          <ClipboardCheck className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <p className="text-sm text-slate-400">待审批</p>
          <p className="text-2xl font-bold text-white">{pendingCount}</p>
        </div>
      </div>
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/20">
          <CheckCircle className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm text-slate-400">已通过</p>
          <p className="text-2xl font-bold text-white">{approvedCount}</p>
        </div>
      </div>
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-rose-500/20">
          <XCircle className="h-6 w-6 text-rose-400" />
        </div>
        <div>
          <p className="text-sm text-slate-400">已拒绝</p>
          <p className="text-2xl font-bold text-white">{rejectedCount}</p>
        </div>
      </div>
    </div>
  );
}
