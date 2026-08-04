"use client";

import Link from "next/link";

interface PendingEntryAlertProps {
  count: number;
}

export function PendingEntryAlert({ count }: PendingEntryAlertProps) {
  if (count <= 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h2 className="text-sm font-semibold text-amber-200">待入账任务</h2>
          <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">
            {count} 笔
          </span>
        </div>
        <Link
          href="/finance/reconciliation"
          className="px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/20 text-xs text-amber-100 hover:bg-amber-500/30 transition"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.localStorage.setItem("reconciliationActiveTab", "PendingEntry");
            }
          }}
        >
          前往处理 →
        </Link>
      </div>
      <p className="text-xs text-amber-300/80 mt-2">
        审批中心已批准 {count} 笔账单/付款申请，等待财务人员处理入账
      </p>
    </section>
  );
}

