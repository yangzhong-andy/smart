/**
 * 财务数据中心化存储
 * 统一管理账户建模、汇率折算等逻辑
 */

export type BankAccount = {
  id: string;
  name: string; // 账户名称（必填）
  accountNumber: string; // 账号（卡号）
  accountType: "对公" | "对私" | "平台"; // 账号类型（旧字段，保留兼容）
  accountCategory: "PRIMARY" | "VIRTUAL"; // 账户类别：主账户/虚拟子账号
  accountPurpose: string; // 账号用途
  currency: "CNY" | "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD"; // 币种（CNY 和 RMB 都支持，兼容旧数据）
  country: string; // 所属国家/地区（ISO代码，如 CN, HK, GLOBAL）
  originalBalance: number; // 原币余额（当前余额，会随流水变化）
  initialCapital?: number; // 原始资金（账户初始资金，固定值，不受流水影响）
  exchangeRate: number; // 汇率（对RMB）
  rmbBalance: number; // 折算RMB余额（自动计算）
  parentId?: string; // 父账户ID（虚拟子账号关联主账户）
  storeId?: string; // 关联店铺ID（硬关联，VIRTUAL 必须绑定）
  companyEntity?: string; // 公司主体
  owner?: string; // 账号归属人
  notes: string; // 使用说明（多行文本）
  createdAt: string;
  // 平台账号相关字段（仅当 accountType === "平台" 时使用）
  platformAccount?: string; // 平台账号
  platformPassword?: string; // 账号密码
  platformUrl?: string; // 登入网站
};

const ACCOUNTS_KEY = "bankAccounts";

/**
 * 计算折算RMB余额
 */
export function calculateRMBBalance(
  originalBalance: number,
  exchangeRate: number,
  currency: BankAccount["currency"]
): number {
  if (currency === "CNY" || currency === "RMB") return originalBalance;
  if (!Number.isFinite(originalBalance) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) return 0;
  return originalBalance * exchangeRate;
}

/**
 * 获取所有账户（同步，从 localStorage，兼容旧代码）
 */
export function getAccounts(): BankAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse bank accounts", e);
    return [];
  }
}

/** 从 API 获取账户 */
export async function getAccountsFromAPI(): Promise<BankAccount[]> {
  const res = await fetch("/api/accounts?page=1&pageSize=500");
  if (!res.ok) throw new Error("Failed to fetch accounts");
  const json = await res.json();
  return Array.isArray(json) ? json : (json?.data ?? []);
}

/**
 * 保存账户列表（同步到 API）
 */
