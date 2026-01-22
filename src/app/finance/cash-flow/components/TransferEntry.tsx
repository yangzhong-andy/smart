"use client";

import { useState, useMemo, useEffect } from "react";
import { type BankAccount } from "@/lib/finance-store";
import type { CashFlow } from "../page";
import { toast } from "sonner";
import { enrichWithUID } from "@/lib/business-utils";

type TransferEntryProps = {
  accounts: BankAccount[];
  onClose: () => void;
  onSave: (flow: CashFlow) => void;
};

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.0000";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
};

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export default function TransferEntry({ accounts, onClose, onSave }: TransferEntryProps) {
  const [form, setForm] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    manualRate: false,
    exchangeRate: "",
    actualReceived: "",
    remark: ""
  });

  useEffect(() => {
    if (accounts.length >= 2) {
      setForm((f) => ({
        ...f,
        fromAccountId: accounts[0].id,
        toAccountId: accounts[1].id
      }));
    }
  }, [accounts]);

  const fromAccount = accounts.find((a) => a.id === form.fromAccountId);
  const toAccount = accounts.find((a) => a.id === form.toAccountId);

  // 自动计算汇率
  const calculatedRate = useMemo(() => {
    if (!fromAccount || !toAccount) return 0;
    if (fromAccount.currency === toAccount.currency) return 1;
    if (fromAccount.currency === "RMB") {
      return toAccount.exchangeRate > 0 ? 1 / toAccount.exchangeRate : 0;
    }
    if (toAccount.currency === "RMB") {
      return fromAccount.exchangeRate;
    }
    if (fromAccount.exchangeRate > 0 && toAccount.exchangeRate > 0) {
      return fromAccount.exchangeRate / toAccount.exchangeRate;
    }
    return 0;
  }, [fromAccount, toAccount]);

  // 计算实收金额
  const calculatedReceived = useMemo(() => {
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) return 0;
    const rate = form.manualRate ? Number(form.exchangeRate) : calculatedRate;
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return amount * rate;
  }, [form.amount, form.manualRate, form.exchangeRate, calculatedRate]);

  // 反向倒推汇率
  const reverseCalculatedRate = useMemo(() => {
    const amount = Number(form.amount);
    const received = Number(form.actualReceived);
    if (Number.isNaN(amount) || Number.isNaN(received) || amount <= 0 || received <= 0) return 0;
    return received / amount;
  }, [form.amount, form.actualReceived]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.fromAccountId || !form.toAccountId) {
      toast.error("请选择转出和转入账户");
      return;
    }
    if (form.fromAccountId === form.toAccountId) {
      toast.error("转出和转入账户不能相同");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("划拨金额需大于 0");
      return;
    }
    if (!fromAccount || !toAccount) {
      toast.error("账户不存在");
      return;
    }
    // 计算转出账户总余额 = 初始资金 + 当前余额
    const fromAccountTotalBalance = (fromAccount.initialCapital || 0) + (fromAccount.originalBalance || 0);
    if (fromAccountTotalBalance < amount) {
      toast.error("转出账户余额不足");
      return;
    }

    const finalRate = form.manualRate
      ? Number(form.exchangeRate)
      : form.actualReceived
        ? reverseCalculatedRate
        : calculatedRate;

    if (!Number.isFinite(finalRate) || finalRate <= 0) {
      toast.error("汇率无效");
      return;
    }

    const receivedAmount = form.actualReceived ? Number(form.actualReceived) : calculatedReceived;
    if (receivedAmount <= 0) {
      toast.error("实收金额无效");
      return;
    }

    const transferId = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // 生成两条关联记录
    const outFlow: CashFlow = {
      id: crypto.randomUUID(),
      date: today,
      summary: `内部划拨 - 转出至 ${toAccount.name}`,
      type: "expense",
      category: "内部划拨",
      amount: -amount,
      accountId: form.fromAccountId,
      accountName: fromAccount.name,
      currency: fromAccount.currency,
      remark: `划拨至 ${toAccount.name}，汇率 ${formatNumber(finalRate)}${form.manualRate ? "（手动汇率）" : ""}，${form.remark || ""}`,
      status: "confirmed",
      relatedId: transferId,
      createdAt: now
    };

    const inFlow: CashFlow = {
      id: crypto.randomUUID(),
      date: today,
      summary: `内部划拨 - 从 ${fromAccount.name} 转入`,
      type: "income",
      category: "内部划拨",
      amount: receivedAmount,
      accountId: form.toAccountId,
      accountName: toAccount.name,
      currency: toAccount.currency,
      remark: `从 ${fromAccount.name} 划拨，汇率 ${formatNumber(finalRate)}${form.manualRate ? "（手动汇率）" : ""}，${form.remark || ""}`,
      status: "confirmed",
      relatedId: transferId,
      createdAt: now
    };

    // 自动生成唯一业务ID
    const outFlowWithUID = enrichWithUID(outFlow, "CASH_FLOW");
    const inFlowWithUID = enrichWithUID(inFlow, "CASH_FLOW");
    
    // 保存两条记录
    onSave(outFlowWithUID);
    // 延迟保存第二条，确保账户余额正确更新
    setTimeout(() => onSave(inFlowWithUID), 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">内部划拨</h2>
            <p className="text-xs text-slate-400 mt-1">支持手动汇率和到账金额倒推</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-slate-300">转出账户</span>
              <select
                value={form.fromAccountId}
                onChange={(e) => setForm((f) => ({ ...f, fromAccountId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                required
              >
                <option value="">请选择账户</option>
                {(() => {
                  // 按币种分组
                  const groupedAccounts = accounts.reduce((acc, account) => {
                    const currency = account.currency || "OTHER";
                    if (!acc[currency]) {
                      acc[currency] = [];
                    }
                    acc[currency].push(account);
                    return acc;
                  }, {} as Record<string, typeof accounts>);

                  const currencyOrder = ["RMB", "USD", "JPY", "EUR", "GBP", "HKD", "SGD", "AUD"];
                  const sortedCurrencies = Object.keys(groupedAccounts).sort((a, b) => {
                    const aIndex = currencyOrder.indexOf(a);
                    const bIndex = currencyOrder.indexOf(b);
                    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
                    if (aIndex === -1) return 1;
                    if (bIndex === -1) return -1;
                    return aIndex - bIndex;
                  });

                  return sortedCurrencies.flatMap((currency) => {
                    const currencyAccounts = groupedAccounts[currency];
                    const currencyLabel = currency === "RMB" ? "人民币" : currency === "USD" ? "美元" : currency === "JPY" ? "日元" : currency;
                    
                    return [
                      <optgroup key={`group-${currency}`} label={`━━━ ${currencyLabel} (${currency}) ━━━`}>
                        {currencyAccounts.map((acc) => {
                          const displayBalance = (acc.initialCapital || 0) + (acc.originalBalance || 0);
                          let balanceText = "";
                          if (acc.currency === "RMB") {
                            balanceText = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(displayBalance);
                          } else if (acc.currency === "USD") {
                            balanceText = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD" }).format(displayBalance);
                          } else {
                            balanceText = `${acc.currency} ${displayBalance.toLocaleString("zh-CN")}`;
                          }
                          return (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} | 余额: {balanceText}
                            </option>
                          );
                        })}
                      </optgroup>
                    ];
                  });
                })()}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">转入账户</span>
              <select
                value={form.toAccountId}
                onChange={(e) => setForm((f) => ({ ...f, toAccountId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                required
              >
                <option value="">请选择账户</option>
                {(() => {
                  const availableAccounts = accounts.filter((acc) => acc.id !== form.fromAccountId);
                  // 按币种分组
                  const groupedAccounts = availableAccounts.reduce((acc, account) => {
                    const currency = account.currency || "OTHER";
                    if (!acc[currency]) {
                      acc[currency] = [];
                    }
                    acc[currency].push(account);
                    return acc;
                  }, {} as Record<string, typeof availableAccounts>);

                  const currencyOrder = ["RMB", "USD", "JPY", "EUR", "GBP", "HKD", "SGD", "AUD"];
                  const sortedCurrencies = Object.keys(groupedAccounts).sort((a, b) => {
                    const aIndex = currencyOrder.indexOf(a);
                    const bIndex = currencyOrder.indexOf(b);
                    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
                    if (aIndex === -1) return 1;
                    if (bIndex === -1) return -1;
                    return aIndex - bIndex;
                  });

                  return sortedCurrencies.flatMap((currency) => {
                    const currencyAccounts = groupedAccounts[currency];
                    const currencyLabel = currency === "RMB" ? "人民币" : currency === "USD" ? "美元" : currency === "JPY" ? "日元" : currency;
                    
                    return [
                      <optgroup key={`group-${currency}`} label={`━━━ ${currencyLabel} (${currency}) ━━━`}>
                        {currencyAccounts.map((acc) => {
                          const displayBalance = (acc.initialCapital || 0) + (acc.originalBalance || 0);
                          let balanceText = "";
                          if (acc.currency === "RMB") {
                            balanceText = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(displayBalance);
                          } else if (acc.currency === "USD") {
                            balanceText = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD" }).format(displayBalance);
                          } else {
                            balanceText = `${acc.currency} ${displayBalance.toLocaleString("zh-CN")}`;
                          }
                          return (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} | 余额: {balanceText}
                            </option>
                          );
                        })}
                      </optgroup>
                    ];
                  });
                })()}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">划拨金额（原币）</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="0.00"
                required
              />
              {fromAccount && (
                <div className="text-xs text-slate-500 mt-1">转出币种：{fromAccount.currency}</div>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">实收金额（目标币种）</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.actualReceived}
                onChange={(e) => setForm((f) => ({ ...f, actualReceived: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="留空则自动计算"
              />
              {toAccount && form.actualReceived && (
                <div className="text-xs text-slate-500 mt-1">
                  转入币种：{toAccount.currency}
                  <span className="text-amber-300 ml-2">反推汇率：{formatNumber(reverseCalculatedRate)}</span>
                </div>
              )}
            </label>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.manualRate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    manualRate: e.target.checked,
                    exchangeRate: e.target.checked ? formatNumber(calculatedRate) : ""
                  }))
                }
                className="text-primary-500"
              />
              <span className="text-sm text-slate-300">手动输入结算汇率</span>
            </label>
            {form.manualRate && (
              <label className="space-y-1">
                <span className="text-sm text-slate-300">结算汇率</span>
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={form.exchangeRate}
                  onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="如：7.2500"
                  required
                />
                <div className="text-xs text-slate-500 mt-1">参考汇率：{formatNumber(calculatedRate)}（自动计算）</div>
              </label>
            )}
            {!form.manualRate && !form.actualReceived && (
              <div className="text-sm text-slate-300">
                <div>参考汇率：{formatNumber(calculatedRate)}（自动计算）</div>
                <div className="mt-1 text-xs text-slate-500">
                  预计实收：{toAccount ? currency(calculatedReceived, toAccount.currency) : "-"}
                </div>
              </div>
            )}
          </div>

          <label className="space-y-1 block">
            <span className="text-sm text-slate-300">备注</span>
            <input
              value={form.remark}
              onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              placeholder="可选"
            />
          </label>

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
              className="rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-blue-600 active:translate-y-px"
              disabled={!form.fromAccountId || !form.toAccountId || !form.amount}
            >
              确认划拨
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
