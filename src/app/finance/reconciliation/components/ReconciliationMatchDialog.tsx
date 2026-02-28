"use client";

import ImageUploader from "@/components/ImageUploader";
import { formatCurrency } from "./types";

export type EntryFormState = {
  accountId: string;
  entryDate: string;
  voucher: string | string[];
};

type PendingEntryLike = {
  id: string;
  type: string;
  billType?: string;
  billCategory?: string;
  netAmount: number;
  currency: string;
  agencyName?: string;
  supplierName?: string;
  factoryName?: string;
  expenseItem?: string;
  month?: string;
  approvedBy?: string;
  approvedAt?: string;
  relatedId?: string;
};

type BankAccountLike = {
  id: string;
  name: string;
  currency: string;
  originalBalance?: number;
  accountCategory?: string;
  parentId?: string;
  accountNumber?: string;
  accountPurpose?: string;
};

interface ReconciliationMatchDialogProps {
  open: boolean;
  pendingEntry: PendingEntryLike | null;
  form: EntryFormState;
  setForm: React.Dispatch<React.SetStateAction<EntryFormState>>;
  bankAccounts: BankAccountLike[];
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

export function ReconciliationMatchDialog({
  open,
  pendingEntry,
  form,
  setForm,
  bankAccounts,
  onClose,
  onConfirm,
  isSubmitting = false,
}: ReconciliationMatchDialogProps) {
  if (!open || !pendingEntry) return null;

  const entryCurrency = pendingEntry.currency;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md" style={{ position: "relative", zIndex: 51 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-100">处理入账</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-slate-800/60 rounded-lg p-4 space-y-2">
            <div className="text-sm text-slate-400">任务信息</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-400">类型：</span>
                <span className="text-slate-100 ml-2">
                  {pendingEntry.type === "Bill" ? (pendingEntry.billType || "账单") : "付款申请"}
                </span>
              </div>
              <div>
                <span className="text-slate-400">金额：</span>
                <span className={`font-medium ml-2 ${pendingEntry.billCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatCurrency(pendingEntry.netAmount, pendingEntry.currency, pendingEntry.billCategory === "Receivable" ? "income" : "expense")}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">服务方/项目：</span>
                <span className="text-slate-100 ml-2">
                  {pendingEntry.type === "Bill"
                    ? pendingEntry.billCategory === "Payable"
                      ? (pendingEntry.agencyName || pendingEntry.supplierName || pendingEntry.factoryName || "-")
                      : (pendingEntry.agencyName || "-")
                    : (pendingEntry.expenseItem || "-")}
                </span>
              </div>
              <div>
                <span className="text-slate-400">审批人：</span>
                <span className="text-slate-100 ml-2">{pendingEntry.approvedBy}</span>
              </div>
              <div>
                <span className="text-slate-400">审批时间：</span>
                <span className="text-slate-100 ml-2 text-xs">
                  {new Date(pendingEntry.approvedAt || "").toLocaleString("zh-CN")}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">入账账户 *</label>
            <select
              value={form.accountId}
              onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              required
            >
              <option value="">请选择入账账户</option>
              {bankAccounts
                .filter((acc) => acc.currency === entryCurrency || acc.currency === "RMB")
                .sort((a, b) => {
                  const aMatch = a.currency === entryCurrency;
                  const bMatch = b.currency === entryCurrency;
                  if (aMatch && !bMatch) return -1;
                  if (!aMatch && bMatch) return 1;
                  return (a.name || "").localeCompare(b.name || "", "zh-CN");
                })
                .map((acc) => {
                  const accountTypeLabel = acc.accountCategory === "PRIMARY" ? "主账户" : acc.accountCategory === "VIRTUAL" ? "虚拟子账号" : "独立账户";
                  const parentAccount = acc.parentId ? bankAccounts.find((a) => a.id === acc.parentId) : null;
                  const displayName = parentAccount ? `${acc.name} (${parentAccount.name}的子账号)` : acc.name;
                  return (
                    <option key={acc.id} value={acc.id}>
                      {displayName} - {accountTypeLabel} - {acc.currency} - 余额: {formatCurrency(acc.originalBalance || 0, acc.currency, "balance")}
                    </option>
                  );
                })}
            </select>
            {form.accountId && (() => {
              const selectedAccount = bankAccounts.find((a) => a.id === form.accountId);
              if (!selectedAccount) return null;
              return (
                <div className="mt-2 text-xs text-slate-400 bg-slate-800/40 rounded p-2">
                  <div>账户名称: {selectedAccount.name}</div>
                  <div>账户类型: {selectedAccount.accountCategory === "PRIMARY" ? "主账户" : selectedAccount.accountCategory === "VIRTUAL" ? "虚拟子账号" : "独立账户"}</div>
                  {selectedAccount.parentId && (() => {
                    const parent = bankAccounts.find((a) => a.id === selectedAccount.parentId);
                    return parent ? <div>父账户: {parent.name}</div> : null;
                  })()}
                  <div>币种: {selectedAccount.currency}</div>
                  <div>账号: {selectedAccount.accountNumber || "-"}</div>
                  <div>用途: {selectedAccount.accountPurpose || "-"}</div>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">入账日期 *</label>
            <input
              type="date"
              lang="zh-CN"
              value={form.entryDate}
              onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400 cursor-pointer"
              style={{ colorScheme: "dark", position: "relative", zIndex: 10 }}
              required
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">凭证</label>
            <ImageUploader
              value={form.voucher}
              onChange={(value) => setForm((f) => ({ ...f, voucher: value }))}
              multiple={false}
              label="上传凭证"
              placeholder="点击上传凭证或直接 Ctrl + V 粘贴图片"
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "处理中…" : "确认入账"}
          </button>
        </div>
      </div>
    </div>
  );
}