export async function saveAccounts(accounts: BankAccount[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const raw = await fetch("/api/accounts?page=1&pageSize=500").then((r) => (r.ok ? r.json() : []));
    const existing: BankAccount[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
    const existingIds = new Set(existing.map((a) => a.id));
    const newIds = new Set(accounts.map((a) => a.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/accounts/${e.id}`, { method: "DELETE" });
      }
    }
    for (const a of accounts) {
      const body = {
        ...a,
        currency: a.currency === "RMB" ? "CNY" : a.currency,
      };
      if (existingIds.has(a.id)) {
        await fetch(`/api/accounts/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }
  } catch (e) {
    console.error("Failed to save bank accounts", e);
    throw e;
  }
}

/**
 * 计算主账户余额（自动汇总子账号）
 * 注意：originalBalance 只包含子账户的当前余额（不含初始资金）
 * 初始资金需要单独处理（initialCapital 字段）
 */
export function calculatePrimaryAccountBalance(
  primaryAccount: BankAccount,
  allAccounts: BankAccount[]
): { originalBalance: number; rmbBalance: number } {
  const childAccounts = allAccounts.filter((acc) => acc.parentId === primaryAccount.id);
  // 只汇总子账户的当前余额（不含初始资金）
  const totalOriginalBalance = childAccounts.reduce((sum, acc) => sum + (acc.originalBalance || 0), 0);
  // 计算RMB余额（只包含当前余额，不含初始资金）
  const totalRmbBalance = childAccounts.reduce((sum, acc) => {
    const childRmb = acc.currency === "RMB" 
      ? (acc.originalBalance || 0)
      : (acc.originalBalance || 0) * (acc.exchangeRate || 1);
    return sum + childRmb;
  }, 0);
  
  return {
    originalBalance: totalOriginalBalance,
    rmbBalance: totalRmbBalance
  };
}

/**
 * 获取账户统计
 * 统计逻辑：
 * 1. 总资产（RMB）：汇总所有账户的 RMB 余额
 *    - 主账户（有子账户）：使用汇总后的余额（已包含子账户）
 *    - 主账户（无子账户）：使用主账户自己的余额
 *    - 虚拟子账户：不统计（已被主账户汇总）
 *    - 独立账户：直接统计
 * 2. 各币种总额：统计所有账户的原币余额
 *    - 主账户（有子账户）：统计子账户的余额
 *    - 主账户（无子账户）：统计主账户的余额
 *    - 虚拟子账户：不统计（已被主账户统计）
 *    - 独立账户：直接统计
 */
export function getAccountStats(accounts: BankAccount[]) {
  if (!accounts || accounts.length === 0) {
    return {
      totalAssetsRMB: 0,
      totalUSD: 0,
      totalJPY: 0,
      totalEUR: 0
    };
  }

  let totalAssetsRMB = 0;
  let totalUSD = 0;
  let totalJPY = 0;
  let totalEUR = 0;

  accounts.forEach((acc) => {
    if (acc.accountCategory === "PRIMARY") {
      // 主账户
      const hasChildren = accounts.some((a) => a.parentId === acc.id);
      if (hasChildren) {
        // 有子账户：汇总子账户的余额
        // 注意：calculated.originalBalance 已经包含了子账户的 initialCapital + 所有流水
        const calculated = calculatePrimaryAccountBalance(acc, accounts);
        // 主账户自己的初始资金RMB值
        const primaryInitialCapitalRMB = (acc.initialCapital || 0) * (acc.currency === "RMB" ? 1 : (acc.exchangeRate || 1));
        // 总RMB余额 = 子账户余额RMB（已包含子账户的 initialCapital + 流水）+ 主账户初始资金RMB
        const rmbBal = calculated.rmbBalance + primaryInitialCapitalRMB;
        totalAssetsRMB += Number.isFinite(rmbBal) ? rmbBal : 0;
        
        // 对于各币种，统计子账户的余额（originalBalance 已经包含了 initialCapital）
        const children = accounts.filter((a) => a.parentId === acc.id);
        children.forEach((child) => {
          // originalBalance 已经包含了 initialCapital + 所有流水
          const childTotal = child.originalBalance || 0;
          if (Number.isFinite(childTotal)) {
            if (child.currency === "USD") {
              totalUSD += childTotal;
            } else if (child.currency === "JPY") {
              totalJPY += childTotal;
            } else if (child.currency === "EUR") {
              totalEUR += childTotal;
            }
          }
        });
        // 加上主账户自己的初始资金（原币）
        const primaryInitialCapital = acc.initialCapital || 0;
        if (Number.isFinite(primaryInitialCapital) && primaryInitialCapital > 0) {
          if (acc.currency === "USD") {
            totalUSD += primaryInitialCapital;
          } else if (acc.currency === "JPY") {
            totalJPY += primaryInitialCapital;
          } else if (acc.currency === "EUR") {
            totalEUR += primaryInitialCapital;
          }
        }
      } else {
        // 无子账户：使用主账户自己的余额（originalBalance 已经包含了 initialCapital）
        const accountTotal = acc.originalBalance || 0;
        const rmbBal = acc.currency === "RMB" 
          ? accountTotal 
          : accountTotal * (acc.exchangeRate || 1);
        totalAssetsRMB += Number.isFinite(rmbBal) ? rmbBal : 0;
        
        if (Number.isFinite(accountTotal)) {
          if (acc.currency === "USD") {
            totalUSD += accountTotal;
          } else if (acc.currency === "JPY") {
            totalJPY += accountTotal;
          } else if (acc.currency === "EUR") {
            totalEUR += accountTotal;
          }
        }
      }
    } else if (acc.accountCategory === "VIRTUAL") {
      // 虚拟子账户：不统计（已被主账户汇总）
      // 如果某个虚拟子账户没有被主账户统计（异常情况），也不统计，因为它在逻辑上应该属于某个主账户
      // 这里不处理，避免重复统计
    } else if (!acc.parentId) {
      // 独立账户：直接统计（originalBalance 已经包含了 initialCapital）
      const accountTotal = acc.originalBalance || 0;
      const rmbBal = acc.currency === "RMB" 
        ? accountTotal 
        : accountTotal * (acc.exchangeRate || 1);
      totalAssetsRMB += Number.isFinite(rmbBal) ? rmbBal : 0;
      
      if (Number.isFinite(accountTotal)) {
        if (acc.currency === "USD") {
          totalUSD += accountTotal;
        } else if (acc.currency === "JPY") {
          totalJPY += accountTotal;
        } else if (acc.currency === "EUR") {
          totalEUR += accountTotal;
        }
      }
    }
  });

  return {
    totalAssetsRMB: Number.isFinite(totalAssetsRMB) ? totalAssetsRMB : 0,
    totalUSD: Number.isFinite(totalUSD) ? totalUSD : 0,
    totalJPY: Number.isFinite(totalJPY) ? totalJPY : 0,
    totalEUR: Number.isFinite(totalEUR) ? totalEUR : 0
  };
}

/**
 * 获取账户树形结构
 */
export function getAccountTree(accounts: BankAccount[]): Array<BankAccount & { children?: BankAccount[] }> {
  const primaryAccounts = accounts.filter((acc) => acc.accountCategory === "PRIMARY");
  const virtualAccounts = accounts.filter((acc) => acc.accountCategory === "VIRTUAL");
  const independentAccounts = accounts.filter(
    (acc) => acc.accountCategory !== "PRIMARY" && acc.accountCategory !== "VIRTUAL" && !acc.parentId
  );

  const tree: Array<BankAccount & { children?: BankAccount[] }> = [];

  // 添加主账户及其子账号
  primaryAccounts.forEach((primary) => {
    const children = virtualAccounts.filter((acc) => acc.parentId === primary.id);
    tree.push({
      ...primary,
      children: children.length > 0 ? children : undefined
    });
  });

  // 添加独立账户
  independentAccounts.forEach((acc) => {
    tree.push(acc);
  });

  return tree;
}

/**
 * 更新账户余额（用于支付等操作，同步到 API）
 */
export async function updateAccountBalance(
  accountId: string,
  amount: number,
  type: "add" | "subtract"
): Promise<boolean> {
  try {
    const res = await fetch(`/api/accounts/${accountId}`);
    if (!res.ok) return false;
    const account = await res.json();
    const newOriginalBalance =
      type === "add" ? account.originalBalance + amount : account.originalBalance - amount;
    const putRes = await fetch(`/api/accounts/${accountId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...account,
        originalBalance: newOriginalBalance,
        rmbBalance: calculateRMBBalance(newOriginalBalance, account.exchangeRate, account.currency),
      }),
    });
    return putRes.ok;
  } catch (e) {
    console.error("Failed to update account balance", e);
    return false;
  }
}

/**
 * 获取账户信息（从 API）
 */
export async function getAccountInfoFromAPI(accountId: string): Promise<BankAccount | null> {
  try {
    const res = await fetch(`/api/accounts/${accountId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * 获取账户信息（兼容：优先 localStorage）
 */
export function getAccountInfo(accountId: string): BankAccount | null {
  const accounts = getAccounts();
  return accounts.find((acc) => acc.id === accountId) || null;
}
