"use client";

/**
 * 支出申请录入组件
 * 
 * 使用场景：
 * - 广告同事：发起广告费、广告充值等支出申请
 * - 物流同事：发起物流费、运费等支出申请
 * - 采购同事：发起采购费、供应商付款等支出申请
 * 
 * 审批流程：
 * 1. 发起人填写申请 → 提交审批
 * 2. 主管审批（通过/退回）
 * 3. 财务选择账户 → 出账 → 生成财务流水
 */

import { useState, useEffect, useMemo } from "react";
import { type BankAccount } from "@/lib/finance-store";
import { getAdAccounts, type AdAccount } from "@/lib/ad-agency-store";
import type { CashFlow } from "../page";
import { toast } from "sonner";
import { enrichWithUID } from "@/lib/business-utils";
import { EXPENSE_CATEGORIES, getSubCategories, type ExpenseSubCategory } from "@/lib/expense-categories";
import useSWR from "swr";
import ImageUploader from "@/components/ImageUploader";
import { createExpenseRequest, type ExpenseRequest } from "@/lib/expense-income-request-store";

type ExpenseEntryProps = {
  accounts: BankAccount[];
  onClose: () => void;
  onSave: (flow: CashFlow, adAccountId?: string, rebateAmount?: number) => void;
};

export default function ExpenseEntry({ accounts, onClose, onSave }: ExpenseEntryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    summary: "",
    primaryCategory: "", // 一级分类
    subCategory: "", // 二级分类
    amount: "",
    accountId: "",
    businessNumber: "",
    remark: "",
    adAccountId: "", // 广告账户ID（仅当分类为"广告费"时显示）
    voucher: "" // 凭证
  });
  
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [isRecharge, setIsRecharge] = useState(false); // 是否为广告充值
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState(""); // 选中的采购单ID

  // 判断是否为采购相关分类
  const isPurchaseCategory = form.primaryCategory === "采购";

  // 使用 SWR 获取采购单列表（仅当分类为采购时）
  const fetcher = (url: string) => fetch(url).then(res => res.json());
  const { data: purchaseOrders = [] } = useSWR(
    isPurchaseCategory ? '/api/purchase-orders' : null,
    fetcher
  );

  // 获取当前一级分类下的二级分类选项
  const availableSubCategories = useMemo(() => {
    if (!form.primaryCategory) return [];
    return getSubCategories(form.primaryCategory);
  }, [form.primaryCategory]);

  // 计算最终分类值（用于保存）
  const finalCategory = useMemo(() => {
    if (form.subCategory) {
      return form.subCategory; // 格式：一级分类/二级分类
    }
    return form.primaryCategory; // 只有一级分类
  }, [form.primaryCategory, form.subCategory]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const loaded = getAdAccounts();
      setAdAccounts(loaded);
    }
  }, []);

  const selectedAccount = accounts.find((a) => a.id === form.accountId);
  const selectedAdAccount = adAccounts.find((a) => a.id === form.adAccountId);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isSubmitting) {
      toast.loading("正在提交，请勿重复点击");
      return;
    }

    if (!form.accountId || !form.primaryCategory) {
      toast.error("请选择账户和费用分类");
      return;
    }
    // 关联单号改为可选，因为有些支出可能没有明确的业务单号
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
    // 账户总余额 = originalBalance（已经包含了 initialCapital + 所有流水）
    const totalBalance = account.originalBalance || 0;
    if (totalBalance < amount) {
      toast.error("账户余额不足");
      return;
    }

    // 如果是广告充值，需要选择广告账户并计算返点
    let adAccountId: string | undefined;
    let rebateAmount: number | undefined;
    
    if (form.primaryCategory === "广告费" && isRecharge) {
      if (!form.adAccountId) {
        toast.error("广告充值时，请选择广告账户");
        return;
      }
      
      const adAccount = adAccounts.find((a) => a.id === form.adAccountId);
      if (!adAccount) {
        toast.error("请选择有效的广告账户");
        return;
      }
      
      // 查找关联的代理商
      let agencies: any[] = [];
      if (typeof window !== "undefined") {
        try {
          const { getAgencies } = require("@/lib/ad-agency-store");
          agencies = getAgencies();
        } catch (e) {
          console.error("Failed to load agencies", e);
        }
      }
      const agency = agencies.find((a: any) => a.id === adAccount.agencyId);
      
      if (agency) {
        // 计算返点金额
        rebateAmount = (amount * agency.rebateRate) / 100;
      }
      
      adAccountId = form.adAccountId;
    }

    // 如果是采购分类且选择了采购单，使用采购单号作为关联单号
    let finalBusinessNumber: string | undefined = form.businessNumber.trim() || undefined;
    let relatedId: string | undefined = undefined;
    
    if (isPurchaseCategory && selectedPurchaseOrderId) {
      const selectedPO = purchaseOrders.find((po: any) => po.id === selectedPurchaseOrderId);
      if (selectedPO) {
        finalBusinessNumber = selectedPO.orderNumber;
        relatedId = selectedPO.id;
      }
    } else if (finalBusinessNumber) {
      // 如果手动输入了关联单号，保留它
      finalBusinessNumber = finalBusinessNumber;
    }

    // 创建支出申请（需要审批）
    const expenseRequest: ExpenseRequest = {
      id: crypto.randomUUID(),
      date: form.date,
      summary: form.summary.trim(),
      category: finalCategory,
      amount: amount,
      currency: account.currency,
      businessNumber: finalBusinessNumber,
      relatedId: relatedId,
      remark: form.remark.trim() + (rebateAmount ? ` 广告充值返点：${rebateAmount.toFixed(2)}` : ""),
      voucher: form.voucher ? (Array.isArray(form.voucher) ? form.voucher : [form.voucher]) : undefined,
      status: "Pending_Approval", // 待审批
      createdBy: "当前用户", // TODO: 从用户系统获取
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      adAccountId: adAccountId,
      rebateAmount: rebateAmount
    };

    // 自动生成唯一业务ID（如果还没有）
    if (!expenseRequest.uid) {
      expenseRequest.uid = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    const requestWithUID = expenseRequest;
    
    // 防止重复提交
    setIsSubmitting(true);
    try {
      // 创建支出申请
      await createExpenseRequest(requestWithUID);
      toast.success("支出申请已提交，等待审批", { duration: 3000 });
      // 关闭弹窗
      setTimeout(() => {
        setIsSubmitting(false);
        onClose();
      }, 1000);
    } catch (error: any) {
      setIsSubmitting(false);
      toast.error(error.message || "提交失败，请重试");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">提交支出申请</h2>
            <p className="text-xs text-slate-400 mt-1">提交后需等待审批，审批通过后才能出账</p>
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
                      subCategory: "", // 清空二级分类
                      adAccountId: "",
                      businessNumber: "" // 清空关联单号
                    }));
                    setIsRecharge(false);
                    setSelectedPurchaseOrderId(""); // 清空采购单选择
                  }}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              >
                <option value="">请选择一级分类</option>
                {EXPENSE_CATEGORIES.map((cat) => (
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
            {form.primaryCategory === "广告费" && (
              <label className="space-y-1 col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    checked={isRecharge}
                    onChange={(e) => {
                      setIsRecharge(e.target.checked);
                      if (!e.target.checked) {
                        setForm((f) => ({ ...f, adAccountId: "" }));
                      }
                    }}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  <span className="text-slate-300 text-sm">这是广告充值</span>
                </div>
                {isRecharge && (
                  <select
                    value={form.adAccountId}
                    onChange={(e) => setForm((f) => ({ ...f, adAccountId: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required={isRecharge}
                  >
                    <option value="">请选择广告账户</option>
                    {adAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName} ({acc.agencyName}) - {acc.currency}
                      </option>
                    ))}
                  </select>
                )}
                {isRecharge && selectedAdAccount && (
                  <div className="text-xs text-slate-500 mt-1">
                    当前余额：{selectedAdAccount.currentBalance.toLocaleString()} {selectedAdAccount.currency}
                  </div>
                )}
              </label>
            )}
            <label className="space-y-1 col-span-2">
              <span className="text-slate-300">摘要 <span className="text-rose-400">*</span></span>
              <input
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="简要描述本次支出"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">金额 <span className="text-rose-400">*</span></span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              />
            </label>
            {/* 采购分类：显示采购单选择器 */}
            {isPurchaseCategory ? (
              <label className="space-y-1 col-span-2">
                <span className="text-slate-300">关联采购单</span>
                <select
                  value={selectedPurchaseOrderId}
                  onChange={(e) => {
                    const poId = e.target.value;
                    setSelectedPurchaseOrderId(poId);
                    if (poId) {
                      const selectedPO = purchaseOrders.find((po: any) => po.id === poId);
                      if (selectedPO) {
                        setForm((f) => ({ ...f, businessNumber: selectedPO.orderNumber }));
                      }
                    } else {
                      setForm((f) => ({ ...f, businessNumber: "" }));
                    }
                  }}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                >
                  <option value="">请选择采购单（可选）</option>
                  {purchaseOrders.map((po: any) => (
                    <option key={po.id} value={po.id}>
                      {po.orderNumber} - {po.sku} {po.productName ? `(${po.productName})` : ""} - {po.status}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-slate-500 mt-1">
                  选择采购单后，将自动关联采购单号
                </div>
                {/* 如果选择了采购单，显示手动输入选项 */}
                {selectedPurchaseOrderId && (
                  <div className="mt-2">
                    <label className="space-y-1">
                      <span className="text-slate-300 text-xs">或手动输入关联单号</span>
                      <input
                        value={form.businessNumber}
                        onChange={(e) => {
                          setForm((f) => ({ ...f, businessNumber: e.target.value }));
                          if (e.target.value) {
                            setSelectedPurchaseOrderId(""); // 清空选择
                          }
                        }}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
                        placeholder="手动输入单号"
                      />
                    </label>
                  </div>
                )}
              </label>
            ) : (
              <label className="space-y-1">
                <span className="text-slate-300">关联单号</span>
                <input
                  value={form.businessNumber}
                  onChange={(e) => setForm((f) => ({ ...f, businessNumber: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="如：PO-123456（可选）"
                />
                <div className="text-xs text-slate-500 mt-1">
                  用于关联采购单号、合同号等业务单据（可选）
                </div>
              </label>
            )}
            <label className="space-y-1 col-span-2">
              <span className="text-slate-300">关联账户 <span className="text-rose-400">*</span></span>
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
                          // 显示余额 = originalBalance（已经包含了 initialCapital + 所有流水）
                          const displayBalance = acc.originalBalance || 0;
                          const accountTypeLabel = acc.accountCategory === "PRIMARY" ? "主账户" : acc.accountCategory === "VIRTUAL" ? "虚拟子账号" : "独立账户";
                          
                          // 格式化余额
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
                              {acc.name} | {accountTypeLabel} | 余额: {balanceText}
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
                // 计算变动后余额（支出时减少）
                const afterBalance = currentBalance - amount;
                
                // 格式化余额显示
                const formatBalance = (balance: number) => {
                  if (selectedAccount.currency === "RMB") {
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
                        <span className={`font-medium ${afterBalance < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {formatBalance(afterBalance)}
                        </span>
                        {afterBalance < 0 && (
                          <span className="text-rose-400 text-xs">（余额不足）</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </label>
            <label className="space-y-1 col-span-2">
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
                label="上传支出凭证"
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
            <button
              type="submit"
              className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-rose-600 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!accounts.length || isSubmitting}
            >
              {isSubmitting ? "提交中..." : "提交申请"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
