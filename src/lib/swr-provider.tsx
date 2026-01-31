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
        revalidateOnFocus: true, // 切回页面时刷新，便于多台电脑数据同步
        revalidateIfStale: true, // 数据过期时自动刷新
        revalidateOnMount: true, // 打开页面时拉取最新数据，确保多设备间数据一致
        dedupingInterval: 60000, // 1分钟内去重，平衡同步与请求量
        shouldRetryOnError: false, // 接口报错（如 500）时不自动重试，避免死循环
        errorRetryCount: 0, // 最大重试次数为 0
        keepPreviousData: true, // 保持旧数据，避免闪烁
      }}
    >
      {children}
    </SWRConfig>
  );
}
