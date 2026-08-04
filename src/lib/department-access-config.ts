/**
 * 部门访问权限配置（简化版 v2）
 */

export type DepartmentAccessRuleConfig = {
  menuLabels: string[];
  childHrefs: Record<string, string[]>;
  defaultRoute: string | null;
};

export function emptyConfig(): DepartmentAccessRuleConfig {
  return { menuLabels: [], childHrefs: {}, defaultRoute: null };
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export function parseDepartmentAccessRuleConfig(raw: unknown): DepartmentAccessRuleConfig | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  let menuLabels: string[] = [];
  if (isStringArray(o.menuLabels)) menuLabels = o.menuLabels.filter(Boolean);

  let childHrefs: Record<string, string[]> = {};
  // 新格式 childHrefs
  if (o.childHrefs && typeof o.childHrefs === "object" && !Array.isArray(o.childHrefs)) {
    for (const [k, v] of Object.entries(o.childHrefs as Record<string, unknown>)) {
      if (isStringArray(v)) childHrefs[k] = v.filter(Boolean);
    }
  }
  // 兼容旧格式 sidebarChildHrefs
  if (o.sidebarChildHrefs && typeof o.sidebarChildHrefs === "object" && !Array.isArray(o.sidebarChildHrefs)) {
    for (const [k, v] of Object.entries(o.sidebarChildHrefs as Record<string, unknown>)) {
      if (isStringArray(v)) childHrefs[k] = v.filter(Boolean);
    }
  }

  const defaultRoute =
    typeof o.defaultRoute === "string" && o.defaultRoute.trim().startsWith("/")
      ? o.defaultRoute.trim() : null;

  return { menuLabels, childHrefs, defaultRoute };
}

export function normalizeRuleConfigForSave(input: DepartmentAccessRuleConfig): DepartmentAccessRuleConfig {
  const result: Record<string, string[]> = {};
  if (input.childHrefs && typeof input.childHrefs === "object") {
    for (const [k, v] of Object.entries(input.childHrefs)) {
      if (Array.isArray(v) && v.length > 0) {
        result[k] = v.filter((h) => typeof h === "string" && h.startsWith("/"));
      }
    }
  }
  return {
    menuLabels: Array.isArray(input.menuLabels) ? input.menuLabels.filter(Boolean) : [],
    childHrefs: result,
    defaultRoute: typeof input.defaultRoute === "string" && input.defaultRoute.trim().startsWith("/")
      ? input.defaultRoute.trim() : null,
  };
}
