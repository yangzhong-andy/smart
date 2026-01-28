"use client";

import { formatMoney, CURRENCY_SYMBOL } from "@/lib/constants/currency";
import { cn } from "@/lib/utils";

/**
 * 统一的金额显示组件
 * 冰川蓝高亮金额 + 灰度显示 CNY 标识
 */
interface MoneyDisplayProps {
  amount: number | string;
  currency?: string;
  className?: string;
  showCurrency?: boolean; // 是否显示币种标识
  variant?: "default" | "highlight" | "muted";
}

export default function MoneyDisplay({
  amount,
  currency = "CNY",
  className,
  showCurrency = true,
  variant = "default"
}: MoneyDisplayProps) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // 如果是 CNY 或 RMB，使用 formatMoney 函数
  if (currency === "CNY" || currency === "RMB") {
    const formatted = formatMoney(num);
    
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <span className="text-cyan-300 font-semibold">
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
        variant === "highlight" ? "text-cyan-300" : variant === "muted" ? "text-slate-400" : "text-slate-200",
        "font-semibold"
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
