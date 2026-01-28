"use client";

import { ReactNode, useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSWRConfig } from "swr";
import dynamic from "next/dynamic";
import SWRProvider from "@/lib/swr-provider";
import GlobalRefresher from "@/components/GlobalRefresher";

// 动态导入 Sidebar，禁用 SSR，避免初始化错误
const Sidebar = dynamic(() => import("@/components/Sidebar"), {
  ssr: false,
  loading: () => (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-4">
      <div className="h-full animate-pulse">
        <div className="h-8 bg-slate-800 rounded mb-4"></div>
        <div className="space-y-2">
          <div className="h-6 bg-slate-800 rounded"></div>
          <div className="h-6 bg-slate-800 rounded"></div>
          <div className="h-6 bg-slate-800 rounded"></div>
        </div>
      </div>
    </aside>
  ),
});

function RouteChangeRefresher() {
  const pathname = usePathname();
  const { mutate, cache } = useSWRConfig();
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    // 如果路径发生变化（且不是首次加载），从数据库更新所有相关数据
    if (prevPathnameRef.current !== null && prevPathnameRef.current !== pathname) {
      console.log(`[RouteChangeRefresher] 路由变化：${prevPathnameRef.current} -> ${pathname}，从数据库更新数据...`);
      
      // 根据当前路由确定需要更新的数据源
      const getEndpointsForRoute = (route: string): string[] => {
        const endpoints: string[] = [];
        
        // 财务相关路由
        if (route.startsWith('/finance')) {
          endpoints.push('/api/accounts', '/api/cash-flow', '/api/payment-requests', '/api/finance-rates');
        }
        
        // 采购相关路由
        if (route.startsWith('/procurement')) {
          endpoints.push('/api/suppliers', '/api/purchase-orders', '/api/purchase-contracts', '/api/delivery-orders');
        }
        
        // 物流相关路由
        if (route.startsWith('/logistics')) {
          endpoints.push('/api/warehouses', '/api/logistics-channels', '/api/logistics-tracking', '/api/outbound-orders', '/api/pending-inbound');
        }
        
        // 产品相关路由
        if (route.startsWith('/product-center') || route.startsWith('/products')) {
          endpoints.push('/api/products');
        }
        
        // 设置相关路由
        if (route.startsWith('/settings')) {
          endpoints.push('/api/stores', '/api/users', '/api/departments', '/api/employees');
        }
        
        // 人力资源相关路由
        if (route.startsWith('/hr')) {
          endpoints.push('/api/employees', '/api/commission-rules', '/api/commission-records');
        }
        
        // 广告相关路由
        if (route.startsWith('/advertising')) {
          endpoints.push('/api/influencers');
        }
        
        // 库存相关路由
        if (route.startsWith('/inventory')) {
          endpoints.push('/api/stock', '/api/inventory-stocks', '/api/inventory-movements');
        }
        
        // 通用数据源（所有页面都可能用到）
        endpoints.push('/api/exchange-rates');
        
        // 去重
        return Array.from(new Set(endpoints));
      };
      
      const endpointsToUpdate = getEndpointsForRoute(pathname);
      
      // 从数据库重新获取数据，忽略缓存
      Promise.all(
        endpointsToUpdate.map(endpoint =>
          mutate(
            endpoint,
            async () => {
              // 重新从数据库获取数据
              const res = await fetch(endpoint);
              if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
              return res.json();
            },
            { 
              revalidate: true, // 强制重新验证
              populateCache: true, // 更新缓存
              rollbackOnError: false // 不回滚错误
            }
          ).catch(() => {
            // 静默处理错误，某些端点可能不存在
          })
        )
      ).then(() => {
        console.log(`[RouteChangeRefresher] ✅ 已从数据库更新 ${endpointsToUpdate.length} 个数据源`);
      });
    }
    
    // 更新上一个路径
    prevPathnameRef.current = pathname;
  }, [pathname, mutate]);

  return null;
}

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isChecking, setIsChecking] = useState(true);
  const isLoginPage = pathname === "/login";

  // 为登录页面添加特殊标识的 useEffect（必须在顶层）
  useEffect(() => {
    if (isLoginPage) {
      document.body.setAttribute('data-login-page', 'true');
      return () => {
        document.body.removeAttribute('data-login-page');
      };
    }
  }, [isLoginPage]);

  useEffect(() => {
    // 如果是登录页面，不需要检查认证
    if (isLoginPage) {
      setIsChecking(false);
      return;
    }

    // 设置超时，防止无限加载
    let timeoutId: NodeJS.Timeout | null = null;
    
    if (status === "loading") {
      timeoutId = setTimeout(() => {
        console.warn("Session 加载超时，重定向到登录页");
        setIsChecking(false);
        router.push("/login");
      }, 5000); // 5秒超时
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    // 清除超时（如果存在）
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // 检查用户是否已登录
    if (status === "unauthenticated" || !session) {
      // 未登录，重定向到登录页
      setIsChecking(false);
      router.push("/login");
      return;
    }

    // 已登录，允许访问
    setIsChecking(false);
  }, [pathname, router, isLoginPage, session, status]);

  // 正在检查认证状态时显示加载中
  if (isChecking && !isLoginPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-primary-500"></div>
          <p className="mt-4 text-slate-400">正在验证身份...</p>
        </div>
      </div>
    );
  }

  // 登录页面不显示侧边栏
  if (isLoginPage) {
    return (
      <SWRProvider>
        {children}
        <GlobalRefresher />
      </SWRProvider>
    );
  }

  // 其他页面显示侧边栏
  return (
    <SWRProvider>
      <RouteChangeRefresher />
      <div className="flex h-full">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main className="flex-1 text-slate-100 overflow-y-auto relative z-0 scrollbar-thin">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
      <GlobalRefresher />
    </SWRProvider>
  );
}
