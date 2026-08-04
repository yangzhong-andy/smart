"use client";

import { SortAsc, SortDesc } from "lucide-react";
import { SearchBar } from "@/components/ui";
import type { Department, FilterStatus, SortBy, SortOrder } from "./types";

interface EmployeesFiltersProps {
  searchKeyword: string;
  onSearchChange: (value: string) => void;
  filterDepartment: Department | "all";
  onFilterDepartmentChange: (value: Department | "all") => void;
  filterStatus: FilterStatus;
  onFilterStatusChange: (value: FilterStatus) => void;
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortName: () => void;
  onSortJoinDate: () => void;
  departments: string[];
}

export function EmployeesFilters({
  searchKeyword,
  onSearchChange,
  filterDepartment,
  onFilterDepartmentChange,
  filterStatus,
  onFilterStatusChange,
  sortBy,
  sortOrder,
  onSortName,
  onSortJoinDate,
  departments,
}: EmployeesFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
      <SearchBar
        value={searchKeyword}
        onChange={onSearchChange}
        placeholder="搜索员工姓名、工号、岗位..."
      />

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">部门：</span>
        <select
          value={filterDepartment}
          onChange={(e) =>
            onFilterDepartmentChange(e.target.value as Department | "all")
          }
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">状态：</span>
        <select
          value={filterStatus}
          onChange={(e) =>
            onFilterStatusChange(e.target.value as FilterStatus)
          }
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部</option>
          <option value="在职">在职</option>
          <option value="试用期">试用期</option>
          <option value="离职">离职</option>
        </select>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-sm text-slate-400">排序：</span>
        <div className="flex gap-1">
          <button
            onClick={onSortName}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              sortBy === "name"
                ? "bg-primary-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            姓名
            {sortBy === "name" &&
              (sortOrder === "asc" ? (
                <SortAsc className="h-3 w-3" />
              ) : (
                <SortDesc className="h-3 w-3" />
              ))}
          </button>
          <button
            onClick={onSortJoinDate}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              sortBy === "joinDate"
                ? "bg-primary-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            入职日期
            {sortBy === "joinDate" &&
              (sortOrder === "asc" ? (
                <SortAsc className="h-3 w-3" />
              ) : (
                <SortDesc className="h-3 w-3" />
              ))}
          </button>
        </div>
      </div>
    </div>
  );
}
