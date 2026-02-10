"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import { getPendingApprovalCount } from "@/lib/reconciliation-store";

// 版本号（从 package.json 读取，构建时注入）
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";
import {
  LayoutDashboard,
  Package,
  Factory,
  Truck,
  Megaphone,
  Wallet,
  Users,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Database,
  Settings,
  LogOut,
  Upload,
  BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ExchangeRateBar from "./ExchangeRateBar";
import { getAllowedNavLabels } from "@/lib/permissions";

import { LucideIcon } from "lucide-react";

/** 子菜单悬停时预取路由 + 可选预请求主 API（暖机），减轻点击后等待 */
const ROUTE_PREFETCH_API: Record<string, string> = {
  "/finance/accounts": "/api/accounts",
  "/finance/cash-flow": "/api/cash-flow",
  "/finance/monthly-bills": "/api/monthly-bills",
  "/procurement/suppliers": "/api/suppliers",
  "/procurement/purchase-orders": "/api/purchase-contracts",
  "/procurement/delivery-orders": "/api/delivery-orders",
  "/product-center/products": "/api/products",
  "/settings/stores": "/api/stores",
  "/hr/employees": "/api/employees",
  "/inventory": "/api/stock",
  "/logistics/channels": "/api/logistics-channels",
};

type NavItem = {
  label: string;
  labelEn: string; // 英文副标题
  icon: LucideIcon;
  href?: string;
  children?: NavItem[];
};

const navItems: NavItem[] = [
  {
    label: "控制台",
    labelEn: "Dashboard",
    icon: LayoutDashboard,
    children: [
      { label: "首页待办", labelEn: "", icon: LayoutDashboard, href: "/" },
      { label: "财务看板", labelEn: "", icon: LayoutDashboard, href: "/finance" },
      { label: "运营工作台", labelEn: "Operations", icon: LayoutDashboard, href: "/operations/purchase-orders" },
      { label: "风控工作台", labelEn: "Risk Control", icon: LayoutDashboard, href: "/risk-control" },
      { label: "审批工作台", labelEn: "Approval", icon: LayoutDashboard, href: "/approval" },
      { label: "财务工作台", labelEn: "Finance", icon: LayoutDashboard, href: "/finance/workbench" },
      { label: "广告代理工作台", labelEn: "Ad Agency", icon: LayoutDashboard, href: "/advertising/workbench" }
    ]
  },
  {
    label: "产品中心",
    labelEn: "Product Master",
    icon: Package,
    children: [
      { label: "产品档案", labelEn: "", icon: Package, href: "/product-center/products" },
      { label: "SKU映射", labelEn: "", icon: Package, href: "/product-center/sku-mapping" }
    ]
  },
  {
    label: "供应链",
    labelEn: "SCM",
    icon: Factory,
    children: [
      { label: "供应商库", labelEn: "", icon: Factory, href: "/procurement/suppliers" },
      { label: "采购合同（分批拿货）", labelEn: "", icon: Factory, href: "/procurement/purchase-orders" },
      { label: "采购订单", labelEn: "", icon: Factory, href: "/procurement/procurement-orders" },
      { label: "生产进度", labelEn: "", icon: Factory, href: "/procurement/production-progress" },
      { label: "拿货单管理", labelEn: "", icon: Factory, href: "/procurement/delivery-orders" },
      { label: "工厂端管理", labelEn: "", icon: Factory, href: "/supply-chain/factories" },
      { label: "库存查询", labelEn: "", icon: Factory, href: "/inventory" },
      { label: "库存看板", labelEn: "", icon: Package, href: "/inventory/dashboard" }
    ]
  },
  {
    label: "物流中心",
    labelEn: "Logistics",
    icon: Truck,
    children: [
      { label: "物流工作台", labelEn: "", icon: Truck, href: "/logistics/workbench" },
      { label: "渠道管理", labelEn: "", icon: Truck, href: "/logistics/channels" },
      { label: "国内入库", labelEn: "", icon: Truck, href: "/logistics/inbound" },
      { label: "物流跟踪", labelEn: "", icon: Truck, href: "/logistics/tracking" },
      { label: "出库管理", labelEn: "", icon: Truck, href: "/logistics/outbound" },
      { label: "仓储管理", labelEn: "", icon: Truck, href: "/logistics/warehouse" }
    ]
  },
  {
    label: "营销与店铺",
    labelEn: "Marketing & Store",
    icon: Megaphone,
    children: [
      { label: "店铺管理", labelEn: "", icon: Megaphone, href: "/settings/stores" },
      { label: "数据导入", labelEn: "", icon: Upload, href: "/finance/import" },
      { label: "店铺订单看板", labelEn: "", icon: BarChart3, href: "/finance/settlement-dashboard" },
      { label: "达人 BD 管理", labelEn: "", icon: Megaphone, href: "/advertising/influencers" },
      { label: "广告代理管理", labelEn: "", icon: Megaphone, href: "/advertising/agencies" }
    ]
  },
  {
    label: "财务中心",
    labelEn: "Finance",
    icon: Wallet,
    children: [
      { label: "月账单管理", labelEn: "", icon: Wallet, href: "/finance/monthly-bills" },
      { label: "对账中心", labelEn: "", icon: Wallet, href: "/finance/reconciliation" },
      { label: "流水明细", labelEn: "", icon: Wallet, href: "/finance/cash-flow" },
      { label: "利润看板", labelEn: "", icon: Wallet, href: "/finance/profit" },
      { label: "账户列表", labelEn: "", icon: Wallet, href: "/finance/accounts" },
      { label: "内部划拨", labelEn: "", icon: Wallet, href: "/finance/transfer" },
      { label: "审批中心", labelEn: "", icon: Wallet, href: "/finance/approval" }
    ]
  },
  {
    label: "人力资源中心",
    labelEn: "HR Center",
    icon: Users,
    children: [
      { label: "员工档案", labelEn: "", icon: Users, href: "/hr/employees" },
      { label: "提成规则", labelEn: "", icon: Users, href: "/hr/commission-rules" },
      { label: "提成管理", labelEn: "", icon: Users, href: "/hr/commissions" }
    ]
  },
  {
    label: "系统设置",
    labelEn: "Settings",
    icon: Settings,
    children: [
      { label: "员工档案管理", labelEn: "User Management", icon: Users, href: "/settings/users" },
      { label: "生成测试数据", labelEn: "", icon: Database, href: "/settings/generate-test-data" },
      { label: "清空系统数据", labelEn: "", icon: Trash2, href: "/settings/clear-data" }
    ]
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const prefetchRoute = (href: string | undefined) => {
    if (!href || href === "#") return;
    router.prefetch(href);
    const api = ROUTE_PREFETCH_API[href];
    if (api) fetch(api, { credentials: "same-origin" }).catch(() => {});
  };
  const { data: session } = useSession();
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 按部门权限过滤一级菜单（如全球供应链部/全球供应链部门 仅显示 产品中心、供应链；支持按 code 或 name 匹配）
  const departmentCode = session?.user?.departmentCode ?? null;
  const departmentName = session?.user?.departmentName ?? null;
  const allowedLabels = getAllowedNavLabels(departmentCode, departmentName);
  const visibleNavItems = useMemo(() => {
    if (!allowedLabels) return navItems;
    return navItems.filter((item) => allowedLabels.includes(item.label));
  }, [allowedLabels]);
  
  // 客户端初始化
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      // 恢复侧边栏折叠状态
      const saved = localStorage.getItem("sidebarCollapsed");
      if (saved === "true") {
        setIsCollapsed(true);
      }
      
      // 默认展开当前路径所在的父级菜单
      const currentPath = pathname || "";
      const expanded: string[] = [];
      visibleNavItems.forEach((item) => {
        if (item.children) {
          const hasActiveChild = item.children.some((child) => child.href === currentPath);
          if (hasActiveChild) {
            expanded.push(item.label);
          }
        }
      });
      setExpandedItems(expanded);
    } catch (e) {
      console.error("Failed to initialize sidebar:", e);
    }
  }, [pathname, visibleNavItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 已禁用路由切换时的重复请求：仅首次挂载时拉取一次，后续通过 approval-updated 事件更新
    let cancelled = false;
    (async () => {
      try {
        const count = await getPendingApprovalCount();
        if (!cancelled) setPendingApprovalCount(count);
      } catch (e) {
        console.error("Failed to get pending approval count", e);
      }
    })();
    
    const handleApprovalUpdate = async () => {
      try {
        const newCount = await getPendingApprovalCount();
        if (!cancelled) setPendingApprovalCount(newCount);
      } catch (e) {
        console.error("Failed to get pending approval count", e);
      }
    };
    
    window.addEventListener("approval-updated", handleApprovalUpdate);
    
    return () => {
      cancelled = true;
      window.removeEventListener("approval-updated", handleApprovalUpdate);
    };
  }, []); // 空依赖：仅挂载时请求一次，不再随 pathname 发起请求

  const toggleExpand = (label: string) => {
    if (isCollapsed) return; // 收起状态下不处理点击展开
    setExpandedItems((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  const handleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebarCollapsed", String(newState));
    }
    // 收起时折叠所有菜单
    if (newState) {
      setExpandedItems([]);
    }
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href;
  };

  const isParentActive = (item: NavItem) => {
    if (!item.children) return false;
    return item.children.some((child) => child.href === pathname);
  };

  return (
    <aside
      className={`flex flex-col border-r border-white/10 transition-all duration-300 relative ${
        isCollapsed ? "w-20" : "w-72"
      }`}
      style={{ 
        backgroundColor: "rgba(11, 14, 20, 0.95)",
        backdropFilter: "blur(20px)",
        boxShadow: "inset -1px 0 0 rgba(255, 255, 255, 0.05)"
      }}
    >
      {/* 渐变装饰 */}
      <div 
        className="absolute top-0 left-0 right-0 h-32 opacity-30 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(0, 149, 255, 0.1) 0%, transparent 100%)"
        }}
      />
      
      {/* 头部 */}
      <div className={`px-6 py-6 border-b border-white/10 transition-all duration-300 relative z-10 ${isCollapsed ? "px-4" : ""}`}>
        {!isCollapsed && (
          <div className="relative">
            {/* 微弱的 backdrop-blur 容器底色 - 更精致的渐变 */}
            <div className="absolute -inset-3 rounded-lg bg-gradient-to-br from-cyan-400/6 via-transparent to-blue-500/6 backdrop-blur-xl -z-10"></div>
            <div className="absolute -inset-3 rounded-lg border border-cyan-500/10 -z-10"></div>
            
            {/* SMART ERP - 极细体，更大 */}
            <div className="text-xs uppercase tracking-[0.25em] text-slate-500/80 mb-3.5 font-extralight relative">
              <span className="relative z-10">SMART ERP</span>
              <div className="absolute -bottom-1 left-0 w-10 h-px bg-gradient-to-r from-cyan-400/30 to-transparent"></div>
            </div>
            
            {/* AI 智能调度中枢 - 冷色渐变，更大更醒目 */}
            <div className="relative">
              <h2 className="text-2xl font-bold leading-tight mb-3">
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent">
                    AI 智能调度中枢
                  </span>
                  {/* 微弱的文字发光效果 */}
                  <span className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent blur-sm opacity-30 -z-10">
                    AI 智能调度中枢
                  </span>
                </span>
              </h2>
              {/* 渐变装饰线 - 更精致，更长 */}
              <div className="relative h-[2px] w-20 overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400 opacity-70"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse"></div>
              </div>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="text-center">
            <div className="text-xl font-bold">
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">S</span>
            </div>
          </div>
        )}
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-2 relative z-10">
        <style jsx>{`
          nav::-webkit-scrollbar {
            width: 6px;
          }
          nav::-webkit-scrollbar-track {
            background: transparent;
          }
          nav::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
          }
          nav::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}</style>
        {visibleNavItems.map((item) => {
          if (item.children) {
            const isExpanded = expandedItems.includes(item.label);
            const hasActiveChild = isParentActive(item);
            const Icon = item.icon;

            return (
              <div key={item.label}>
                <div
                  className="relative"
                  onMouseEnter={() => {
                    if (isCollapsed) {
                      if (hoverLeaveTimerRef.current) {
                        clearTimeout(hoverLeaveTimerRef.current);
                        hoverLeaveTimerRef.current = null;
                      }
                      setHoveredItem(item.label);
                    }
                  }}
                  onMouseLeave={() => {
                    if (isCollapsed) {
                      hoverLeaveTimerRef.current = setTimeout(() => setHoveredItem(null), 180);
                    }
                  }}
                >
                  <button
                    onClick={() => toggleExpand(item.label)}
                    className={`w-full group flex items-center justify-between rounded-xl px-4 py-4 text-base transition-all duration-300 relative overflow-hidden ${
                      hasActiveChild
                        ? "text-white font-bold"
                        : "text-slate-300 hover:text-white font-semibold"
                    } ${isCollapsed ? "justify-center px-3" : ""}`}
                  style={
                    hasActiveChild
                      ? {
                          background: "linear-gradient(135deg, rgba(0, 149, 255, 0.2) 0%, rgba(0, 149, 255, 0.08) 100%)",
                          borderLeft: "4px solid #0095FF",
                          paddingLeft: "calc(1rem - 4px)",
                          boxShadow: "0 4px 20px rgba(0, 149, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
                        }
                      : {}
                  }
                  title={isCollapsed ? item.label : undefined}
                  onMouseEnter={(e) => {
                    if (!hasActiveChild) {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                      e.currentTarget.style.transform = "translateX(2px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!hasActiveChild) {
                      e.currentTarget.style.background = "";
                      e.currentTarget.style.transform = "";
                    }
                  }}
                >
                  {/* 悬停时的背景光效 */}
                  {!hasActiveChild && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                  )}
                  <div className={`flex items-center gap-4 relative z-10 ${isCollapsed ? "justify-center" : ""}`}>
                    <div className={`p-2 rounded-lg transition-all duration-300 ${
                      hasActiveChild 
                        ? "bg-primary-500/20 shadow-lg shadow-primary-500/20" 
                        : "bg-white/5 group-hover:bg-white/10"
                    }`}>
                      <Icon 
                        size={22} 
                        strokeWidth={hasActiveChild ? 2.5 : 2} 
                        className={`transition-all duration-300 ${
                          hasActiveChild ? "text-primary-300" : "text-slate-400 group-hover:text-primary-300"
                        }`}
                      />
                    </div>
                    {!isCollapsed && (
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="relative z-10 text-[15px] leading-snug">{item.label}</span>
                        {item.labelEn && (
                          <span className="text-[11px] text-slate-500 leading-tight mt-0.5 font-medium tracking-wide">
                            {item.labelEn}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <ChevronRight
                      size={18}
                      strokeWidth={2}
                      className={`text-slate-400 opacity-60 group-hover:opacity-100 transition-all duration-300 ${
                        isExpanded ? "rotate-90 opacity-100 text-primary-400" : ""
                      }`}
                    />
                  )}
                </button>
                {!isCollapsed && (
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden relative"
                      >
                        <div className="ml-6 mt-2 pl-4 relative">
                          {/* 幽灵引导线：极细的半透明竖线，不连到底，作为视觉参考 */}
                          <div className="absolute left-0 top-0 bottom-0 w-px bg-white/10" />
                          
                          <div className="space-y-0.5 pl-5">
                            {item.children.map((child, index) => {
                              const isApprovalLink = child.href === "/finance/approval";
                              const active = isActive(child.href);
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href || "#"}
                                  prefetch
                                  onMouseEnter={() => prefetchRoute(child.href)}
                                  onClick={(e) => {
                                    if (child.href && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                      e.preventDefault();
                                      router.push(child.href);
                                    }
                                  }}
                                  className={`group relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all duration-200 cursor-pointer ${
                                    active
                                      ? "text-blue-400 font-medium bg-blue-500/10"
                                      : "text-gray-400 hover:text-white hover:bg-white/5"
                                  }`}
                                >
                                  {/* 左侧占位/指示器区域：选中时显示圆点，未选中时透明占位保持对齐 */}
                                  <div className="w-1.5 h-1.5 flex-shrink-0 flex items-center justify-center">
                                    {active && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                    )}
                                  </div>
                                  
                                  {/* 文本内容 */}
                                  <span className="flex-1">
                                    {child.label}
                                  </span>
                                  
                                  {/* 英文标签（如果有且不是控制台的子菜单） */}
                                  {child.labelEn && item.label !== "控制台" && (
                                    <span className={`text-[10px] font-medium transition-all duration-200 ${
                                      active ? "text-blue-400/70" : "text-gray-500 group-hover:text-gray-400"
                                    }`}>
                                      {child.labelEn}
                                    </span>
                                  )}
                                  
                                  {/* 待审批数量角标 */}
                                  {isApprovalLink && pendingApprovalCount > 0 && (
                                    <span 
                                      className="bg-gradient-to-br from-rose-500 to-rose-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg shadow-rose-500/40 animate-pulse"
                                      style={{
                                        boxShadow: "0 0 12px rgba(239, 68, 68, 0.6)"
                                      }}
                                    >
                                      {pendingApprovalCount > 9 ? "9+" : pendingApprovalCount}
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
                {/* 窄版模式的悬停弹出菜单：移入时取消关闭定时器，避免移过去时菜单消失点不到 */}
                {isCollapsed && hoveredItem === item.label && (
                  <div
                    className="absolute left-16 ml-2 top-0 w-48 rounded-lg border border-slate-800/80 bg-[#0B0E14] shadow-2xl z-50 py-2 backdrop-blur-sm"
                    onMouseEnter={() => {
                      if (hoverLeaveTimerRef.current) {
                        clearTimeout(hoverLeaveTimerRef.current);
                        hoverLeaveTimerRef.current = null;
                      }
                    }}
                  >
                    <div className="text-xs text-slate-400 px-3 py-1.5 mb-1 border-b border-slate-800/50">
                      {item.label}
                    </div>
                    {item.children.map((child) => {
                      const isApprovalLink = child.href === "/finance/approval";
                      const active = isActive(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href || "#"}
                          onClick={(e) => {
                            if (child.href && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                              e.preventDefault();
                              router.push(child.href);
                            }
                          }}
                          className={`block px-3 py-2 text-sm transition-all duration-200 cursor-pointer ${
                            active
                              ? "text-white font-semibold"
                              : "text-slate-400 hover:text-white"
                          }`}
                          style={
                            active
                              ? {
                                  background: "linear-gradient(90deg, rgba(0,149,255,0.1) 0%, rgba(0,149,255,0) 100%)"
                                }
                              : {}
                          }
                        >
                          {child.label}
                          {isApprovalLink && pendingApprovalCount > 0 && (
                            <span className="ml-2 bg-rose-500 text-white text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center">
                              {pendingApprovalCount > 9 ? "9+" : pendingApprovalCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            );
          }
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href || "#"}
              prefetch
              className={`group flex items-center gap-4 rounded-xl px-4 py-4 text-base transition-all duration-300 relative ${
                active
                  ? "text-white font-bold"
                  : "text-slate-300 hover:text-white font-semibold"
              } ${isCollapsed ? "justify-center px-3" : ""}`}
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, rgba(0, 149, 255, 0.2) 0%, rgba(0, 149, 255, 0.08) 100%)",
                      borderLeft: "4px solid #0095FF",
                      paddingLeft: "calc(1rem - 4px)",
                      boxShadow: "0 4px 20px rgba(0, 149, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
                    }
                  : {}
              }
              title={isCollapsed ? item.label : undefined}
              onMouseEnter={(e) => {
                prefetchRoute(item.href);
                if (!active) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                  e.currentTarget.style.transform = "translateX(2px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.transform = "";
                }
              }}
            >
              <div className={`p-2 rounded-lg transition-all duration-300 ${
                active 
                  ? "bg-primary-500/20 shadow-lg shadow-primary-500/20" 
                  : "bg-white/5 group-hover:bg-white/10"
              }`}>
                <Icon 
                  size={22} 
                  strokeWidth={active ? 2.5 : 2} 
                  className={`transition-all duration-300 ${
                    active ? "text-primary-300" : "text-slate-400 group-hover:text-primary-300"
                  }`}
                />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[15px] leading-snug">{item.label}</span>
                  {item.labelEn && (
                    <span className="text-[11px] text-slate-500 leading-tight mt-0.5 font-medium tracking-wide">
                      {item.labelEn}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 底部 */}
      <div className={`px-5 py-5 border-t border-white/10 relative z-10 space-y-2 ${isCollapsed ? "px-3" : ""}`}>
        {/* 用户信息 */}
        {!isCollapsed && session?.user && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <div className="text-xs text-slate-400 mb-1">当前用户</div>
            <div className="text-sm font-medium text-white">{session.user.name || "用户"}</div>
            <div className="text-xs text-slate-500 truncate">{session.user.email || ""}</div>
          </div>
        )}
        
        {/* 登出按钮 */}
        <button
          onClick={async () => {
            // 使用 NextAuth 的 signOut 清除 session
            await signOut({ 
              redirect: true, 
              callbackUrl: "/login" 
            });
          }}
          className={`w-full flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all duration-300 relative overflow-hidden group ${
            isCollapsed ? "justify-center px-3" : ""
          }`}
          title={isCollapsed ? "登出" : "登出系统"}
        >
          <LogOut size={18} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-1" />
          {!isCollapsed && <span className="font-semibold">登出</span>}
        </button>
        
        {/* 收起按钮 */}
        <button
          onClick={handleCollapse}
          className={`w-full flex items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-300 relative overflow-hidden group ${
            isCollapsed ? "justify-center px-3" : ""
          }`}
          title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {/* 悬停光效 */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 via-primary-500/10 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
          <span className="relative z-10 flex items-center gap-2">
            {isCollapsed ? (
              <ChevronRight size={18} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-1" />
            ) : (
              <>
                <ChevronLeft size={18} strokeWidth={2} className="transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="font-semibold">收起侧边栏</span>
              </>
            )}
          </span>
        </button>
        
        {/* 汇率显示栏 */}
        {!isCollapsed && (
          <div className="-mx-5">
            <ExchangeRateBar />
          </div>
        )}
        
        {/* 版本号 */}
        <div className={`mt-3 pt-3 border-t border-white/5 ${isCollapsed ? "px-3" : "px-5"}`}>
          {isCollapsed ? (
            <div className="text-center">
              <div className="text-[10px] text-slate-600 font-mono">v{APP_VERSION}</div>
            </div>
          ) : (
            <div className="text-xs text-slate-600 font-mono text-center">
              <div>Version {APP_VERSION}</div>
              <div className="text-[10px] text-slate-700 mt-0.5">Smart ERP</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
