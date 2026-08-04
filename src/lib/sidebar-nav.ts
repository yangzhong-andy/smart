/**
 * 侧栏菜单结构 - 统一数据源
 */

export type NavChild = {
  label: string;
  href: string;
};

export type NavGroup = {
  label: string;
  children: NavChild[];
};

export const SIDEBAR_NAV_STRUCTURE: NavGroup[] = [
  {
    label: "控制台",
    children: [
      { label: "首页待办", href: "/" },
      { label: "财务看板", href: "/finance" },
      { label: "运营工作台", href: "/operations/purchase-orders" },
      { label: "风控工作台", href: "/risk-control" },
      { label: "审批工作台", href: "/approval" },
      { label: "财务工作台", href: "/finance/workbench" },
      { label: "广告代理工作台", href: "/advertising/workbench" },
    ],
  },
  {
    label: "产品中心",
    children: [
      { label: "产品档案", href: "/product-center/products" },
      { label: "SKU映射", href: "/product-center/sku-mapping" },
    ],
  },
  {
    label: "供应链",
    children: [
      { label: "供应链看板", href: "/procurement" },
      { label: "供应商库", href: "/procurement/suppliers" },
      { label: "采购合同", href: "/procurement/purchase-orders" },
      { label: "采购订单", href: "/procurement/procurement-orders" },
      { label: "生产进度", href: "/procurement/production-progress" },
      { label: "拿货单管理", href: "/procurement/delivery-orders" },
      { label: "工厂端管理", href: "/supply-chain/factories" },
      { label: "库存查询", href: "/inventory" },
      { label: "仓库库存", href: "/inventory/warehouse" },
      { label: "库存看板", href: "/inventory/dashboard" },
      { label: "库存对账", href: "/inventory/reconciliation" },
    ],
  },
  {
    label: "物流中心",
    children: [
      { label: "物流工作台", href: "/logistics/workbench" },
      { label: "渠道管理", href: "/logistics/channels" },
      { label: "国内入库", href: "/logistics/inbound" },
      { label: "入库批次列表", href: "/inbound" },
      { label: "物流跟踪", href: "/logistics/tracking" },
      { label: "出库单", href: "/logistics/outbound" },
      { label: "出库批次", href: "/outbound" },
      { label: "物流费用管理", href: "/logistics-cost" },
      { label: "柜子管理", href: "/logistics/containers" },
      { label: "柜子预录单", href: "/logistics/pre-records" },
      { label: "仓储管理", href: "/logistics/warehouse" },
      { label: "关税统计", href: "/logistics/duty-stats" },
    ],
  },
  {
    label: "营销与店铺",
    children: [
      { label: "店铺管理", href: "/settings/stores" },
      { label: "数据导入", href: "/finance/import" },
      { label: "店铺订单看板", href: "/finance/settlement-dashboard" },
      { label: "店铺回款统计", href: "/finance/store-report" },
      { label: "物流费用分摊", href: "/finance/logistics-cost-allocation" },
      { label: "达人BD管理", href: "/advertising/influencers" },
      { label: "广告代理管理", href: "/advertising/agencies" },
    ],
  },
  {
    label: "财务中心",
    children: [
      { label: "月账单管理", href: "/finance/monthly-bills" },
      { label: "对账中心", href: "/finance/reconciliation" },
      { label: "流水明细", href: "/finance/cash-flow" },
      { label: "利润看板", href: "/finance/profit" },
      { label: "账户列表", href: "/finance/accounts" },
      { label: "内部划拨", href: "/finance/transfer" },
      { label: "审批中心", href: "/finance/approval" },
      { label: "应收款管理", href: "/finance/receivables" },
    ],
  },
  {
    label: "运营工具",
    children: [
      { label: "每日运营报表", href: "/operations/daily-report" },
      { label: "巴西利润测算", href: "/finance/profit-calculation" },
      { label: "代理IP管理", href: "/operations/proxy-ip" },
    ],
  },
  {
    label: "人力资源中心",
    children: [
      { label: "员工档案", href: "/hr/employees" },
      { label: "工资管理", href: "/hr/payroll" },
      { label: "提成规则", href: "/hr/commission-rules" },
      { label: "提成管理", href: "/hr/commissions" },
    ],
  },
  {
    label: "系统设置",
    children: [
      { label: "系统账号管理", href: "/settings/users" },
      { label: "部门权限", href: "/settings/department-permissions" },
      { label: "本公司信息", href: "/settings/company" },
      { label: "出口公司管理", href: "/settings/exporters" },
      { label: "海外公司管理", href: "/settings/overseas-companies" },
    ],
  },
];

export const SIDEBAR_TOP_LEVEL_LABELS: string[] = SIDEBAR_NAV_STRUCTURE.map(g => g.label);
