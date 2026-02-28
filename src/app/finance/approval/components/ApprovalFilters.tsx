"use client";

import type { BillStatus, BillType } from "./types";

export type ActiveTab = "pending" | "history";

interface ApprovalFiltersProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  billTypeFilter: BillType | "all";
  onBillTypeFilterChange: (value: BillType | "all") => void;
  historyFilter: BillStatus | "all";
  onHistoryFilterChange: (value: BillStatus | "all") => void;
  pendingCount: number;
  historyCount: number;
}

export function ApprovalFilters({
  activeTab,
  onTabChange,
  billTypeFilter,
  onBillTypeFilterChange,
  historyFilter,
  onHistoryFilterChange,
  pendingCount,
  historyCount,
}: ApprovalFiltersProps) {
  return (
    <>
      <div className="flex gap-2 border-b border-slate-800/50 bg-slate-900/40 rounded-t-xl p-2">
        <button
          onClick={() => onTabChange("pending")}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
            activeTab === "pending"
              ? "border-primary-500 text-primary-400 bg-primary-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          待审批
          {(pendingCount > 0) && (
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === "pending"
                  ? "bg-primary-500/20 text-primary-300"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange("history")}
          className={`px-6 py-3 text-sm font-medium transition-all duration-200 border-b-2 ${
            activeTab === "history"
              ? "border-primary-500 text-primary-400 bg-primary-500/10"
              : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
          }`}
        >
          历史记录
          {(historyCount > 0) && (
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === "history"
                  ? "bg-primary-500/20 text-primary-300"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {historyCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">账单类型：</span>
          <select
            value={billTypeFilter}
            onChange={(e) => onBillTypeFilterChange(e.target.value as BillType | "all")}
            className="rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
          >
            <option value="all">全部类型</option>
            <option value="广告">广告</option>
            <option value="物流">物流</option>
            <option value="工厂订单">工厂订单</option>
            <option value="店铺回款">店铺回款</option>
            <option value="广告返点">广告返点</option>
            <option value="其他">其他</option>
          </select>
        </div>

        {activeTab === "history" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">筛选状态：</span>
            <select
              value={historyFilter}
              onChange={(e) => onHistoryFilterChange(e.target.value as BillStatus | "all")}
              className="rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            >
              <option value="all">全部状态</option>
              <option value="Approved">已批准</option>
              <option value="Paid">已支付</option>
              <option value="Draft">已退回</option>
            </select>
          </div>
        )}
      </div>
    </>
  );
}
