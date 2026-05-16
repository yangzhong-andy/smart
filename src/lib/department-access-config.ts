/**
 * 部门访问规则（存 DepartmentAccessRule.config，由系统设置页维护）
 */

export type AccessMenuMode = "inherit" | "whitelist";
export type AccessPathMode = "inherit" | "whitelist";

export type DepartmentAccessRuleConfig = {
  menuMode: AccessMenuMode;
  /** menuMode 为 whitelist 时生效 */
  menuLabels?: string[];
  pathMode: AccessPathMode;
  /** pathMode 为 whitelist 时生效，须以 / 开头 */
  pathPrefixes?: string[];
  /** 与 SIDEBAR_CHILD_HREFS_BY_DEPARTMENT 相同结构：父级 label -> 允许的子菜单 href */
  sidebarChildHrefs?: Record<string, string[]> | null;
  /** 越权或进入系统时的默认落地页 */
  defaultRoute?: string | null;
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export function parseDepartmentAccessRuleConfig(raw: unknown): DepartmentAccessRuleConfig | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const menuMode: AccessMenuMode = o.menuMode === "whitelist" ? "whitelist" : "inherit";
  const pathMode: AccessPathMode = o.pathMode === "whitelist" ? "whitelist" : "inherit";
  const menuLabels = isStringArray(o.menuLabels) ? o.menuLabels.map((s) => s.trim()).filter(Boolean) : [];
  const pathPrefixes = isStringArray(o.pathPrefixes)
    ? o.pathPrefixes.map((s) => s.trim()).filter((s) => s.startsWith("/"))
    : [];
  let sidebarChildHrefs: Record<string, string[]> | null = null;
  if (o.sidebarChildHrefs != null && typeof o.sidebarChildHrefs === "object" && !Array.isArray(o.sidebarChildHrefs)) {
    const m: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(o.sidebarChildHrefs as Record<string, unknown>)) {
      if (!k.trim()) continue;
      if (isStringArray(v)) m[k] = v.filter((h) => typeof h === "string" && h.startsWith("/"));
    }
    sidebarChildHrefs = Object.keys(m).length ? m : null;
  }
  const defaultRoute =
    typeof o.defaultRoute === "string" && o.defaultRoute.trim().startsWith("/")
      ? o.defaultRoute.trim()
      : null;
  return {
    menuMode,
    menuLabels,
    pathMode,
    pathPrefixes,
    sidebarChildHrefs,
    defaultRoute,
  };
}

export function normalizeRuleConfigForSave(input: DepartmentAccessRuleConfig): DepartmentAccessRuleConfig {
  const menuMode = input.menuMode === "whitelist" ? "whitelist" : "inherit";
  const pathMode = input.pathMode === "whitelist" ? "whitelist" : "inherit";
  const menuLabels =
    menuMode === "whitelist" && Array.isArray(input.menuLabels)
      ? input.menuLabels.filter(Boolean)
      : [];
  const pathPrefixes =
    pathMode === "whitelist" && Array.isArray(input.pathPrefixes)
      ? input.pathPrefixes.map((s) => s.trim()).filter((s) => s.startsWith("/"))
      : [];
  let sidebarChildHrefs: Record<string, string[]> | null = null;
  if (input.sidebarChildHrefs && typeof input.sidebarChildHrefs === "object") {
    sidebarChildHrefs = Object.fromEntries(
      Object.entries(input.sidebarChildHrefs).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.filter((h) => typeof h === "string" && h.startsWith("/")) : [],
      ])
    );
    if (Object.keys(sidebarChildHrefs).length === 0) sidebarChildHrefs = null;
  }
  const defaultRoute =
    typeof input.defaultRoute === "string" && input.defaultRoute.trim().startsWith("/")
      ? input.defaultRoute.trim()
      : null;
  return {
    menuMode,
    menuLabels,
    pathMode,
    pathPrefixes,
    sidebarChildHrefs,
    defaultRoute,
  };
}
