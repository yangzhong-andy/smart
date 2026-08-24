/**
 * 与 Sidebar 一级菜单 label 保持一致（用于系统设置-部门权限勾选）。
 * 若调整侧栏结构，请同步更新本文件。
 */
export const SIDEBAR_TOP_LEVEL_LABELS = [
  "控制台",
  "产品中心",
  "供应链",
  "物流中心",
  "平台中心",
  "营销与店铺",
  "财务中心",
  "运营工具",
  "人力资源中心",
  "系统设置",
] as const;

export type SidebarTopLevelLabel = (typeof SIDEBAR_TOP_LEVEL_LABELS)[number];

/** 常用路径前缀（用于白名单快捷勾选） */
export const COMMON_PATH_PREFIX_OPTIONS: { prefix: string; label: string }[] = [
  { prefix: "/", label: "首页 /" },
  { prefix: "/procurement", label: "采购 / 供应链看板" },
  { prefix: "/supply-chain", label: "供应链工厂" },
  { prefix: "/inventory", label: "库存" },
  { prefix: "/product-center", label: "产品中心" },
  { prefix: "/products", label: "产品（旧路径）" },
  { prefix: "/logistics", label: "物流中心" },
  { prefix: "/logistics-cost", label: "物流费用" },
  { prefix: "/inbound", label: "入库批次" },
  { prefix: "/outbound", label: "出库批次" },
  { prefix: "/advertising", label: "营销 / 广告" },
  { prefix: "/finance", label: "财务中心" },
  { prefix: "/operations", label: "运营工具" },
  { prefix: "/hr", label: "人力资源" },
  { prefix: "/settings", label: "系统设置" },
  { prefix: "/approval", label: "审批工作台" },
  { prefix: "/risk-control", label: "风控" },
];
