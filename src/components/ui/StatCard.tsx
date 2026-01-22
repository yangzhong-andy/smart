"use client";

import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: string;
  gradient?: string;
  trend?: {
    value: number;
    label: string;
    isPositive?: boolean;
  };
  children?: ReactNode;
  className?: string;
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-primary-300",
  gradient = "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
  trend,
  children,
  className = ""
}: StatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02] ${className}`}
      style={{
        background: gradient,
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
      }}
    >
      {/* 背景装饰 */}
      <div 
        className="absolute top-0 right-0 w-32 h-32 opacity-10"
        style={{
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%)"
        }}
      />
      
      <div className="flex items-center justify-between relative z-10">
        <div className="flex-1">
          <p className="text-xs text-slate-400 mb-2 font-medium tracking-wide">{title}</p>
          <p 
            className="text-2xl font-bold text-slate-100 mb-1" 
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {value}
          </p>
          {trend && (
            <div className={`text-xs font-medium mt-1 ${
              trend.isPositive ? "text-emerald-400" : "text-rose-400"
            }`}>
              {trend.isPositive ? "↑" : "↓"} {trend.value} {trend.label}
            </div>
          )}
          {children}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl bg-white/5 ${iconColor}`}>
            <Icon className="h-8 w-8 opacity-80" />
          </div>
        )}
      </div>
    </div>
  );
}
