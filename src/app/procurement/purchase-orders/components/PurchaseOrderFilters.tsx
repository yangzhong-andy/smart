"use client";

import { Search, X } from "lucide-react";
import type { Supplier } from "./types";
import { STATUS_OPTIONS } from "./types";

interface PurchaseOrderFiltersProps {
  searchKeyword: string;
  onSearchKeywordChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  filterSupplier: string;
  onFilterSupplierChange: (value: string) => void;
  suppliers: Supplier[];
}

export function PurchaseOrderFilters({
  searchKeyword,
  onSearchKeywordChange,
  filterStatus,
  onFilterStatusChange,
  filterSupplier,
  onFilterSupplierChange,
  suppliers,
}: PurchaseOrderFiltersProps) {
  return (
    <section className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索合同编号、供应商、SKU..."
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
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
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
              </button>
            ))}
          </div>
        </div>

        {suppliers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">供应商：</span>
            <select
              value={filterSupplier}
              onChange={(e) => onFilterSupplierChange(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
            >
              <option value="all">全部</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </section>
  );
}
