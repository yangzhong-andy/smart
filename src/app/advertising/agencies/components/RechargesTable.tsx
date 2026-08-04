"use client";

import type { AdAccount, AdRecharge } from "@/lib/ad-agency-store";
import { getCountryByCode } from "@/lib/country-config";
import { formatCurrency } from "@/lib/currency-utils";

export type RechargesTableProps = {
  recharges: AdRecharge[];
  adAccounts: AdAccount[];
  onDelete: (id: string) => void;
  onViewVoucher: (voucher: string | null) => void;
};

export function RechargesTable({
  recharges,
  adAccounts,
  onDelete,
  onViewVoucher,
}: RechargesTableProps) {
  const sorted = [...recharges].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">充值历史</h2>
        <p className="text-sm text-slate-400 mt-1">查看所有广告账户的充值记录和返点明细</p>
      </div>
      {recharges.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">暂无充值记录</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-300">日期</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">账户名称</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">国家</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">代理商</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">充值金额</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">返点金额</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                <th className="px-4 py-3 text-center font-medium text-slate-300">付款状态</th>
                <th className="px-4 py-3 text-center font-medium text-slate-300">凭证</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">备注</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sorted.map((recharge) => {
                const account = adAccounts.find((a) => a.id === recharge.adAccountId);
                const countryDisplay = account?.country
                  ? getCountryByCode(account.country)?.name ?? account.country
                  : "-";
                return (
                  <tr key={recharge.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-300">{recharge.date}</td>
                    <td className="px-4 py-3 text-slate-300">{recharge.month || "-"}</td>
                    <td className="px-4 py-3 text-slate-100 font-medium">{recharge.accountName}</td>
                    <td className="px-4 py-3 text-slate-300">{countryDisplay}</td>
                    <td className="px-4 py-3 text-slate-300">{recharge.agencyName || "-"}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(recharge.amount, recharge.currency, "income")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {recharge.rebateAmount
                        ? formatCurrency(recharge.rebateAmount, recharge.currency, "income")
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{recharge.currency}</td>
                    <td className="px-4 py-3 text-center">
                      {recharge.paymentStatus === "Pending" ? (
                        <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          待付款
                        </span>
                      ) : recharge.paymentStatus === "Paid" ? (
                        <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          已付款
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          已取消
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {recharge.voucher ? (
                        <button
                          onClick={() => onViewVoucher(recharge.voucher || null)}
                          className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                        >
                          查看
                        </button>
                      ) : (
                        <span className="text-slate-500 text-xs">无</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">
                      {recharge.notes || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onDelete(recharge.id)}
                        className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
