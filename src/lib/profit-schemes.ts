export const PROFIT_SCHEME_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const PROFIT_COMPONENT_CATEGORIES = [
  "REVENUE",
  "PLATFORM",
  "PRODUCT",
  "LOGISTICS",
  "WAREHOUSE",
  "MARKETING",
  "TAX",
  "ADJUSTMENT",
] as const;
export const PROFIT_COMPONENT_DIRECTIONS = ["REVENUE", "COST", "PASSTHROUGH"] as const;
export const PROFIT_CALCULATION_MODES = [
  "SOURCE",
  "RATE",
  "PER_ORDER",
  "PER_UNIT",
  "TIERED",
  "ALLOCATION",
  "FORMULA",
  "MANUAL",
] as const;

export type ProfitSchemeStatus = (typeof PROFIT_SCHEME_STATUSES)[number];
export type ProfitComponentCategory = (typeof PROFIT_COMPONENT_CATEGORIES)[number];
export type ProfitComponentDirection = (typeof PROFIT_COMPONENT_DIRECTIONS)[number];
export type ProfitCalculationMode = (typeof PROFIT_CALCULATION_MODES)[number];

export type ProfitSchemeComponentInput = {
  code: string;
  label: string;
  category: ProfitComponentCategory;
  direction: ProfitComponentDirection;
  calculationMode: ProfitCalculationMode;
  sourceKey: string | null;
  includeInGmv: boolean;
  includeInProfit: boolean;
  required: boolean;
  visible: boolean;
  sortOrder: number;
  config: Record<string, unknown> | null;
};

export type ProfitComponentAmount = ProfitSchemeComponentInput & {
  amountCny: number;
  originalAmounts: Record<string, number>;
  sourceStatus: "ACTUAL" | "ESTIMATED" | "MIXED" | "MISSING";
};

export const PROFIT_SOURCE_KEYS = [
  "gmvCny",
  "platformFeeCny",
  "fulfillmentFeeCny",
  "productCostCny",
  "logisticsCostCny",
  "warehouseFulfillmentCostCny",
  "netAdCostCny",
  "taxCostCny",
] as const;

type ProfitSourceKey = (typeof PROFIT_SOURCE_KEYS)[number];

const SOURCE_ORIGINAL_KEY: Partial<Record<ProfitSourceKey, string>> = {
  gmvCny: "gmv",
  platformFeeCny: "platformFee",
  fulfillmentFeeCny: "fulfillmentFee",
  logisticsCostCny: "logisticsCost",
  warehouseFulfillmentCostCny: "warehouseFulfillment",
  netAdCostCny: "netAdCost",
  taxCostCny: "taxCost",
};

const BASE_COMPONENTS: ProfitSchemeComponentInput[] = [
  component("GMV", "GMV", "REVENUE", "REVENUE", "gmvCny", 10, { includeInGmv: true }),
  component("PLATFORM_FEE", "平台费用", "PLATFORM", "COST", "platformFeeCny", 20),
  component("FULFILLMENT_FEE", "履约服务费", "PLATFORM", "COST", "fulfillmentFeeCny", 30),
  component("PRODUCT_COST", "采购成本", "PRODUCT", "COST", "productCostCny", 40),
  component("LOGISTICS_COST", "物流成本", "LOGISTICS", "COST", "logisticsCostCny", 50),
  component("WAREHOUSE_FULFILLMENT", "海外仓代发", "WAREHOUSE", "COST", "warehouseFulfillmentCostCny", 60),
  component("AD_COST", "广告实际消耗", "MARKETING", "COST", "netAdCostCny", 70),
  component("TAX_COST", "税务成本", "TAX", "COST", "taxCostCny", 80),
];

const BRAZIL_TIKTOK_COMPONENTS: ProfitSchemeComponentInput[] = BASE_COMPONENTS.map((item) => {
  if (item.code === "GMV") return { ...item, label: "GMV（商品金额 + TikTok商品补贴）" };
  if (item.code === "PLATFORM_FEE") return { ...item, label: "TikTok平台佣金" };
  if (item.code === "FULFILLMENT_FEE") return { ...item, label: "SFP服务费及每件成交费" };
  if (item.code === "LOGISTICS_COST") return { ...item, label: "头程物流费用" };
  if (item.code === "TAX_COST") return { ...item, label: "店铺主体税务成本" };
  return item;
});

function component(
  code: string,
  label: string,
  category: ProfitComponentCategory,
  direction: ProfitComponentDirection,
  sourceKey: ProfitSourceKey,
  sortOrder: number,
  overrides: Partial<ProfitSchemeComponentInput> = {},
): ProfitSchemeComponentInput {
  return {
    code,
    label,
    category,
    direction,
    calculationMode: "SOURCE",
    sourceKey,
    includeInGmv: false,
    includeInProfit: true,
    required: true,
    visible: true,
    sortOrder,
    config: null,
    ...overrides,
  };
}

