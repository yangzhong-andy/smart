"use client";

import { formatMoney, CURRENCY_SYMBOL } from "@/lib/constants/currency";
import { cn } from "@/lib/utils";

/**
 * 统一的金额显示组件
 * 支持通过 amountClassName 控制金额颜色（如收款绿、付款红）
 */
interface MoneyDisplayProps {
  amount: number | string;
  currency?: string;
  className?: string;
  showCurrency?: boolean; // 是否显示币种标识
  variant?: "default" | "highlight" | "muted";
  /** 金额数字的样式类名，用于收款/付款等场景（如 text-emerald-300 / text-rose-300） */
  amountClassName?: string;
}

export default function MoneyDisplay({
  amount,
  currency = "CNY",
  className,
  showCurrency = true,
  variant = "default",
  amountClassName
}: MoneyDisplayProps) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // 如果是 CNY 或 RMB，使用 formatMoney 函数
  if (currency === "CNY" || currency === "RMB") {
    const formatted = formatMoney(num);
    
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <span className={cn("font-semibold", amountClassName ?? "text-cyan-300")}>
          {formatted.replace(CURRENCY_SYMBOL, '')}
        </span>
        {showCurrency && (
          <span className="text-slate-500 text-xs font-normal">
            CNY
          </span>
        )}
      </span>
    );
  }
  
  // 其他币种使用原有逻辑
  const formatted = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));
  
  const symbol = currency === "USD" ? "$" : currency === "HKD" ? "HK$" : currency;
  
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className={cn(
        "font-semibold",
        amountClassName ?? (variant === "highlight" ? "text-cyan-300" : variant === "muted" ? "text-slate-400" : "text-slate-200")
      )}>
        {symbol}{formatted}
      </span>
      {showCurrency && currency !== "CNY" && (
        <span className="text-slate-500 text-xs font-normal">
          {currency}
        </span>
      )}
    </span>
  );
}
