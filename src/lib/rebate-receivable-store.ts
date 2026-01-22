/**
 * 返点应收款数据存储
 * 管理广告返点的应收款记录和核销流水
 */

export type RebateReceivableStatus = "待核销" | "核销中" | "已结清";

export type RebateReceivable = {
  id: string; // 应收ID（关联充值单号）
  rechargeId: string; // 关联的充值记录ID
  rechargeDate: string; // 产生日期（充值日期）
  agencyId: string; // 所属代理商ID
  agencyName: string; // 所属代理商名称
  adAccountId: string; // 关联广告账户ID
  accountName: string; // 广告账户名称
  platform: "FB" | "Google" | "TikTok" | "其他"; // 所属板块
  rebateAmount: number; // 返点金额（USD/RMB）
  currency: "USD" | "CNY" | "HKD"; // 币种
  currentBalance: number; // 当前余额（初始等于返点金额）
  status: RebateReceivableStatus; // 状态：待核销/核销中/已结清
  
  // 核销流水
  writeoffRecords: Array<{
    id: string; // 核销记录ID
    consumptionId: string; // 关联的消耗记录ID
    consumptionDate: string; // 消耗日期
    writeoffAmount: number; // 核销金额
    remainingBalance: number; // 核销后剩余余额
    createdAt: string; // 核销时间
  }>;
  
  // 手动修正记录
  adjustments: Array<{
    id: string; // 修正记录ID
    amount: number; // 修正金额（正数表示增加，负数表示扣减）
    reason: string; // 修正原因（备注）
    adjustedBy: string; // 修正人
    adjustedAt: string; // 修正时间
    balanceBefore: number; // 修正前余额
    balanceAfter: number; // 修正后余额
  }>;
  
  // 元数据
  createdAt: string; // 创建时间
  updatedAt: string; // 更新时间
  notes?: string; // 备注
};

const REBATE_RECEIVABLES_KEY = "rebateReceivables";

/**
 * 获取所有返点应收款记录
 */
export function getRebateReceivables(): RebateReceivable[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(REBATE_RECEIVABLES_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse rebate receivables", e);
    return [];
  }
}

/**
 * 保存返点应收款记录列表
 */
export function saveRebateReceivables(receivables: RebateReceivable[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REBATE_RECEIVABLES_KEY, JSON.stringify(receivables));
  } catch (e) {
    console.error("Failed to save rebate receivables", e);
  }
}

/**
 * 根据ID获取返点应收款记录
 */
export function getRebateReceivableById(id: string): RebateReceivable | undefined {
  const receivables = getRebateReceivables();
  return receivables.find((r) => r.id === id);
}

/**
 * 根据充值ID获取返点应收款记录
 */
export function getRebateReceivableByRechargeId(rechargeId: string): RebateReceivable | undefined {
  const receivables = getRebateReceivables();
  return receivables.find((r) => r.rechargeId === rechargeId);
}

/**
 * 根据广告账户ID获取返点应收款记录
 */
export function getRebateReceivablesByAccount(accountId: string): RebateReceivable[] {
  const receivables = getRebateReceivables();
  return receivables.filter((r) => r.adAccountId === accountId);
}

/**
 * 根据状态获取返点应收款记录
 */
export function getRebateReceivablesByStatus(status: RebateReceivableStatus): RebateReceivable[] {
  const receivables = getRebateReceivables();
  return receivables.filter((r) => r.status === status);
}

/**
 * 计算未核销返点总资产（按币种分组）
 */
export function getTotalUnsettledRebates(): {
  USD: number;
  CNY: number;
  HKD: number;
} {
  const receivables = getRebateReceivables();
  const totals = { USD: 0, CNY: 0, HKD: 0 };
  
  receivables
    .filter((r) => r.status !== "已结清" && r.currentBalance > 0)
    .forEach((r) => {
      if (r.currency === "USD") {
        totals.USD += r.currentBalance;
      } else if (r.currency === "CNY") {
        totals.CNY += r.currentBalance;
      } else if (r.currency === "HKD") {
        totals.HKD += r.currentBalance;
      }
    });
  
  return totals;
}
