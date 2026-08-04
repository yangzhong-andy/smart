"use client";

import { Search, X } from "lucide-react";
import { InputHTMLAttributes } from "react";

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = "搜索...",
  className = "",
  ...props
}: SearchBarProps) {
  return (
    <div className={`relative flex-1 max-w-md ${className}`}>
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all duration-300"
        {...props}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
