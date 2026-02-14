/**
 * 广告代理管理数据中心化存储
 */

export type RebateConfig = {
  rate: number; // 返点比例（%）
  period: "月" | "季"; // 返点周期：月/季
};

export type Agency = {
  id: string;
  name: string; // 代理商名称
  platform: "FB" | "Google" | "TikTok" | "其他"; // 平台
  rebateRate: number; // 返点比例（%）（保留用于兼容）
  rebateConfig?: RebateConfig; // 返点配置（新字段）
  settlementCurrency?: "USD" | "CNY"; // 结算币种
  creditTerm?: string; // 账期规则，例如："本月消耗，次月第15天结算"
  contact?: string; // 联系人
  phone?: string; // 联系电话
  notes?: string; // 备注
  createdAt: string;
};

export type AdAccount = {
  id: string;
  agencyId: string; // 关联代理商ID
  agencyName: string; // 代理商名称（冗余字段）
  accountName: string; // 账户名称
  currentBalance: number; // 当前余额（实付本金 - 消耗本金，不含返点）
  rebateReceivable: number; // 应收返点（待结算的返点额度，不计入余额）
  creditLimit: number; // 账期授信额度
  currency: "USD" | "RMB" | "EUR" | "GBP" | "JPY"; // 币种
  country?: string; // 所属国家（ISO代码，如 CN, US, JP）
  notes?: string; // 备注
  createdAt: string;
};

export type AdConsumption = {
  id: string;
  adAccountId: string; // 关联广告账户ID
  accountName: string; // 账户名称（冗余字段）
  agencyId?: string; // 关联代理商ID（冗余字段，便于计算返点）
  agencyName?: string; // 关联代理商名称（冗余字段）
  storeId?: string; // 关联店铺ID
  storeName?: string; // 关联店铺名称（冗余字段）
  month: string; // 月份（格式：YYYY-MM）
  date: string; // 消耗日期
  amount: number; // 消耗金额
  currency: string; // 币种
  estimatedRebate?: number; // 预估返点金额
  rebateRate?: number; // 返点比例（冗余字段，便于显示）
  campaignName?: string; // 广告系列名称
  dueDate?: string; // 预计付款日期（格式：YYYY-MM-DD）
  rebateDueDate?: string; // 预计返点到账日期（格式：YYYY-MM-DD）
  isSettled?: boolean; // 是否已结算
  settledAt?: string; // 结算日期
  settlementFlowId?: string; // 关联的财务流水ID（结算时生成）
  voucher?: string; // 消耗凭证（图片 base64 或 URL）
  notes?: string; // 备注
  createdAt: string;
};

export type AdRecharge = {
  id: string;
  uid?: string; // 全局唯一业务ID（业财一体化）
  adAccountId: string; // 关联广告账户ID
  accountName: string; // 账户名称（冗余字段）
  agencyId: string; // 关联代理商ID（用于月账单模块）
  agencyName?: string; // 关联代理商名称（冗余字段）
  amount: number; // 充值金额（原币）
  currency: "USD" | "CNY" | "HKD"; // 充值币种
  rebateAmount?: number; // 返点金额（原币）
  rebateRate?: number; // 返点比例（冗余字段）
  date: string; // 充值日期
  month: string; // 充值月份（格式：YYYY-MM，用于月账单模块）
  paymentStatus: "Pending" | "Paid" | "Cancelled"; // 付款状态
  voucher?: string; // 充值凭证（图片 base64 或 URL）
  notes?: string; // 备注
  createdAt: string;
};

/**
 * 根据账期规则计算预计付款日期
 * @param creditTerm 账期规则，例如："本月消耗，次月第15天结算"
 * @param month 消耗月份，格式：YYYY-MM
 * @returns 预计付款日期，格式：YYYY-MM-DD
 */
export function calculateDueDate(creditTerm: string | undefined, month: string): string | undefined {
  if (!creditTerm) return undefined;
  
  // 解析账期规则："本月消耗，次月第15天结算"
  const match = creditTerm.match(/次月第(\d+)天/);
  if (!match) return undefined;
  
  const day = parseInt(match[1], 10);
  if (isNaN(day) || day < 1 || day > 31) return undefined;
  
  // 计算次月的日期
  // month 格式：YYYY-MM，例如 "2024-01"（1月）
  const [year, monthNum] = month.split("-").map(Number);
  // monthNum 是消耗月份（1-12），次月是 monthNum（作为月份值）
  // 例如：消耗月份是 1 月（monthNum=1），次月是 2 月（monthNum=2）
  // 使用 Date.UTC 避免时区问题
  const nextYear = monthNum === 12 ? year + 1 : year; // 如果消耗月份是 12 月，次月是下一年
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1; // 次月（1-12）
  const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate(); // 次月最后一天
  const targetDay = Math.min(day, lastDayOfNextMonth); // 确保不超过次月最后一天
  
  // 构造日期字符串，避免时区问题
  const nextMonthStr = String(nextMonth).padStart(2, "0");
  const dayStr = String(targetDay).padStart(2, "0");
  return `${nextYear}-${nextMonthStr}-${dayStr}`;
}

