/**
 * 支出分类配置
 * 支持一级分类和二级分类
 */

export type ExpenseCategory = {
  label: string;
  value: string;
  subCategories?: ExpenseSubCategory[];
};

export type ExpenseSubCategory = {
  label: string;
  value: string;
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    label: "采购",
    value: "采购",
    subCategories: [
      { label: "采购定金", value: "采购/采购定金" },
      { label: "采购尾款", value: "采购/采购尾款" },
      { label: "采购全款", value: "采购/采购全款" },
      { label: "样品费", value: "采购/样品费" },
      { label: "其他采购费用", value: "采购/其他采购费用" }
    ]
  },
  {
    label: "物流",
    value: "物流",
    subCategories: [
      { label: "海运费用", value: "物流/海运费用" },
      { label: "空运费用", value: "物流/空运费用" },
      { label: "快递费用", value: "物流/快递费用" },
      { label: "国内物流", value: "物流/国内物流" },
      { label: "仓储费用", value: "物流/仓储费用" },
      { label: "仓储管理费", value: "物流/仓储管理费" },
      { label: "其他物流费用", value: "物流/其他物流费用" }
    ]
  },
  {
    label: "广告费",
    value: "广告费",
    subCategories: [
      { label: "广告充值", value: "广告费/广告充值" },
      { label: "广告投放", value: "广告费/广告投放" },
      { label: "广告代理费", value: "广告费/广告代理费" },
      { label: "其他广告费用", value: "广告费/其他广告费用" }
    ]
  },
  {
    label: "税费",
    value: "税费",
    subCategories: [
      { label: "关税", value: "税费/关税" },
      { label: "增值税", value: "税费/增值税" },
      { label: "消费税", value: "税费/消费税" },
      { label: "其他税费", value: "税费/其他税费" }
    ]
  },
  {
    label: "平台费用",
    value: "平台费用",
    subCategories: [
      { label: "平台佣金", value: "平台费用/平台佣金" },
      { label: "平台仓储费", value: "平台费用/平台仓储费" },
      { label: "平台广告费", value: "平台费用/平台广告费" },
      { label: "平台服务费", value: "平台费用/平台服务费" },
      { label: "其他平台费用", value: "平台费用/其他平台费用" }
    ]
  },
  {
    label: "人力成本",
    value: "人力成本",
    subCategories: [
      { label: "员工薪资", value: "人力成本/员工薪资" },
      { label: "社保公积金", value: "人力成本/社保公积金" },
      { label: "提成奖金", value: "人力成本/提成奖金" },
      { label: "培训费用", value: "人力成本/培训费用" },
      { label: "其他人力成本", value: "人力成本/其他人力成本" }
    ]
  },
  {
    label: "运营费用",
    value: "运营费用",
    subCategories: [
      { label: "办公费用", value: "运营费用/办公费用" },
      { label: "差旅费", value: "运营费用/差旅费" },
      { label: "营销推广", value: "运营费用/营销推广" },
      { label: "技术服务费", value: "运营费用/技术服务费" },
      { label: "咨询费", value: "运营费用/咨询费" },
      { label: "其他运营费用", value: "运营费用/其他运营费用" }
    ]
  },
  {
    label: "手续费",
    value: "手续费",
    subCategories: [
      { label: "银行手续费", value: "手续费/银行手续费" },
      { label: "支付手续费", value: "手续费/支付手续费" },
      { label: "汇率手续费", value: "手续费/汇率手续费" },
      { label: "其他手续费", value: "手续费/其他手续费" }
    ]
  },
  {
    label: "其他费用",
    value: "其他费用",
    subCategories: [
      { label: "保险费用", value: "其他费用/保险费用" },
      { label: "汇率损失", value: "其他费用/汇率损失" },
      { label: "坏账损失", value: "其他费用/坏账损失" },
      { label: "退款", value: "其他费用/退款" },
      { label: "其他支出", value: "其他费用/其他支出" }
    ]
  }
];

/**
 * 获取所有一级分类
 */
export function getPrimaryCategories(): string[] {
  return EXPENSE_CATEGORIES.map(cat => cat.value);
}

/**
 * 根据一级分类获取二级分类
 */
export function getSubCategories(primaryCategory: string): ExpenseSubCategory[] {
  const category = EXPENSE_CATEGORIES.find(cat => cat.value === primaryCategory);
  return category?.subCategories || [];
}

/**
 * 解析分类字符串（格式：一级分类/二级分类 或 一级分类）
 */
export function parseCategory(categoryStr: string | null | undefined): { primary: string; sub: string | null } {
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
export function formatCategoryDisplay(categoryStr: string | null | undefined): string {
  if (!categoryStr) return "";
  const { primary, sub } = parseCategory(categoryStr);
  if (sub) {
    return `${primary} > ${sub}`;
  }
  return primary || "";
}
