"use client";

import { useState } from "react";
import { memo } from "react";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { formatCurrency } from "@/lib/currency-utils";
import { getRequestStringField } from "./types";
import { STATUS_COLORS, STATUS_LABELS } from "./types";
import type { MonthlyBill, BillStatus } from "@/lib/reconciliation-store";
import type { ExpenseRequest, IncomeRequest, RequestStatus } from "@/lib/expense-income-request-store";
import type { ActiveTab, RequestKindFilter } from "./ApprovalFilters";
import { VoucherThumbnails, VoucherViewerModal, parseVoucher, type VoucherViewerState } from "./VoucherImage";

interface ApprovalListProps {
  activeTab: ActiveTab;
  filteredPendingBills: MonthlyBill[];
  pendingExpenseRequests: ExpenseRequest[];
  pendingIncomeRequests: IncomeRequest[];
  filteredHistoryBills: MonthlyBill[];
  filteredHistoryRequests: (ExpenseRequest | IncomeRequest)[];
  historyExpenseRequests: ExpenseRequest[];
  historyIncomeRequests: IncomeRequest[];
  /** 未筛选前的历史总条数（月账单+支出+收入），用于空态区分「无数据」与「筛选无结果」 */
  totalHistoryCount: number;
  requestKindFilter: RequestKindFilter;
  onViewBillDetail: (bill: MonthlyBill) => void;
  onApproveBill: (billId: string) => void;
  onRejectBill: (billId: string) => void;
  onApproveExpenseRequest: (requestId: string) => void;
  onRejectExpenseRequest: (requestId: string) => void;
  onApproveIncomeRequest: (requestId: string) => void;
  onRejectIncomeRequest: (requestId: string) => void;
  onOpenRequestDetail: (request: ExpenseRequest | IncomeRequest, type: "expense" | "income") => void;
}

