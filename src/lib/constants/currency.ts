/**
 * 货币常量定义和格式化函数
 */

// 货币代码常量
export const CURRENCY_CODE = 'CNY';

// 货币符号常量
export const CURRENCY_SYMBOL = '¥';

/**
 * 格式化金额函数
 * 自动带上 ¥ 符号，保留两位小数，处理千分位分隔符
 * 
 * @param amount - 金额数值
 * @returns 格式化后的金额字符串，例如：¥86,258.30
 * 
 * @example
 * formatMoney(86258.3) // "¥86,258.30"
 * formatMoney(1234.5) // "¥1,234.50"
 * formatMoney(1000000) // "¥1,000,000.00"
 */
export function formatMoney(amount: number | string): string {
  // 转换为数字
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // 处理无效值
  if (!Number.isFinite(num)) {
    return `${CURRENCY_SYMBOL}0.00`;
  }
  
  // 使用 Intl.NumberFormat 格式化，自动处理千分位分隔符
  const formatted = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  
  // 返回带货币符号的格式化字符串
  return `${CURRENCY_SYMBOL}${formatted}`;
}
