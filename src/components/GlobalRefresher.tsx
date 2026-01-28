"use client";

import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";

/**
 * 全局自动刷新组件
 * 后台静默获取新数据，只更新数据，不刷新整个页面
 * 
 * 刷新机制：
 * 1. 使用 SWR 的 mutate 函数静默重新验证缓存
 * 2. 只有当页面可见时才刷新（节省流量）
 * 3. 只更新数据，不会导致页面重新加载
 */
export default function GlobalRefresher() {
  const { mutate } = useSWRConfig();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    // 防止重复初始化（修复：使用 ref 而不是依赖项来避免重复执行）
    if (isMountedRef.current) {
      return;
    }
    isMountedRef.current = true;

    // 定义所有需要刷新的 API endpoints
    const apiEndpoints = [
      '/api/accounts',
      '/api/cash-flow',
      '/api/suppliers',
      '/api/products',
      '/api/purchase-orders',
    ];

    // 刷新函数 - 静默更新数据，不触发页面重新加载
    const refreshAllData = () => {
      // 检查页面是否可见
      if (document.visibilityState !== "visible") {
        return;
      }

      const timestamp = new Date().toLocaleTimeString();
      console.log(`[GlobalRefresher] 🔄 后台更新数据... ${timestamp}`);
      
      // 静默刷新所有 API endpoints
      // 使用 revalidate: true 但不会导致页面重新加载
      apiEndpoints.forEach((endpoint) => {
        // 使用 mutate 重新验证，但只更新数据，不触发页面重新加载
        mutate(
          endpoint,
          async () => {
            // 重新获取数据
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error('Failed to fetch');
            return res.json();
          },
          {
            revalidate: true,
            rollbackOnError: false,
            populateCache: true,
            // 关键：不触发重新渲染，只更新缓存
            optimisticData: undefined,
          }
        ).catch(() => {
          // 静默处理错误
        });
      });

      console.log(`[GlobalRefresher] ✅ 已触发 ${apiEndpoints.length} 个数据源的后台更新`);
    };

    // 设置定时器，每隔 1 小时刷新一次（减少流量消耗）
    intervalRef.current = setInterval(() => {
      refreshAllData();
    }, 3600000); // 1 小时 = 3600000 毫秒

    console.log('[GlobalRefresher] ✅ 已启动，将每 1 小时在后台更新数据（不刷新页面）');

    // 清理定时器
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        isMountedRef.current = false;
        console.log('[GlobalRefresher] 已停止');
      }
    };
  }, []); // 修复：移除 mutate 依赖，使用 ref 防止重复执行

  // 不渲染任何 UI 内容
  return null;
}
