"use client";

import { formatCurrency } from "@/lib/currency-utils";
import { STATUS_COLORS, STATUS_LABELS } from "./types";
import type { MonthlyBill } from "@/lib/reconciliation-store";
import type { ExpenseRequest, IncomeRequest } from "@/lib/expense-income-request-store";
import type { RebateReceivable } from "@/lib/rebate-receivable-store";
import type { RejectModalState } from "./types";

interface ApprovalDetailDialogProps {
  isDetailModalOpen: boolean;
  selectedBill: MonthlyBill | null;
  onCloseBillDetail: () => void;
  isRequestDetailOpen: boolean;
  selectedExpenseRequest: ExpenseRequest | null;
  selectedIncomeRequest: IncomeRequest | null;
  onCloseRequestDetail: () => void;
  rejectModal: RejectModalState;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  rejectSubmitting: boolean;
  onConfirmReject: () => void;
  onCloseReject: () => void;
  voucherViewModal: string | null;
  onCloseVoucher: () => void;
  recharges: Array<Record<string, unknown>>;
  consumptions: Array<Record<string, unknown>>;
  rebateReceivables: RebateReceivable[];
  onVoucherView: (url: string | null) => void;
}

export function ApprovalDetailDialog({
  isDetailModalOpen,
  selectedBill,
  onCloseBillDetail,
  isRequestDetailOpen,
  selectedExpenseRequest,
  selectedIncomeRequest,
  onCloseRequestDetail,
  rejectModal,
  rejectReason,
  onRejectReasonChange,
  rejectSubmitting,
  onConfirmReject,
  onCloseReject,
  voucherViewModal,
  onCloseVoucher,
  recharges,
  consumptions,
  rebateReceivables,
  onVoucherView,
}: ApprovalDetailDialogProps) {
  const statusColors = STATUS_COLORS;
  const statusLabels = STATUS_LABELS;

  return (
    <>
      {/* 账单详情弹窗 */}
      {isDetailModalOpen && selectedBill && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#0B0C10]/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">
                账单详细清单 - {selectedBill.month}
              </h2>
              <button
                onClick={onCloseBillDetail}
                className="text-slate-400 hover:text-slate-200 text-xl"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-800/60 rounded-lg p-4 border border-white/10">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单ID</div>
                    <div className="text-slate-300 text-xs font-mono">
                      {selectedBill.id.slice(0, 20)}...
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单月份</div>
                    <div className="text-slate-100 font-medium">{selectedBill.month}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单类型</div>
                    <div className="text-slate-100">{selectedBill.billType || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单分类</div>
                    <div
                      className={`px-2 py-1 rounded text-xs border inline-block ${
                        selectedBill.billCategory === "Receivable"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                      }`}
                    >
                      {selectedBill.billCategory === "Receivable" ? "应收款" : "应付款"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">服务方</div>
                    <div className="text-slate-100 font-medium">
                      {selectedBill.agencyName ||
                        selectedBill.supplierName ||
                        selectedBill.factoryName ||
                        "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">状态</div>
                    <span
                      className={`px-2 py-1 rounded text-xs border ${
                        statusColors[selectedBill.status] ||
                        "bg-slate-500/20 text-slate-300 border-slate-500/40"
                      }`}
                    >
                      {statusLabels[selectedBill.status] || selectedBill.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/60 rounded-lg p-4 border border-white/10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">币种</div>
                    <div className="text-slate-100 font-medium">{selectedBill.currency}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">账单金额</div>
                    <div className="text-slate-100 font-medium">
                      {formatCurrency(
                        selectedBill.totalAmount,
                        selectedBill.currency,
                        "expense"
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">返点金额</div>
                    <div className="text-emerald-300 font-medium">
                      {selectedBill.billType === "广告"
                        ? "-"
                        : formatCurrency(
                            selectedBill.rebateAmount,
                            selectedBill.currency,
                            "income"
                          )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 mb-1">
                      {selectedBill.billCategory === "Receivable" ? "净应收" : "净应付"}
                    </div>
                    <div
                      className={`font-bold text-lg ${
                        selectedBill.billCategory === "Receivable"
                          ? "text-emerald-300"
                          : "text-rose-300"
                      }`}
                    >
                      {formatCurrency(
                        selectedBill.netAmount,
                        selectedBill.currency,
                        selectedBill.billCategory === "Receivable" ? "income" : "expense"
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {selectedBill.rechargeIds && selectedBill.rechargeIds.length > 0 && (
                <div className="bg-slate-800/60 rounded-lg p-4 border border-white/10">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">关联充值记录</div>
                      <div className="text-slate-100 font-medium">
                        {selectedBill.rechargeIds.length} 笔
                      </div>
                    </div>
                    {selectedBill.consumptionIds && selectedBill.consumptionIds.length > 0 && (
                      <div>
                        <div className="text-xs text-slate-400 mb-1">关联消耗记录</div>
                        <div className="text-slate-100 font-medium">
                          {selectedBill.consumptionIds.length} 笔
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selectedBill.notes && (
                <div>
                  <div className="text-xs text-slate-400 mb-1">备注</div>
                  <div className="text-slate-300 text-sm">{selectedBill.notes}</div>
                </div>
              )}
              {selectedBill.rejectionReason && (
                <div className="rounded-md bg-rose-500/10 border border-rose-500/40 p-3">
                  <div className="text-xs text-rose-300 mb-1">退回原因</div>
                  <div className="text-rose-200 text-sm">{selectedBill.rejectionReason}</div>
                </div>
              )}
              {((selectedBill.billType === "广告" ||
                selectedBill.billType === "广告返点") &&
                selectedBill.rechargeIds &&
                selectedBill.rechargeIds.length > 0) && (
                <div className="border-t border-white/10 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">关联充值记录</div>
                  <div className="rounded-lg border border-white/10 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/60">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-300">充值日期</th>
                          <th className="px-3 py-2 text-left text-slate-300">账户名称</th>
                          <th className="px-3 py-2 text-right text-slate-300">充值金额</th>
                          <th className="px-3 py-2 text-right text-slate-300">返点金额</th>
                          <th className="px-3 py-2 text-center text-slate-300">凭证</th>
                          <th className="px-3 py-2 text-left text-slate-300">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedBill.rechargeIds.map((rechargeId: string) => {
                          const recharge = recharges.find(
                            (r: Record<string, unknown>) => r.id === rechargeId
                          ) as Record<string, unknown> | undefined;
                          if (!recharge) {
                            return (
                              <tr key={rechargeId} className="hover:bg-slate-800/40">
                                <td colSpan={6} className="px-3 py-2 text-slate-500 text-xs text-center">
                                  充值记录 {rechargeId} 不存在或已被删除
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={rechargeId} className="hover:bg-slate-800/40">
                              <td className="px-3 py-2 text-slate-300">
                                {String(recharge.date ?? "-")}
                              </td>
                              <td className="px-3 py-2 text-slate-100 font-medium">
                                {String(recharge.accountName ?? "-")}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-100 font-medium">
                                {formatCurrency(
                                  Number(recharge.amount ?? 0),
                                  String(recharge.currency ?? "USD"),
                                  "expense"
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-emerald-300 font-medium">
                                {formatCurrency(
                                  Number(recharge.rebateAmount ?? 0),
                                  String(recharge.currency ?? "USD"),
                                  "income"
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {recharge.voucher &&
                                String(recharge.voucher).length > 10 ? (
                                  <button
                                    onClick={() =>
                                      onVoucherView(String(recharge.voucher) || null)
                                    }
                                    className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                                  >
                                    查看
                                  </button>
                                ) : (
                                  <span className="text-slate-500 text-xs">无</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-400 text-xs">
                                {String(recharge.notes ?? "-")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {selectedBill.billType === "广告返点" &&
                selectedBill.adAccountId &&
                (() => {
                  const receivable = rebateReceivables.find(
                    (r) =>
                      r.adAccountId === selectedBill!.adAccountId &&
                      selectedBill!.rechargeIds?.some((rechargeId) => r.rechargeId === rechargeId)
                  );
                  if (!receivable) {
                    return (
                      <div className="border-t border-white/10 pt-4">
                        <div className="text-sm font-medium text-slate-300 mb-3">返点明细</div>
                        <div className="text-center py-4 text-slate-500 bg-slate-800/60 rounded-lg">
                          未找到关联的返点应收款记录
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="border-t border-white/10 pt-4">
                      <div className="text-sm font-medium text-slate-300 mb-3">返点明细</div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 bg-slate-800/60 rounded-lg p-4">
                          <div>
                            <div className="text-xs text-slate-400 mb-1">返点总额</div>
                            <div className="text-emerald-300 font-bold text-lg">
                              {formatCurrency(receivable.rebateAmount, receivable.currency, "income")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">当前余额</div>
                            <div
                              className={`font-bold text-lg ${
                                receivable.currentBalance > 0 ? "text-emerald-300" : "text-slate-400"
                              }`}
                            >
                              {formatCurrency(receivable.currentBalance, receivable.currency, "income")}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">状态</div>
                            <div
                              className={`px-2 py-1 rounded text-xs border inline-block ${
                                receivable.status === "已结清"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : receivable.status === "核销中"
                                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                    : "bg-slate-500/20 text-slate-300 border-slate-500/40"
                              }`}
                            >
                              {receivable.status}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">产生日期</div>
                            <div className="text-slate-100">{receivable.rechargeDate}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">所属板块</div>
                            <div className="text-slate-100">{receivable.platform}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-400 mb-1">代理商</div>
                            <div className="text-slate-100">{receivable.agencyName}</div>
                          </div>
                        </div>
                        {receivable.writeoffRecords.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-slate-300 mb-2">核销流水</div>
                            <div className="rounded-lg border border-white/10 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-800/60">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-slate-300">消耗日期</th>
                                    <th className="px-3 py-2 text-left text-slate-300">关联消耗ID</th>
                                    <th className="px-3 py-2 text-right text-slate-300">核销金额</th>
                                    <th className="px-3 py-2 text-right text-slate-300">剩余余额</th>
                                    <th className="px-3 py-2 text-left text-slate-300">核销时间</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {receivable.writeoffRecords.map((record) => {
                                    const relatedConsumption = consumptions.find(
                                      (c: Record<string, unknown>) => c.id === record.consumptionId
                                    ) as Record<string, unknown> | undefined;
                                    return (
                                      <tr key={record.id} className="hover:bg-slate-800/40">
                                        <td className="px-3 py-2 text-slate-300">
                                          {record.consumptionDate}
                                        </td>
                                        <td className="px-3 py-2 text-slate-400 text-xs font-mono">
                                          {record.consumptionId.slice(0, 8)}...
                                          {relatedConsumption && (
                                            <div className="text-slate-500 mt-1">
                                              {String(
                                                relatedConsumption.storeName ||
                                                  relatedConsumption.campaignName ||
                                                  "-"
                                              )}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-amber-300 font-medium">
                                          {formatCurrency(
                                            record.writeoffAmount,
                                            receivable.currency,
                                            "expense"
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-300">
                                          {formatCurrency(
                                            record.remainingBalance,
                                            receivable.currency,
                                            "income"
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-slate-400 text-xs">
                                          {new Date(record.createdAt).toLocaleString("zh-CN")}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                        {receivable.adjustments.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-slate-300 mb-2">手动修正记录</div>
                            <div className="rounded-lg border border-white/10 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-800/60">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-slate-300">修正金额</th>
                                    <th className="px-3 py-2 text-left text-slate-300">修正原因</th>
                                    <th className="px-3 py-2 text-left text-slate-300">修正人</th>
                                    <th className="px-3 py-2 text-left text-slate-300">修正时间</th>
                                    <th className="px-3 py-2 text-right text-slate-300">修正前余额</th>
                                    <th className="px-3 py-2 text-right text-slate-300">修正后余额</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {receivable.adjustments.map((adj) => (
                                    <tr key={adj.id} className="hover:bg-slate-800/40">
                                      <td
                                        className={`px-3 py-2 font-medium ${
                                          adj.amount > 0 ? "text-emerald-300" : "text-rose-300"
                                        }`}
                                      >
                                        {adj.amount > 0 ? "+" : ""}
                                        {formatCurrency(
                                          adj.amount,
                                          receivable.currency,
                                          adj.amount > 0 ? "income" : "expense"
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-slate-300">{adj.reason}</td>
                                      <td className="px-3 py-2 text-slate-300 text-xs">
                                        {adj.adjustedBy}
                                      </td>
                                      <td className="px-3 py-2 text-slate-400 text-xs">
                                        {new Date(adj.adjustedAt).toLocaleString("zh-CN")}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-300">
                                        {formatCurrency(
                                          adj.balanceBefore,
                                          receivable.currency,
                                          "income"
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right text-emerald-300">
                                        {formatCurrency(
                                          adj.balanceAfter,
                                          receivable.currency,
                                          "income"
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                        {receivable.writeoffRecords.length === 0 &&
                          receivable.adjustments.length === 0 && (
                            <div className="text-center py-4 text-slate-500 bg-slate-800/60 rounded-lg">
                              暂无核销记录和修正记录
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })()}

              {selectedBill.consumptionIds && selectedBill.consumptionIds.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">
                    关联消耗记录 ({selectedBill.consumptionIds.length} 条)
                  </div>
                  <div className="rounded-lg border border-white/10 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/60">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-300">日期</th>
                          <th className="px-3 py-2 text-left text-slate-300">账户</th>
                          <th className="px-3 py-2 text-right text-slate-300">消耗金额</th>
                          <th className="px-3 py-2 text-center text-slate-300">凭证</th>
                          <th className="px-3 py-2 text-left text-slate-300">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedBill.consumptionIds.map((consumptionId: string) => {
                          const consumption = consumptions.find(
                            (c: Record<string, unknown>) => c.id === consumptionId
                          ) as Record<string, unknown> | undefined;
                          if (!consumption) {
                            return (
                              <tr key={consumptionId} className="hover:bg-slate-800/40">
                                <td colSpan={5} className="px-3 py-2 text-slate-500 text-xs text-center">
                                  消耗记录不存在或已被删除
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={consumptionId} className="hover:bg-slate-800/40">
                              <td className="px-3 py-2 text-slate-300">
                                {String(consumption.date ?? "-")}
                              </td>
                              <td className="px-3 py-2 text-slate-100 font-medium">
                                {String(consumption.accountName ?? "-")}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-100 font-medium">
                                {formatCurrency(
                                  Number(consumption.amount ?? 0),
                                  String(consumption.currency ?? "USD"),
                                  "expense"
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {consumption.voucher &&
                                String(consumption.voucher).length > 10 ? (
                                  <button
                                    onClick={() =>
                                      onVoucherView(String(consumption.voucher) || null)
                                    }
                                    className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                                  >
                                    查看
                                  </button>
                                ) : (
                                  <span className="text-slate-500 text-xs">无</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-400 text-xs">
                                {String(consumption.notes ?? "-")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="border-t border-white/10 pt-4">
                <div className="text-sm font-medium text-slate-300 mb-3">审批流程</div>
                <div className="bg-slate-800/60 rounded-lg p-4 space-y-3">
                  {selectedBill.createdBy && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500" />
                      <div className="flex-1">
                        <div className="text-xs text-slate-400">创建</div>
                        <div className="text-sm text-slate-200">{selectedBill.createdBy}</div>
                        {selectedBill.createdAt && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(selectedBill.createdAt).toLocaleString("zh-CN")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedBill.approvedBy && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500" />
                      <div className="flex-1">
                        <div className="text-xs text-slate-400">审批通过</div>
                        <div className="text-sm text-slate-200">{selectedBill.approvedBy}</div>
                        {selectedBill.approvedAt && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(selectedBill.approvedAt).toLocaleString("zh-CN")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedBill.rejectionReason && (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-rose-500" />
                      <div className="flex-1">
                        <div className="text-xs text-rose-400">退回修改</div>
                        <div className="text-sm text-rose-200">{selectedBill.rejectionReason}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 支出/收入申请详情弹窗 */}
      {isRequestDetailOpen && (selectedExpenseRequest || selectedIncomeRequest) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-100">
                {selectedExpenseRequest ? "支出申请详情" : "收入申请详情"}
              </h2>
              <button
                onClick={onCloseRequestDetail}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              {selectedExpenseRequest ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">摘要</div>
                      <div className="text-slate-100">{selectedExpenseRequest.summary}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">金额</div>
                      <div className="text-slate-100">
                        {formatCurrency(
                          selectedExpenseRequest.amount,
                          selectedExpenseRequest.currency,
                          "expense"
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">分类</div>
                      <div className="text-slate-100">{selectedExpenseRequest.category}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">店铺/国家</div>
                      <div className="text-slate-100">
                        {selectedExpenseRequest.storeName ||
                          selectedExpenseRequest.country ||
                          "-"}
                      </div>
                    </div>
                  </div>
                  {"approvalDocument" in selectedExpenseRequest &&
                    selectedExpenseRequest.approvalDocument && (
                      <div>
                        <div className="text-xs text-slate-400 mb-1">老板签字申请单</div>
                        <img
                          src={
                            Array.isArray(selectedExpenseRequest.approvalDocument)
                              ? selectedExpenseRequest.approvalDocument[0]
                              : selectedExpenseRequest.approvalDocument
                          }
                          alt="申请单"
                          className="max-w-full max-h-96 rounded-md border border-slate-700"
                        />
                      </div>
                    )}
                  {(selectedExpenseRequest as ExpenseRequest & { remark?: string }).remark && (
                    <div className="rounded-md bg-slate-800/40 border-l-2 border-cyan-400/50 pl-3 pr-3 py-2">
                      <div className="text-xs text-slate-400 mb-1">备注</div>
                      <div className="text-slate-300">
                        {(selectedExpenseRequest as ExpenseRequest & { remark?: string }).remark}
                      </div>
                    </div>
                  )}
                </>
              ) : selectedIncomeRequest ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">摘要</div>
                      <div className="text-slate-100">{selectedIncomeRequest.summary}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">金额</div>
                      <div className="text-slate-100">
                        {formatCurrency(
                          selectedIncomeRequest.amount,
                          selectedIncomeRequest.currency,
                          "income"
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">分类</div>
                      <div className="text-slate-100">{selectedIncomeRequest.category}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">店铺</div>
                      <div className="text-slate-100">
                        {selectedIncomeRequest.storeName || "-"}
                      </div>
                    </div>
                  </div>
                  {(selectedIncomeRequest as IncomeRequest & { remark?: string }).remark && (
                    <div className="rounded-md bg-slate-800/40 border-l-2 border-cyan-400/50 pl-3 pr-3 py-2">
                      <div className="text-xs text-slate-400 mb-1">备注</div>
                      <div className="text-slate-300">
                        {(selectedIncomeRequest as IncomeRequest & { remark?: string }).remark}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 退回原因输入弹窗 */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">退回原因</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  请输入退回原因 *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => onRejectReasonChange(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="请详细说明退回原因..."
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={onCloseReject}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={onConfirmReject}
                  disabled={rejectSubmitting}
                  className="px-4 py-2 rounded-md bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rejectSubmitting ? "处理中..." : "确认退回"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 凭证查看弹窗 */}
      {voucherViewModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 9999 }}
          onClick={onCloseVoucher}
        >
          <div
            className="relative max-w-5xl max-h-[95vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onCloseVoucher}
              className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300 z-10 bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
            >
              ✕
            </button>
            {(() => {
              let imageSrc = voucherViewModal;
              if (
                /^[A-Za-z0-9+/=]+$/.test(voucherViewModal) &&
                voucherViewModal.length > 100 &&
                !voucherViewModal.startsWith("data:")
              ) {
                imageSrc = `data:image/jpeg;base64,${voucherViewModal}`;
              }
              return (
                <img
                  src={imageSrc}
                  alt="凭证"
                  className="max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector(".error-message")) {
                      const errorDiv = document.createElement("div");
                      errorDiv.className =
                        "error-message text-white text-center p-8 bg-rose-500/20 rounded-lg border border-rose-500/40";
                      errorDiv.innerHTML = `<div class="text-rose-300 text-lg mb-2">❌ 图片加载失败</div><div class="text-slate-300 text-sm">请检查图片格式或数据是否正确</div>`;
                      parent.appendChild(errorDiv);
                    }
                  }}
                />
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
