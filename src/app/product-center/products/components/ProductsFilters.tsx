"use client";

import { Search, X, SortAsc, SortDesc } from "lucide-react";
import type { ProductStatus } from "@/lib/products-store";

type SortBy = "name" | "cost" | "created" | "none";
type SortOrder = "asc" | "desc";

type SupplierOption = { id: string; name: string };

type ProductsFiltersProps = {
  searchKeyword: string;
  onSearchKeywordChange: (v: string) => void;
  filterStatus: ProductStatus | "all";
  onFilterStatusChange: (v: ProductStatus | "all") => void;
  filterCategory: string;
  onFilterCategoryChange: (v: string) => void;
  filterFactory: string;
  onFilterFactoryChange: (v: string) => void;
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortChange: (by: SortBy, order: SortOrder) => void;
  categories: string[];
  suppliers: SupplierOption[];
};

export function ProductsFilters({
  searchKeyword,
  onSearchKeywordChange,
  filterStatus,
  onFilterStatusChange,
  filterCategory,
  onFilterCategoryChange,
  filterFactory,
  onFilterFactoryChange,
  sortBy,
  sortOrder,
  onSortChange,
  categories,
  suppliers
}: ProductsFiltersProps) {
  return (
    <section className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索 SKU、产品名称、分类或工厂..."
          value={searchKeyword}
          onChange={(e) => onSearchKeywordChange(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 pl-10 pr-10 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
        />
        {searchKeyword && (
          <button
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
            <button
              onClick={() => onFilterStatusChange("all")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filterStatus === "all" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              全部
            </button>
            <button
              onClick={() => onFilterStatusChange("ACTIVE")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filterStatus === "ACTIVE" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              在售
            </button>
            <button
              onClick={() => onFilterStatusChange("INACTIVE")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filterStatus === "INACTIVE" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              下架
            </button>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">分类：</span>
            <select
              value={filterCategory}
              onChange={(e) => onFilterCategoryChange(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
            >
              <option value="all">全部</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {suppliers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">工厂：</span>
            <select
              value={filterFactory}
              onChange={(e) => onFilterFactoryChange(e.target.value)}
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

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">排序：</span>
          <div className="flex gap-1">
            <button
              onClick={() => {
                if (sortBy === "name") {
                  onSortChange("name", sortOrder === "asc" ? "desc" : "asc");
                } else {
                  onSortChange("name", "asc");
                }
              }}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                sortBy === "name" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              名称
              {sortBy === "name" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </button>
            <button
              onClick={() => {
                if (sortBy === "cost") {
                  onSortChange("cost", sortOrder === "asc" ? "desc" : "asc");
                } else {
                  onSortChange("cost", "desc");
                }
              }}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                sortBy === "cost" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              价格
              {sortBy === "cost" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </button>
            <button
              onClick={() => {
                if (sortBy === "created") {
                  onSortChange("created", sortOrder === "asc" ? "desc" : "asc");
                } else {
                  onSortChange("created", "desc");
                }
              }}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                sortBy === "created" ? "bg-primary-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              创建时间
              {sortBy === "created" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
