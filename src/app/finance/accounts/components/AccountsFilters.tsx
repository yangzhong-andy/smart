"use client";

import { Search, X, SortAsc, SortDesc } from "lucide-react";

type AccountsFiltersProps = {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  sortBy: "balance" | "name" | "none";
  sortOrder: "asc" | "desc";
  setSortBy: (v: "balance" | "name" | "none") => void;
  setSortOrder: (v: "asc" | "desc") => void;
  filterCurrency: string;
  setFilterCurrency: (v: string) => void;
  filterAccountType: string;
  setFilterAccountType: (v: string) => void;
};

export function AccountsFilters({
  searchQuery,
  setSearchQuery,
  filterCategory,
  setFilterCategory,
  sortBy,
  sortOrder,
  setSortBy,
  setSortOrder,
  filterCurrency,
  setFilterCurrency,
  filterAccountType,
  setFilterAccountType,
}: AccountsFiltersProps) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="搜索账户名称或账号后四位..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-10 pr-10 text-sm text-slate-300 outline-none focus:border-primary-400"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">快速筛选：</span>
          <div className="flex gap-2">
            {(["all", "对公", "对私", "平台"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  filterCategory === cat ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {cat === "all" ? "全部" : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">排序：</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                if (sortBy === "balance" && sortOrder === "desc") {
                  setSortBy("balance");
                  setSortOrder("asc");
                } else {
                  setSortBy("balance");
                  setSortOrder("desc");
                }
              }}
              className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                sortBy === "balance" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              余额
              {sortBy === "balance" && (sortOrder === "desc" ? <SortDesc className="h-3 w-3" /> : <SortAsc className="h-3 w-3" />)}
            </button>
            <button
              type="button"
              onClick={() => {
                if (sortBy === "name" && sortOrder === "asc") {
                  setSortBy("name");
                  setSortOrder("desc");
                } else {
                  setSortBy("name");
                  setSortOrder("asc");
                }
              }}
              className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                sortBy === "name" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              名称
              {sortBy === "name" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </button>
            {sortBy !== "none" && (
              <button
                type="button"
                onClick={() => setSortBy("none")}
                className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
                title="清除排序"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">币种：</span>
          <select
            value={filterCurrency}
            onChange={(e) => setFilterCurrency(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="RMB">RMB</option>
            <option value="USD">USD</option>
            <option value="JPY">JPY</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">类型：</span>
          <select
            value={filterAccountType}
            onChange={(e) => setFilterAccountType(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="对公">对公</option>
            <option value="对私">对私</option>
            <option value="平台">平台</option>
          </select>
        </div>
      </div>
    </section>
  );
}
