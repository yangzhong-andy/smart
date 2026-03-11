"use client";

import type { AdConsumption } from "@/lib/ad-agency-store";
import { formatCurrency } from "@/lib/currency-utils";

export type ConsumptionsTableProps = {
  consumptions: AdConsumption[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onViewVoucher: (voucher: string | null) => void;
};

export function ConsumptionsTable({
  consumptions,
  onAdd,
  onDelete,
  onViewVoucher,
}: ConsumptionsTableProps) {
  const sorted = [...consumptions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">消耗记录</h2>
          <p className="text-sm text-slate-400 mt-1">记录和管理广告账户的消耗明细</p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
        >
          + 新增消耗记录
        </button>
      </div>

      {consumptions.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">
            暂无消耗记录，请点击右上角「新增消耗记录」开始添加
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">日期</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">账户名称</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">关联店铺</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">消耗金额</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">预估返点</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">预计付款日期</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">返点到账日期</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                <th className="px-4 py-3 text-center font-medium text-slate-300">结算状态</th>
                <th className="px-4 py-3 text-center font-medium text-slate-300">凭证</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sorted.map((consumption) => (
                <tr key={consumption.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-300">{consumption.month || "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{consumption.date}</td>
                  <td className="px-4 py-3 text-slate-100">{consumption.accountName}</td>
                  <td className="px-4 py-3 text-slate-300">{consumption.storeName || "-"}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(consumption.amount, consumption.currency || "USD", "expense")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {consumption.estimatedRebate
                      ? formatCurrency(consumption.estimatedRebate, consumption.currency || "USD", "income")
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{consumption.dueDate || "-"}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{consumption.rebateDueDate || "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{consumption.currency}</td>
                  <td className="px-4 py-3 text-center">
                    {consumption.isSettled ? (
                      <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        已结算
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        待结算
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {consumption.voucher && consumption.voucher.length > 10 ? (
                      <button
                        onClick={() => onViewVoucher(consumption.voucher || null)}
                        className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                      >
                        查看
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs">无</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(consumption.id)}
                      className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
