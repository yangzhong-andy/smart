"use client";

import { Search } from "lucide-react";
import { AGENCY_PLATFORM_OPTIONS } from "./types";

interface AgencyFiltersProps {
  platformFilter: string;
  onPlatformFilterChange: (value: string) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function AgencyFilters({
  platformFilter,
  onPlatformFilterChange,
  keyword,
  onKeywordChange,
  hasActiveFilters,
  onClearFilters,
}: AgencyFiltersProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[140px]">
          <label className="block text-xs text-slate-400 mb-1.5">平台</label>
          <select
            value={platformFilter}
            onChange={(e) => onPlatformFilterChange(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400 transition"
          >
            <option value="all">全部</option>
            {AGENCY_PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-400 mb-1.5">关键词</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              placeholder="搜索代理商名称、联系人..."
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-slate-700 bg-slate-900 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-primary-400 transition"
            />
          </div>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-4 py-1.5 text-sm text-slate-300 hover:text-slate-100 border border-slate-700 rounded-md hover:bg-slate-800 transition"
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  );
}
