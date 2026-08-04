"use client";

import { cn } from "@/lib/utils";

/**
 * 磨砂质感骨架屏组件
 * 用于按需加载时的占位显示
 */
interface SkeletonProps {
  className?: string;
  variant?: "default" | "card" | "text" | "avatar" | "button";
  lines?: number; // 文本行数
}

export default function Skeleton({ 
  className, 
  variant = "default",
  lines = 1 
}: SkeletonProps) {
  const baseClasses = "animate-pulse bg-gradient-to-r from-slate-800/50 via-slate-700/50 to-slate-800/50 bg-[length:200%_100%] animate-[shimmer_2s_infinite] rounded";
  
  const variants = {
    default: "h-4 w-full",
    card: "h-32 w-full rounded-lg",
    text: "h-4 w-full",
    avatar: "h-12 w-12 rounded-full",
    button: "h-10 w-24 rounded-lg"
  };

  if (variant === "text" && lines > 1) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              baseClasses,
              variants.text,
              i === lines - 1 && "w-3/4" // 最后一行短一些
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        baseClasses,
        variants[variant],
        className
      )}
      style={{
        background: "linear-gradient(90deg, rgba(30, 41, 59, 0.5) 0%, rgba(51, 65, 85, 0.5) 50%, rgba(30, 41, 59, 0.5) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 2s infinite"
      }}
    />
  );
}

/**
 * 卡片骨架屏
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-slate-800/50 bg-slate-900/40 p-4", className)}>
      <Skeleton variant="text" lines={2} className="mb-3" />
      <Skeleton variant="text" className="w-2/3" />
    </div>
  );
}

/**
 * 表格骨架屏
 */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} variant="text" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 详情页骨架屏
 */
export function SkeletonDetail() {
  return (
    <div className="space-y-4">
      <Skeleton variant="card" className="h-48" />
      <Skeleton variant="text" lines={3} />
      <Skeleton variant="text" lines={2} />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" />
      </div>
    </div>
  );
}