/**
 * 根据返点周期计算预计返点到账日期
 * @param rebateConfig 返点配置
 * @param month 消耗月份，格式：YYYY-MM
 * @returns 预计返点到账日期，格式：YYYY-MM-DD
 */
export function calculateRebateDueDate(rebateConfig: RebateConfig | undefined, month: string): string | undefined {
  if (!rebateConfig) return undefined;
  
  // month 格式：YYYY-MM，例如 "2024-01"（1月）
  const [year, monthNum] = month.split("-").map(Number);
  let targetYear: number;
  let targetMonth: number;
  
  if (rebateConfig.period === "月") {
    // 月度返点：次月最后一天
    // 消耗月份是 monthNum（1-12），次月是 monthNum + 1（1-12）
    targetYear = monthNum === 12 ? year + 1 : year; // 如果消耗月份是 12 月，次月是下一年
    targetMonth = monthNum === 12 ? 1 : monthNum + 1; // 次月（1-12）
  } else if (rebateConfig.period === "季") {
    // 季度返点：季度结束后的下一个月最后一天
    const quarter = Math.floor((monthNum - 1) / 3); // 当前季度（0-3）
    const quarterEndMonth = (quarter + 1) * 3; // 季度结束月份（3, 6, 9, 12）
    const monthAfterQuarterEnd = quarterEndMonth + 1; // 季度结束后的下一个月（1-12）
    targetYear = monthAfterQuarterEnd === 13 ? year + 1 : year; // 如果超过 12 月，是下一年
    targetMonth = monthAfterQuarterEnd === 13 ? 1 : monthAfterQuarterEnd; // 该月（1-12）
  } else {
    return undefined;
  }
  
  // 计算该月的最后一天，避免时区问题
  const lastDay = new Date(targetYear, targetMonth, 0).getDate(); // 该月最后一天
  const monthStr = String(targetMonth).padStart(2, "0");
  const dayStr = String(lastDay).padStart(2, "0");
  return `${targetYear}-${monthStr}-${dayStr}`;
}

const AGENCIES_KEY = "adAgencies";
const AD_ACCOUNTS_KEY = "adAccounts";
const AD_CONSUMPTIONS_KEY = "adConsumptions";
const AD_RECHARGES_KEY = "adRecharges";

/**
 * 获取所有代理商（同步，从 localStorage 读取；优先使用 API）
 */
export function getAgencies(): Agency[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(AGENCIES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse agencies", e);
    return [];
  }
}

const toList = (json: any) => Array.isArray(json) ? json : (json?.data ?? []);
/** 从 API 获取代理商 */
export async function getAgenciesFromAPI(): Promise<Agency[]> {
  const res = await fetch("/api/ad-agencies?page=1&pageSize=500");
  if (!res.ok) return [];
  return toList(await res.json());
}

/**
 * 保存代理商列表（同步到 API）
 */
export async function saveAgencies(agencies: Agency[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const existing: Agency[] = await fetch("/api/ad-agencies").then((r) => (r.ok ? r.json() : []));
    const existingIds = new Set(existing.map((a) => a.id));
    const newIds = new Set(agencies.map((a) => a.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/ad-agencies/${e.id}`, { method: "DELETE" });
      }
    }
    const platformMap: Record<string, string> = { FB: "FB", Google: "Google", TikTok: "TikTok", "其他": "OTHER", OTHER: "OTHER" };
    for (const a of agencies) {
      const body = { ...a, platform: platformMap[a.platform] ?? "OTHER", rebateRate: a.rebateRate ?? 0 };
      if (existingIds.has(a.id)) {
        await fetch(`/api/ad-agencies/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/ad-agencies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
    }
  } catch (e) {
    console.error("Failed to save agencies", e);
    throw e;
  }
}

/**
 * 获取所有广告账户（同步，从 localStorage）
 */
export function getAdAccounts(): AdAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(AD_ACCOUNTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse ad accounts", e);
    return [];
  }
}

/** 从 API 获取广告账户 */
export async function getAdAccountsFromAPI(): Promise<AdAccount[]> {
  const res = await fetch("/api/ad-accounts?page=1&pageSize=500");
  if (!res.ok) return [];
  return toList(await res.json());
}

