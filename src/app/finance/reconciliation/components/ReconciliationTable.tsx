"use client";

import { formatCurrency } from "./types";
import type { MonthlyBill, BillStatus, BillType } from "./types";

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
            <th className="px-4 py-3 text-right font-medium text-slate-300">账单金额</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">返点金额</th>
            <th className="px-4 py-3 text-right font-medium text-slate-300">
              {activeCategory === "Payable" ? "净应付" : "净应收"}
            </th>
            <th className="px-4 py-3 text-center font-medium text-slate-300">状态</th>
            <th className="px-4 py-3 text-left font-medium text-slate-300">创建人</th>
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
                ? bill.factoryName || "-"
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
                <td className="px-4 py-3 text-right">
                  {formatCurrency(bill.totalAmount, bill.currency, "expense")}
                </td>
                <td className="px-4 py-3 text-right text-emerald-300">
                  {formatCurrency(bill.rebateAmount || 0, bill.currency, "income")}
                </td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    activeCategory === "Receivable" ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {formatCurrency(bill.netAmount, bill.currency, activeCategory === "Receivable" ? "income" : "expense")}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-1 rounded text-xs border ${statusColors[bill.status]}`}>
                    {statusLabels[bill.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300 text-xs">{bill.createdBy}</td>
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
                    {bill.status === "Draft" && userRole === "dept" && (
                      <button
                        onClick={() => onSubmitForApproval(bill.id)}
                        className="px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-xs text-amber-100 hover:bg-amber-500/20"
                      >
                        提交给财务
                      </button>
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
