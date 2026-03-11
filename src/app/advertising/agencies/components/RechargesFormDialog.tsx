"use client";

import type { AdAccount, Agency } from "@/lib/ad-agency-store";
import ImageUploader from "@/components/ImageUploader";

export type RechargeFormState = {
  amount: string;
  currency: "USD" | "CNY" | "HKD";
  date: string;
  voucher: string;
  notes: string;
};

export type RechargesFormDialogProps = {
  isOpen: boolean;
  rechargeAccount: AdAccount | null;
  onClose: () => void;
  form: RechargeFormState;
  setForm: React.Dispatch<React.SetStateAction<RechargeFormState>>;
  amountError: boolean;
  setAmountError: (v: boolean) => void;
  previewKey: number;
  setPreviewKey: React.Dispatch<React.SetStateAction<number>>;
  agencies: Agency[];
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
};

const initialFormState: RechargeFormState = {
  amount: "",
  currency: "USD",
  date: new Date().toISOString().slice(0, 10),
  voucher: "",
  notes: "",
};

export function RechargesFormDialog({
  isOpen,
  rechargeAccount,
  onClose,
  form,
  setForm,
  amountError,
  setAmountError,
  previewKey,
  setPreviewKey,
  agencies,
  onSubmit,
}: RechargesFormDialogProps) {
  if (!isOpen || !rechargeAccount) return null;

  const handleClose = () => {
    setForm(initialFormState);
    setAmountError(false);
    setPreviewKey(0);
    onClose();
  };

  const formatAmount = (val: number, curr: string) => {
    const symbol = curr === "USD" ? "$" : curr === "CNY" ? "¥" : "HK$";
    return `${symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const agency = agencies.find((a) => a.id === rechargeAccount.agencyId);
  const rebateRate = agency?.rebateConfig?.rate ?? agency?.rebateRate ?? 0;
  const amount = Number(form.amount) || 0;
  const rebateAmount = rebateRate > 0 ? (amount * rebateRate) / 100 : 0;
  const currentBalance = rechargeAccount.currentBalance ?? 0;
  const currentRebateReceivable = rechargeAccount.rebateReceivable ?? 0;
  const newBalance = currentBalance + amount;
  const newRebateReceivable = currentRebateReceivable + rebateAmount;
  const showPreview = amount > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm" style={{ zIndex: 50 }}>
      <div className="bg-[#0B0C10]/90 backdrop-blur-xl rounded-xl border border-cyan-500/20 p-6 w-full max-w-md shadow-[0_0_40px_rgba(6,182,212,0.2)] modal-enter" style={{ position: "relative", zIndex: 51 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">充值 - {rechargeAccount.accountName}</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-200 transition-colors duration-200">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">充值货币 *</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as "USD" | "CNY" | "HKD" }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
            >
              <option value="USD">USD (美元)</option>
              <option value="CNY">CNY (人民币)</option>
              <option value="HKD">HKD (港币)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">充值金额 *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                {form.currency === "USD" ? "$" : form.currency === "CNY" ? "¥" : "HK$"}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => {
                  const value = e.target.value;
                  setForm((f) => ({ ...f, amount: value }));
                  const numValue = Number(value);
                  const hasError = value !== "" && (isNaN(numValue) || numValue <= 0);
                  setAmountError(hasError);
                  if (!hasError && value !== "") setPreviewKey((prev) => prev + 1);
                }}
                onBlur={(e) => {
                  const numValue = Number(e.target.value);
                  const hasError = e.target.value !== "" && (isNaN(numValue) || numValue <= 0);
                  setAmountError(hasError);
                }}
                className={`w-full rounded-md border pl-8 pr-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300 ${
                  amountError ? "border-rose-500 bg-slate-900/50 error" : "border-white/10 bg-slate-900/50"
                }`}
                placeholder="0.00"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">充值日期 *</label>
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
            <label className="block text-sm font-medium text-slate-300 mb-1">充值凭证 *</label>
            <ImageUploader
              value={form.voucher || ""}
              onChange={(value) => {
                const voucherValue = typeof value === "string" ? value : (Array.isArray(value) ? value[0] || "" : "");
                setForm((f) => ({ ...f, voucher: voucherValue }));
              }}
              maxImages={1}
              multiple={false}
            />
            <p className="text-xs text-slate-400 mt-1">请上传充值凭证（如转账截图、支付凭证等）</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              placeholder="可选备注信息"
            />
          </div>
          {showPreview && (
            <div key={previewKey} className="rounded-lg bg-slate-900/40 backdrop-blur-md border border-white/10 p-5 space-y-3 shadow-glow-blue">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 text-sm">实付金额（本金）：</span>
                <span className="text-[#00E5FF] font-bold text-lg number-preview">
                  {formatAmount(amount, form.currency)}
                </span>
              </div>
              {rebateRate > 0 && rebateAmount > 0 && (
                <>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-300 text-sm flex items-center gap-1">
                        待结返点（应收账款）
                        <span className="text-xs text-amber-400/80">ℹ️</span>
                      </span>
                      <span className="text-xs text-slate-500 leading-tight">
                        返点不计入账户余额，将作为应收账款独立核算
                      </span>
                    </div>
                    <span className="text-amber-400 font-bold text-base number-preview">
                      {formatAmount(rebateAmount, form.currency)}
                    </span>
                  </div>
                  <div className="border-t border-white/10 pt-3" />
                </>
              )}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">当前可用余额：</span>
                  <span className="text-slate-100 font-medium text-sm">
                    {formatAmount(currentBalance, rechargeAccount.currency)}
                  </span>
                </div>
                {currentRebateReceivable > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-xs">当前待结返点：</span>
                    <span className="text-amber-400 font-medium text-sm">
                      {formatAmount(currentRebateReceivable, rechargeAccount.currency)}
                    </span>
                  </div>
                )}
              </div>
              <div className="border-t border-cyan-500/20 pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-medium text-sm">充值后可用余额：</span>
                  <span className="text-[#00E5FF] font-bold text-xl number-preview">
                    {formatAmount(newBalance, rechargeAccount.currency)}
                  </span>
                </div>
                {rebateRate > 0 && rebateAmount > 0 && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-slate-300 font-medium text-sm">充值后待结返点：</span>
                    <span className="text-amber-400 font-bold text-base number-preview">
                      {formatAmount(newRebateReceivable, rechargeAccount.currency)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
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
              disabled={amountError || !form.amount || Number(form.amount) <= 0}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#00E5FF] via-[#3D5AFE] to-[#00E5FF] text-slate-900 font-bold hover:shadow-[0_0_20px_rgba(0,150,255,0.4)] transition-all duration-300 shadow-[0_0_20px_rgba(0,150,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[0_0_20px_rgba(0,150,255,0.3)]"
            >
              确认充值
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