/**
 * 保存广告账户列表（同步到 API）
 */
export async function saveAdAccounts(accounts: AdAccount[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const raw = await fetch("/api/ad-accounts?page=1&pageSize=500").then((r) => (r.ok ? r.json() : []));
    const existing: AdAccount[] = toList(raw);
    const existingIds = new Set(existing.map((a) => a.id));
    const newIds = new Set(accounts.map((a) => a.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/ad-accounts/${e.id}`, { method: "DELETE" });
      }
    }
    for (const a of accounts) {
      const body = { ...a, currentBalance: a.currentBalance ?? 0, rebateReceivable: a.rebateReceivable ?? 0, creditLimit: a.creditLimit ?? 0 };
      if (existingIds.has(a.id)) {
        await fetch(`/api/ad-accounts/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/ad-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
    }
  } catch (e) {
    console.error("Failed to save ad accounts", e);
    throw e;
  }
}

/**
 * 获取所有消耗记录（同步，从 localStorage）
 */
export function getAdConsumptions(): AdConsumption[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(AD_CONSUMPTIONS_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse ad consumptions", e);
    return [];
  }
}

/** 从 API 获取消耗记录 */
export async function getAdConsumptionsFromAPI(): Promise<AdConsumption[]> {
  const res = await fetch("/api/ad-consumptions?page=1&pageSize=5000");
  if (!res.ok) return [];
  return toList(await res.json());
}

/**
 * 保存消耗记录列表（同步到 API）
 */
export async function saveAdConsumptions(consumptions: AdConsumption[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const raw = await fetch("/api/ad-consumptions?page=1&pageSize=5000").then((r) => (r.ok ? r.json() : []));
    const existing: AdConsumption[] = toList(raw);
    const existingIds = new Set(existing.map((c) => c.id));
    const newIds = new Set(consumptions.map((c) => c.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/ad-consumptions/${e.id}`, { method: "DELETE" });
      }
    }
    for (const c of consumptions) {
      const body = { ...c, date: c.date?.length === 10 ? c.date : c.date?.slice(0, 10) };
      if (existingIds.has(c.id)) {
        await fetch(`/api/ad-consumptions/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/ad-consumptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
    }
  } catch (e) {
    console.error("Failed to save ad consumptions", e);
    throw e;
  }
}

/**
 * 根据代理商ID获取广告账户（可选传入accounts，否则从API获取）
 */
export function getAdAccountsByAgency(agencyId: string, accounts?: AdAccount[]): AdAccount[] {
  if (accounts) return accounts.filter((acc) => acc.agencyId === agencyId);
  return getAdAccounts().filter((acc) => acc.agencyId === agencyId);
}

/**
 * 根据广告账户ID获取消耗记录
 */
export function getConsumptionsByAccount(accountId: string, consumptions?: AdConsumption[]): AdConsumption[] {
  if (consumptions) return consumptions.filter((c) => c.adAccountId === accountId);
  return getAdConsumptions().filter((c) => c.adAccountId === accountId);
}

/**
 * 获取所有充值记录（同步，从 localStorage）
 */
export function getAdRecharges(): AdRecharge[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(AD_RECHARGES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse ad recharges", e);
    return [];
  }
}

/** 从 API 获取充值记录 */
export async function getAdRechargesFromAPI(): Promise<AdRecharge[]> {
  const res = await fetch("/api/ad-recharges");
  return res.ok ? res.json() : [];
}

/**
 * 保存充值记录列表（同步到 API）
 */
export async function saveAdRecharges(recharges: AdRecharge[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const raw = await fetch("/api/ad-recharges?page=1&pageSize=5000").then((r) => (r.ok ? r.json() : []));
    const existing: AdRecharge[] = toList(raw);
    const existingIds = new Set(existing.map((r) => r.id));
    const newIds = new Set(recharges.map((r) => r.id));
    for (const e of existing) {
      if (!newIds.has(e.id)) {
        await fetch(`/api/ad-recharges/${e.id}`, { method: "DELETE" });
      }
    }
    for (const r of recharges) {
      const body = { ...r, date: r.date?.length === 10 ? r.date : r.date?.slice(0, 10) };
      if (existingIds.has(r.id)) {
        await fetch(`/api/ad-recharges/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/ad-recharges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
    }
  } catch (e) {
    console.error("Failed to save ad recharges", e);
    throw e;
  }
}

/**
 * 根据广告账户ID获取充值记录
 */
export function getRechargesByAccount(accountId: string, recharges?: AdRecharge[]): AdRecharge[] {
  if (recharges) return recharges.filter((r) => r.adAccountId === accountId);
  return getAdRecharges().filter((r) => r.adAccountId === accountId);
}
