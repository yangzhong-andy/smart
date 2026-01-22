/**
 * localStorage 回退 Hook
 * 当 API 失败时，自动回退到使用 localStorage
 */

import { useState, useEffect } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

/**
 * 使用 localStorage 作为后备的数据获取 Hook
 * @param apiUrl API 地址
 * @param storageKey localStorage 键名
 * @param options SWR 选项
 */
export function useLocalStorageFallback<T>(
  apiUrl: string,
  storageKey: string,
  options?: any
) {
  // 尝试从 API 获取数据
  const { data: apiData, error, isLoading, mutate } = useSWR<T[]>(
    apiUrl,
    fetcher,
    {
      ...options,
      onError: (err) => {
        console.warn(`[useLocalStorageFallback] API 请求失败，使用 localStorage: ${apiUrl}`, err);
        if (options?.onError) options.onError(err);
      },
      // 禁用自动重试，失败后立即使用 localStorage
      shouldRetryOnError: false,
    }
  );

  // 从 localStorage 获取数据
  const [localData, setLocalData] = useState<T[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setLocalData(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
      console.error(`[useLocalStorageFallback] 读取 localStorage 失败: ${storageKey}`, e);
    }
  }, [storageKey]);

  // 如果 API 失败或返回空数据，使用 localStorage
  const finalData = error || !apiData ? localData : apiData;
  const finalIsLoading = !error && isLoading;

  // 保存到 localStorage 的函数
  const saveToLocalStorage = (data: T[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
      setLocalData(data);
    } catch (e) {
      console.error(`[useLocalStorageFallback] 保存到 localStorage 失败: ${storageKey}`, e);
    }
  };

  return {
    data: finalData,
    isLoading: finalIsLoading,
    error: error ? null : undefined, // 如果有 localStorage 数据，不显示错误
    mutate,
    saveToLocalStorage,
    isUsingLocalStorage: !!error || !apiData,
  };
}
