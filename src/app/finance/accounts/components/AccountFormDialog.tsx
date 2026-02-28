"use client";

import type { BankAccount } from "@/lib/finance-store";
import { getCountryByCode } from "@/lib/country-config";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export type AccountFormState = {
  name: string;
  accountNumber: string;
  accountType: BankAccount["accountType"];
  accountCategory: BankAccount["accountCategory"];
  accountPurpose: string;
  currency: BankAccount["currency"];
  country: string;
  originalBalance: string;
  initialCapital: string;
  exchangeRate: string;
  parentId: string;
  storeId: string;
  companyEntity: string;
  owner: string;
  notes: string;
  platformAccount: string;
  platformPassword: string;
  platformUrl: string;
};

type StoreLike = { id: string; name: string; country: string; platform?: string; currency?: string };
type CountriesByRegion = Record<string, Array<{ code: string; name: string }>>;

type AccountFormDialogProps = {
  open: boolean;
  editAccount: BankAccount | null;
  form: AccountFormState;
  setForm: React.Dispatch<React.SetStateAction<AccountFormState>>;
  primaryAccounts: BankAccount[];
  storesList: StoreLike[];
  countriesByRegion: CountriesByRegion;
  currentRMBBalance: number;
  isCreating: boolean;
  isUpdating: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export function AccountFormDialog({
  open,
  editAccount,
  form,
  setForm,
  primaryAccounts,
  storesList,
  countriesByRegion,
  currentRMBBalance,
  isCreating,
  isUpdating,
  onSubmit,
  onClose,
}: AccountFormDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">{editAccount ? "编辑账户" : "新增账户"}</h2>
            <p className="text-xs text-slate-400">账户名称是必填项，汇率将自动计算折算CNY余额。</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 space-y-1">
              <span className="text-slate-300">
                账户名称 <span className="text-rose-400">*</span>
              </span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="如：寻汇美金、招行公户"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">账号（卡号）</span>
              <input
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">
                账户类别 <span className="text-rose-400">*</span>
              </span>
              <select
                value={form.accountCategory}
                onChange={(e) => {
                  const category = e.target.value as BankAccount["accountCategory"];
                  setForm((f) => ({
                    ...f,
                    accountCategory: category,
                    parentId: category === "VIRTUAL" ? f.parentId : "",
                    storeId: category === "VIRTUAL" ? f.storeId : "",
                    originalBalance: category === "PRIMARY" ? "" : f.originalBalance,
                  }));
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              >
                <option value="PRIMARY">主账户（汇总子账号余额）</option>
                <option value="VIRTUAL">虚拟子账号（必须绑定店铺）</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">账号类型</span>
              <select
                value={form.accountType}
                onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value as BankAccount["accountType"] }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              >
                <option value="对公">对公</option>
                <option value="对私">对私</option>
                <option value="平台">平台</option>
              </select>
            </label>
            {form.accountType === "平台" && (
              <>
                <label className="space-y-1">
                  <span className="text-slate-300">平台账号</span>
                  <input
                    value={form.platformAccount}
                    onChange={(e) => setForm((f) => ({ ...f, platformAccount: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="请输入平台账号"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">账号密码</span>
                  <input
                    type="password"
                    value={form.platformPassword}
                    onChange={(e) => setForm((f) => ({ ...f, platformPassword: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="请输入账号密码"
                  />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-slate-300">登入网站</span>
                  <input
                    type="url"
                    value={form.platformUrl}
                    onChange={(e) => setForm((f) => ({ ...f, platformUrl: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：https://example.com"
                  />
                </label>
              </>
            )}
            {form.accountCategory === "VIRTUAL" && (
              <label className="col-span-2 space-y-1">
                <span className="text-slate-300">
                  关联主账户 <span className="text-rose-400">*</span>
                </span>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  required
                >
                  <option value="">请选择主账户</option>
                  {primaryAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
                {primaryAccounts.length === 0 && <div className="mt-1 text-xs text-amber-400">请先创建主账户</div>}
              </label>
            )}
            <label className="space-y-1">
              <span className="text-slate-300">账号用途</span>
              <input
                value={form.accountPurpose}
                onChange={(e) => setForm((f) => ({ ...f, accountPurpose: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="如：采购货款、广告费"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">公司主体</span>
              <input
                value={form.companyEntity}
                onChange={(e) => setForm((f) => ({ ...f, companyEntity: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="如：XX有限公司、XX贸易公司"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">账号归属人</span>
              <input
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="如：张三、李四"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">币种</span>
              {form.storeId ? (
                <input
                  type="text"
                  value={form.currency}
                  readOnly
                  className="w-full cursor-not-allowed rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-slate-400 outline-none"
                />
              ) : (
                <select
                  value={form.currency}
                  onChange={(e) => {
                    const newCurrency = e.target.value as BankAccount["currency"];
                    setForm((f) => ({
                      ...f,
                      currency: newCurrency,
                      exchangeRate: newCurrency === "CNY" ? "1" : f.exchangeRate,
                    }));
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="CNY">CNY (人民币)</option>
                  <option value="USD">USD (美元)</option>
                  <option value="JPY">JPY (日元)</option>
                  <option value="EUR">EUR (欧元)</option>
                  <option value="GBP">GBP (英镑)</option>
                  <option value="HKD">HKD (港币)</option>
                  <option value="SGD">SGD (新加坡元)</option>
                  <option value="AUD">AUD (澳元)</option>
                </select>
              )}
              {form.storeId && <div className="mt-1 text-xs text-slate-500">已锁定（与关联店铺同步）</div>}
            </label>
            {form.accountCategory === "VIRTUAL" && (
              <label className="col-span-2 space-y-1">
                <span className="text-slate-300">关联店铺</span>
                <select
                  value={form.storeId}
                  onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="">不关联店铺（可选）</option>
                  {storesList.map((store) => {
                    const country = getCountryByCode(store.country);
                    return (
                      <option key={store.id} value={store.id}>
                        {store.name} ({store.platform}) - {country?.name || store.country} - {store.currency}
                      </option>
                    );
                  })}
                </select>
                {form.storeId && <div className="mt-1 text-xs text-emerald-400">已关联店铺，国家/币种已自动同步并锁定</div>}
                {storesList.length === 0 && (
                  <div className="mt-1 text-xs text-amber-400">暂无店铺，请先前往"系统设置 - 店铺管理"创建店铺</div>
                )}
              </label>
            )}
            {form.accountCategory !== "VIRTUAL" && (
              <label className="col-span-2 space-y-1">
                <span className="text-slate-300">关联店铺（可选）</span>
                <select
                  value={form.storeId}
                  onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="">不关联店铺</option>
                  {storesList.map((store) => {
                    const country = getCountryByCode(store.country);
                    return (
                      <option key={store.id} value={store.id}>
                        {store.name} ({store.platform}) - {country?.name || store.country} - {store.currency}
                      </option>
                    );
                  })}
                </select>
                {form.storeId && <div className="mt-1 text-xs text-emerald-400">已关联店铺，国家/币种已自动同步并锁定</div>}
              </label>
            )}
            <label className="space-y-1">
              <span className="text-slate-300">所属国家/地区</span>
              <input
                type="text"
                value={
                  form.storeId
                    ? (() => {
                        const selectedStore = storesList.find((s) => s.id === form.storeId);
                        if (selectedStore) {
                          const country = getCountryByCode(selectedStore.country);
                          return country ? `${country.name} (${country.code})` : selectedStore.country;
                        }
                        return "";
                      })()
                    : (() => {
                        const country = getCountryByCode(form.country);
                        return country ? `${country.name} (${country.code})` : form.country;
                      })()
                }
                readOnly
                className={`w-full rounded-md border border-slate-700 px-3 py-2 outline-none ${
                  form.storeId ? "cursor-not-allowed bg-slate-800/50 text-slate-400" : "bg-slate-900 text-slate-300"
                }`}
              />
              {!form.storeId && (
                <select
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  {Object.entries(countriesByRegion).map(([region, countries]) => (
                    <optgroup key={region} label={region}>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {form.storeId && <div className="mt-1 text-xs text-slate-500">已锁定（与关联店铺同步）</div>}
            </label>
            {form.accountCategory !== "PRIMARY" && (
              <label className="space-y-1">
                <span className="text-slate-300">
                  原币余额 <span className="text-rose-400">*</span>
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={form.originalBalance}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || /^-?\d*\.?\d*$/.test(value)) setForm((f) => ({ ...f, originalBalance: value }));
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="请输入原币余额，如：1000.00"
                  required
                  min="0"
                />
                <div className="mt-1 text-xs text-slate-500">当前账户的原币余额（会随流水变化）</div>
              </label>
            )}
            {form.accountCategory === "PRIMARY" && (
              <label className="space-y-1">
                <span className="text-slate-300">原币余额</span>
                <input
                  type="text"
                  value="自动汇总（子账号余额）"
                  readOnly
                  className="w-full cursor-not-allowed rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-slate-400 outline-none"
                />
                <div className="mt-1 text-xs text-slate-500">主账户余额自动汇总所有子账号</div>
              </label>
            )}
            <label className="space-y-1">
              <span className="text-slate-300">
                汇率（对CNY）{(form.currency === "CNY" || form.currency === "RMB") && <span className="text-slate-500">(固定为1)</span>}
              </span>
              <input
                type="number"
                step="0.0001"
                value={form.currency === "CNY" || form.currency === "RMB" ? "1" : form.exchangeRate}
                onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="如：7.2500"
                disabled={form.currency === "CNY" || form.currency === "RMB"}
                required={form.currency !== "RMB"}
              />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-slate-300">折算CNY余额（自动计算）</span>
              <div className="w-full rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 font-medium text-emerald-300">
                {currency(currentRMBBalance, "CNY")}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">原始资金</span>
              <input
                type="number"
                step="0.01"
                value={form.initialCapital}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "" || /^-?\d*\.?\d*$/.test(value)) setForm((f) => ({ ...f, initialCapital: value }));
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="请输入账户的初始资金，如：10000.00"
                min="0"
              />
              <div className="mt-1 text-xs text-slate-500">
                账户创建时的初始资金（固定值，不受流水影响）
                {form.accountCategory === "PRIMARY" && "，主账户的原始资金用于记录初始投入"}
              </div>
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-slate-300">使用说明</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                rows={3}
                placeholder="多行文本备注"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCreating || isUpdating}
            >
              {isCreating || isUpdating ? (editAccount ? "更新中..." : "创建中...") : editAccount ? "保存修改" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
