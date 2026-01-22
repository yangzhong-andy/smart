/**
 * 收入分类配置
 * 支持一级分类和二级分类
 */

export type IncomeCategory = {
  label: string;
  value: string;
  subCategories?: IncomeSubCategory[];
};

export type IncomeSubCategory = {
  label: string;
  value: string;
};

export const INCOME_CATEGORIES: IncomeCategory[] = [
  {
    label: "回款",
    value: "回款",
    subCategories: [
      { label: "平台回款", value: "回款/平台回款" },
      { label: "店铺回款", value: "回款/店铺回款" },
      { label: "其他回款", value: "回款/其他回款" }
    ]
  },
  {
    label: "销售收入",
    value: "销售收入",
    subCategories: [
      { label: "商品销售", value: "销售收入/商品销售" },
      { label: "服务收入", value: "销售收入/服务收入" },
      { label: "其他销售收入", value: "销售收入/其他销售收入" }
    ]
  },
  {
    label: "退款收入",
    value: "退款收入",
    subCategories: [
      { label: "平台退款", value: "退款收入/平台退款" },
      { label: "供应商退款", value: "退款收入/供应商退款" },
      { label: "其他退款", value: "退款收入/其他退款" }
    ]
  },
  {
    label: "其他收入",
    value: "其他收入",
    subCategories: [
      { label: "投资收益", value: "其他收入/投资收益" },
      { label: "利息收入", value: "其他收入/利息收入" },
      { label: "补贴收入", value: "其他收入/补贴收入" },
      { label: "其他", value: "其他收入/其他" }
    ]
  }
];

/**
 * 获取所有一级分类
 */
export function getPrimaryIncomeCategories(): string[] {
  return INCOME_CATEGORIES.map(cat => cat.value);
}

/**
 * 根据一级分类获取二级分类
 */
export function getIncomeSubCategories(primaryCategory: string): IncomeSubCategory[] {
  const category = INCOME_CATEGORIES.find(cat => cat.value === primaryCategory);
  return category?.subCategories || [];
}

/**
 * 解析分类字符串（格式：一级分类/二级分类 或 一级分类）
 */
export function parseIncomeCategory(categoryStr: string | null | undefined): { primary: string; sub: string | null } {
  if (!categoryStr || typeof categoryStr !== "string") return { primary: "", sub: null };
  const parts = categoryStr.split("/");
  if (parts.length === 2) {
    return { primary: parts[0] || "", sub: parts[1] || null };
  }
  return { primary: categoryStr || "", sub: null };
}

/**
 * 格式化分类显示（一级分类 > 二级分类）
 */
export function formatIncomeCategoryDisplay(categoryStr: string | null | undefined): string {
  if (!categoryStr) return "";
  const { primary, sub } = parseIncomeCategory(categoryStr);
  if (sub) {
    return `${primary} > ${sub}`;
  }
  return primary || "";
}
