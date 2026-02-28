"use client";

import type { BankAccount } from "./types";
import type { CashFlowLike } from "./types";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

type AccountFlowDialogProps = {
  open: boolean;
  account: BankAccount | null;
  flows: { normal: CashFlowLike[]; transfers: CashFlowLike[] };
  onClose: () => void;
};

export function AccountFlowDialog({ open, account, flows, onClose }: AccountFlowDialogProps) {
  if (!open || !account) return null;

  const { normal, transfers } = flows;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">账户流水明细 - {account.name}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {account.accountNumber && `账号：${account.accountNumber} | `}
              币种：{account.currency} |
              当前余额：
              {account.currency === "RMB"
                ? currency(account.originalBalance || 0, "CNY")
                : account.currency === "USD"
                  ? currency(account.originalBalance || 0, "USD")
                  : `${formatNumber(account.originalBalance || 0)} ${account.currency}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-700 bg-slate-800/60 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-200">正常收入支出</h3>
            </div>
            {normal.length === 0 ? (
              <div className="p-8 text-center text-slate-400">暂无收入支出记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">日期</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">类型</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">摘要</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">分类</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400">金额</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">备注</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">状态</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">业务单号</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {normal.map((flow) => (
                      <tr key={flow.id} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 text-slate-300">
                          {new Date(flow.createdAt || flow.date).toLocaleString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              flow.type === "income" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                            }`}
                          >
                            {flow.type === "income" ? "收入" : "支出"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{flow.summary}</td>
                        <td className="px-3 py-2 text-slate-400">{flow.category || "-"}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            flow.type === "income" ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {flow.currency === "RMB"
                            ? currency(Math.abs(flow.amount), "CNY")
                            : flow.currency === "USD"
                              ? currency(Math.abs(flow.amount), "USD")
                              : `${formatNumber(Math.abs(flow.amount))} ${flow.currency}`}
                        </td>
                        <td className="max-w-xs truncate px-3 py-2 text-slate-400" title={flow.remark}>
                          {flow.remark || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              flow.status === "confirmed" ? "bg-blue-500/20 text-blue-300" : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {flow.status === "confirmed" ? "已确认" : "待核对"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400">{flow.businessNumber || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-800/40">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right font-medium text-slate-300">
                        合计：
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="space-y-1">
                          <div className="font-medium text-emerald-300">
                            收入：
                            {account.currency === "RMB"
                              ? currency(
                                  normal
                                    .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                    .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                  "CNY"
                                )
                              : account.currency === "USD"
                                ? currency(
                                    normal
                                      .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                    "USD"
                                  )
                                : `${formatNumber(
                                    normal
                                      .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                  )} ${account.currency}`}
                          </div>
                          <div className="font-medium text-rose-300">
                            支出：
                            {account.currency === "RMB"
                              ? currency(
                                  normal
                                    .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                    .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                  "CNY"
                                )
                              : account.currency === "USD"
                                ? currency(
                                    normal
                                      .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                    "USD"
                                  )
                                : `${formatNumber(
                                    normal
                                      .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                  )} ${account.currency}`}
                          </div>
                        </div>
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-700 bg-slate-800/60 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-200">内部划拨记录</h3>
            </div>
            {transfers.length === 0 ? (
              <div className="p-8 text-center text-slate-400">暂无划拨记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">日期</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">类型</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">摘要</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400">金额</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">备注</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {transfers.map((flow) => (
                      <tr key={flow.id} className="hover:bg-slate-800/40">
                        <td className="px-3 py-2 text-slate-300">
                          {new Date(flow.createdAt || flow.date).toLocaleString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              flow.type === "income" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"
                            }`}
                          >
                            {flow.type === "income" ? "划入" : "划出"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{flow.summary}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            flow.type === "income" ? "text-blue-300" : "text-purple-300"
                          }`}
                        >
                          {flow.currency === "RMB"
                            ? currency(Math.abs(flow.amount), "CNY")
                            : flow.currency === "USD"
                              ? currency(Math.abs(flow.amount), "USD")
                              : `${formatNumber(Math.abs(flow.amount))} ${flow.currency}`}
                        </td>
                        <td className="max-w-xs truncate px-3 py-2 text-slate-400" title={flow.remark}>
                          {flow.remark || "-"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              flow.status === "confirmed" ? "bg-blue-500/20 text-blue-300" : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {flow.status === "confirmed" ? "已确认" : "待核对"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-800/40">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right font-medium text-slate-300">
                        合计：
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="space-y-1">
                          <div className="font-medium text-blue-300">
                            划入：
                            {account.currency === "RMB"
                              ? currency(
                                  transfers
                                    .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                    .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                  "CNY"
                                )
                              : account.currency === "USD"
                                ? currency(
                                    transfers
                                      .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                    "USD"
                                  )
                                : `${formatNumber(
                                    transfers
                                      .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                  )} ${account.currency}`}
                          </div>
                          <div className="font-medium text-purple-300">
                            划出：
                            {account.currency === "RMB"
                              ? currency(
                                  transfers
                                    .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                    .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                  "CNY"
                                )
                              : account.currency === "USD"
                                ? currency(
                                    transfers
                                      .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                    "USD"
                                  )
                                : `${formatNumber(
                                    transfers
                                      .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                      .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                  )} ${account.currency}`}
                          </div>
                        </div>
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
