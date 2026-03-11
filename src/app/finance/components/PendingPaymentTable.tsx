"use client";

import Link from "next/link";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

interface PendingPaymentRow {
  poId: string;
  poNumber: string;
  supplierName: string;
  currency: string;
  depositAmount: number;
  tailAmount: number;
  totalAmount: number;
  earliestDueDate: string | null;
  daysUntilDue: number | null;
  storeName: string;
  status: string;
}

interface PendingPaymentTableProps {
  rows: PendingPaymentRow[];
  onTriggerPayment: (row: PendingPaymentRow) => void;
}

export function PendingPaymentTable({ rows, onTriggerPayment }: PendingPaymentTableProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-4 text-sm font-medium text-slate-100">工厂待付明细</h2>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">暂无待付款项</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">工厂名称</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">币种</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">待付金额</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">关联店铺</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">倒计时（天）</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">状态</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => {
                const isOverdue = payment.daysUntilDue !== null && payment.daysUntilDue < 0;
                const isUrgent = payment.daysUntilDue !== null && payment.daysUntilDue >= 0 && payment.daysUntilDue <= 3;
                return (
                  <tr key={payment.poId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-3 text-slate-200">{payment.supplierName}</td>
                    <td className="px-3 py-3 text-slate-400">{payment.currency}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-100">
                      {currency(payment.totalAmount, payment.currency)}
                    </td>
                    <td className="px-3 py-3 text-slate-400">{payment.storeName}</td>
                    <td className="px-3 py-3 text-center">
                      {payment.daysUntilDue !== null ? (
                        <span
                          className={`text-xs font-medium ${
                            isOverdue ? "text-rose-400" : isUrgent ? "text-amber-400" : "text-slate-400"
                          }`}
                        >
                          {isOverdue ? `逾期 ${Math.abs(payment.daysUntilDue)} 天` : `${payment.daysUntilDue} 天`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-400 text-xs">{payment.status}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => onTriggerPayment(payment)}
                          className="rounded-md bg-primary-500 px-2 py-1 text-xs font-medium text-white hover:bg-primary-600"
                        >
                          确认付款
                        </button>
                        <Link
                          href={`/supply-chain/factories?supplier=${payment.supplierName}`}
                          className="rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600"
                        >
                          工厂明细
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

