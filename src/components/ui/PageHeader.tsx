"use client";

import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  actions,
  className = ""
}: PageHeaderProps) {
  return (
    <header className={`flex items-baseline justify-between gap-3 ${className}`}>
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-white mb-1.5">{title}</h1>
        {description && (
          <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex gap-2 items-center">
          {actions}
        </div>
      )}
    </header>
  );
}
