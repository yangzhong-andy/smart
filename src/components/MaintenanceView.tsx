"use client";

import { Wrench } from "lucide-react";

interface MaintenanceViewProps {
  /** 刷新回调，点击「重试」时触发 */
  onRetry?: () => void;
  /** 自定义描述文案 */
  description?: string;
  className?: string;
}

/**
 * API 报错时显示的「系统维护中」视图
 * 避免程序进入死循环请求，给用户明确反馈
 */
export default function MaintenanceView({
  onRetry,
  description = "系统维护中，请稍后再试",
  className = "",
}: MaintenanceViewProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[400px] p-8 text-center ${className}`}
    >
      <div className="rounded-full bg-amber-500/20 p-6 mb-6">
        <Wrench className="h-12 w-12 text-amber-400" />
      </div>
      <h2 className="text-xl font-semibold text-slate-100 mb-2">系统维护中</h2>
      <p className="text-slate-400 mb-6 max-w-md">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-6 py-2.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 hover:border-cyan-400/50 transition-colors font-medium"
        >
          重试
        </button>
      )}
    </div>
  );
}
