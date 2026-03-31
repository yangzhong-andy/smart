/**
 * 财务相关页面（工作台、审批中心、对账中心）跨标签页 SWR 缓存同步。
 * localStorage 的 storage 事件仅在「其他标签页」写入时触发，用于多开页场景。
 */
export const FINANCE_SWR_SYNC_KEY = "smart-finance-swr-sync-ts";

export function broadcastFinanceSwrInvalidate(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FINANCE_SWR_SYNC_KEY, String(Date.now()));
  } catch {
    /* private mode / quota */
  }
}
