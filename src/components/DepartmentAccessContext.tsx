"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import {
  parseDepartmentAccessRuleConfig,
  type DepartmentAccessRuleConfig,
} from "@/lib/department-access-config";

export type DepartmentAccessContextValue = {
  bypass: boolean;
  config: DepartmentAccessRuleConfig | null;
  loaded: boolean;
  /** 保存部门权限后调用，刷新当前用户的 effective 规则 */
  refresh: () => Promise<void>;
};

const DepartmentAccessContext = createContext<DepartmentAccessContextValue | null>(null);

export function useDepartmentAccess(): DepartmentAccessContextValue | null {
  return useContext(DepartmentAccessContext);
}

export function DepartmentAccessProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [bypass, setBypass] = useState(false);
  const [config, setConfig] = useState<DepartmentAccessRuleConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (status !== "authenticated" || !session?.user) return;
    const role = session.user.role;
    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      setBypass(true);
      setConfig(null);
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch("/api/department-access-rules/effective", { credentials: "same-origin" });
      const data = (await res.json().catch(() => ({}))) as {
        bypass?: boolean;
        config?: DepartmentAccessRuleConfig | null;
        error?: string;
      };
      if (!res.ok) {
        setBypass(false);
        setConfig(null);
        setLoaded(true);
        return;
      }
      setBypass(Boolean(data.bypass));
      const rawConfig = data.config ?? null;
      setConfig(rawConfig ? parseDepartmentAccessRuleConfig(rawConfig) : null);
      setLoaded(true);
    } catch {
      setBypass(false);
      setConfig(null);
      setLoaded(true);
    }
  }, [session?.user?.departmentId, session?.user?.id, session?.user?.role, status]);

  useEffect(() => {
    const onUpdated = () => {
      void load();
    };
    window.addEventListener("department-access-updated", onUpdated);
    return () => window.removeEventListener("department-access-updated", onUpdated);
  }, [load]);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated" || !session?.user) {
      setBypass(false);
      setConfig(null);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load, session?.user?.id, session?.user?.departmentId, session?.user?.role, status]);

  const refresh = useCallback(async () => {
    setLoaded(false);
    await load();
  }, [load]);

  const value = useMemo(
    () => ({ bypass, config, loaded, refresh }),
    [bypass, config, loaded, refresh]
  );

  return (
    <DepartmentAccessContext.Provider value={value}>{children}</DepartmentAccessContext.Provider>
  );
}
