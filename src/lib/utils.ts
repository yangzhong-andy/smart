/**
 * 合并 Tailwind CSS 类名
 * 简单的类名合并工具
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
