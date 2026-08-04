"use client";

import type { AdAccount, AdConsumption } from "@/lib/ad-agency-store";

export type SettlementData = {
  month: string;
  accountId: string;
  consumptions: AdConsumption[];
};

export type SettlementDialogProps = {
  isOpen: boolean;
  settlementData: SettlementData | null;
  adAccounts: AdAccount[];
  currencyFormat: (n: number, curr: string) => string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

export function SettlementDialog({
  isOpen,
  settlementData,
  adAccounts,
  currencyFormat,
  onClose,
  onSubmit,
}: SettlementDialogProps) {
  if (!isOpen || !settlementData) return null;

  const account = adAccounts.find((a) => a.id === settlementData.accountId);
  const totalRebate = settlementData.consumptions.reduce(
    (sum, c) => sum + (c.estimatedRebate ?? 0),
    0
  );
  const currency = account?.currency ?? "USD";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">一键结算返点</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-sm text-slate-300 mb-2">
              <span className="font-medium">结算月份：</span>
              <span className="text-emerald-300">{settlementData.month}</span>
            </div>
            <div className="text-sm text-slate-300 mb-2">
              <span className="font-medium">广告账户：</span>
              <span className="text-emerald-300">
                {account?.accountName ?? "-"}
              </span>
            </div>
            <div className="text-sm text-slate-300 mb-2">
              <span className="font-medium">消耗记录数：</span>
              <span className="text-blue-300">{settlementData.consumptions.length} 条</span>
            </div>
            <div className="text-sm text-slate-300">
              <span className="font-medium">结算返点总额：</span>
              <span className="text-2xl font-semibold text-emerald-300 ml-2">
                {currencyFormat(totalRebate, currency)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 max-h-60 overflow-y-auto">
            <div className="text-sm font-medium text-slate-300 mb-2">消耗记录明细：</div>
            <div className="space-y-2">
              {settlementData.consumptions.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between text-xs text-slate-400 py-1 border-b border-slate-800"
                >
                  <div>
                    <span>{c.date}</span>
                    {c.storeName && <span className="ml-2">| {c.storeName}</span>}
                  </div>
                  <div className="text-right">
                    <div>消耗：{currencyFormat(c.amount, c.currency)}</div>
                    <div className="text-emerald-400">
                      返点：{currencyFormat(c.estimatedRebate ?? 0, c.currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
            >
              确认结算
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
