"use client";

import { Search, X } from "lucide-react";

interface ContainerFiltersProps {
  searchKeyword: string;
  onSearchKeywordChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  filterMethod: string;
  onFilterMethodChange: (value: string) => void;
  statusCountMap: Record<string, number>;
}

export function ContainerFilters({
  searchKeyword,
  onSearchKeywordChange,
  filterStatus,
  onFilterStatusChange,
  filterMethod,
  onFilterMethodChange,
  statusCountMap,
}: ContainerFiltersProps) {
  const statusOptions = [
    { value: "all", label: "全部状态" },
    { value: "PLANNED", label: "已计划" },
    { value: "LOADING", label: "装柜中" },
    { value: "IN_TRANSIT", label: "在途" },
    { value: "ARRIVED_PORT", label: "已到港" },
    { value: "CUSTOMS_CLEAR", label: "清关完成" },
    { value: "IN_WAREHOUSE", label: "已入仓" },
    { value: "CLOSED", label: "已完结" },
  ];

  return (
    <section className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索柜号、船名、航次..."
          value={searchKeyword}
          onChange={(e) => onSearchKeywordChange(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 pl-10 pr-10 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
        />
        {searchKeyword && (
          <button
            type="button"
            onClick={() => onSearchKeywordChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">状态：</span>
          <div className="flex gap-2 flex-wrap">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFilterStatusChange(opt.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === opt.value
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {opt.label}
                {opt.value !== "all" && (
                  <span className="ml-1 text-[10px] opacity-80">({statusCountMap[opt.value] || 0})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">运输方式：</span>
          <select
            value={filterMethod}
            onChange={(e) => onFilterMethodChange(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="SEA">海运</option>
            <option value="AIR">空运</option>
            <option value="EXPRESS">快递</option>
          </select>
        </div>
      </div>
    </section>
  );
}

