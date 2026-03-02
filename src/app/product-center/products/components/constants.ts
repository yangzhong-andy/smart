/** 变体颜色/尺寸预设选项 */
export const VARIANT_COLOR_OPTIONS = ["红色", "蓝色", "黑色", "白色", "灰色", "黄色", "绿色", "粉色", "紫色", "橙色", "卡其色"];
export const VARIANT_SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL", "均码"];
export const OTHER_LABEL = "其他";

/** 颜色名称 → 圆点展示用背景色 */
export const COLOR_DOT_MAP: Record<string, string> = {
  红色: "#ef4444", 蓝色: "#3b82f6", 黑色: "#1f2937", 白色: "#f3f4f6", 灰色: "#9ca3af",
  黄色: "#eab308", 绿色: "#22c55e", 粉色: "#ec4899", 紫色: "#a855f7", 橙色: "#f97316", 卡其色: "#c3b091"
};

export function getColorDotStyle(color: string | undefined): { backgroundColor: string; borderColor: string } {
  if (!color?.trim()) return { backgroundColor: "#64748b", borderColor: "rgba(255,255,255,0.2)" };
  const c = COLOR_DOT_MAP[color.trim()] ?? "#64748b";
  return { backgroundColor: c, borderColor: "rgba(255,255,255,0.25)" };
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
