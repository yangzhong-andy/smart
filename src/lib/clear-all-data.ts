/**
 * 清空系统所有数据工具
 * 用于重置系统到初始状态
 */

// 所有 localStorage key 列表
const ALL_STORAGE_KEYS = [
  // 广告代理相关
  "adAgencies",
  "adAccounts",
  "adConsumptions",
  "adRecharges",
  "adAgencyMockDataInitialized",
  
  // 财务相关
  "bankAccounts",
  "monthlyBills",
  "paymentRequests",
  "cashFlow",
  "rebateReceivables",
  
  // 采购相关
  "purchaseContracts",
  "purchaseOrders",
  "deliveryOrders",
  
  // 产品相关
  "products",
  
  // 达人BD相关
  "influencerBD",
  
  // 人力资源相关
  "hr_employees",
  "hr_commission_rules",
  "hr_commission_records",
  
  // 物流相关
  "logisticsChannels",
  "logisticsTracking",
  "pendingInbound",
  "outboundOrders", // 出库单
  "outboundBatches", // 出库批次
  "warehouses", // 仓库信息
  "inventoryMovements", // 库存变动记录
  
  // 供应商相关
  "suppliers", // 供应商库（主要数据）
  "supplierProfiles",
  "supplierMonthlyBills",
  "supplierPayments",
  
  // 供应链相关
  "orderTracking",
  "batchReceipts",
  "documents",
  "salesVelocity",
  
  // 店铺相关
  "stores",
  
  // 业务关系
  "businessRelations",
  
  // 通知相关
  "notifications",
  
  // 待处理相关
  "pendingEntries",
  
  // 临时清理标记（这些是页面内部使用的临时标记，也应该清理）
  "CLEAR_FINANCE_DATA",
  "CLEAR_STORES_DATA",
  "CLEAR_ALL_TEST_DATA",
  
  // 初始化标记（这些标记表示数据已初始化，清空数据时也应该清理）
  "cashFlowInitialized",
  "storesInitialized",
  
  // 其他
  "sidebarCollapsed", // 侧边栏折叠状态（可选，保留用户偏好）
  "auth_token", // 登录令牌（可选，保留登录状态）
  "user_info", // 用户信息（可选，保留登录状态）
];

/**
 * 清空所有系统数据
 * @param options 清空选项
 */
export function clearAllData(options?: {
  keepAuth?: boolean; // 是否保留登录状态
  keepSidebarState?: boolean; // 是否保留侧边栏状态
}) {
  if (typeof window === "undefined") {
    console.warn("clearAllData: window is not defined");
    return;
  }

  const keysToRemove = [...ALL_STORAGE_KEYS];
  
  // 如果保留登录状态，不移除 auth 相关 key
  if (options?.keepAuth) {
    keysToRemove.splice(keysToRemove.indexOf("auth_token"), 1);
    keysToRemove.splice(keysToRemove.indexOf("user_info"), 1);
  }
  
  // 如果保留侧边栏状态，不移除 sidebarCollapsed
  if (options?.keepSidebarState) {
    keysToRemove.splice(keysToRemove.indexOf("sidebarCollapsed"), 1);
  }

  let clearedCount = 0;
  keysToRemove.forEach((key) => {
    try {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        clearedCount++;
      }
    } catch (e) {
      console.error(`Failed to remove key: ${key}`, e);
    }
  });

  // 兜底清理：清理所有包含特定关键词的 key（防止遗漏）
  const keywordsToClean = [
    "supplier", "order", "contract", "delivery", "inbound", "outbound",
    "warehouse", "logistics", "product", "store", "account", "bill",
    "payment", "cash", "rebate", "commission", "employee", "notification",
    "adAgency", "adAccount", "adConsumption", "adRecharge", "influencer",
    "initialized", "Initialized", "mock", "Mock", "test", "Test", "clear", "Clear"
  ];
  
  // 要保留的 key（即使包含关键词也不清理）
  const keysToKeep = new Set<string>();
  if (options?.keepAuth) {
    keysToKeep.add("auth_token");
    keysToKeep.add("user_info");
  }
  if (options?.keepSidebarState) {
    keysToKeep.add("sidebarCollapsed");
  }
  
  let additionalCleared = 0;
  try {
    const allKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) allKeys.push(key);
    }
    
    allKeys.forEach((key) => {
      // 跳过要保留的 key
      if (keysToKeep.has(key)) return;
      
      // 如果 key 已经在清理列表中，跳过（已经清理过了）
      if (keysToRemove.includes(key)) return;
      
      // 如果 key 包含关键词，则清理
      const shouldClean = keywordsToClean.some(keyword => 
        key.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (shouldClean) {
        try {
          window.localStorage.removeItem(key);
          additionalCleared++;
          console.log(`清理额外 key: ${key}`);
        } catch (e) {
          console.error(`Failed to remove additional key: ${key}`, e);
        }
      }
    });
  } catch (e) {
    console.error("Failed to clean additional keys", e);
  }

  const totalCleared = clearedCount + additionalCleared;
  console.log(`✅ 已清空 ${clearedCount} 条预定义数据，${additionalCleared} 条额外数据，共 ${totalCleared} 条`);
  return totalCleared;
}

/**
 * 获取所有存储的数据统计
 * 统计所有 localStorage key，不仅仅是预定义的
 */
export function getDataStats() {
  if (typeof window === "undefined") {
    return {
      stats: {},
      totalSize: 0,
      totalKeys: 0,
      allKeys: []
    };
  }

  const stats: Record<string, number> = {};
  let totalSize = 0;
  const allKeys: string[] = [];

  // 先统计所有 localStorage key
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        allKeys.push(key);
        try {
          const value = window.localStorage.getItem(key);
          if (value) {
            const size = new Blob([value]).size;
            stats[key] = size;
            totalSize += size;
          }
        } catch (e) {
          console.error(`Failed to get stats for key: ${key}`, e);
        }
      }
    }
  } catch (e) {
    console.error("Failed to enumerate localStorage keys", e);
  }

  // 过滤掉要保留的 key（用于统计显示）
  const keysToExclude = ["sidebarCollapsed", "auth_token", "user_info"];
  const filteredStats: Record<string, number> = {};
  let filteredTotalSize = 0;
  let filteredTotalKeys = 0;

  Object.keys(stats).forEach((key) => {
    if (!keysToExclude.includes(key)) {
      filteredStats[key] = stats[key];
      filteredTotalSize += stats[key];
      filteredTotalKeys++;
    }
  });

  return {
    stats: filteredStats,
    totalSize: filteredTotalSize,
    totalKeys: filteredTotalKeys,
    allKeys: allKeys.filter(k => !keysToExclude.includes(k))
  };
}
