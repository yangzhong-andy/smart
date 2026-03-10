"use client";

import { ReactNode, useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSWRConfig } from "swr";
import dynamic from "next/dynamic";
import SWRProvider from "@/lib/swr-provider";
import GlobalRefresher from "@/components/GlobalRefresher";
import { isPathAllowedForDepartment, getDefaultRouteForDepartment } from "@/lib/permissions";

/** 路由切换时顶部细进度条，点击子菜单后立即有反馈，减轻“卡住”体感 */
function RouteChangeProgress() {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 800);
      return () => clearTimeout(t);
    }
    prevPathRef.current = pathname;
  }, [pathname]);

  if (!show) return null;
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-[100] overflow-hidden bg-slate-800/50">
      <div
        className="h-full bg-primary-500 animate-progress-shrink"
        style={{ boxShadow: "0 0 10px rgba(0, 229, 255, 0.5)" }}
      />
    </div>
  );
}

// 动态导入 Sidebar：ssr:false 防止水合错误导致页面崩溃，loading 占位保持布局稳定
const Sidebar = dynamic(() => import("@/components/Sidebar"), {
  ssr: false,
  loading: () => (
    <aside className="flex flex-col w-72 border-r border-slate-800 bg-slate-900/50 p-4 flex-shrink-0" aria-label="侧栏加载中">
      <div className="h-full animate-pulse flex flex-col gap-4">
        <div className="h-8 bg-slate-800 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-6 bg-slate-800 rounded" />
          ))}
        </div>
      </div>
      <div className="mt-auto text-xs text-slate-500 text-center py-2">加载中…</div>
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
          endpoints.push('/api/stock', '/api/stock-logs', '/api/inventory-stocks', '/api/inventory-movements');
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

const CHECKING_TIMEOUT_MS = 8000;

export default function LayoutWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isChecking, setIsChecking] = useState(true);
  const isLoginPage = pathname === "/login";
  const checkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 加载锁超时：防止 isChecking 永远不解除导致右侧一直“加载中”
  useEffect(() => {
    if (!isLoginPage && isChecking) {
      checkingTimeoutRef.current = setTimeout(() => {
        checkingTimeoutRef.current = null;
        setIsChecking(false);
      }, CHECKING_TIMEOUT_MS);
    }
    return () => {
      if (checkingTimeoutRef.current) {
        clearTimeout(checkingTimeoutRef.current);
        checkingTimeoutRef.current = null;
      }
    };
  }, [isLoginPage, isChecking]);

  // 为登录页面添加特殊标识的 useEffect（必须在顶层）
  useEffect(() => {
    if (isLoginPage) {
      document.body.setAttribute('data-login-page', 'true');
      return () => {
        document.body.removeAttribute('data-login-page');
      };
    }
  }, [isLoginPage]);

  // 路由切换时恢复 body 滚动，避免对账中心等页面的弹窗遮罩残留导致后续页面无法滚动
  useEffect(() => {
    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [pathname]);

  useEffect(() => {
    if (isLoginPage) {
      setIsChecking(false);
      return;
    }

    // session 加载中：不阻塞界面，直接显示正常布局，避免切换页面时反复出现「验证身份」
    if (status === "loading") {
      setIsChecking(false);
      return;
    }

    if (status === "unauthenticated" || !session) {
      setIsChecking(false);
      router.replace("/login");
      return;
    }

    const departmentCode = (session?.user as any)?.departmentCode ?? null;
    const departmentName = (session?.user as any)?.departmentName ?? null;
    if ((departmentCode || departmentName) && !isPathAllowedForDepartment(pathname || "/", departmentCode, departmentName)) {
      const fallback =
        getDefaultRouteForDepartment(departmentCode, departmentName) ||
        "/";
      setIsChecking(false);
      router.replace(fallback);
      return;
    }
    setIsChecking(false);
  }, [pathname, router, isLoginPage, session, status]);

  // 仅在实际未登录时显示「跳转登录」；session 加载中不挡屏，不显示「验证身份」
  if (isChecking && !isLoginPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-primary-500"></div>
          <p className="mt-4 text-slate-400">加载中...</p>
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

  // 未登录且不在登录页：只显示“跳转中”，不渲染后台界面，避免先闪出侧栏再弹登录
  if (status === "unauthenticated" || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-primary-500"></div>
          <p className="mt-4 text-slate-400">正在跳转到登录页...</p>
        </div>
      </div>
    );
  }

  // 已登录：其他页面显示侧边栏
  return (
    <SWRProvider>
      <RouteChangeRefresher />
      <RouteChangeProgress />
      <div className="flex h-full relative">
        {/* 侧栏容器：position:relative + z-index:50，确保永远在 main(z-0) 之上，避免 dynamic 加载顺序导致被遮挡 */}
        <div className="relative z-50 flex-shrink-0">
          <Sidebar />
        </div>

        {/* Main Content */}
        <main className="flex-1 text-slate-100 overflow-y-auto relative z-0 scrollbar-thin min-w-0">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
      <GlobalRefresher />
    </SWRProvider>
  );
}
