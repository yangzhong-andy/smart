"use client";

import type { Agency, AdAccount } from "@/lib/ad-agency-store";
import type { Store } from "@/lib/store-store";
import { getCountriesByRegion, getCountryByCode } from "@/lib/country-config";

export type AccountFormState = {
  agencyId: string;
  accountName: string;
  accountId: string;
  storeIds: string[];
  currentBalance: string;
  creditLimit: string;
  currency: AdAccount["currency"];
  country: string;
  notes: string;
};

export type AccountsFormDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  editAccount: AdAccount | null;
  form: AccountFormState;
  setForm: React.Dispatch<React.SetStateAction<AccountFormState>>;
  agencies: Agency[];
  stores: Store[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

const initialFormState: AccountFormState = {
  agencyId: "",
  accountName: "",
  accountId: "",
  storeIds: [],
  currentBalance: "",
  creditLimit: "",
  currency: "USD",
  country: "",
  notes: "",
};

export function AccountsFormDialog({
  isOpen,
  onClose,
  editAccount,
  form,
  setForm,
  agencies,
  stores,
  isSubmitting,
  onSubmit,
}: AccountsFormDialogProps) {
  if (!isOpen) return null;
  const countriesByRegion = getCountriesByRegion();

  const handleClose = () => {
    if (isSubmitting) return;
    setForm(initialFormState);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{editAccount ? "编辑广告账户" : "新增广告账户"}</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">代理商 *</label>
            <select
              value={form.agencyId}
              onChange={(e) => setForm((f) => ({ ...f, agencyId: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
              disabled={!!editAccount}
            >
              <option value="">请选择代理商</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name} ({agency.platform})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">绑定店铺（可多选）</label>
            <select
              multiple
              value={form.storeIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setForm((f) => ({ ...f, storeIds: selected }));
              }}
              className="w-full min-h-[96px] rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}（{store.platform}/{store.country}）
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">按 Ctrl/Command 可多选。绑定后将以店铺ID做精确关联。</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">账户名称 *</label>
            <input
              type="text"
              value={form.accountName}
              onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">账户ID</label>
            <input
              type="text"
              value={form.accountId}
              onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              placeholder="平台账户ID（如Facebook广告账户ID）"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">币种 *</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as AdAccount["currency"] }))}
                className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              >
                <option value="USD">USD</option>
                <option value="RMB">RMB</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">所属国家</label>
              <input
                type="text"
                value={form.country ? (() => {
                  const country = getCountryByCode(form.country);
                  return country ? `${country.name} (${country.code})` : form.country;
                })() : "不指定"}
                readOnly
                className="mb-2 w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-slate-300 outline-none"
              />
              <select
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              >
                <option value="">不指定</option>
                {Object.entries(countriesByRegion).map(([region, countries]) => (
                  <optgroup key={region} label={region}>
                    {countries
                      .filter((country) => country.code !== "GLOBAL")
                      .map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.code})
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">当前余额</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.currentBalance}
              onChange={(e) => setForm((f) => ({ ...f, currentBalance: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">账期授信额度</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.creditLimit}
              onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              placeholder="0.00"
            />
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
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md border border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md bg-[#00E5FF] text-slate-900 font-semibold hover:bg-[#00B8CC] transition-all duration-200 shadow-lg shadow-[#00E5FF]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (editAccount ? "更新中…" : "创建中…") : editAccount ? "更新" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
