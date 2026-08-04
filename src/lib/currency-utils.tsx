/**
 * 货币格式化工具函数
 */

import React from "react";

// 纯字符串货币格式化函数，用于文本消息（如弹窗提示）
export const formatCurrencyString = (
  value: number,
  currency: "USD" | "CNY" | "HKD" | string = "USD"
): string => {
  const num = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(num));

  // 确定符号
  const symbol = currency === "USD" ? "$" : currency === "CNY" ? "¥" : currency === "HKD" ? "HK$" : currency;

  return `${symbol}${formatted}`;
};

// 全局货币格式化函数，支持 USD/CNY，带颜色和符号（返回 React 元素）
export const formatCurrency = (
  value: number,
  currency: "USD" | "CNY" | "HKD" | string = "USD",
  type: "income" | "expense" | "balance" = "balance"
): React.ReactNode => {
  const num = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(num));

  // 确定颜色
  let colorClass = "text-slate-300"; // 默认颜色
  if (type === "income" || type === "balance") {
    colorClass = "text-emerald-300"; // 收入/余额用绿色
  } else if (type === "expense") {
    colorClass = "text-rose-300"; // 支出用红色
  }

  // 确定符号
  const symbol = currency === "USD" ? "$" : currency === "CNY" ? "¥" : currency === "HKD" ? "HK$" : currency;

  return (
    <span className={colorClass}>
      <span className="text-sm opacity-80">{symbol}</span>{" "}
      <span>{formatted}</span>
    </span>
  );
};
