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
        revalidateIfStale: true,
        dedupingInterval: 800,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
