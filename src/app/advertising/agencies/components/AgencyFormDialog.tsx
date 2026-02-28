"use client";

import type { Agency } from "@/lib/ad-agency-store";
import type { AgencyFormState } from "./types";
import { AGENCY_PLATFORM_OPTIONS } from "./types";

interface AgencyFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editingAgency: Agency | null;
  form: AgencyFormState;
  setForm: React.Dispatch<React.SetStateAction<AgencyFormState>>;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function AgencyFormDialog({
  isOpen,
  onClose,
  editingAgency,
  form,
  setForm,
  isSubmitting,
  onSubmit,
}: AgencyFormDialogProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-100">
            {editingAgency ? "编辑代理商" : "新增代理商"}
          </h2>
          <button type="button" onClick={handleClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">代理商名称 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">平台 *</label>
            <select
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Agency["platform"] }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
            >
              {AGENCY_PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">返点比例 (%) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.rebateRate}
                onChange={(e) => setForm((f) => ({ ...f, rebateRate: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">返点周期 *</label>
              <select
                value={form.rebatePeriod}
                onChange={(e) => setForm((f) => ({ ...f, rebatePeriod: e.target.value as "月" | "季" }))}
                className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              >
                <option value="月">月度</option>
                <option value="季">季度</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">结算币种</label>
            <select
              value={form.settlementCurrency}
              onChange={(e) => setForm((f) => ({ ...f, settlementCurrency: e.target.value as "USD" | "CNY" }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
            >
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">账期规则</label>
            <input
              type="text"
              value={form.creditTerm}
              onChange={(e) => setForm((f) => ({ ...f, creditTerm: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
              placeholder="例如：本月消耗，次月第15天结算"
            />
            <div className="text-xs text-slate-500 mt-1">
              格式：本月消耗，次月第X天结算（X为1-31之间的数字）
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">联系人</label>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">联系电话</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
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
              className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md bg-[#00E5FF] text-slate-900 font-semibold hover:bg-[#00B8CC] transition-all duration-200 shadow-lg shadow-[#00E5FF]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingAgency ? "更新" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
