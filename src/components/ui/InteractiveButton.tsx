"use client";

import React, { useState, ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InteractiveButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  showSuccessIcon?: boolean;
  successDuration?: number; // 成功图标显示时长（毫秒）
  className?: string;
}

/**
 * 交互式按钮组件
 * 支持自动 loading 状态和成功反馈
 */
export default function InteractiveButton({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  onClick,
  showSuccessIcon = true,
  successDuration = 1500,
  className,
  disabled,
  ...props
}: InteractiveButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading || showSuccess) return;

    if (onClick) {
      try {
        setIsLoading(true);
        await onClick(e);
        
        // 显示成功图标
        if (showSuccessIcon) {
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
          }, successDuration);
        }
      } catch (error) {
        // 错误处理由外部完成（如 toast.error）
        console.error("Button action error:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // 基础样式
  const baseStyles = "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  
  // 尺寸样式
  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm rounded-md",
    md: "px-4 py-2 text-sm rounded-lg",
    lg: "px-6 py-3 text-base rounded-lg",
  };

  // 变体样式
  const variantStyles = {
    primary: "bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700",
    secondary: "bg-slate-700 text-slate-200 hover:bg-slate-600 active:bg-slate-500",
    danger: "bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700",
    ghost: "bg-transparent text-slate-300 hover:bg-slate-800 active:bg-slate-700",
    success: "bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700",
  };

  // 渲染图标
  const renderIcon = () => {
    if (showSuccess) {
      return <CheckCircle2 className="h-4 w-4 text-emerald-400 animate-pulse" />;
    }
    if (isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (icon) {
      return icon;
    }
    return null;
  };

  const iconElement = renderIcon();
  const shouldShowIcon = iconElement !== null;

  return (
    <button
      {...props}
      onClick={handleClick}
      disabled={disabled || isLoading || showSuccess}
      className={cn(
        baseStyles,
        sizeStyles[size],
        variantStyles[variant],
        className
      )}
    >
      {shouldShowIcon && iconPosition === "left" && iconElement}
      {children}
      {shouldShowIcon && iconPosition === "right" && iconElement}
    </button>
  );
}
