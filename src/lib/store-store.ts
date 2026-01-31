/**
 * 店铺数据中心化存储
 * 统一管理店铺建模、关联账户等逻辑
 */

export type Store = {
  id: string;
  name: string; // 店铺名称（如 TK-UK-01）
  platform: "TikTok" | "Amazon" | "其他"; // 所属平台
  country: string; // 国家代码（ISO，如 JP, UK, US）
  currency: "GBP" | "JPY" | "USD" | "RMB" | "EUR" | "HKD" | "SGD" | "AUD"; // 经营币种
  accountId: string; // 关联收款账户ID
  accountName: string; // 关联收款账户名称（冗余字段，便于显示）
  vatNumber?: string; // VAT/税务识别号（欧洲站等）
  taxId?: string; // 税务识别号（其他地区）
  createdAt: string;
};

const STORES_KEY = "stores";

/**
 * 获取所有店铺（同步，从 localStorage）
 */
export function getStores(): Store[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse stores", e);
    return [];
  }
}

/** 从 API 获取店铺 */
export async function getStoresFromAPI(): Promise<Store[]> {
  const res = await fetch("/api/stores");
  if (!res.ok) throw new Error("Failed to fetch stores");
  return res.json();
}

/**
 * 保存店铺列表（同步到 API）
 */
export async function saveStores(stores: Store[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing: Store[] = await fetch("/api/stores").then((r) => (r.ok ? r.json() : []));
    const existingIds = new Set(existing.map((s) => s.id));
    const newIds = new Set(stores.map((s) => s.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/stores/${e.id}`, { method: "DELETE" });
      }
    }
    for (const s of stores) {
      if (existingIds.has(s.id)) {
        await fetch(`/api/stores/${s.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        });
      } else {
        await fetch("/api/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        });
      }
    }
  } catch (e) {
    console.error("Failed to save stores", e);
    throw e;
  }
}

/**
 * 根据ID获取店铺（需传入 stores 或从 API 获取）
 */
export function getStoreById(storeId: string, stores?: Store[]): Store | null {
  if (stores) return stores.find((s) => s.id === storeId) || null;
  const list = getStores();
  return list.find((s) => s.id === storeId) || null;
}

/**
 * 根据账户ID获取店铺
 */
export function getStoresByAccountId(accountId: string, stores?: Store[]): Store[] {
  const list = stores ?? getStores();
  return list.filter((s) => s.accountId === accountId);
}
