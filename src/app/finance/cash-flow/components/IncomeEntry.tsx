"use client";

import { useState, useMemo, useEffect } from "react";
import { type BankAccount } from "@/lib/finance-store";
import { type Store } from "@/lib/store-store";
import type { CashFlow } from "../page";
import { toast } from "sonner";
import { enrichWithUID } from "@/lib/business-utils";
import { INCOME_CATEGORIES, getIncomeSubCategories, type IncomeSubCategory } from "@/lib/income-categories";
import useSWR from "swr";
import ImageUploader from "@/components/ImageUploader";
import { createIncomeRequest, type IncomeRequest } from "@/lib/expense-income-request-store";
import InteractiveButton from "@/components/ui/InteractiveButton";

type IncomeEntryProps = {
  accounts: BankAccount[];
  onClose: () => void;
  onSave: (flow: CashFlow) => void;
};

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function IncomeEntry({ accounts, onClose, onSave }: IncomeEntryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    summary: "",
    primaryCategory: "", // 一级分类
    subCategory: "", // 二级分类
    amount: "",
    storeId: "",
    accountId: "",
    remark: "",
    voucher: "" // 凭证
  });

  // 使用 SWR 从 API 加载店铺数据
  const { data: storesData = [] } = useSWR<Store[]>('/api/stores', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true
  });

  const stores = storesData || [];
  
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
    if (selectedAccount.currency === "CNY" || selectedAccount.currency === "RMB") return amount;
    return amount * selectedAccount.exchangeRate;
  }, [selectedAccount, form.amount]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isSubmitting) {
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

    // 构建备注：如果有店铺，显示店铺名称；否则只显示备注
    let remarkText = "";
    if (selectedStore) {
      remarkText = `${selectedStore.name} - ${form.remark.trim()}`;
    } else {
      remarkText = form.remark.trim();
    }

    // 创建收入申请（需要审批）
    const incomeRequest: IncomeRequest = {
      id: crypto.randomUUID(),
      date: form.date,
      summary: form.summary.trim(),
      category: finalCategory,
      amount: amount,
      currency: account.currency,
      storeId: form.storeId || undefined,
      storeName: selectedStore?.name || undefined,
      remark: remarkText,
      voucher: form.voucher ? (Array.isArray(form.voucher) ? form.voucher : [form.voucher]) : undefined,
      status: "Pending_Approval", // 待审批
      createdBy: "当前用户", // TODO: 从用户系统获取
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString()
    };

    // 自动生成唯一业务ID（如果还没有）
    if (!incomeRequest.uid) {
      incomeRequest.uid = `INC-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    const requestWithUID = incomeRequest;
    
    // 防止重复提交
    setIsSubmitting(true);
    try {
      // 创建收入申请
      await createIncomeRequest(requestWithUID);
      toast.success("收入申请已提交，等待审批");
      // 关闭弹窗
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 1000);
    } catch (error: any) {
      setIsSubmitting(false);
      toast.error(error.message || "提交失败，请重试");
      throw error; // 重新抛出错误，让 InteractiveButton 也能捕获
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">提交收入申请</h2>
            <p className="text-xs text-slate-400 mt-1">提交后需等待审批，审批通过后才能入账</p>
          </div>
          <button 
            onClick={() => {
              setIsSubmitting(false);
              onClose();
            }} 
            className="text-slate-400 hover:text-slate-200"
            disabled={isSubmitting}
          >
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
              <span className="text-slate-300">所属店铺</span>
              <select
                value={form.storeId}
                onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value, accountId: "" }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              >
                <option value="">请选择（可选）</option>
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
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                required
              >
                <option value="">请选择账户</option>
                {(() => {
                  // 按币种分组账户
                  const groupedAccounts = accounts.reduce((acc, account) => {
                    const currency = account.currency || "OTHER";
                    if (!acc[currency]) {
                      acc[currency] = [];
                    }
                    acc[currency].push(account);
                    return acc;
                  }, {} as Record<string, typeof accounts>);

                  // 币种显示顺序
                  const currencyOrder = ["CNY", "USD", "JPY", "EUR", "GBP", "HKD", "SGD", "AUD"];
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
                    const currencyLabel = currency === "CNY" || currency === "RMB" ? "人民币" : currency === "USD" ? "美元" : currency === "JPY" ? "日元" : currency;
                    
                    return [
                      <optgroup key={`group-${currency}`} label={`━━━ ${currencyLabel} (${currency}) ━━━`}>
                        {currencyAccounts.map((account) => {
                          // 显示余额 = originalBalance（已经包含了 initialCapital + 所有流水）
                          const displayBalance = account.originalBalance || 0;
                          const accountTypeLabel = account.accountCategory === "PRIMARY" ? "主账户" : account.accountCategory === "VIRTUAL" ? "虚拟子账号" : "独立账户";
                          
                          // 格式化余额
                          let balanceText = "";
                          if (account.currency === "CNY" || account.currency === "RMB") {
                            balanceText = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(displayBalance);
                          } else if (account.currency === "USD") {
                            balanceText = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD" }).format(displayBalance);
                          } else {
                            balanceText = `${account.currency} ${displayBalance.toLocaleString("zh-CN")}`;
                          }
                          
                          const isRecommended = selectedStore && (
                            (account.accountCategory === "VIRTUAL" && account.storeId === selectedStore.id) ||
                            account.id === selectedStore.accountId
                          );
                          
                          return (
                            <option key={account.id} value={account.id}>
                              {account.name} | {accountTypeLabel} | 余额: {balanceText}{isRecommended ? " ⭐推荐" : ""}
                            </option>
                          );
                        })}
                      </optgroup>
                    ];
                  });
                })()}
              </select>
              {selectedAccount && (() => {
                // 当前余额 = originalBalance（已经包含了 initialCapital + 所有流水）
                const currentBalance = selectedAccount.originalBalance || 0;
                const amount = Number(form.amount) || 0;
                // 计算变动后余额（收入时增加）
                const afterBalance = currentBalance + amount;
                
                // 格式化余额显示
                const formatBalance = (balance: number) => {
                  if (selectedAccount.currency === "CNY" || selectedAccount.currency === "RMB") {
                    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(balance);
                  } else if (selectedAccount.currency === "USD") {
                    return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD" }).format(balance);
                  } else {
                    return `${selectedAccount.currency} ${balance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  }
                };
                
                return (
                  <div className="text-xs text-slate-500 mt-1 space-y-1">
                    <div>
                      当前余额：<span className="text-slate-300 font-medium">{formatBalance(currentBalance)}</span>
                    </div>
                    {amount > 0 && (
                      <div className="flex items-center gap-2">
                        <span>变动后余额：</span>
                        <span className="text-emerald-400 font-medium">
                          {formatBalance(afterBalance)}
                        </span>
                      </div>
                    )}
                    {selectedStore && (
                      <div className="text-slate-400">
                        币种：{selectedAccount.currency} | 汇率：{selectedAccount.exchangeRate} | 折算CNY：¥{rmbAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                );
              })()}
              {accounts.length === 0 && (
                <div className="text-xs text-amber-400 mt-1">
                  暂无账户，请先前往"财务中心 - 账户列表"创建账户
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
                  折算CNY：¥{rmbAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <label className="space-y-1 col-span-2">
              <span className="text-slate-300">凭证</span>
              <ImageUploader
                value={form.voucher}
                onChange={(value) => setForm((f) => ({ ...f, voucher: typeof value === "string" ? value : value[0] || "" }))}
                multiple={false}
                label="上传收入凭证"
                placeholder="点击上传凭证或直接 Ctrl + V 粘贴图片"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsSubmitting(false);
                onClose();
              }}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              disabled={isSubmitting}
            >
              取消
            </button>
            <InteractiveButton
              type="submit"
              variant="success"
              size="md"
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-emerald-600"
              disabled={!accounts.length || isSubmitting}
            >
              提交申请
            </InteractiveButton>
          </div>
        </form>
      </div>
    </div>
  );
}
