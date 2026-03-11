"use client";

import Link from "next/link";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

const formatDate = (d: string) => new Date(d).toISOString().slice(0, 10);

interface UnpaidTailItem {
  poNumber: string;
  supplierName: string;
  amount: number;
  dueDate: string;
  receiptId: string;
  poId: string;
}

interface UnpaidTailsListProps {
  items: UnpaidTailItem[];
}

export function UnpaidTailsList({ items }: UnpaidTailsListProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-100">待付尾款提醒</h2>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">暂无待付尾款</div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((tail) => {
            const dueDate = new Date(tail.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const isOverdue = daysUntilDue < 0;
            const isUrgent = daysUntilDue >= 0 && daysUntilDue <= 3;
            return (
              <div
                key={tail.receiptId}
                className={`rounded-lg border p-3 ${
                  isOverdue
                    ? "border-rose-500/40 bg-rose-500/10"
                    : isUrgent
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-slate-800 bg-slate-900/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-100">{tail.supplierName}</div>
                    <div className="text-xs text-slate-400">{tail.poNumber}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-100">{currency(tail.amount)}</div>
                    <div
                      className={`text-xs ${
                        isOverdue ? "text-rose-300" : isUrgent ? "text-amber-300" : "text-slate-500"
                      }`}
                    >
                      {isOverdue
                        ? `已逾期 ${Math.abs(daysUntilDue)} 天`
                        : isUrgent
                          ? `${daysUntilDue} 天后到期`
                          : `${daysUntilDue} 天后到期`}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">到期日：{formatDate(tail.dueDate)}</div>
              </div>
            );
          })}
          {items.length > 5 && (
            <div className="text-xs text-slate-500 text-center pt-2">
              还有 {items.length - 5} 笔待付尾款，前往{" "}
              <Link href="/purchase-orders" className="text-primary-300 hover:underline">
                采购下单
              </Link>{" "}
              查看
            </div>
          )}
        </div>
      )}
    </div>
  );
}