export function normalizeCountryCode(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (["BR", "BRA", "BRAZIL", "巴西"].includes(normalized)) return "BR";
  if (["US", "USA", "UNITED STATES", "美国", "美区"].includes(normalized)) return "US";
  if (["JP", "JPN", "JAPAN", "日本"].includes(normalized)) return "JP";
  if (["KR", "KOR", "KOREA", "韩国", "韓國"].includes(normalized)) return "KR";
  return normalized || "UNSET";
}

export function defaultTimeZone(countryCode: string): string {
  if (countryCode === "BR") return "America/Sao_Paulo";
  if (countryCode === "US") return "America/Denver";
  if (countryCode === "JP") return "Asia/Tokyo";
  if (countryCode === "KR") return "Asia/Seoul";
  return "UTC";
}

export function defaultProfitComponents(countryCode: string, platform: string): ProfitSchemeComponentInput[] {
  const source = countryCode === "BR" && platform.toUpperCase() === "TIKTOK"
    ? BRAZIL_TIKTOK_COMPONENTS
    : BASE_COMPONENTS;
  return source.map((item) => ({ ...item, config: item.config ? { ...item.config } : null }));
}

export function validateProfitComponents(value: unknown): { components: ProfitSchemeComponentInput[]; error: string | null } {
  if (!Array.isArray(value) || value.length === 0) return { components: [], error: "利润方案至少需要一个核算项目" };
  if (value.length > 60) return { components: [], error: "单个利润方案最多支持60个核算项目" };

  const codes = new Set<string>();
  const components: ProfitSchemeComponentInput[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index] as Record<string, unknown>;
    const code = String(raw?.code || "").trim().toUpperCase();
    const label = String(raw?.label || "").trim();
    const category = String(raw?.category || "").trim().toUpperCase() as ProfitComponentCategory;
    const direction = String(raw?.direction || "").trim().toUpperCase() as ProfitComponentDirection;
    const calculationMode = String(raw?.calculationMode || "SOURCE").trim().toUpperCase() as ProfitCalculationMode;
    const sourceKey = String(raw?.sourceKey || "").trim() || null;
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return { components: [], error: `第${index + 1}个项目代码无效` };
    if (codes.has(code)) return { components: [], error: `项目代码重复：${code}` };
    if (!label || label.length > 80) return { components: [], error: `第${index + 1}个项目名称无效` };
    if (!PROFIT_COMPONENT_CATEGORIES.includes(category)) return { components: [], error: `项目分类无效：${label}` };
    if (!PROFIT_COMPONENT_DIRECTIONS.includes(direction)) return { components: [], error: `收支方向无效：${label}` };
    if (!PROFIT_CALCULATION_MODES.includes(calculationMode)) return { components: [], error: `计算方式无效：${label}` };
    if (calculationMode === "SOURCE" && !sourceKey) return { components: [], error: `项目缺少数据来源：${label}` };
    codes.add(code);
    components.push({
      code,
      label,
      category,
      direction,
      calculationMode,
      sourceKey,
      includeInGmv: raw?.includeInGmv === true,
      includeInProfit: raw?.includeInProfit !== false,
      required: raw?.required !== false,
      visible: raw?.visible !== false,
      sortOrder: Number.isFinite(Number(raw?.sortOrder)) ? Math.trunc(Number(raw.sortOrder)) : index * 10,
      config: raw?.config && typeof raw.config === "object" && !Array.isArray(raw.config)
        ? raw.config as Record<string, unknown>
        : null,
    });
  }
  if (!components.some((item) => item.includeInGmv && item.direction === "REVENUE")) {
    return { components: [], error: "利润方案必须包含至少一个计入GMV的收入项目" };
  }
  return { components: components.sort((left, right) => left.sortOrder - right.sortOrder), error: null };
}

type MetricLike = Partial<Record<ProfitSourceKey, number>> & {
  originalAmounts?: Record<string, Record<string, number>>;
  sourceStatus?: Partial<Record<string, ProfitComponentAmount["sourceStatus"]>>;
};

export function buildProfitComponentAmounts(
  metric: MetricLike,
  definitions: ProfitSchemeComponentInput[],
): ProfitComponentAmount[] {
  return definitions
    .filter((definition) => definition.visible)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((definition) => {
      const sourceKey = definition.sourceKey as ProfitSourceKey | null;
      const originalKey = sourceKey ? SOURCE_ORIGINAL_KEY[sourceKey] : null;
      const amountCny = sourceKey ? Number(metric[sourceKey] || 0) : 0;
      const original = originalKey ? metric.originalAmounts?.[originalKey] || {} : {};
      const originalAmounts = Object.keys(original).length > 0
        ? { ...original }
        : amountCny !== 0 ? { CNY: amountCny } : {};
      return {
        ...definition,
        amountCny,
        originalAmounts,
        sourceStatus: metric.sourceStatus?.[definition.code] || "ACTUAL",
      };
    });
}

export function contributionProfitFromComponents(components: ProfitComponentAmount[]): number {
  return components.reduce((total, component) => {
    if (!component.includeInProfit || component.direction === "PASSTHROUGH") return total;
    return total + (component.direction === "REVENUE" ? component.amountCny : -component.amountCny);
  }, 0);
}
