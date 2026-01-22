/**
 * 仅使用 localStorage 的数据获取 Hook
 * 当数据库不可用时，完全使用 localStorage
 */

import { useState, useEffect } from 'react';

/**
 * 仅从 localStorage 获取数据
 */
export function useLocalStorageOnly<T>(
  storageKey: string,
  defaultValue: T[] = []
): {
  data: T[];
  isLoading: boolean;
  mutate: (data?: T[], shouldRevalidate?: boolean) => void;
  saveToLocalStorage: (data: T[]) => void;
} {
  const [data, setData] = useState<T[]>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  // 从 localStorage 加载数据
  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setData(Array.isArray(parsed) ? parsed : defaultValue);
      } else {
        setData(defaultValue);
      }
    } catch (e) {
      console.error(`[useLocalStorageOnly] 读取 localStorage 失败: ${storageKey}`, e);
      setData(defaultValue);
    } finally {
      setIsLoading(false);
    }
  }, [storageKey, defaultValue]);

  // 保存到 localStorage
  const saveToLocalStorage = (newData: T[]) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(newData));
      setData(newData);
    } catch (e) {
      console.error(`[useLocalStorageOnly] 保存到 localStorage 失败: ${storageKey}`, e);
    }
  };

  // mutate 函数（兼容 SWR API）
  const mutate = (newData?: T[], shouldRevalidate?: boolean) => {
    if (newData !== undefined) {
      saveToLocalStorage(newData);
    } else if (shouldRevalidate) {
      // 重新加载
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setData(Array.isArray(parsed) ? parsed : defaultValue);
        } catch (e) {
          console.error(`[useLocalStorageOnly] 重新加载失败: ${storageKey}`, e);
        }
      }
    }
  };

  return {
    data,
    isLoading,
    mutate,
    saveToLocalStorage,
  };
}
