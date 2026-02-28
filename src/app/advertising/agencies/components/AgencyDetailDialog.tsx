"use client";

import type { Agency } from "@/lib/ad-agency-store";
import { formatCurrency } from "@/lib/currency-utils";
import type { AdAccount, AdConsumption, AdRecharge } from "@/lib/ad-agency-store";

interface AgencyDetailDialogProps {
  isOpen: boolean;
  agency: Agency | null;
  adAccounts: AdAccount[];
  consumptions: AdConsumption[];
  recharges: AdRecharge[];
  onClose: () => void;
  onEdit: (agency: Agency) => void;
}

export function AgencyDetailDialog({
  isOpen,
  agency,
  adAccounts,
  consumptions,
  recharges,
  onClose,
  onEdit,
}: AgencyDetailDialogProps) {
  if (!isOpen || !agency) return null;

  const agencyAccounts = adAccounts.filter((acc) => acc.agencyId === agency.id);
  const agencyRecharges = recharges.filter((r) =>
    agencyAccounts.some((acc) => acc.id === r.adAccountId)
  );
  const agencyConsumptions = consumptions.filter((c) =>
    agencyAccounts.some((acc) => acc.id === c.adAccountId)
  );

  const totalRechargeByCurrency: Record<string, number> = {};
  agencyRecharges.forEach((r) => {
    const currency = r.currency || "USD";
    totalRechargeByCurrency[currency] = (totalRechargeByCurrency[currency] || 0) + r.amount;
  });
  const mainRechargeCurrency =
    totalRechargeByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalRechargeByCurrency)[0] || "USD";
  const totalRecharge = totalRechargeByCurrency[mainRechargeCurrency] || 0;

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-100">代理商详情</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">代理商名称</span>
              <p className="text-slate-100 font-medium">{agency.name}</p>
            </div>
            <div>
              <span className="text-slate-500">平台</span>
              <p className="text-slate-100">{agency.platform}</p>
            </div>
            <div>
              <span className="text-slate-500">结算币种</span>
              <p className="text-slate-100">{agency.settlementCurrency || "-"}</p>
            </div>
            <div>
              <span className="text-slate-500">返点比例</span>
              <p className="text-emerald-300 font-medium">{agency.rebateConfig?.rate ?? agency.rebateRate}%</p>
            </div>
            <div>
              <span className="text-slate-500">返点周期</span>
              <p className="text-slate-100">{agency.rebateConfig?.period || "月"}</p>
            </div>
            <div>
              <span className="text-slate-500">账期规则</span>
              <p className="text-slate-100 text-xs">{agency.creditTerm || "-"}</p>
            </div>
            <div>
              <span className="text-slate-500">联系人</span>
              <p className="text-slate-100">{agency.contact || "-"}</p>
            </div>
            <div>
              <span className="text-slate-500">联系电话</span>
              <p className="text-slate-100">{agency.phone || "-"}</p>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-sm font-medium text-slate-400 mb-2">汇总数据</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">总充值金额</span>
                <p className="text-slate-100 font-medium">
                  {formatCurrency(totalRecharge, mainRechargeCurrency as "USD" | "CNY" | "HKD", "income")}
                </p>
              </div>
              <div>
                <span className="text-slate-500">消耗金额</span>
                <p className="text-slate-100 font-medium">
                  {formatCurrency(totalConsumption, mainConsumptionCurrency as "USD" | "CNY" | "HKD", "expense")}
                </p>
              </div>
              <div>
                <span className="text-slate-500">返点</span>
                <p className="text-emerald-300 font-medium">
                  {formatCurrency(totalRebate, mainRebateCurrency as "USD" | "CNY" | "HKD", "income")}
                </p>
              </div>
              <div>
                <span className="text-slate-500">账户剩余金额</span>
                <p className="text-slate-100 font-medium">
                  {formatCurrency(totalBalance, mainBalanceCurrency as "USD" | "CNY" | "HKD", "balance")}
                </p>
              </div>
            </div>
          </div>

          {agency.notes && (
            <div className="border-t border-slate-800 pt-4">
              <span className="text-slate-500 text-sm">备注</span>
              <p className="text-slate-300 text-sm mt-1">{agency.notes}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(agency);
              }}
              className="px-4 py-2 rounded-md bg-primary-500 text-white font-medium hover:bg-primary-600"
            >
              编辑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
