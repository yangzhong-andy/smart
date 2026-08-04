"use client";

import type { BillStatus, BillType } from "./types";

interface ReconciliationFiltersProps {
  filterType: BillType | "all";
  onFilterTypeChange: (value: BillType | "all") => void;
  filterStatus: BillStatus | "all";
  onFilterStatusChange: (value: BillStatus | "all") => void;
  availableBillTypes: string[];
}

const typeLabels: Record<string, string> = {
  "广告": "广告账单",
  "物流": "物流账单",
  "工厂订单": "工厂订单账单",
  "店铺回款": "店铺回款",
  "广告返点": "广告返点",
  "其他": "其他",
};

export function ReconciliationFilters({
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
  availableBillTypes,
}: ReconciliationFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={filterType}
        onChange={(e) => onFilterTypeChange(e.target.value as BillType | "all")}
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
      >
        <option value="all">全部类型</option>
        {availableBillTypes.map((type) => (
          <option key={type} value={type}>
            {typeLabels[type] ?? type}
          </option>
        ))}
      </select>
      <select
        value={filterStatus}
        onChange={(e) => onFilterStatusChange(e.target.value as BillStatus | "all")}
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
      >
        <option value="all">全部状态</option>
        <option value="Draft">草稿</option>
        <option value="Pending_Approval">待审批</option>
        <option value="Approved">已核准</option>
        <option value="Paid">已支付</option>
      </select>
    </div>
  );
}
