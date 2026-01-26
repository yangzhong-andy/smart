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

import React, { useState, useEffect, useMemo } from "react";
import { getPaymentRequests, createPaymentRequest, updatePaymentRequest, getPaymentRequestsByStatus, type PaymentRequest } from "@/lib/payment-request-store";
import { type BillStatus } from "@/lib/reconciliation-store";
import { getStores, type Store } from "@/lib/store-store";
import { getAccounts, type BankAccount } from "@/lib/finance-store";
import { formatCurrency } from "@/lib/currency-utils";
import { COUNTRIES } from "@/lib/country-config";
import ImageUploader from "@/components/ImageUploader";
import { toast } from "sonner";
import { FileText, Filter, Plus, Edit, Send, CheckCircle, XCircle, Clock, DollarSign } from "lucide-react";

export default function PaymentRequestPage() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [filterStatus, setFilterStatus] = useState<BillStatus | "All">("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<PaymentRequest | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [requestsData, storesData, accountsData] = await Promise.all([
        getPaymentRequests(),
        getStores(),
        getAccounts()
      ]);
      setRequests(requestsData);
      setStores(storesData);
      setAccounts(accountsData);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("加载数据失败");
    }
  };

  const filteredRequests = useMemo(() => {
    if (filterStatus === "All") return requests;
    return requests.filter((r) => r.status === filterStatus);
  }, [requests, filterStatus]);

  const handleSubmit = async (request: Omit<PaymentRequest, "id">) => {
    try {
      if (editingRequest) {
        await updatePaymentRequest(editingRequest.id, request);
        toast.success("付款申请已更新");
      } else {
        await createPaymentRequest({
          ...request,
          createdAt: new Date().toISOString()
        });
        toast.success("付款申请已创建");
      }
      setModalOpen(false);
      setEditingRequest(null);
      loadData();
    } catch (error) {
      toast.error("操作失败");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2">通用付款申请</h1>
          <p className="text-slate-400 text-sm">用于特殊付款申请，如采购合同定金、店铺相关支出等</p>
        </div>
        <button
          onClick={() => {
            setEditingRequest(null);
            setModalOpen(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建付款申请
        </button>
      </div>

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
      <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">支出项目</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">金额</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">店铺</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">创建人</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">创建时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  暂无付款申请
                </td>
              </tr>
            ) : (
              filteredRequests.map((request) => (
                <tr key={request.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm text-white">{request.expenseItem}</td>
                  <td className="px-4 py-3 text-sm text-white">
                    {formatCurrency(request.amount, request.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {request.storeName || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {request.status === "Draft" && (
                      <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">草稿</span>
                    )}
                    {request.status === "Pending_Approval" && (
                      <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 rounded text-xs">待审批</span>
                    )}
                    {request.status === "Approved" && (
                      <span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">已批准</span>
                    )}
                    {request.status === "Paid" && (
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">已付款</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{request.createdBy}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(request.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => {
                        setEditingRequest(request);
                        setModalOpen(true);
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 创建/编辑模态框 - 简化版，可根据需要完善 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 w-full max-w-2xl border border-slate-800">
            <h2 className="text-xl font-bold mb-4">
              {editingRequest ? "编辑付款申请" : "新建付款申请"}
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              此功能正在完善中，目前可通过采购订单页面创建采购定金付款申请
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setModalOpen(false);
                  setEditingRequest(null);
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
