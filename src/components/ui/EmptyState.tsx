"use client";

import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = ""
}: EmptyStateProps) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center ${className}`}>
      {Icon && (
        <Icon className="h-12 w-12 text-slate-500 mx-auto mb-4 opacity-50" />
      )}
      <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
      {description && (
        <p className="text-slate-400 mb-4 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
