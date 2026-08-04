"use client";
import React from "react";

/**
 * 通用：把账户列表按币种分组成 <optgroup>+<option> 列表
 * 用法：
 *   <select ...>
 *     <option value="">请选择</option>
 *     {renderGroupedAccountOptions(accounts)}
 *   </select>
 */

const CURRENCY_LABELS: Record<string, string> = {
  CNY: "人民币",
  RMB: "人民币",
  USD: "美元",
  JPY: "日元",
  EUR: "欧元",
  GBP: "英镑",
  HKD: "港币",
  SGD: "新加坡元",
  AUD: "澳元",
};

const CURRENCY_ORDER = ["CNY", "RMB", "USD", "JPY", "EUR", "GBP", "HKD", "SGD", "AUD"];

/** 格式化账户余额（带币种符号） */
export function formatAccountBalance(acc: any): string {
  const displayBalance = Number(acc.originalBalance ?? acc.balance ?? 0) || 0;
  const cur = acc.currency || "CNY";
  try {
    if (cur === "CNY" || cur === "RMB") {
      return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(displayBalance);
    }
    if (["USD", "JPY", "EUR", "GBP", "HKD", "SGD", "AUD"].includes(cur)) {
      return new Intl.NumberFormat("zh-CN", { style: "currency", currency: cur }).format(displayBalance);
    }
  } catch {
    /* ignore */
  }
  return `${cur} ${displayBalance.toLocaleString("zh-CN")}`;
}

export interface RenderGroupedAccountOptionsProps {
  /** 自定义 option 文本，默认 "{name} | 余额: {balance}" */
  renderLabel?: (acc: any) => string;
  /** 自定义 option value，默认 acc.id */
  getValue?: (acc: any) => string;
  /** 自定义 option key，默认 acc.id */
  getKey?: (acc: any) => string;
}

/**
 * 渲染按币种分组的 <optgroup>+<option> 列表
 * 直接嵌入 <select> 使用
 */
export function renderGroupedAccountOptions(
  accounts: any[] | undefined | null,
  props: RenderGroupedAccountOptionsProps = {}
): React.ReactNode {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;

  const { renderLabel, getValue = (a) => a.id, getKey = (a) => a.id } = props;

  // 按币种分组
  const grouped: Record<string, any[]> = {};
  accounts.forEach((account) => {
    const currency = account.currency || "OTHER";
    if (!grouped[currency]) grouped[currency] = [];
    grouped[currency].push(account);
  });

  // 排序币种
  const sortedCurrencies = Object.keys(grouped).sort((a, b) => {
    const aIndex = CURRENCY_ORDER.indexOf(a);
    const bIndex = CURRENCY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return sortedCurrencies.flatMap((currency) => {
    const label = CURRENCY_LABELS[currency] || currency;
    return [
      <optgroup key={`group-${currency}`} label={`━━━ ${label} (${currency}) ━━━`}>
        {grouped[currency].map((acc) => (
          <option key={getKey(acc)} value={getValue(acc)}>
            {renderLabel ? renderLabel(acc) : `${acc.name} | 余额: ${formatAccountBalance(acc)}`}
          </option>
        ))}
      </optgroup>,
    ];
  });
}
