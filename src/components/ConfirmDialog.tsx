"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  type = "warning",
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  // 处理 ESC 键关闭
  useEffect(() => {
    if (!open) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onCancel]);

  // 防止背景滚动
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const iconColors = {
    danger: "text-rose-500",
    warning: "text-amber-500",
    info: "text-primary-500"
  };

  const confirmButtonColors = {
    danger: "bg-rose-600 hover:bg-rose-700 border-rose-500/40 text-white",
    warning: "bg-amber-600 hover:bg-amber-700 border-amber-500/40 text-white",
    info: "bg-primary-600 hover:bg-primary-700 border-primary-500/40 text-white"
  };

  // 处理换行显示
  const messageLines = message.split("\n");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* 对话框 */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl p-6 shadow-2xl shadow-[#00E5FF]/10 animate-in zoom-in-95 duration-200">
        {/* 关闭按钮 */}
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200 transition-colors rounded-lg p-1 hover:bg-slate-800/50"
          aria-label="关闭"
        >
          <X size={18} />
        </button>

        {/* 图标和标题 */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br ${
            type === "danger" ? "from-rose-500/20 to-rose-600/20" :
            type === "warning" ? "from-amber-500/20 to-amber-600/20" :
            "from-primary-500/20 to-primary-600/20"
          } flex items-center justify-center border ${
            type === "danger" ? "border-rose-500/30" :
            type === "warning" ? "border-amber-500/30" :
            "border-primary-500/30"
          }`}>
            <AlertTriangle 
              size={24} 
              className={iconColors[type]}
            />
          </div>
          
          <div className="flex-1 pt-1">
            {title && (
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                {title}
              </h3>
            )}
            <div className="text-sm text-slate-300 leading-relaxed">
              {messageLines.map((line, index) => (
                <p key={index} className={index > 0 ? "mt-2" : ""}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* 按钮组 */}
        <div className="flex gap-3 mt-6 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg transition-all duration-200 hover:border-slate-600/50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 border shadow-lg shadow-black/20 ${confirmButtonColors[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
