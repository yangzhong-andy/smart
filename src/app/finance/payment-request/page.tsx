"use client";

/**
 * 通用付款申请页面
 * 
 * 使用场景：
 * - 特殊付款申请，如采购合同定金、店铺相关支出等
 * - 通常由财务人员或采购人员发起，需要老板审批
 * 
 * 与支出申请（ExpenseRequest）的区别：
 * - 支出申请：用于广告、物流、采购同事发起的日常运营支出（广告费、物流费、采购费等）
 * - 付款申请：用于特殊付款场景，通常与采购合同、店铺运营等特定业务相关
 * 
 * 审批流程：
 * 1. 财务/采购人员创建申请 → 提交审批
 * 2. 老板审批（通过/退回）
 * 3. 出纳选择账户 → 付款 → 生成财务流水
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import useSWR, { mutate } from "swr";
import { getPaymentRequests, createPaymentRequest, updatePaymentRequest, getPaymentRequestsByStatus, type PaymentRequest } from "@/lib/payment-request-store";
import { type BillStatus } from "@/lib/reconciliation-store";
import { getStores, type Store } from "@/lib/store-store";
import { type BankAccount } from "@/lib/finance-store";
import { formatCurrency } from "@/lib/currency-utils";
import { COUNTRIES } from "@/lib/country-config";
import { EXPENSE_CATEGORIES, getSubCategories, parseCategory } from "@/lib/expense-categories";
import ImageUploader from "@/components/ImageUploader";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { PageHeader } from "@/components/ui";
import { toast } from "sonner";
import { FileText, Filter, Plus, Edit, Send, CheckCircle, XCircle, Clock, DollarSign, Eye, X } from "lucide-react";

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function PaymentRequestPage() {
  const [filterStatus, setFilterStatus] = useState<BillStatus | "All">("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PaymentRequest | null>(null);
  const [detailModal, setDetailModal] = useState<PaymentRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 使用 SWR 加载数据
  const { data: requestsData = [] } = useSWR<PaymentRequest[]>('/api/payment-requests', fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true
  });
  
  const { data: storesData = [] } = useSWR<Store[]>('stores', async () => {
    if (typeof window === "undefined") return [];
    return getStores();
  });
  
  const { data: accountsData = [] } = useSWR<BankAccount[]>('/api/accounts', fetcher);

  // 确保数据是数组
  const requests: PaymentRequest[] = Array.isArray(requestsData) ? requestsData : [];
  const stores: Store[] = Array.isArray(storesData) ? storesData : [];
  const accounts: BankAccount[] = Array.isArray(accountsData) ? accountsData : [];

  const filteredRequests = useMemo(() => {
    if (filterStatus === "All") return requests;
    return requests.filter((r) => r.status === filterStatus);
  }, [requests, filterStatus]);

  // 表单状态
  const [form, setForm] = useState({
    expenseItem: "",
    amount: "",
    currency: "RMB" as "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD",
    storeId: "",
    category: "",
    primaryCategory: "",
    subCategory: "",
    country: "",
    notes: "",
    approvalDocument: "" as string | string[]
  });

  // 初始化表单（编辑时）
  useEffect(() => {
    if (editingRequest) {
      const { primary, sub } = parseCategory(editingRequest.category);
      setForm({
        expenseItem: editingRequest.expenseItem || "",
        amount: String(editingRequest.amount || ""),
        currency: editingRequest.currency || "RMB",
        storeId: editingRequest.storeId || "",
        category: editingRequest.category || "",
        primaryCategory: primary,
        subCategory: sub || "",
        country: editingRequest.country || "",
        notes: editingRequest.notes || "",
        approvalDocument: editingRequest.approvalDocument || ""
      });
    } else {
      // 重置表单
      setForm({
        expenseItem: "",
        amount: "",
        currency: "RMB",
        storeId: "",
        category: "",
        primaryCategory: "",
        subCategory: "",
        country: "",
        notes: "",
        approvalDocument: ""
      });
    }
  }, [editingRequest]);

  // 获取可用二级分类
  const availableSubCategories = useMemo(() => {
    if (!form.primaryCategory) return [];
    return getSubCategories(form.primaryCategory);
  }, [form.primaryCategory]);

  // 计算最终分类
  const finalCategory = useMemo(() => {
    if (form.subCategory) {
      return form.subCategory;
    }
    return form.primaryCategory;
  }, [form.primaryCategory, form.subCategory]);

  // 选中的店铺
  const selectedStore = stores.find((s) => s.id === form.storeId);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    if (!form.expenseItem || !form.amount || !form.primaryCategory) {
      toast.error("请填写必填字段");
      return;
    }

    setIsSubmitting(true);
    try {
      const requestData: Omit<PaymentRequest, "id"> = {
        expenseItem: form.expenseItem,
        amount: Number(form.amount),
        currency: form.currency,
        storeId: form.storeId || undefined,
        storeName: selectedStore?.name || undefined,
        country: form.country || undefined,
        category: finalCategory,
        approvalDocument: form.approvalDocument || undefined,
        status: editingRequest?.status || "Draft",
        createdBy: editingRequest?.createdBy || "系统",
        createdAt: editingRequest?.createdAt || new Date().toISOString(),
        notes: form.notes || undefined
      };

      if (editingRequest) {
        await updatePaymentRequest(editingRequest.id, requestData);
        toast.success("付款申请已更新");
      } else {
        await createPaymentRequest(requestData);
        toast.success("付款申请已创建");
      }
      
      await mutate('/api/payment-requests');
      setModalOpen(false);
      setEditingRequest(null);
    } catch (error: any) {
      console.error("Failed to save payment request:", error);
      toast.error(error.message || "操作失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 提交审批
  const handleSubmitForApproval = async (requestId: string) => {
    try {
      const request = requests.find((r) => r.id === requestId);
      if (!request) {
        toast.error("申请不存在");
        return;
      }

      if (request.status !== "Draft") {
        toast.error("只有草稿状态的申请可以提交审批");
        return;
      }

      await updatePaymentRequest(requestId, {
        ...request,
        status: "Pending_Approval",
        submittedAt: new Date().toISOString()
      });
      
      await mutate('/api/payment-requests');
      toast.success("已提交审批");
    } catch (error: any) {
      console.error("Failed to submit for approval:", error);
      toast.error(error.message || "提交失败");
    }
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <PageHeader
        title="通用付款申请"
        description="用于特殊付款申请，如采购合同定金、店铺相关支出等"
        actions={
          <InteractiveButton
            onClick={() => {
              setEditingRequest(null);
              setModalOpen(true);
            }}
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
          >
            新建付款申请
          </InteractiveButton>
        }
      />

      {/* 筛选器 */}
      <div className="flex items-center gap-4">
        <Filter className="w-5 h-5 text-slate-400" />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as BillStatus | "All")}
          className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
        >
          <option value="All">全部状态</option>
          <option value="Draft">草稿</option>
          <option value="Pending_Approval">待审批</option>
          <option value="Approved">已批准</option>
          <option value="Paid">已付款</option>
        </select>
      </div>

      {/* 列表 */}
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 overflow-hidden shadow-xl">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">支出项目</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">金额</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">分类</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">店铺</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">创建人</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">创建时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="w-12 h-12 opacity-30" />
                    <p>暂无付款申请</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRequests.map((request) => (
                <tr key={request.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-200 font-medium">{request.expenseItem}</td>
                  <td className="px-4 py-3 text-sm text-slate-100">
                    {formatCurrency(request.amount, request.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {request.category || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {request.storeName || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {request.status === "Draft" && (
                      <span className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs border border-slate-600">草稿</span>
                    )}
                    {request.status === "Pending_Approval" && (
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-xs border border-amber-500/30">待审批</span>
                    )}
                    {request.status === "Approved" && (
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs border border-emerald-500/30">已批准</span>
                    )}
                    {request.status === "Paid" && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs border border-blue-500/30">已付款</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{request.createdBy}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(request.createdAt).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit"
                    })}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDetailModal(request)}
                        className="text-cyan-400 hover:text-cyan-300 transition-colors"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {request.status === "Draft" && (
                        <>
                          <button
                            onClick={() => {
                              setEditingRequest(request);
                              setModalOpen(true);
                            }}
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                            title="编辑"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <InteractiveButton
                            onClick={() => handleSubmitForApproval(request.id)}
                            variant="success"
                            size="sm"
                            className="!px-2 !py-1"
                            title="提交审批"
                          >
                            <Send className="w-3 h-3" />
                          </InteractiveButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 创建/编辑模态框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">
                  {editingRequest ? "编辑付款申请" : "新建付款申请"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {editingRequest ? "修改付款申请信息" : "填写付款申请信息，创建后为草稿状态"}
                </p>
              </div>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setEditingRequest(null);
                }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">支出项目 <span className="text-rose-400">*</span></span>
                  <input
                    type="text"
                    value={form.expenseItem}
                    onChange={(e) => setForm((f) => ({ ...f, expenseItem: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100"
                    placeholder="如：采购合同定金"
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
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100"
                    required
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-slate-300">币种 <span className="text-rose-400">*</span></span>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD" }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100"
                    required
                  >
                    <option value="RMB">RMB (人民币)</option>
                    <option value="USD">USD (美元)</option>
                    <option value="JPY">JPY (日元)</option>
                    <option value="EUR">EUR (欧元)</option>
                    <option value="GBP">GBP (英镑)</option>
                    <option value="HKD">HKD (港币)</option>
                    <option value="SGD">SGD (新加坡元)</option>
                    <option value="AUD">AUD (澳元)</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-slate-300">一级分类 <span className="text-rose-400">*</span></span>
                  <select
                    value={form.primaryCategory}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        primaryCategory: e.target.value,
                        subCategory: ""
                      }));
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100"
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
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100"
                    >
                      <option value="">不选择二级分类</option>
                      {availableSubCategories.map((sub) => (
                        <option key={sub.value} value={sub.value}>
                          {sub.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="space-y-1">
                  <span className="text-slate-300">店铺</span>
                  <select
                    value={form.storeId}
                    onChange={(e) => {
                      const storeId = e.target.value;
                      const store = stores.find((s) => s.id === storeId);
                      setForm((f) => ({
                        ...f,
                        storeId,
                        country: store?.country || ""
                      }));
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100"
                  >
                    <option value="">不选择店铺</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} ({store.country})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-slate-300">国家</span>
                  <select
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100"
                  >
                    <option value="">不选择国家</option>
                    {COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">备注</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-100 resize-none"
                    rows={3}
                    placeholder="可选"
                  />
                </label>

                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">审批凭证（可选）</span>
                  <ImageUploader
                    value={form.approvalDocument}
                    onChange={(value) => setForm((f) => ({ ...f, approvalDocument: value }))}
                    multiple={true}
                    label="上传审批凭证"
                    placeholder="点击上传凭证或直接 Ctrl + V 粘贴图片"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingRequest(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
                >
                  取消
                </button>
                <InteractiveButton
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {editingRequest ? "保存修改" : "创建申请"}
                </InteractiveButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 详情查看模态框 */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">付款申请详情</h2>
              <button
                onClick={() => setDetailModal(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400">支出项目：</span>
                  <span className="text-slate-200 ml-2">{detailModal.expenseItem}</span>
                </div>
                <div>
                  <span className="text-slate-400">金额：</span>
                  <span className="text-slate-200 ml-2">{formatCurrency(detailModal.amount, detailModal.currency)}</span>
                </div>
                <div>
                  <span className="text-slate-400">分类：</span>
                  <span className="text-slate-200 ml-2">{detailModal.category || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400">店铺：</span>
                  <span className="text-slate-200 ml-2">{detailModal.storeName || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400">国家：</span>
                  <span className="text-slate-200 ml-2">{detailModal.country || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400">状态：</span>
                  <span className="ml-2">
                    {detailModal.status === "Draft" && (
                      <span className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs">草稿</span>
                    )}
                    {detailModal.status === "Pending_Approval" && (
                      <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-xs">待审批</span>
                    )}
                    {detailModal.status === "Approved" && (
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs">已批准</span>
                    )}
                    {detailModal.status === "Paid" && (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">已付款</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">创建人：</span>
                  <span className="text-slate-200 ml-2">{detailModal.createdBy}</span>
                </div>
                <div>
                  <span className="text-slate-400">创建时间：</span>
                  <span className="text-slate-200 ml-2">
                    {new Date(detailModal.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                {detailModal.submittedAt && (
                  <div>
                    <span className="text-slate-400">提交时间：</span>
                    <span className="text-slate-200 ml-2">
                      {new Date(detailModal.submittedAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                )}
                {detailModal.approvedBy && (
                  <div>
                    <span className="text-slate-400">审批人：</span>
                    <span className="text-slate-200 ml-2">{detailModal.approvedBy}</span>
                  </div>
                )}
                {detailModal.approvedAt && (
                  <div>
                    <span className="text-slate-400">审批时间：</span>
                    <span className="text-slate-200 ml-2">
                      {new Date(detailModal.approvedAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                )}
                {detailModal.notes && (
                  <div className="col-span-2">
                    <span className="text-slate-400">备注：</span>
                    <div className="text-slate-200 mt-1 p-3 bg-slate-800/50 rounded-md">
                      {detailModal.notes}
                    </div>
                  </div>
                )}
                {detailModal.approvalDocument && (
                  <div className="col-span-2">
                    <span className="text-slate-400">审批凭证：</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(() => {
                        const images = Array.isArray(detailModal.approvalDocument)
                          ? detailModal.approvalDocument
                          : [detailModal.approvalDocument];
                        return images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`凭证 ${idx + 1}`}
                            className="w-32 h-32 object-cover rounded-md border border-slate-700 cursor-pointer hover:border-primary-400 transition"
                            onClick={() => window.open(img, '_blank')}
                          />
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setDetailModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
                >
                  关闭
                </button>
                {detailModal.status === "Draft" && (
                  <>
                    <InteractiveButton
                      onClick={() => {
                        setDetailModal(null);
                        setEditingRequest(detailModal);
                        setModalOpen(true);
                      }}
                      variant="secondary"
                    >
                      编辑
                    </InteractiveButton>
                    <InteractiveButton
                      onClick={async () => {
                        await handleSubmitForApproval(detailModal.id);
                        setDetailModal(null);
                      }}
                      variant="success"
                    >
                      提交审批
                    </InteractiveButton>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
