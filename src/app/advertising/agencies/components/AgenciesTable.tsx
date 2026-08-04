"use client";

import { memo } from "react";
import { formatCurrency } from "@/lib/currency-utils";
import type { Agency, AdAccount, AdConsumption, AdRecharge } from "@/lib/ad-agency-store";

interface AgenciesTableProps {
  agencies: Agency[];
  adAccounts: AdAccount[];
  consumptions: AdConsumption[];
  recharges: AdRecharge[];
  onViewDetail: (agency: Agency) => void;
  onEdit: (agency: Agency) => void;
  onDelete: (agencyId: string) => void;
}

function AgenciesTableComponent({
  agencies,
  adAccounts,
  consumptions,
  recharges,
  onViewDetail,
  onEdit,
  onDelete,
}: AgenciesTableProps) {
  if (agencies.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
        <p className="text-slate-400">暂无代理商，请点击右上角「新增代理商」开始添加</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-800/60">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-300">代理商名称</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">平台</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">结算币种</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">返点比例</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">返点周期</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">账期规则</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">联系人</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">总充值金额</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">消耗金额</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">返点</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">账户剩余金额</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {agencies.map((agency) => {
            const agencyAccounts = adAccounts.filter((acc) => acc.agencyId === agency.id);
            const agencyRecharges = recharges.filter((r) =>
              agencyAccounts.some((acc) => acc.id === r.adAccountId)
            );
            const totalRechargeByCurrency: Record<string, number> = {};
            agencyRecharges.forEach((r) => {
              const currency = r.currency || "USD";
              totalRechargeByCurrency[currency] = (totalRechargeByCurrency[currency] || 0) + r.amount;
            });
            const mainRechargeCurrency =
              totalRechargeByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalRechargeByCurrency)[0] || "USD";
            const totalRecharge = totalRechargeByCurrency[mainRechargeCurrency] || 0;

            const agencyConsumptions = consumptions.filter((c) =>
              agencyAccounts.some((acc) => acc.id === c.adAccountId)
            );
            const totalConsumptionByCurrency: Record<string, number> = {};
            agencyConsumptions.forEach((c) => {
              const currency = c.currency || "USD";
              totalConsumptionByCurrency[currency] =
                (totalConsumptionByCurrency[currency] || 0) + (c.amount || 0);
            });
            const mainConsumptionCurrency =
              totalConsumptionByCurrency["USD"] !== undefined
                ? "USD"
                : Object.keys(totalConsumptionByCurrency)[0] || "USD";
            const totalConsumption = totalConsumptionByCurrency[mainConsumptionCurrency] || 0;

            const rebateRate = agency.rebateConfig?.rate ?? agency.rebateRate ?? 0;
            const totalRebateByCurrency: Record<string, number> = {};
            agencyRecharges.forEach((r) => {
              const currency = r.currency || "USD";
              const rebate = (r.amount * rebateRate) / 100;
              totalRebateByCurrency[currency] = (totalRebateByCurrency[currency] || 0) + rebate;
            });
            const mainRebateCurrency =
              totalRebateByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalRebateByCurrency)[0] || "USD";
            const totalRebate = totalRebateByCurrency[mainRebateCurrency] || 0;

            const totalBalanceByCurrency: Record<string, number> = {};
            agencyAccounts.forEach((acc) => {
              const currency = acc.currency || "USD";
              const balance = Math.max(0, acc.currentBalance || 0);
              if (balance > 0) {
                totalBalanceByCurrency[currency] = (totalBalanceByCurrency[currency] || 0) + balance;
              }
            });
            const mainBalanceCurrency =
              totalBalanceByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalBalanceByCurrency)[0] || "USD";
            const totalBalance = totalBalanceByCurrency[mainBalanceCurrency] || 0;

            return (
              <tr key={agency.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 text-slate-100 font-medium">{agency.name}</td>
                <td className="px-4 py-3 text-slate-300">{agency.platform}</td>
                <td className="px-4 py-3 text-slate-300">{agency.settlementCurrency || "-"}</td>
                <td className="px-4 py-3 text-right text-emerald-300 font-medium">
                  {agency.rebateConfig?.rate ?? agency.rebateRate}%
                </td>
                <td className="px-4 py-3 text-slate-300">{agency.rebateConfig?.period || "月"}</td>
                <td className="px-4 py-3 text-slate-300 text-xs">{agency.creditTerm || "-"}</td>
                <td className="px-4 py-3 text-slate-300">{agency.contact || "-"}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatCurrency(totalRecharge, mainRechargeCurrency as "USD" | "CNY" | "HKD", "income")}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatCurrency(totalConsumption, mainConsumptionCurrency as "USD" | "CNY" | "HKD", "expense")}
                </td>
                <td className="px-4 py-3 text-right font-medium text-emerald-300">
                  {formatCurrency(totalRebate, mainRebateCurrency as "USD" | "CNY" | "HKD", "income")}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatCurrency(totalBalance, mainBalanceCurrency as "USD" | "CNY" | "HKD", "balance")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => onViewDetail(agency)}
                      className="px-2 py-1 rounded border border-slate-500/40 bg-slate-800/60 text-xs text-slate-300 hover:bg-slate-700/60"
                    >
                      查看
                    </button>
                    <button
                      onClick={() => onEdit(agency)}
                      className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => onDelete(agency.id)}
                      className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const AgenciesTable = memo(AgenciesTableComponent);
