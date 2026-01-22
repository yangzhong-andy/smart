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
 * 获取所有店铺
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

/**
 * 保存店铺列表
 */
export function saveStores(stores: Store[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORES_KEY, JSON.stringify(stores));
  } catch (e) {
    console.error("Failed to save stores", e);
  }
}

/**
 * 根据ID获取店铺
 */
export function getStoreById(storeId: string): Store | null {
  const stores = getStores();
  return stores.find((s) => s.id === storeId) || null;
}

/**
 * 根据账户ID获取店铺
 */
export function getStoresByAccountId(accountId: string): Store[] {
  const stores = getStores();
  return stores.filter((s) => s.accountId === accountId);
}
