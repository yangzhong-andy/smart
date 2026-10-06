"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, History, ShieldCheck, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import type { BankAccount } from "@/lib/finance-store";

type FlowSummary = {
  id: string;
  date: string;
  summary: string;
  amount: number;
  currency: string;
  accountId: string;
  accountName: string;
};

type ChangeLog = {
  id: string;
  oldAccountName: string;
  newAccountName: string;
  reason: string;
  changedByName: string;
  changedByEmail: string;
  createdAt: string;
};

type Props = {
  flow: FlowSummary | null;
  accounts: BankAccount[];
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
};

function normalizedCurrency(value: string): string {
  const currency = String(value || "").trim().toUpperCase();
  return currency === "RMB" ? "CNY" : currency;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: normalizedCurrency(currency),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount));
  } catch {
    return `${Math.abs(amount).toFixed(2)} ${currency}`;
  }
}

function accountOptionLabel(account: BankAccount): string {
  const numberSuffix = account.accountNumber
    ? ` · 尾号 ${account.accountNumber.replace(/\s/g, "").slice(-4)}`
    : "";
  const purpose = account.accountPurpose ? ` · ${account.accountPurpose}` : "";
  return `${account.name}${numberSuffix}${purpose}`;
}

export default function CashFlowAccountChangeDialog({
  flow,
  accounts,
  onClose,
  onSuccess,
}: Props) {
  const [newAccountId, setNewAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ChangeLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const currentAccount = useMemo(
    () => accounts.find((account) => account.id === flow?.accountId),
    [accounts, flow?.accountId],
  );
  const availableAccounts = useMemo(() => {
    if (!flow) return [];
    const currency = normalizedCurrency(flow.currency);
    return accounts
      .filter(
        (account) =>
          account.id !== flow.accountId &&
          normalizedCurrency(account.currency) === currency,
      )
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [accounts, flow]);
  const newAccount = useMemo(
    () => availableAccounts.find((account) => account.id === newAccountId),
    [availableAccounts, newAccountId],
  );

  useEffect(() => {
    if (!flow) return;
    setNewAccountId("");
    setReason("");
    setHistory([]);
    setHistoryLoading(true);

    const controller = new AbortController();
    fetch(`/api/cash-flow/${flow.id}/account`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "修改记录读取失败");
        setHistory(Array.isArray(data.data) ? data.data : []);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          toast.error(error?.message || "修改记录读取失败");
        }
      })
      .finally(() => setHistoryLoading(false));

    return () => controller.abort();
  }, [flow]);

  useEffect(() => {
    if (!flow) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [flow, onClose, saving]);

  if (!flow) return null;

  const canSubmit = Boolean(newAccount && reason.trim().length >= 4 && !saving);

  const submit = async () => {
    if (!canSubmit || !newAccount) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/cash-flow/${flow.id}/account`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newAccountId: newAccount.id, reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "付款账户修改失败");
      await onSuccess();
      toast.success(`付款账户已修改为：${data.accountName || newAccount.name}`);
      onClose();
    } catch (error: any) {
      toast.error(error?.message || "付款账户修改失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-flow-account-change-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-300">
              <WalletCards className="h-5 w-5" />
            </span>
            <div>
              <h2 id="cash-flow-account-change-title" className="text-base font-semibold text-slate-100">
                修改付款账户
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                仅调整账户归属，不改变金额、汇率、日期、分类和凭证。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-px overflow-hidden rounded-md border border-slate-700 bg-slate-700 sm:grid-cols-3">
            <div className="bg-slate-900 px-3 py-3">
              <div className="text-xs text-slate-500">业务日期</div>
              <div className="mt-1 text-sm font-medium text-slate-200">{flow.date.slice(0, 10)}</div>
            </div>
            <div className="bg-slate-900 px-3 py-3">
              <div className="text-xs text-slate-500">付款金额</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-rose-300">
                {money(flow.amount, flow.currency)}
              </div>
            </div>
            <div className="min-w-0 bg-slate-900 px-3 py-3">
              <div className="text-xs text-slate-500">摘要</div>
              <div className="mt-1 truncate text-sm text-slate-200" title={flow.summary}>
                {flow.summary || "-"}
              </div>
            </div>
          </div>

          <div className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-4 py-3">
              <div className="text-xs font-medium text-amber-300">当前付款账户</div>
              <div className="mt-2 break-words text-sm font-semibold text-slate-100">
                {currentAccount?.name || flow.accountName}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {currentAccount
                  ? `${currentAccount.currency} · ${currentAccount.accountPurpose || "未注明用途"}`
                  : flow.currency}
              </div>
            </div>
            <div className="hidden items-center justify-center text-slate-500 sm:flex">
              <ArrowRight className="h-5 w-5" />
            </div>
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3">
              <label htmlFor="new-payment-account" className="text-xs font-medium text-sky-300">
                新付款账户
              </label>
              <select
                id="new-payment-account"
                value={newAccountId}
                onChange={(event) => setNewAccountId(event.target.value)}
                disabled={saving}
                className="mt-2 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 disabled:opacity-60"
              >
                <option value="">请选择同币种账户</option>
                {availableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountOptionLabel(account)}
                  </option>
                ))}
              </select>
              {availableAccounts.length === 0 && (
                <p className="mt-2 text-xs text-amber-300">没有其他 {flow.currency} 账户可供选择。</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="account-change-reason" className="text-sm font-medium text-slate-200">
                修改原因 <span className="text-rose-400">*</span>
              </label>
              <span className="text-xs text-slate-500">{reason.trim().length}/500</span>
            </div>
            <textarea
              id="account-change-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              disabled={saving}
              rows={3}
              placeholder="例如：付款时误选了美克多账户，应归属 TikTok 02 店"
              className="mt-2 w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 disabled:opacity-60"
            />
            {reason.length > 0 && reason.trim().length < 4 && (
              <p className="mt-1 text-xs text-amber-300">请至少填写 4 个字，便于后续审计。</p>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs leading-5 text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>系统会同步账户 ID 和账户名称，并记录原账户、新账户、操作人、时间及修改原因。</span>
          </div>

          <section className="border-t border-slate-800 pt-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <History className="h-4 w-4" />
              历史修改记录
            </div>
            {historyLoading ? (
              <p className="mt-3 text-xs text-slate-500">正在读取...</p>
            ) : history.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">该流水暂无账户修改记录。</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-800 border-y border-slate-800">
                {history.map((item) => (
                  <div key={item.id} className="py-3 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 text-slate-300">
                      <span>{item.oldAccountName}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
                      <span className="font-medium text-sky-300">{item.newAccountName}</span>
                    </div>
                    <div className="mt-1 text-slate-500">
                      {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                      {` · ${item.changedByName || item.changedByEmail} · ${item.reason}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-700 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-md border border-sky-500/40 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "正在修改..." : "确认修改账户"}
          </button>
        </footer>
      </div>
    </div>
  );
}
