"use client";

import Link from "next/link";
import { FileText, DollarSign } from "lucide-react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { ActionButton } from "@/components/ui";

export type ActionButtonsProps = {
  onOpenExpense: () => void;
  onOpenIncome: () => void;
  onOpenTransfer: () => void;
  onRefreshAll: () => Promise<void>;
};

export function ActionButtons({ onOpenExpense, onOpenIncome, onOpenTransfer, onRefreshAll }: ActionButtonsProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <InteractiveButton
          onClick={onOpenExpense}
          variant="danger"
          size="md"
          className="rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-rose-500/20 hover:from-rose-600 hover:to-rose-700"
        >
          登记支出
        </InteractiveButton>
        <InteractiveButton
          onClick={onOpenIncome}
          variant="success"
          size="md"
          className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700"
        >
          登记收入
        </InteractiveButton>
        <InteractiveButton
          onClick={onOpenTransfer}
          variant="primary"
          size="md"
          className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-blue-700"
        >
          内部划拨
        </InteractiveButton>
      </div>

      <InteractiveButton
        onClick={async () => {
          await onRefreshAll();
          toast.success("数据已刷新");
        }}
        variant="secondary"
        size="md"
        className="rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-300 hover:from-cyan-500/30 hover:to-blue-500/30 hover:border-cyan-400/50"
        title="刷新数据"
      >
        <span>🔄</span>
        <span>刷新数据</span>
      </InteractiveButton>

      <Link href="/finance/reconciliation">
        <ActionButton variant="secondary" icon={FileText}>
          对账中心
        </ActionButton>
      </Link>
      <Link href="/finance/cash-flow">
        <ActionButton variant="secondary" icon={DollarSign}>
          流水明细
        </ActionButton>
      </Link>
    </>
  );
}

