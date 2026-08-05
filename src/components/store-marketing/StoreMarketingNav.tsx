"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShoppingBag,
} from "lucide-react";

const PRIMARY_LINKS = [
  { label: "经营总览", href: "/finance/settlement-dashboard", icon: LayoutDashboard },
  { label: "订单中心", href: "/tiktok/orders", icon: ShoppingBag },
  { label: "店铺分析", href: "/tiktok/analytics", icon: BarChart3 },
  { label: "营销增长", href: "/advertising/influencers", icon: Megaphone },
  { label: "平台管理", href: "/settings/stores", icon: Settings },
];

const MORE_LINKS = [
  { label: "数据导入", href: "/finance/import" },
  { label: "商店分析", href: "/tiktok/shop-analytics" },
  { label: "联盟营销", href: "/tiktok/affiliate" },
  { label: "广告代理", href: "/advertising/agencies" },
  { label: "TikTok 授权", href: "/settings/tiktok" },
];

export default function StoreMarketingNav() {
  const pathname = usePathname();
  const moreActive = MORE_LINKS.some((item) => pathname === item.href);

  return (
    <nav aria-label="营销与店铺功能" className="border-b border-slate-800 pb-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto pb-1 scrollbar-thin">
          <div className="flex min-w-max items-center gap-1.5">
            {PRIMARY_LINKS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary-500 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <details className="group relative shrink-0">
          <summary
            className={`flex h-9 cursor-pointer list-none items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden ${
              moreActive
                ? "bg-primary-500 text-white"
                : "border border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            更多
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl">
            {MORE_LINKS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`block px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary-500/20 text-primary-300"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </details>
      </div>
    </nav>
  );
}
