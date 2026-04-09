"use client";

import type { AdAccount, AdConsumption, AdRecharge } from "@/lib/ad-agency-store";
import type { Store } from "@/lib/store-store";
import type { CashFlow as CashFlowStoreType } from "@/lib/cash-flow-store";
import { getCountryByCode } from "@/lib/country-config";
import { formatCurrency } from "@/lib/currency-utils";

export type AccountsTableProps = {
  adAccounts: AdAccount[];
  stores: Store[];
  consumptions: AdConsumption[];
  recharges: AdRecharge[];
  cashFlowList: CashFlowStoreType[];
  onAddAccount: () => void;
  onRecharge: (account: AdAccount) => void;
  onSettlement: (accountId: string, month: string, consumptions: AdConsumption[]) => void;
  onEditAccount: (account: AdAccount) => void;
  onDeleteAccount: (id: string) => void;
};

export function AccountsTable({
  adAccounts,
  stores,
  consumptions,
  recharges,
  cashFlowList,
  onAddAccount,
  onRecharge,
  onSettlement,
  onEditAccount,
  onDeleteAccount,
}: AccountsTableProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">广告账户列表</h2>
          <p className="text-sm text-slate-400 mt-1">管理广告账户余额、授信额度和账户信息</p>
        </div>
        <button
          onClick={onAddAccount}
          className="flex items-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
        >
          + 新增广告账户
        </button>
      </div>

      {adAccounts.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">
            暂无广告账户，请点击右上角「新增广告账户」开始添加
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-300">账户名称</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">账户ID</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">关联店铺</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">代理商</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">国家</th>
                <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">可用余额</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">待结返点</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">授信额度</th>
                <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {adAccounts.map((account) => {
                const accountConsumptions = consumptions.filter((c) => c.adAccountId === account.id);
                const relatedByBinding = stores.filter((store) => (account.storeIds || []).includes(store.id));
                const relatedByStoreConfig = stores.filter((store) => {
                  const accountIdMatched = Boolean(account.accountId) && store.accountId === account.accountId;
                  const accountNameMatched = store.accountName.trim() === account.accountName.trim();
                  return accountIdMatched || accountNameMatched;
                });
                const relatedByConsumptionIds = Array.from(
                  new Set(accountConsumptions.map((c) => c.storeId).filter((id): id is string => Boolean(id)))
                );
                const relatedByConsumption = relatedByConsumptionIds
                  .map((id) => stores.find((store) => store.id === id))
                  .filter((store): store is Store => Boolean(store));
                const relatedStoreNames = Array.from(
                  new Set([...relatedByBinding, ...relatedByStoreConfig, ...relatedByConsumption].map((store) => store.name))
                );
                const totalConsumption = accountConsumptions.reduce((sum, c) => sum + c.amount, 0);
                const totalEstimatedRebate = accountConsumptions.reduce((sum, c) => sum + (c.estimatedRebate || 0), 0);
                const settledRebates = accountConsumptions
                  .filter((c) => c.isSettled)
                  .reduce((sum, c) => sum + (c.estimatedRebate || 0), 0);
                const pendingRebates = totalEstimatedRebate - settledRebates;

                const accountRecharges = recharges.filter((r) => r.adAccountId === account.id);
                const totalRecharge = accountRecharges.reduce((sum, r) => sum + r.amount, 0);

                let totalSettledRebate = 0;
                cashFlowList.forEach((flow) => {
                  if (
                    flow.category === "运营-广告-已结算" &&
                    flow.type === "income" &&
                    !flow.isReversal &&
                    (flow.status === "confirmed" || !flow.status) &&
                    flow.relatedId
                  ) {
                    const consumption = accountConsumptions.find((c) => c.id === flow.relatedId);
                    if (consumption && consumption.isSettled) {
                      totalSettledRebate += Math.abs(flow.amount ?? 0);
                    }
                  }
                });

                const calculatedBalance = totalRecharge - totalConsumption + totalSettledRebate;
                const rebateReceivable = account.rebateReceivable ?? 0;

                const consumptionsByMonth: Record<string, AdConsumption[]> = {};
                accountConsumptions
                  .filter((c) => !c.isSettled)
                  .forEach((c) => {
                    if (!consumptionsByMonth[c.month]) consumptionsByMonth[c.month] = [];
                    consumptionsByMonth[c.month].push(c);
                  });

                return (
                  <tr key={account.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-100 font-medium">{account.accountName}</td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                      {account.accountId ? (
                        account.accountId
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {relatedStoreNames.length > 0 ? (
                        relatedStoreNames.length <= 2 ? (
                          relatedStoreNames.join("、")
                        ) : (
                          `${relatedStoreNames.slice(0, 2).join("、")} +${relatedStoreNames.length - 2}`
                        )
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{account.agencyName}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {account.country ? (() => {
                        const country = getCountryByCode(account.country);
                        return country ? `${country.name} (${country.code})` : account.country;
                      })() : <span className="text-slate-500">-</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{account.currency}</td>
                    <td className="px-4 py-3 text-right">
                      <div className={`font-medium ${calculatedBalance >= 0 ? "text-blue-300" : "text-rose-400"}`}>
                        {formatCurrency(calculatedBalance, account.currency, "balance")}
                        {calculatedBalance < 0 && (
                          <span className="ml-1 text-xs text-rose-400/70" title="账户已透支">(透支)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rebateReceivable > 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="font-medium text-amber-400">
                            {formatCurrency(rebateReceivable, account.currency, "balance")}
                          </span>
                          <span
                            className="cursor-help text-amber-400 text-xs"
                            title="返点为应收账款，后续需独立收回，不计入账户现金余额"
                          >
                            ℹ️
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {formatCurrency(account.creditLimit, account.currency, "balance")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => onRecharge(account)}
                          className="px-2 py-1 rounded border border-blue-500/40 bg-blue-500/10 text-xs text-blue-100 hover:bg-blue-500/20"
                          title="充值"
                        >
                          💵 充值
                        </button>
                        {Object.keys(consumptionsByMonth).length > 0 && (
                          <button
                            onClick={() => {
                              const months = Object.keys(consumptionsByMonth).sort().reverse();
                              const selectedMonth = months[0];
                              onSettlement(account.id, selectedMonth, consumptionsByMonth[selectedMonth]);
                            }}
                            className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-100 hover:bg-emerald-500/20"
                            title="一键结算"
                          >
                            💰 结算
                          </button>
                        )}
                        <button
                          onClick={() => onEditAccount(account)}
                          className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => onDeleteAccount(account.id)}
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
      )}
    </div>
  );
}
