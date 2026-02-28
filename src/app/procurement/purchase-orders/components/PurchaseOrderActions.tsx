"use client";

import { Eye, Truck, Trash2, FileText } from "lucide-react";
import type { PurchaseContract } from "./types";

type ExpenseRequest = { id: string; summary: string; status: string };

interface PurchaseOrderActionsProps {
  contract: PurchaseContract;
  expenseRequestsList: ExpenseRequest[];
  remainingQty: number;
  isSuperAdmin: boolean;
  onGenerateContract: (contractId: string) => void;
  onOpenDetail: (contractId: string) => void;
  onOpenDelivery: (contractId: string) => void;
  onPayment: (contractId: string, type: "deposit" | "tail", deliveryOrderId?: string) => void;
  onDelete: (contractId: string) => void;
}

export function PurchaseOrderActions({
  contract,
  expenseRequestsList,
  remainingQty,
  isSuperAdmin,
  onGenerateContract,
  onOpenDetail,
  onOpenDelivery,
  onPayment,
  onDelete,
}: PurchaseOrderActionsProps) {
  const depositRequest = expenseRequestsList.find((r) => {
    const isContractDeposit = r.summary.includes(`采购合同定金 - ${contract.contractNumber}`);
    return isContractDeposit && (r.status === "Pending_Approval" || r.status === "Approved" || r.status === "Paid");
  });
  const hasDepositRequest = !!depositRequest;
  const depositRequestStatus = depositRequest?.status;
  const depositPaid = contract.depositPaid ?? 0;

  return (
    <div className="flex flex-col gap-1 items-end">
      <button
        onClick={() => onGenerateContract(contract.id)}
        className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
        title="生成合同并预览/下载 PDF"
      >
        <FileText className="h-3 w-3" />
        生成合同
      </button>
      <button
        onClick={() => onOpenDetail(contract.id)}
        className="flex items-center gap-1 rounded-md border border-slate-600/40 bg-slate-800/40 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700/40"
      >
        <Eye className="h-3 w-3" />
        详情
      </button>
      {remainingQty > 0 && contract.status !== "待审批" && (
        <button
          onClick={() => onOpenDelivery(contract.id)}
          className="flex items-center gap-1 rounded-md border border-primary-500/40 bg-primary-500/10 px-2 py-1 text-xs font-medium text-primary-100 hover:bg-primary-500/20"
        >
          <Truck className="h-3 w-3" />
          发起拿货
        </button>
      )}
      {depositPaid < contract.depositAmount && (
        <>
          {hasDepositRequest ? (
            <button
              disabled
              className="rounded-md border border-slate-600/40 bg-slate-700/40 px-2 py-1 text-xs font-medium text-slate-400 cursor-not-allowed"
              title={`付款申请状态：${
                depositRequestStatus === "Pending_Approval"
                  ? "待审批"
                  : depositRequestStatus === "Approved"
                  ? "已审批"
                  : "已支付"
              }`}
            >
              {depositRequestStatus === "Pending_Approval"
                ? "审批中"
                : depositRequestStatus === "Approved"
                ? "已审批"
                : "已支付"}
            </button>
          ) : (
            <button
              onClick={() => onPayment(contract.id, "deposit")}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-500/20"
            >
              支付定金
            </button>
          )}
        </>
      )}
      {isSuperAdmin && (
        <button
          onClick={() => onDelete(contract.id)}
          className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-100 hover:bg-rose-500/20"
          title="删除合同（仅最高管理员）"
        >
          <Trash2 className="h-3 w-3" />
          删除
        </button>
      )}
    </div>
  );
}
