"use client";

import { Search } from "lucide-react";

interface UsersFiltersProps {
  searchKeyword: string;
  onSearchChange: (value: string) => void;
}

export function UsersFilters({ searchKeyword, onSearchChange }: UsersFiltersProps) {
  return (
    <div className="bg-white/10 backdrop-blur-xl rounded-xl p-4 border border-white/20">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 text-white/70" />
        <input
          type="text"
          value={searchKeyword}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索姓名、邮箱、部门..."
          className="flex-1 bg-transparent text-white placeholder-white/50 outline-none"
        />
      </div>
    </div>
  );
}
