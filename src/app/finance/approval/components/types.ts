import type { BillStatus, BillType, MonthlyBill } from "@/lib/reconciliation-store";
import type { ExpenseRequest, IncomeRequest, RequestStatus } from "@/lib/expense-income-request-store";
import type { RebateReceivable } from "@/lib/rebate-receivable-store";

export type { BillStatus, BillType, MonthlyBill, ExpenseRequest, IncomeRequest, RequestStatus, RebateReceivable };

export type CombinedRequest = ExpenseRequest | IncomeRequest | MonthlyBill;

export type RejectModalState = {
  open: boolean;
  type: "bill" | "expense" | "income" | null;
  id: string | null;
};

export type ConfirmDialogState = {
  open: boolean;
  title?: string;
  message: string;
  type?: "danger" | "warning" | "info";
  onConfirm: () => void;
} | null;

export const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  Pending_Finance_Review: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Pending_Approval: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Cashier_Approved: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Paid: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  Rejected: "bg-red-500/10 text-red-400 border-red-500/30",
  Received: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
};

export const STATUS_LABELS: Record<string, string> = {
  Draft: "草稿",
  Pending_Finance_Review: "待财务审批",
  Pending_Approval: "待主管审批",
  Approved: "已核准",
  Cashier_Approved: "出纳已审核",
  Paid: "已支付",
  Rejected: "已退回",
  Received: "已收款",
};

export function getRequestField<T extends keyof CombinedRequest>(
  request: CombinedRequest,
  field: T
): CombinedRequest[T] | undefined {
  return field in request ? (request as Record<string, unknown>)[field] as CombinedRequest[T] : undefined;
}

export function getRequestStringField(request: CombinedRequest, ...fields: string[]): string {
  for (const field of fields) {
    const value = getRequestField(request, field as keyof CombinedRequest);
    if (value && typeof value === "string") return value;
  }
  return "";
}
