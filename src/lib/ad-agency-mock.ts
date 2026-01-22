/**
 * 广告代理管理 Mock Data 初始化脚本
 * 在项目启动时如果 localStorage 为空，则自动填充测试数据
 */

import {
  type Agency,
  type AdAccount,
  type AdConsumption,
  getAgencies,
  saveAgencies,
  getAdAccounts,
  saveAdAccounts,
  getAdConsumptions,
  saveAdConsumptions,
  calculateDueDate,
  calculateRebateDueDate
} from "./ad-agency-store";
import { type Store, getStores, saveStores } from "./store-store";
import { type BankAccount, getAccounts, saveAccounts } from "./finance-store";

const MOCK_DATA_INITIALIZED_KEY = "adAgencyMockDataInitialized";

/**
 * 初始化 Mock 数据
 * 仅在 localStorage 为空时执行
 */
export function initializeMockData() {
  if (typeof window === "undefined") return;

  // 检查是否已经初始化过
  const isInitialized = window.localStorage.getItem(MOCK_DATA_INITIALIZED_KEY);
  if (isInitialized === "true") {
    return; // 已经初始化过，跳过
  }

  // 检查是否已有数据（如果有数据，不覆盖）
  const existingAgencies = getAgencies();
  const existingAccounts = getAdAccounts();
  const existingConsumptions = getAdConsumptions();
  
  if (existingAgencies.length > 0 || existingAccounts.length > 0 || existingConsumptions.length > 0) {
    // 已有数据，标记为已初始化，但不再创建新数据
    window.localStorage.setItem(MOCK_DATA_INITIALIZED_KEY, "true");
    return;
  }

  console.log("🚀 开始初始化广告代理管理 Mock 数据...");

  // 1. 创建一个示例代理商：返点 3%，账期月结
  const mockAgency: Agency = {
    id: "agency-mock-001",
    name: "示例广告代理商（测试）",
    platform: "TikTok",
    rebateRate: 3, // 返点 3%（保留用于兼容）
    rebateConfig: {
      rate: 3, // 返点 3%
      period: "月" // 月度返点
    },
    settlementCurrency: "USD", // 结算币种
    creditTerm: "本月消耗，次月第15天结算", // 账期规则
    contact: "张经理",
    phone: "138-0000-0000",
    notes: "账期月结",
    createdAt: new Date("2024-01-01").toISOString()
  };

  // 2. 创建两个店铺（用于关联消耗记录）
  const existingStores = getStores();
  let mockStore1: Store | undefined;
  let mockStore2: Store | undefined;

  // 如果已有店铺，使用前两个；否则创建新店铺
  if (existingStores.length >= 2) {
    mockStore1 = existingStores[0];
    mockStore2 = existingStores[1];
  } else {
    // 需要先创建银行账户用于店铺关联
    const existingBankAccounts = getAccounts();
    let bankAccount: BankAccount;

    if (existingBankAccounts.length > 0) {
      bankAccount = existingBankAccounts[0];
    } else {
      // 创建一个测试银行账户
      bankAccount = {
        id: "bank-mock-001",
        name: "测试银行账户（USD）",
        accountNumber: "TEST-USD-001",
        accountType: "对公",
        accountCategory: "PRIMARY",
        currency: "USD",
        country: "US",
        originalBalance: 100000,
        exchangeRate: 7.2,
        rmbBalance: 720000,
        accountPurpose: "测试账户",
        storeId: undefined,
        companyEntity: "测试公司",
        notes: "Mock 数据银行账户",
        createdAt: new Date("2024-01-01").toISOString()
      };
      saveAccounts([...existingBankAccounts, bankAccount]);
    }

    mockStore1 = {
      id: "store-mock-001",
      name: "TK-US-01",
      platform: "TikTok",
      country: "US",
      currency: "USD",
      accountId: bankAccount.id,
      accountName: bankAccount.name,
      createdAt: new Date("2024-01-01").toISOString()
    };

    mockStore2 = {
      id: "store-mock-002",
      name: "TK-UK-01",
      platform: "TikTok",
      country: "UK",
      currency: "GBP",
      accountId: bankAccount.id,
      accountName: bankAccount.name,
      createdAt: new Date("2024-01-01").toISOString()
    };

    if (existingStores.length === 0) {
      saveStores([mockStore1, mockStore2]);
    } else if (existingStores.length === 1) {
      saveStores([...existingStores, mockStore2]);
    }
  }

  // 3. 创建两个广告账户（关联到代理商）
  // 账户1：初始余额 5000，充值 10000 + 返点 300 = 13300，消耗 2000 = 11300
  // 账户2：初始余额 3000，消耗 1500 = 1500
  const mockAccount1: AdAccount = {
    id: "ad-account-mock-001",
    agencyId: mockAgency.id,
    agencyName: mockAgency.name,
    accountName: "TikTok 广告账户-美国站",
    currentBalance: 5000, // 初始余额
    rebateReceivable: 0, // 应收返点
    creditLimit: 10000, // 账期授信额度
    currency: "USD",
    country: "US",
    notes: "测试账户1",
    createdAt: new Date("2024-01-01").toISOString()
  };

  const mockAccount2: AdAccount = {
    id: "ad-account-mock-002",
    agencyId: mockAgency.id,
    agencyName: mockAgency.name,
    accountName: "TikTok 广告账户-英国站",
    currentBalance: 3000, // 初始余额
    rebateReceivable: 0, // 应收返点
    creditLimit: 8000, // 账期授信额度
    currency: "USD",
    country: "GB",
    notes: "测试账户2",
    createdAt: new Date("2024-01-01").toISOString()
  };

  // 4. 模拟一笔 1 月份的充值记录（需要在财务流水中创建）
  const CASH_FLOW_KEY = "cashFlow";
  const existingCashFlow = window.localStorage.getItem(CASH_FLOW_KEY);
  let cashFlow: Array<{
    id: string;
    date: string;
    summary: string;
    category: string;
    type: "income" | "expense";
    amount: number;
    accountId: string;
    accountName: string;
    currency: string;
    remark: string;
    businessNumber?: string;
    status: "confirmed" | "pending";
    isReversal?: boolean;
    createdAt: string;
    relatedId?: string;
  }> = [];

  if (existingCashFlow) {
    try {
      cashFlow = JSON.parse(existingCashFlow);
    } catch (e) {
      console.error("Failed to parse existing cash flow", e);
    }
  }

  // 检查是否已有广告充值记录
  const hasRecharge = cashFlow.some(
    (f) => f.category === "广告费" && f.remark && f.remark.includes("广告充值")
  );

  if (!hasRecharge && mockStore1) {
    // 获取或创建用于充值的银行账户
    const bankAccounts = getAccounts();
    const rechargeBankAccount =
      bankAccounts.find((a) => a.currency === "USD") || bankAccounts[0] || mockAccount1;

    const rechargeAmount = 10000; // 充值金额
    const rebateAmount = (rechargeAmount * mockAgency.rebateRate) / 100; // 返点金额 300

    const rechargeFlow = {
      id: "cash-flow-recharge-mock-001",
      date: "2024-01-05",
      summary: "广告充值 - TikTok 广告账户-美国站",
      category: "广告费",
      type: "expense" as const,
      amount: -rechargeAmount, // 支出
      accountId: rechargeBankAccount.id,
      accountName: rechargeBankAccount.name,
      currency: "USD",
      remark: `广告充值返点：${rebateAmount.toFixed(2)} | 广告账户：${mockAccount1.accountName}`,
      businessNumber: "AD-RECHARGE-20240105",
      status: "confirmed" as const,
      isReversal: false,
      createdAt: new Date("2024-01-05").toISOString(),
      relatedId: mockAccount1.id // 关联广告账户ID
    };

    cashFlow.push(rechargeFlow);

    // 更新广告账户余额（增加充值金额 + 返点）
    // 余额计算：初始 5000 + 充值 10000 + 返点 300 = 15300
    mockAccount1.currentBalance = mockAccount1.currentBalance + rechargeAmount + rebateAmount;
    console.log(`✅ 账户 ${mockAccount1.accountName} 充值完成：初始 5000 + 充值 ${rechargeAmount} + 返点 ${rebateAmount} = ${mockAccount1.currentBalance}`);
  }

  // 5. 模拟两笔 1 月份的消耗记录
  const consumption1: AdConsumption = {
    id: "consumption-mock-001",
    adAccountId: mockAccount1.id,
    accountName: mockAccount1.accountName,
    agencyId: mockAgency.id,
    agencyName: mockAgency.name,
    storeId: mockStore1?.id,
    storeName: mockStore1?.name,
    month: "2024-01",
    date: "2024-01-15",
    amount: 2000, // 消耗金额
    currency: "USD",
    estimatedRebate: (2000 * mockAgency.rebateRate) / 100, // 预估返点 60
    rebateRate: mockAgency.rebateRate,
    campaignName: "1月春季促销广告",
    dueDate: calculateDueDate(mockAgency.creditTerm, "2024-01"), // 预计付款日期：2024-02-15
    rebateDueDate: calculateRebateDueDate(mockAgency.rebateConfig, "2024-01"), // 预计返点到账日期：2024-02-29
    isSettled: false, // 未结算
    notes: "测试消耗记录1",
    createdAt: new Date("2024-01-15").toISOString()
  };

  const consumption2: AdConsumption = {
    id: "consumption-mock-002",
    adAccountId: mockAccount2.id,
    accountName: mockAccount2.accountName,
    agencyId: mockAgency.id,
    agencyName: mockAgency.name,
    storeId: mockStore2?.id,
    storeName: mockStore2?.name,
    month: "2024-01",
    date: "2024-01-20",
    amount: 1500, // 消耗金额
    currency: "USD",
    estimatedRebate: (1500 * mockAgency.rebateRate) / 100, // 预估返点 45
    rebateRate: mockAgency.rebateRate,
    campaignName: "1月新品推广广告",
    dueDate: calculateDueDate(mockAgency.creditTerm, "2024-01"), // 预计付款日期：2024-02-15
    rebateDueDate: calculateRebateDueDate(mockAgency.rebateConfig, "2024-01"), // 预计返点到账日期：2024-02-29
    isSettled: false, // 未结算
    notes: "测试消耗记录2",
    createdAt: new Date("2024-01-20").toISOString()
  };

  // 更新广告账户余额（减少消耗金额）
  // 账户1：余额 = 15300 - 2000 = 13300
  mockAccount1.currentBalance = mockAccount1.currentBalance - consumption1.amount;
  // 账户2：余额 = 3000 - 1500 = 1500
  mockAccount2.currentBalance = mockAccount2.currentBalance - consumption2.amount;
  
  console.log(`✅ 账户 ${mockAccount1.accountName} 消耗 ${consumption1.amount}，余额：${mockAccount1.currentBalance}`);
  console.log(`✅ 账户 ${mockAccount2.accountName} 消耗 ${consumption2.amount}，余额：${mockAccount2.currentBalance}`);

  // 为消耗记录生成财务流水（运营-广告-待结算）
  const settlementFlow1 = {
    id: "cash-flow-settlement-mock-001",
    date: consumption1.date,
    summary: `广告返点待结算 - ${mockAccount1.accountName} - 2024-01`,
    category: "运营-广告-待结算",
    type: "income" as const,
    amount: consumption1.estimatedRebate, // 预估返点 60
    accountId: mockAccount1.id,
    accountName: mockAccount1.accountName,
    currency: "USD",
    remark: `店铺：${mockStore1?.name || "未指定"} | 消耗金额：${consumption1.amount} | 返点比例：${mockAgency.rebateRate}%`,
    relatedId: consumption1.id,
    businessNumber: `AD-202401-${consumption1.id.slice(0, 8)}`,
    status: "pending" as const,
    isReversal: false,
    createdAt: consumption1.createdAt
  };

  const settlementFlow2 = {
    id: "cash-flow-settlement-mock-002",
    date: consumption2.date,
    summary: `广告返点待结算 - ${mockAccount2.accountName} - 2024-01`,
    category: "运营-广告-待结算",
    type: "income" as const,
    amount: consumption2.estimatedRebate, // 预估返点 45
    accountId: mockAccount2.id,
    accountName: mockAccount2.accountName,
    currency: "USD",
    remark: `店铺：${mockStore2?.name || "未指定"} | 消耗金额：${consumption2.amount} | 返点比例：${mockAgency.rebateRate}%`,
    relatedId: consumption2.id,
    businessNumber: `AD-202401-${consumption2.id.slice(0, 8)}`,
    status: "pending" as const,
    isReversal: false,
    createdAt: consumption2.createdAt
  };

  // 保存所有数据
  saveAgencies([mockAgency]);
  saveAdAccounts([mockAccount1, mockAccount2]);
  saveAdConsumptions([consumption1, consumption2]);

  // 将消耗记录生成的财务流水添加到 cash flow
  if (!hasRecharge) {
    cashFlow.push(settlementFlow1 as any, settlementFlow2 as any);
  } else {
    // 如果已有充值记录，检查是否已有这些待结算记录
    const hasSettlement1 = cashFlow.some((f) => f.id === settlementFlow1.id);
    const hasSettlement2 = cashFlow.some((f) => f.id === settlementFlow2.id);
    if (!hasSettlement1) cashFlow.push(settlementFlow1 as any);
    if (!hasSettlement2) cashFlow.push(settlementFlow2 as any);
  }

  window.localStorage.setItem(CASH_FLOW_KEY, JSON.stringify(cashFlow));

  // 标记为已初始化
  window.localStorage.setItem(MOCK_DATA_INITIALIZED_KEY, "true");

  console.log("✅ 广告代理管理 Mock 数据初始化完成！");
  console.log("📊 创建的数据：");
  console.log("  - 代理商：", mockAgency.name, `（返点 ${mockAgency.rebateRate}%）`);
  console.log("  - 广告账户：", mockAccount1.accountName, `（余额 ${mockAccount1.currentBalance} USD）`);
  console.log("  - 广告账户：", mockAccount2.accountName, `（余额 ${mockAccount2.currentBalance} USD）`);
  console.log("  - 消耗记录：", consumption1.amount, "USD（预估返点", consumption1.estimatedRebate, "USD）");
  console.log("  - 消耗记录：", consumption2.amount, "USD（预估返点", consumption2.estimatedRebate, "USD）");
}
