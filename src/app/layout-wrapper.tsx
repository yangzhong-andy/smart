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

/**
 * 路由切换刷新器
 * 已禁用：不再在路由切换时主动请求数据库，数据由各页面的 useSWR 按需加载
 * 如需恢复，将 ENABLE_ROUTE_REFRESH 设为 true
 */
function RouteChangeRefresher() {
  const ENABLE_ROUTE_REFRESH = false; // 设为 true 可恢复路由切换时预加载数据
  const pathname = usePathname();
  const { mutate } = useSWRConfig();
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ENABLE_ROUTE_REFRESH) {
      prevPathnameRef.current = pathname;
      return;
    }
    // 如果路径发生变化（且不是首次加载），从数据库更新所有相关数据
    if (prevPathnameRef.current !== null && prevPathnameRef.current !== pathname) {
      console.log(`[RouteChangeRefresher] 路由变化：${prevPathnameRef.current} -> ${pathname}，从数据库更新数据...`);
      
      const getEndpointsForRoute = (route: string): string[] => {
        const endpoints: string[] = [];
        if (route.startsWith('/finance')) {
          endpoints.push('/api/accounts', '/api/cash-flow', '/api/payment-requests', '/api/finance-rates');
        }
        if (route.startsWith('/procurement')) {
          endpoints.push('/api/suppliers', '/api/purchase-orders', '/api/purchase-contracts', '/api/delivery-orders');
        }
        if (route.startsWith('/logistics')) {
          endpoints.push('/api/warehouses', '/api/logistics-channels', '/api/logistics-tracking', '/api/outbound-orders', '/api/pending-inbound');
        }
        if (route.startsWith('/product-center') || route.startsWith('/products')) {
          endpoints.push('/api/products');
        }
        if (route.startsWith('/settings')) {
          endpoints.push('/api/stores', '/api/users', '/api/departments', '/api/employees');
        }
        if (route.startsWith('/hr')) {
          endpoints.push('/api/employees', '/api/commission-rules', '/api/commission-records');
        }
        if (route.startsWith('/advertising')) {
          endpoints.push('/api/influencers');
        }
        if (route.startsWith('/inventory')) {
          endpoints.push('/api/stock', '/api/inventory-stocks', '/api/inventory-movements');
        }
        return Array.from(new Set(endpoints));
      };
      
      const endpointsToUpdate = getEndpointsForRoute(pathname);
      
      Promise.all(
        endpointsToUpdate.map(async (endpoint) => {
          try {
            await mutate(
              endpoint,
              async () => {
                const res = await fetch(endpoint);
                if (!res.ok) throw new Error(`Failed to fetch ${endpoint}: ${res.status}`);
                return res.json();
              },
              { revalidate: true, populateCache: true, rollbackOnError: true }
            );
            return { endpoint, success: true };
          } catch (error) {
            console.warn(`[RouteChangeRefresher] 更新 ${endpoint} 时出错:`, error);
            return { endpoint, success: false, error };
          }
        })
      ).then((results) => {
        const successCount = results.filter(r => r?.success).length;
        console.log(`[RouteChangeRefresher] ✅ 已更新 ${successCount}/${endpointsToUpdate.length} 个数据源`);
      });
    }
    
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
