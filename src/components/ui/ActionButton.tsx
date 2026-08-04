"use client";

import { LucideIcon } from "lucide-react";
import { ButtonHTMLAttributes, ReactNode } from "react";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  isLoading?: boolean;
}

export default function ActionButton({
  variant = "primary",
  icon: Icon,
  iconPosition = "left",
  size = "md",
  children,
  isLoading = false,
  className = "",
  disabled,
  ...props
}: ActionButtonProps) {
  const baseStyles = "flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-300 relative overflow-hidden group";
  
  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base"
  };

  const variantStyles = {
    primary: "bg-primary-500 text-white shadow-lg hover:bg-primary-600 hover:shadow-primary-500/25 active:translate-y-px",
    secondary: "border border-slate-700 bg-slate-800/50 text-slate-300 shadow hover:bg-slate-700/50 hover:text-white",
    danger: "bg-rose-500 text-white shadow-lg hover:bg-rose-600 hover:shadow-rose-500/25 active:translate-y-px",
    ghost: "text-slate-300 hover:text-white hover:bg-white/5"
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${disabled || isLoading ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {/* 悬停光效 */}
      {!disabled && !isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}
      
      <span className="relative z-10 flex items-center gap-2">
        {isLoading ? (
          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          Icon && iconPosition === "left" && <Icon className="h-4 w-4" />
        )}
        {children}
        {Icon && iconPosition === "right" && !isLoading && <Icon className="h-4 w-4" />}
      </span>
    </button>
  );
}
