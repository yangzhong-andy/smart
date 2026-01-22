"use client";

import { useState, useMemo, useEffect } from "react";
import { type BankAccount, getAccounts } from "@/lib/finance-store";
import { type Store, getStores } from "@/lib/store-store";
import type { CashFlow } from "../page";
import { toast } from "sonner";
import { enrichWithUID } from "@/lib/business-utils";
import { INCOME_CATEGORIES, getIncomeSubCategories, type IncomeSubCategory } from "@/lib/income-categories";

type IncomeEntryProps = {
  accounts: BankAccount[];
  onClose: () => void;
  onSave: (flow: CashFlow) => void;
};

export default function IncomeEntry({ accounts, onClose, onSave }: IncomeEntryProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    summary: "",
    primaryCategory: "", // 一级分类
    subCategory: "", // 二级分类
    amount: "",
    storeId: "",
    accountId: "",
    remark: ""
  });
  
  // 获取当前一级分类下的二级分类选项
  const availableSubCategories = useMemo(() => {
    if (!form.primaryCategory) return [];
    return getIncomeSubCategories(form.primaryCategory);
  }, [form.primaryCategory]);

  // 计算最终分类值（用于保存）
  const finalCategory = useMemo(() => {
    if (form.subCategory) {
      return form.subCategory; // 格式：一级分类/二级分类
    }
    return form.primaryCategory; // 只有一级分类
  }, [form.primaryCategory, form.subCategory]);

  useEffect(() => {
    const loaded = getStores();
    setStores(loaded);
  }, []);

  // 根据选择的店铺自动带出币种和关联账户
  const selectedStore = useMemo(() => {
    return stores.find((s) => s.id === form.storeId);
  }, [stores, form.storeId]);

  // 根据店铺自动匹配虚拟子账号
  useEffect(() => {
    if (selectedStore) {
      // 优先查找绑定该店铺的虚拟子账号
      const virtualAccount = accounts.find(
        (acc) => acc.accountCategory === "VIRTUAL" && acc.storeId === selectedStore.id
      );
      if (virtualAccount) {
        setForm((f) => ({
          ...f,
          accountId: virtualAccount.id
        }));
      } else if (selectedStore.accountId) {
        // 如果没有虚拟子账号，使用店铺关联的账户
        setForm((f) => ({
          ...f,
          accountId: selectedStore.accountId
        }));
      }
    }
  }, [selectedStore, accounts]);

  const selectedAccount = accounts.find((a) => a.id === form.accountId);

  // 计算折算RMB金额
  const rmbAmount = useMemo(() => {
    if (!selectedAccount || !form.amount) return 0;
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) return 0;
    if (selectedAccount.currency === "RMB") return amount;
    return amount * selectedAccount.exchangeRate;
  }, [selectedAccount, form.amount]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.storeId) {
      toast.error("请选择所属店铺");
      return;
    }
    if (!form.accountId) {
      toast.error("请选择收款账户");
      return;
    }
    if (!form.primaryCategory) {
      toast.error("请选择收入分类");
      return;
    }
    if (!form.summary.trim()) {
      toast.error("请填写摘要");
      return;
    }
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("金额需为大于 0 的数字");
      return;
    }
    const account = accounts.find((a) => a.id === form.accountId);
    if (!account) {
      toast.error("账户不存在");
      return;
    }

    const newFlow: CashFlow = {
      id: crypto.randomUUID(),
      date: form.date,
      summary: form.summary.trim(),
      type: "income",
      category: finalCategory,
      amount: amount,
      accountId: form.accountId,
      accountName: account.name,
      currency: account.currency,
      remark: `${selectedStore?.name || ""} - ${form.remark.trim()}`,
      status: "confirmed",
      createdAt: new Date().toISOString()
    };

    // 自动生成唯一业务ID
    const flowWithUID = enrichWithUID(newFlow, "CASH_FLOW");
    onSave(flowWithUID);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">登记收入</h2>
            <p className="text-xs text-slate-400 mt-1">选择店铺后自动带出币种和关联账户，自动折算RMB</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-slate-300">日期</span>
              <input
                type="date"
                lang="zh-CN"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">一级分类 <span className="text-rose-400">*</span></span>
              <select
                value={form.primaryCategory}
                onChange={(e) => {
                  setForm((f) => ({ 
                    ...f, 
                    primaryCategory: e.target.value, 
                    subCategory: "" // 清空二级分类
                  }));
                }}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              >
                <option value="">请选择一级分类</option>
                {INCOME_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </label>
            {form.primaryCategory && availableSubCategories.length > 0 && (
              <label className="space-y-1">
                <span className="text-slate-300">二级分类</span>
                <select
                  value={form.subCategory}
                  onChange={(e) => setForm((f) => ({ ...f, subCategory: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="">不选择二级分类（使用一级分类）</option>
                  {availableSubCategories.map((sub) => (
                    <option key={sub.value} value={sub.value}>
                      {sub.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="space-y-1 col-span-2">
              <span className="text-slate-300">所属店铺 <span className="text-rose-400">*</span></span>
              <select
                value={form.storeId}
                onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value, accountId: "" }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              >
                <option value="">请选择</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name} ({store.platform}) - {store.currency}
                  </option>
                ))}
              </select>
              {stores.length === 0 && (
                <div className="text-xs text-amber-400 mt-1">
                  暂无店铺，请先前往"设置 - 店铺管理"创建店铺
                </div>
              )}
              {selectedStore && (
                <div className="text-xs text-emerald-400 mt-1">
                  已自动关联账户：{selectedStore.accountName} ({selectedStore.currency})
                </div>
              )}
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-slate-300">收款账户 <span className="text-rose-400">*</span></span>
              <select
                value={form.accountId}
                onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
                disabled={!selectedStore}
              >
                <option value="">请选择</option>
                {selectedStore && (
                  <option value={selectedStore.accountId}>
                    {selectedStore.accountName} ({selectedStore.currency})
                  </option>
                )}
              </select>
              {selectedStore && selectedAccount && (
                <div className="text-xs text-slate-500 mt-1">
                  币种：{selectedStore.currency} | 汇率：{selectedAccount.exchangeRate} | 折算RMB：¥{rmbAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-slate-300">摘要 <span className="text-rose-400">*</span></span>
              <input
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="简要描述本次收入"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">
                回款金额 <span className="text-rose-400">*</span> ({selectedStore?.currency || "原币"})
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              />
              {selectedStore && form.amount && (
                <div className="text-xs text-slate-400 mt-1">
                  折算RMB：¥{rmbAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">备注</span>
              <input
                value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="可选"
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
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-emerald-600 active:translate-y-px"
              disabled={!accounts.length}
            >
              确认登记
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
