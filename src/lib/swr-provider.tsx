"use client";

import { ReactNode, useMemo } from "react";
import { SWRConfig, Cache } from "swr";

const CACHE_KEY = "swr-cache-v1";

function createPersistentMap(): Cache {
  if (typeof window === "undefined") return new Map();

  let entries: [string, any][] = [];
  try {
    const stored = window.localStorage.getItem(CACHE_KEY);
    if (stored) entries = JSON.parse(stored);
  } catch {
    entries = [];
  }

  const map = new Map(entries);

  const persist = () => {
    try {
      const data = JSON.stringify(Array.from(map.entries()));
      window.localStorage.setItem(CACHE_KEY, data);
    } catch {
      /* ignore quota errors */
    }
  };

  const originalSet = map.set.bind(map);
  map.set = (key: any, value: any) => {
    originalSet(key, value);
    persist();
    return map;
  };

  const originalDelete = map.delete.bind(map);
  map.delete = (key: any) => {
    const res = originalDelete(key);
    persist();
    return res;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", persist);
  }

  return map as Cache;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
};

export default function SWRProvider({ children }: { children: ReactNode }) {
  const provider = useMemo(() => createPersistentMap, []);

  return (
    <SWRConfig
      value={{
        fetcher,
        provider,
        revalidateOnFocus: false,
        revalidateIfStale: false, // 已禁用：减少自动刷新，数据由用户操作或手动刷新触发
        revalidateOnMount: false, // 已禁用：挂载时优先使用缓存，无缓存时才请求，减少数据库访问
        dedupingInterval: 300000, // 5分钟内相同 key 不重复请求
        shouldRetryOnError: false, // 接口报错（如 500）时不自动重试，避免死循环
        errorRetryCount: 0, // 最大重试次数为 0
        keepPreviousData: true, // 保持旧数据，避免闪烁
      }}
    >
      {children}
    </SWRConfig>
  );
}
