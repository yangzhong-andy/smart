"use client";

import { formatCurrency } from "./types";
import type { MonthlyBill, BillStatus, BillType } from "./types";
import { procurementPaymentCoverageLabel } from "@/lib/procurement-payment-coverage";

const statusColors: Record<BillStatus, string> = {
  Draft: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  Pending_Finance_Review: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Pending_Approval: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Cashier_Approved: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Paid: "bg-purple-500/20 text-purple-300 border-purple-500/40",
};

const statusLabels: Record<BillStatus, string> = {
  Draft: "草稿",
  Pending_Finance_Review: "待财务审批",
  Pending_Approval: "待主管审批",
  Approved: "已核准",
  Cashier_Approved: "出纳已审核",
  Paid: "已支付",
};

const typeColors: Record<BillType, string> = {
  "广告": "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "物流": "bg-purple-500/20 text-purple-300 border-purple-500/40",
  "工厂订单": "bg-orange-500/20 text-orange-300 border-orange-500/40",
  "店铺回款": "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "广告返点": "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "其他": "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

type ActiveCategory = "Payable" | "Receivable";
type UserRole = "dept" | "finance" | "boss" | "cashier";

interface ReconciliationTableProps {
  bills: MonthlyBill[];
  activeCategory: ActiveCategory;
  userRole: UserRole;
  onViewDetail: (bill: MonthlyBill) => void;
  onOpenRebateDetail: (bill: MonthlyBill) => void;
  onSubmitForApproval: (billId: string) => void;
  onFinanceApprove: (billId: string) => void;
  onReject: (billId: string) => void;
  onApprove: (billId: string) => void;
  onPay: (billId: string) => void;
}

export function ReconciliationTable({
  bills,
  activeCategory,
  userRole,
  onViewDetail,
  onOpenRebateDetail,
  onSubmitForApproval,
  onFinanceApprove,
  onReject,
  onApprove,
  onPay,
}: ReconciliationTableProps) {
  if (bills.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400">
        暂无账单记录
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-800/60">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">类型</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">服务方</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">
              {activeCategory === "Receivable" ? "应收金额" : "应付金额"}
            </th>
            <th className="px-4 py-3 text-center font-medium text-slate-300">状态</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">操作人</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300 min-w-[120px]">备注</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {bills.map((bill) => {
            const serviceProviderName =
              bill.billType === "广告"
                ? bill.agencyName || bill.accountName || "-"
                : bill.billType === "物流"
                ? bill.supplierName || "-"
                : bill.billType === "工厂订单"
                ? bill.supplierName || bill.factoryName || "-"
                : bill.agencyName || "-";

            return (
              <tr key={bill.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 text-slate-300">{bill.month}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs border ${typeColors[bill.billType || "其他"]}`}>
                    {bill.billType || "其他"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-100">{serviceProviderName}</td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    activeCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {bill.billType === "广告返点" && (
                    <div className="text-xs text-slate-500 mb-0.5">
                      消耗：<span className="text-slate-400">{formatCurrency(bill.totalAmount, bill.currency, "expense")}</span>
                      <span className="ml-1 text-slate-600">
                        ({bill.totalAmount > 0 ? Math.round((bill.netAmount / bill.totalAmount) * 10000) / 100 : 0}%)
                      </span>
                    </div>
                  )}
                  {formatCurrency(
                    bill.billType === "广告返点" ? bill.netAmount : bill.totalAmount,
                    bill.currency,
                    activeCategory === "Receivable" ? "income" : "expense"
                  )}
                  {bill.billType === "广告返点" && <span className="ml-1 text-xs text-slate-500">返点</span>}
                  {bill.billType === "工厂订单" && (
                    <div className="mt-1 space-y-0.5 text-xs font-normal">
                      {(bill.actualPaidAmount || 0) > 0 && (
                        <div className="text-emerald-300">拿货单已付 {formatCurrency(bill.actualPaidAmount || 0, bill.currency, "expense")}</div>
                      )}
                      {(bill.depositDeductionAmount || 0) > 0 && (
                        <div className="text-cyan-300">定金抵扣 {formatCurrency(bill.depositDeductionAmount || 0, bill.currency, "expense")}</div>
                      )}
                      <div className={(bill.netAmount || 0) > 0.005 && bill.status !== "Paid" ? "text-rose-300" : "text-slate-500"}>
                        待付 {formatCurrency(bill.status === "Paid" ? 0 : Math.max(0, bill.netAmount || 0), bill.currency, "expense")}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {bill.status === "Paid" ? (
                    <span className={`px-2 py-1 rounded text-xs border ${bill.billCategory === "Receivable" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : statusColors.Paid}`}>
                      {bill.billCategory === "Receivable" ? "已回款" : "已支付"}
                    </span>
                  ) : bill.procurementPaymentCoverage?.blocked ? (
                    <span
                      className="inline-block max-w-[150px] rounded border border-blue-500/40 bg-blue-500/15 px-2 py-1 text-xs leading-5 text-blue-200"
                      title={`已关联 ${bill.procurementPaymentCoverage.activeRequestCount} 条拿货单付款申请`}
                    >
                      {procurementPaymentCoverageLabel(bill.procurementPaymentCoverage)}
                    </span>
                  ) : (
                    <span className={`px-2 py-1 rounded text-xs border ${statusColors[bill.status]}`}>
                      {statusLabels[bill.status]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs">{bill.paidBy || bill.approvedBy || bill.financeReviewedBy || bill.createdBy}</td>
                <td className="px-4 py-3 text-slate-400 text-xs max-w-[150px] truncate" title={bill.notes || bill.paymentRemarks || ""}>
                  {bill.paymentRemarks || bill.notes || "-"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onViewDetail(bill)}
                      className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20"
                    >
                      查看
                    </button>
                    {bill.billType === "广告返点" && bill.adAccountId && (
                      <button
                        onClick={() => onOpenRebateDetail(bill)}
                        className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-100 hover:bg-amber-500/20"
                      >
                        返点明细
                      </button>
                    )}
                    {bill.status === "Draft" && userRole === "dept" && !bill.procurementPaymentCoverage?.blocked && (
                      <button
                        onClick={() => onSubmitForApproval(bill.id)}
                        className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-100 hover:bg-amber-500/20"
                      >
                        提交给财务
                      </button>
                    )}
                    {bill.status === "Draft" && userRole === "dept" && bill.procurementPaymentCoverage?.blocked && (
                      <span className="px-2 py-1 text-xs text-slate-500" title="请在已发起的拿货单付款流程中继续处理">
                        无需重复提交
                      </span>
                    )}
                    {bill.status === "Pending_Finance_Review" && userRole === "finance" && (
                      <>
                        <button
                          onClick={() => onFinanceApprove(bill.id)}
                          className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-100 hover:bg-emerald-500/20"
                        >
                          财务审批通过
                        </button>
                        <button
                          onClick={() => onReject(bill.id)}
                          className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                        >
                          退回
                        </button>
                      </>
                    )}
                    {bill.status === "Pending_Approval" && userRole === "boss" && (
                      <>
                        <button
                          onClick={() => onApprove(bill.id)}
                          className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-100 hover:bg-emerald-500/20"
                        >
                          批准
                        </button>
                        <button
                          onClick={() => onReject(bill.id)}
                          className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                        >
                          退回
                        </button>
                      </>
                    )}
                    {bill.status === "Approved" && userRole === "cashier" && (
                      <button
                        onClick={() => onPay(bill.id)}
                        className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                      >
                        出纳打款
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
