"use client";

import { useEffect, useMemo, useState } from "react";
import { type BankAccount, getAccounts, saveAccounts, updateAccountBalance } from "@/lib/finance-store";

const CASH_FLOW_KEY = "cashFlow";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
};

type TransferForm = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  manualRate: boolean;
  exchangeRate: string;
  actualReceived: string;
  remark: string;
};

export default function InternalTransferPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [form, setForm] = useState<TransferForm>({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    manualRate: false,
    exchangeRate: "",
    actualReceived: "",
    remark: ""
  });

  useEffect(() => {
    const loaded = getAccounts();
    setAccounts(loaded);
    if (loaded.length >= 2) {
      setForm((f) => ({
        ...f,
        fromAccountId: loaded[0].id,
        toAccountId: loaded[1].id
      }));
    }
  }, []);

  const fromAccount = accounts.find((a) => a.id === form.fromAccountId);
  const toAccount = accounts.find((a) => a.id === form.toAccountId);

  // 自动计算汇率（如果未手动输入）
  const calculatedRate = useMemo(() => {
    if (!fromAccount || !toAccount) return 0;
    if (fromAccount.currency === toAccount.currency) return 1;
    if (fromAccount.currency === "RMB") {
      // 从RMB转出，使用目标币种的汇率倒数
      return toAccount.exchangeRate > 0 ? 1 / toAccount.exchangeRate : 0;
    }
    if (toAccount.currency === "RMB") {
      // 转入RMB，使用源币种的汇率
      return fromAccount.exchangeRate;
    }
    // 跨币种：通过RMB中转
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
      alert("请选择转出和转入账户");
      return;
    }
    if (form.fromAccountId === form.toAccountId) {
      alert("转出和转入账户不能相同");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      alert("划拨金额需大于 0");
      return;
    }
    if (!fromAccount || !toAccount) {
      alert("账户不存在");
      return;
    }
    if (fromAccount.originalBalance < amount) {
      alert("转出账户余额不足");
      return;
    }

    const finalRate = form.manualRate
      ? Number(form.exchangeRate)
      : form.actualReceived
        ? reverseCalculatedRate
        : calculatedRate;

    if (!Number.isFinite(finalRate) || finalRate <= 0) {
      alert("汇率无效");
      return;
    }

    const receivedAmount = form.actualReceived ? Number(form.actualReceived) : calculatedReceived;
    if (receivedAmount <= 0) {
      alert("实收金额无效");
      return;
    }

    // 更新账户余额
    const updatedAccounts = accounts.map((acc) => {
      if (acc.id === form.fromAccountId) {
        return {
          ...acc,
          originalBalance: acc.originalBalance - amount,
          rmbBalance: (acc.originalBalance - amount) * (acc.currency === "RMB" ? 1 : acc.exchangeRate)
        };
      }
      if (acc.id === form.toAccountId) {
        return {
          ...acc,
          originalBalance: acc.originalBalance + receivedAmount,
          rmbBalance: (acc.originalBalance + receivedAmount) * (acc.currency === "RMB" ? 1 : acc.exchangeRate)
        };
      }
      return acc;
    });
    setAccounts(updatedAccounts);
    saveAccounts(updatedAccounts);

    // 生成两条关联流水记录
    const transferId = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const storedFlow = typeof window !== "undefined" ? window.localStorage.getItem(CASH_FLOW_KEY) : null;
    const flowList = storedFlow ? JSON.parse(storedFlow) : [];

    // 转出记录
    flowList.push({
      id: crypto.randomUUID(),
      date: today,
      type: "expense",
      category: "内部划拨",
      amount: -amount,
      accountId: form.fromAccountId,
      accountName: fromAccount.name,
      currency: fromAccount.currency,
      remark: `划拨至 ${toAccount.name}，汇率 ${formatNumber(finalRate)}${form.manualRate ? "（手动汇率）" : ""}，${form.remark || ""}`,
      relatedId: transferId,
      createdAt: now
    });

    // 转入记录
    flowList.push({
      id: crypto.randomUUID(),
      date: today,
      type: "income",
      category: "内部划拨",
      amount: receivedAmount,
      accountId: form.toAccountId,
      accountName: toAccount.name,
      currency: toAccount.currency,
      remark: `从 ${fromAccount.name} 划拨，汇率 ${formatNumber(finalRate)}${form.manualRate ? "（手动汇率）" : ""}，${form.remark || ""}`,
      relatedId: transferId,
      createdAt: now
    });

    if (typeof window !== "undefined") {
      window.localStorage.setItem(CASH_FLOW_KEY, JSON.stringify(flowList));
    }

    alert("划拨成功！已自动更新账户余额并生成流水记录。");
    setForm({
      fromAccountId: form.fromAccountId,
      toAccountId: form.toAccountId,
      amount: "",
      manualRate: false,
      exchangeRate: "",
      actualReceived: "",
      remark: ""
    });
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">内部划拨</h1>
          <p className="mt-1 text-sm text-slate-400">
            支持跨币种划拨，手动输入结算汇率，自动更新账户余额并生成关联流水
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-sm text-slate-300">转出账户</span>
              <select
                value={form.fromAccountId}
                onChange={(e) => setForm((f) => ({ ...f, fromAccountId: e.target.value }))}
                className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
                required
              >
                <option value="">请选择</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency}) - 余额{" "}
                    {acc.currency === "RMB"
                      ? currency(acc.originalBalance, "CNY")
                      : acc.currency === "USD"
                        ? currency(acc.originalBalance, "USD")
                        : acc.currency === "JPY"
                          ? `¥${formatNumber(acc.originalBalance)}`
                          : currency(acc.originalBalance, acc.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">转入账户</span>
              <select
                value={form.toAccountId}
                onChange={(e) => setForm((f) => ({ ...f, toAccountId: e.target.value }))}
                className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
                required
              >
                <option value="">请选择</option>
                {accounts
                  .filter((acc) => acc.id !== form.fromAccountId)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency}) - 余额{" "}
                      {acc.currency === "RMB"
                        ? currency(acc.originalBalance, "CNY")
                        : acc.currency === "USD"
                          ? currency(acc.originalBalance, "USD")
                          : acc.currency === "JPY"
                            ? `¥${formatNumber(acc.originalBalance)}`
                            : currency(acc.originalBalance, acc.currency)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">划拨金额（原币）</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
                placeholder="0.00"
                required
              />
              {fromAccount && (
                <div className="text-xs text-slate-500 mt-1">
                  转出币种：{fromAccount.currency}
                </div>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-300">实收金额（目标币种）</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.actualReceived}
                onChange={(e) => setForm((f) => ({ ...f, actualReceived: e.target.value }))}
                className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
                placeholder="留空则自动计算"
              />
              {toAccount && (
                <div className="text-xs text-slate-500 mt-1">
                  转入币种：{toAccount.currency}
                  {form.actualReceived && (
                    <span className="text-amber-300 ml-2">
                      反推汇率：{formatNumber(reverseCalculatedRate)}
                    </span>
                  )}
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
                  className="w-full rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
                  placeholder="如：7.2500"
                  required
                />
                <div className="text-xs text-slate-500 mt-1">
                  参考汇率：{formatNumber(calculatedRate)}（自动计算）
                </div>
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
              type="submit"
              className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
              disabled={!form.fromAccountId || !form.toAccountId || !form.amount}
            >
              确认划拨
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
