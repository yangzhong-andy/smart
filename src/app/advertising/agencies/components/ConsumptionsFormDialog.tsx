"use client";

import type { Agency, AdAccount } from "@/lib/ad-agency-store";
import type { Store } from "@/lib/store-store";
import ImageUploader from "@/components/ImageUploader";

export type ConsumptionFormState = {
  adAccountId: string;
  storeId: string;
  month: string;
  date: string;
  amount: string;
  currency: string;
  campaignName: string;
  voucher: string;
  notes: string;
};

export type ConsumptionsFormDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  form: ConsumptionFormState;
  setForm: React.Dispatch<React.SetStateAction<ConsumptionFormState>>;
  adAccounts: AdAccount[];
  agencies: Agency[];
  stores: Store[];
  currencyFormat: (n: number, curr: string) => string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

const initialFormState: ConsumptionFormState = {
  adAccountId: "",
  storeId: "",
  month: new Date().toISOString().slice(0, 7),
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  currency: "USD",
  campaignName: "",
  voucher: "",
  notes: "",
};

export function ConsumptionsFormDialog({
  isOpen,
  onClose,
  form,
  setForm,
  adAccounts,
  agencies,
  stores,
  currencyFormat,
  onSubmit,
}: ConsumptionsFormDialogProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    setForm({
      ...initialFormState,
      month: new Date().toISOString().slice(0, 7),
      date: new Date().toISOString().slice(0, 10),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm" style={{ zIndex: 50 }}>
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md" style={{ position: "relative", zIndex: 51 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">新增消耗记录</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">广告账户 *</label>
            <select
              value={form.adAccountId}
              onChange={(e) => {
                const account = adAccounts.find((a) => a.id === e.target.value);
                const agency = account ? agencies.find((a) => a.id === account.agencyId) : null;
                setForm((f) => ({
                  ...f,
                  adAccountId: e.target.value,
                  currency: account?.currency || "USD",
                  month: f.month || new Date().toISOString().slice(0, 7),
                }));
              }}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
            >
              <option value="">请选择广告账户</option>
              {adAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} ({account.agencyName}) - 余额: {currencyFormat(account.currentBalance ?? 0, account.currency)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">月份 *</label>
            <input
              type="month"
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">关联店铺</label>
            <select
              value={form.storeId}
              onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
            >
              <option value="">请选择店铺（可选）</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.platform}) - {store.country}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">消耗日期 *</label>
            <input
              type="date"
              lang="zh-CN"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300 cursor-pointer"
              style={{ colorScheme: "dark", position: "relative", zIndex: 10 }}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">消耗金额 *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
            />
            {form.adAccountId && form.amount && (() => {
              const account = adAccounts.find((a) => a.id === form.adAccountId);
              const agency = account ? agencies.find((a) => a.id === account.agencyId) : null;
              const estimatedRebate = agency && form.amount ? (Number(form.amount) * agency.rebateRate) / 100 : 0;
              return estimatedRebate > 0 ? (
                <div className="text-xs text-emerald-400 mt-1">
                  预估返点：{currencyFormat(estimatedRebate, form.currency || account?.currency || "USD")} ({agency?.rebateRate ?? 0}%)
                </div>
              ) : null;
            })()}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">币种 *</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
            >
              <option value="USD">USD</option>
              <option value="RMB">RMB</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">广告系列名称</label>
            <input
              type="text"
              value={form.campaignName}
              onChange={(e) => setForm((f) => ({ ...f, campaignName: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">消耗凭证</label>
            <ImageUploader
              value={form.voucher || ""}
              onChange={(value) => {
                const voucherValue = typeof value === "string" ? value : (Array.isArray(value) ? value[0] || "" : "");
                setForm((f) => ({ ...f, voucher: voucherValue }));
              }}
              maxImages={1}
              multiple={false}
            />
            <p className="text-xs text-slate-400 mt-1">请上传消耗凭证（如广告截图、账单等）</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-[#00E5FF] text-slate-900 font-semibold hover:bg-[#00B8CC] transition-all duration-200 shadow-lg shadow-[#00E5FF]/20"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