function ApprovalListComponent({
  activeTab,
  filteredPendingBills,
  pendingExpenseRequests,
  pendingIncomeRequests,
  filteredHistoryBills,
  filteredHistoryRequests,
  historyExpenseRequests,
  historyIncomeRequests,
  totalHistoryCount,
  requestKindFilter,
  onViewBillDetail,
  onApproveBill,
  onRejectBill,
  onApproveExpenseRequest,
  onRejectExpenseRequest,
  onApproveIncomeRequest,
  onRejectIncomeRequest,
  onOpenRequestDetail,
}: ApprovalListProps) {
  const statusColors = STATUS_COLORS;
  const statusLabels = STATUS_LABELS;
  const [voucherViewState, setVoucherViewState] = useState<VoucherViewerState | null>(null);

  if (activeTab === "pending") {
    const isEmpty =
      filteredPendingBills.length === 0 &&
      pendingExpenseRequests.length === 0 &&
      pendingIncomeRequests.length === 0;
    if (isEmpty) {
      return (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-12 text-center">
          <div className="text-slate-400 text-4xl mb-4">✓</div>
          <p className="text-slate-300 font-medium mb-1">暂无待审批项目</p>
          <p className="text-sm text-slate-500">所有审批已处理完毕</p>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        {filteredPendingBills.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              月账单 ({filteredPendingBills.length})
            </h2>
            <div className="space-y-4">
              {filteredPendingBills.map((bill) => (
                <div
                  key={bill.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">账单月份</div>
                          <div className="text-lg font-semibold text-slate-100">{bill.month}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">代理商</div>
                          <div className="text-slate-200 font-medium">{bill.agencyName}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">操作人</div>
                          <div className="text-slate-300 text-sm">{bill.paidBy || bill.approvedBy || bill.financeReviewedBy || bill.createdBy}</div>
                        </div>
                        {bill.submittedAt && (
                          <div>
                            <div className="text-xs text-slate-400 mb-1">提交时间</div>
                            <div className="text-slate-300 text-sm">
                              {new Date(bill.submittedAt).toLocaleString("zh-CN", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">
                            {bill.billType === "广告返点" ? "返点应收金额" : "应付金额"}
                          </div>
                          <div className={`text-lg font-semibold ${bill.billCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"}`}>
                            {formatCurrency(
                              bill.billType === "广告返点" ? bill.netAmount : bill.totalAmount,
                              bill.currency,
                              bill.billCategory === "Receivable" ? "income" : "expense"
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">币种</div>
                          <div className="text-slate-300">{bill.currency}</div>
                        </div>
                      </div>
                      {bill.notes && (
                        <div className="mb-4">
                          <div className="text-xs text-slate-400 mb-1">备注</div>
                          <div className="text-slate-300 text-sm">{bill.notes}</div>
                        </div>
                      )}
                      {bill.paymentApplicationVoucher && (() => {
                        const imgs = parseVoucher(bill.paymentApplicationVoucher);
                        return imgs.length > 0 ? (
                          <div className="mb-4">
                            <div className="text-xs text-slate-400 mb-1">{bill.billCategory === "Receivable" ? "收款申请书凭证" : "付款申请书凭证"}</div>
                            <button
                              onClick={() => setVoucherViewState({ images: imgs, index: 0 })}
                              className="px-3 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20 transition"
                            >
                              📄 查看{bill.billCategory === "Receivable" ? "收款" : "付款"}申请书凭证 ({imgs.length}张)
                            </button>
                          </div>
                        ) : null;
                      })()}
                      <div className="flex gap-2">
                        <button
                          onClick={() => onViewBillDetail(bill)}
                          className="px-3 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20"
                        >
                          查看详细清单
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 ml-6">
                      <InteractiveButton
                        onClick={() => onApproveBill(bill.id)}
                        variant="success"
                        size="md"
                        className="px-6 py-3 border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                      >
                        ✓ 批准
                      </InteractiveButton>
                      <InteractiveButton
                        onClick={() => onRejectBill(bill.id)}
                        variant="danger"
                        size="md"
                        className="px-6 py-3 border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                      >
                        ✗ 退回修改
                      </InteractiveButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingExpenseRequests.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              支出申请 ({pendingExpenseRequests.length})
            </h2>
            <div className="space-y-4">
              {pendingExpenseRequests.map((request) => {
                const memoString = getRequestStringField(request, "notes", "remark") || "";
                return (
                  <div
                    key={request.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">摘要</div>
                            <div className="text-lg font-semibold text-slate-100">
                              {request.summary}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">分类</div>
                            <div className="text-slate-200 font-medium">{request.category}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">发起人</div>
                            <div className="text-slate-300 text-sm">{request.createdBy}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">日期</div>
                            <div className="text-slate-300 text-sm">{request.date}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">金额</div>
                            <div className="text-lg font-semibold text-rose-300">
                              {formatCurrency(request.amount, request.currency, "expense")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">币种</div>
                            <div className="text-slate-300">{request.currency}</div>
                          </div>
                          {request.businessNumber && (
                            <div>
                              <div className="text-xs text-slate-400 mb-1">关联单号</div>
                              <div className="text-slate-300">{request.businessNumber}</div>
                            </div>
                          )}
                          {(request as any).containerNo && (
                            <div>
                              <div className="text-xs text-slate-400 mb-1">柜号</div>
                              <div className="text-cyan-300 font-medium">{(request as any).containerNo}</div>
                            </div>
                          )}
                        </div>
                        {memoString ? (
                          <div className="mb-4 rounded-md bg-slate-800/40 border-l-2 border-cyan-400/50 pl-3 pr-3 py-2">
                            <div className="text-xs text-slate-400 mb-1">备注</div>
                            <div className="text-slate-300 text-sm">{memoString}</div>
                          </div>
                        ) : null}
                        {request.voucher && (
                          <div className="mb-4">
                            <div className="text-xs text-slate-400 mb-2">
                              {String(request.category || "").startsWith("采购") || String(request.summary || "").startsWith("采购")
                                ? "发起付款凭证"
                                : "凭证"}
                            </div>
                            <VoucherThumbnails
                              voucher={request.voucher}
                              thumbClassName="w-20 h-20"
                              onView={(_src, images, index) => setVoucherViewState({ images, index })}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 ml-6">
                        <InteractiveButton
                          onClick={() => onApproveExpenseRequest(request.id)}
                          variant="success"
                          size="md"
                          className="px-6 py-3 border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                        >
                          ✓ 批准
                        </InteractiveButton>
                        <InteractiveButton
                          onClick={() => onRejectExpenseRequest(request.id)}
                          variant="danger"
                          size="md"
                          className="px-6 py-3 border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                        >
                          ✗ 退回修改
                        </InteractiveButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pendingIncomeRequests.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              收入申请 ({pendingIncomeRequests.length})
            </h2>
            <div className="space-y-4">
              {pendingIncomeRequests.map((request) => {
                const memoString = getRequestStringField(request, "notes", "remark") || "";
                return (
                  <div
                    key={request.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">摘要</div>
                            <div className="text-lg font-semibold text-slate-100">
                              {request.summary}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">分类</div>
                            <div className="text-slate-200 font-medium">{request.category}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">发起人</div>
                            <div className="text-slate-300 text-sm">{request.createdBy}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">日期</div>
                            <div className="text-slate-300 text-sm">{request.date}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">金额</div>
                            <div className="text-lg font-semibold text-emerald-300">
                              {formatCurrency(request.amount, request.currency, "income")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">币种</div>
                            <div className="text-slate-300">{request.currency}</div>
                          </div>
                          {request.storeName && (
                            <div>
                              <div className="text-xs text-slate-400 mb-1">所属店铺</div>
                              <div className="text-slate-300">{request.storeName}</div>
                            </div>
                          )}
                        </div>
                        {memoString ? (
                          <div className="mb-4 rounded-md bg-slate-800/40 border-l-2 border-cyan-400/50 pl-3 pr-3 py-2">
                            <div className="text-xs text-slate-400 mb-1">备注</div>
                            <div className="text-slate-300 text-sm">{memoString}</div>
                          </div>
                        ) : null}
                        {request.voucher && (
                          <div className="mb-4">
                            <div className="text-xs text-slate-400 mb-2">凭证</div>
                            <VoucherThumbnails
                              voucher={request.voucher}
                              thumbClassName="w-20 h-20"
                              onView={(_src, images, index) => setVoucherViewState({ images, index })}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 ml-6">
                        <InteractiveButton
                          onClick={() => onApproveIncomeRequest(request.id)}
                          variant="success"
                          size="md"
                          className="px-6 py-3 border border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                        >
                          ✓ 批准
                        </InteractiveButton>
                        <InteractiveButton
                          onClick={() => onRejectIncomeRequest(request.id)}
                          variant="danger"
                          size="md"
                          className="px-6 py-3 border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                        >
                          ✗ 退回修改
                        </InteractiveButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <VoucherViewerModal viewer={voucherViewState} onClose={() => setVoucherViewState(null)} />
      </div>
    );
  }

  const isEmptyHistory =
    filteredHistoryBills.length === 0 && filteredHistoryRequests.length === 0;
  if (isEmptyHistory) {
    const filteredOut = totalHistoryCount > 0;
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-12 text-center">
        <div className="text-slate-400 text-4xl mb-4">📋</div>
        <p className="text-slate-300 font-medium mb-1">
          {filteredOut ? "无符合筛选条件的历史记录" : "暂无历史审批记录"}
        </p>
        <p className="text-sm text-slate-500">
          {filteredOut
            ? "请调整「账单类型」或「筛选状态」后重试"
            : "所有审批记录将显示在这里"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {filteredHistoryBills.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-200 mb-4">
            月账单历史 ({filteredHistoryBills.length})
          </h2>
          <div className="space-y-4">
            {[...filteredHistoryBills]
              .sort((a, b) => {
                const timeA = a.approvedAt || a.submittedAt || a.createdAt || "";
                const timeB = b.approvedAt || b.submittedAt || b.createdAt || "";
                return new Date(timeB).getTime() - new Date(timeA).getTime();
              })
              .map((bill) => (
                <div
                  key={bill.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">账单月份</div>
                          <div className="text-lg font-semibold text-slate-100">{bill.month}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">服务方</div>
                          <div className="text-slate-200 font-medium">
                            {bill.agencyName || bill.supplierName || bill.factoryName || "-"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">账单类型</div>
                          <div className="text-slate-300 text-sm">{bill.billType}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">状态</div>
                          <span
                            className={`px-2 py-1 rounded text-xs border ${
                              statusColors[bill.status] || "bg-slate-500/20 text-slate-300 border-slate-500/40"
                            }`}
                          >
                            {statusLabels[bill.status] || bill.status}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="text-xs text-slate-400 mb-1">
                            {bill.billType === "广告返点" ? "返点应收金额" : "应付金额"}
                          </div>
                          <div className={`text-lg font-semibold ${bill.billCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"}`}>
                            {formatCurrency(bill.billType === "广告返点" ? bill.netAmount : bill.totalAmount, bill.currency, bill.billCategory === "Receivable" ? "income" : "expense")}
                          </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">币种</div>
                          <div className="text-slate-300">{bill.currency}</div>
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400">
                        {bill.createdBy && (
                          <div>
                            操作人：<span className="text-slate-300">{bill.paidBy || bill.approvedBy || bill.financeReviewedBy || bill.createdBy}</span>
                          </div>
                        )}
                        {bill.submittedAt && (
                          <div>
                            提交时间：
                            <span className="text-slate-300">
                              {new Date(bill.submittedAt).toLocaleString("zh-CN")}
                            </span>
                          </div>
                        )}
                        {bill.approvedBy && (
                          <div>
                            审批人：<span className="text-slate-300">{bill.approvedBy}</span>
                          </div>
                        )}
                        {bill.approvedAt && (
                          <div>
                            审批时间：
                            <span className="text-slate-300">
                              {new Date(bill.approvedAt).toLocaleString("zh-CN")}
                            </span>
                          </div>
                        )}
                        {bill.paidBy && (
                          <div>
                            付款人：<span className="text-slate-300">{bill.paidBy}</span>
                          </div>
                        )}
                        {bill.paidAt && (
                          <div>
                            付款时间：
                            <span className="text-slate-300">
                              {new Date(bill.paidAt).toLocaleString("zh-CN")}
                            </span>
                          </div>
                        )}
                      </div>
                      {bill.rejectionReason && (
                        <div className="mt-3 rounded-md bg-rose-500/10 border border-rose-500/40 p-2">
                          <div className="text-xs text-rose-300 mb-1">退回原因</div>
                          <div className="text-rose-200 text-xs">{bill.rejectionReason}</div>
                        </div>
                      )}
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => onViewBillDetail(bill)}
                          className="px-3 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20"
                        >
                          查看详细清单
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {filteredHistoryRequests.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-200 mb-4">
            {requestKindFilter === "expense"
              ? `支出申请历史 (${filteredHistoryRequests.length})`
              : requestKindFilter === "income"
                ? `收入申请历史 (${filteredHistoryRequests.length})`
                : `支出/收入申请历史 (${filteredHistoryRequests.length})`}
          </h2>
          <div className="space-y-4">
            {[...filteredHistoryRequests]
              .sort((a, b) => {
                const timeA = a.approvedAt || a.submittedAt || a.createdAt || "";
                const timeB = b.approvedAt || b.submittedAt || b.createdAt || "";
                return new Date(timeB).getTime() - new Date(timeA).getTime();
              })
              .map((request) => {
                const expenseIds = new Set(historyExpenseRequests.map((r) => r.id));
                const isExpense = expenseIds.has(request.id);
                const isIncome = !isExpense;
                const memoText =
                  getRequestStringField(request, "notes", "remark") || "";
                return (
                  <div
                    key={request.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 hover:border-primary-500/40 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">摘要</div>
                            <div className="text-lg font-semibold text-slate-100">
                              {request.summary}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">分类</div>
                            <div className="text-slate-200 font-medium">{request.category}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">店铺</div>
                            <div className="text-slate-300 text-sm">
                              {request.storeName || "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">状态</div>
                            <span
                              className={`px-2 py-1 rounded text-xs border ${
                                statusColors[request.status] ||
                                "bg-slate-500/20 text-slate-300 border-slate-500/40"
                              }`}
                            >
                              {statusLabels[request.status] || request.status}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">申请金额</div>
                            <div
                              className={`font-medium text-lg ${
                                isExpense ? "text-rose-300" : "text-emerald-300"
                              }`}
                            >
                              {formatCurrency(
                                request.amount,
                                request.currency,
                                isExpense ? "expense" : "income"
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">币种</div>
                            <div className="text-slate-300">{request.currency}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">申请日期</div>
                            <div className="text-slate-300">
                              {request.date
                                ? (typeof request.date === "string" ? request.date : new Date(request.date).toISOString().slice(0, 10))
                                : request.createdAt
                                ? new Date(request.createdAt).toISOString().slice(0, 10)
                                : "-"}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-400">
                          {request.createdBy && (
                            <div>
                              创建人：
                              <span className="text-cyan-300 font-medium">{request.createdBy}</span>
                            </div>
                          )}
                          {request.submittedAt && (
                            <div>
                              提交时间：
                              <span className="text-slate-100">
                                {new Date(request.submittedAt).toLocaleString("zh-CN")}
                              </span>
                            </div>
                          )}
                          {request.approvedBy && (
                            <div>
                              审批人：
                              <span className="text-cyan-300 font-medium">{request.approvedBy}</span>
                            </div>
                          )}
                          {request.approvedAt && (
                            <div>
                              审批时间：
                              <span className="text-slate-100">
                                {new Date(request.approvedAt).toLocaleString("zh-CN")}
                              </span>
                            </div>
                          )}
                          {"paidBy" in request && request.paidBy && (
                            <div>
                              付款人：
                              <span className="text-cyan-300 font-medium">{request.paidBy}</span>
                            </div>
                          )}
                          {"paidAt" in request && request.paidAt && (
                            <div>
                              付款时间：
                              <span className="text-slate-100">
                                {new Date(request.paidAt).toLocaleString("zh-CN")}
                              </span>
                            </div>
                          )}
                          {"receivedBy" in request && request.receivedBy && (
                            <div>
                              收款人：
                              <span className="text-cyan-300 font-medium">{request.receivedBy}</span>
                            </div>
                          )}
                          {"receivedAt" in request && request.receivedAt && (
                            <div>
                              收款时间：
                              <span className="text-slate-100">
                                {new Date(request.receivedAt).toLocaleString("zh-CN")}
                              </span>
                            </div>
                          )}
                        </div>
                        {request.rejectionReason && (
                          <div className="mt-3 rounded-md bg-rose-500/10 border border-rose-500/40 p-2">
                            <div className="text-xs text-rose-300 mb-1">退回原因</div>
                            <div className="text-rose-200 text-xs">{request.rejectionReason}</div>
                          </div>
                        )}
                        {memoText ? (
                          <div className="mt-3 rounded-md bg-slate-800/40 border-l-2 border-cyan-400/50 pl-3 pr-3 py-2">
                            <div className="text-xs text-slate-400 mb-1">备注</div>
                            <div className="text-slate-300 text-sm">{memoText}</div>
                          </div>
                        ) : null}
                        <div className="flex gap-2 mt-4">
                          <button
                            onClick={() => onOpenRequestDetail(request, isExpense ? "expense" : "income")}
                            className="px-3 py-1.5 rounded border border-primary-500/40 bg-primary-500/10 text-sm text-primary-100 hover:bg-primary-500/20"
                          >
                            查看详情
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
      <VoucherViewerModal viewer={voucherViewState} onClose={() => setVoucherViewState(null)} />
          </div>
  );
}

export const ApprovalList = memo(ApprovalListComponent);
