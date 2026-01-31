"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  type Agency,
  type AdAccount,
  type AdConsumption,
  type AdRecharge,
  getAgencies,
  saveAgencies,
  getAdAccounts,
  saveAdAccounts,
  getAdConsumptions,
  saveAdConsumptions,
  getAdRecharges,
  saveAdRecharges,
  getRechargesByAccount,
  getAdAccountsByAgency,
  getConsumptionsByAccount,
  calculateDueDate,
  calculateRebateDueDate
} from "@/lib/ad-agency-store";
import { type BankAccount, saveAccounts } from "@/lib/finance-store";
import { type Store, getStoreById } from "@/lib/store-store";
import { COUNTRIES, getCountryByCode } from "@/lib/country-config";
import { getMonthlyBills, saveMonthlyBills, type MonthlyBill } from "@/lib/reconciliation-store";
import { 
  type RebateReceivable,
  getRebateReceivables,
  getRebateReceivableByRechargeId,
  saveRebateReceivables
} from "@/lib/rebate-receivable-store";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

import { formatCurrency, formatCurrencyString } from "@/lib/currency-utils";
import MoneyDisplay from "@/components/ui/MoneyDisplay";
import ImageUploader from "@/components/ImageUploader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

export default function AdAgenciesPage() {
  const [mounted, setMounted] = useState(false); // 客户端挂载状态，避免 hydration 错误
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [consumptions, setConsumptions] = useState<AdConsumption[]>([]);
  const [recharges, setRecharges] = useState<AdRecharge[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "agencies" | "accounts" | "consumptions" | "recharges">("dashboard");
  const [isAgencyModalOpen, setIsAgencyModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isConsumptionModalOpen, setIsConsumptionModalOpen] = useState(false);
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementData, setSettlementData] = useState<{ month: string; accountId: string; consumptions: AdConsumption[] } | null>(null);
  const [editAgency, setEditAgency] = useState<Agency | null>(null);
  const [editAccount, setEditAccount] = useState<AdAccount | null>(null);
  const [rechargeAccount, setRechargeAccount] = useState<AdAccount | null>(null);
  
  const [agencyForm, setAgencyForm] = useState({
    name: "",
    platform: "TikTok" as Agency["platform"],
    rebateRate: "",
    rebatePeriod: "月" as "月" | "季", // 返点周期
    settlementCurrency: "USD" as "USD" | "CNY", // 结算币种
    creditTerm: "", // 账期规则，例如："本月消耗，次月第15天结算"
    contact: "",
    phone: "",
    notes: ""
  });

  const [accountForm, setAccountForm] = useState({
    agencyId: "",
    accountName: "",
    currentBalance: "",
    creditLimit: "",
    currency: "USD" as AdAccount["currency"],
    country: "",
    notes: ""
  });

  const [consumptionForm, setConsumptionForm] = useState({
    adAccountId: "",
    storeId: "",
    month: new Date().toISOString().slice(0, 7), // YYYY-MM
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "USD",
    campaignName: "",
    voucher: "" as string, // 消耗凭证
    notes: ""
  });

  const [rechargeForm, setRechargeForm] = useState({
    amount: "",
    currency: "USD" as "USD" | "CNY" | "HKD", // 默认美元
    date: new Date().toISOString().slice(0, 10),
    voucher: "" as string, // 充值凭证
    notes: ""
  });
  const [amountError, setAmountError] = useState(false);
  const [previewKey, setPreviewKey] = useState(0); // 用于触发数值跳动动画
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title?: string;
    message: string;
    type?: "danger" | "warning" | "info";
    onConfirm: () => void;
  } | null>(null);
  const [confirmConsumptionModal, setConfirmConsumptionModal] = useState<{
    open: boolean;
    accountName: string;
    agencyName: string;
    storeName: string;
    month: string;
    date: string;
    amount: number;
    estimatedRebate: number;
    rebateRate: number;
    currency: string;
    campaignName?: string;
    voucher?: string;
    notes?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmRechargeModal, setConfirmRechargeModal] = useState<{
    open: boolean;
    accountName: string;
    agencyName: string;
    amount: number;
    rebateAmount: number;
    rebateRate: number;
    currency: string;
    date: string;
    voucher?: string;
    notes?: string;
  } | null>(null);
  
  // 过滤器状态
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    // 默认选中当前月份
    if (typeof window !== "undefined") {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    return "";
  });
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterAgency, setFilterAgency] = useState<string>("all");
  const [filterStore, setFilterStore] = useState<string>("all");
  const [isFilterLoading, setIsFilterLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // 标记为已挂载，避免 hydration 错误
    setMounted(true);
    
    // 读取 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get("tab");
    const action = urlParams.get("action");
    
    // 根据 URL 参数设置标签页
    if (tab && ["dashboard", "agencies", "accounts", "consumptions", "recharges"].includes(tab)) {
      setActiveTab(tab as typeof activeTab);
    }
    
    // 根据 action 参数打开对应的模态框
    if (action === "add-agency") {
      setIsAgencyModalOpen(true);
    } else if (action === "add-account") {
      setIsAccountModalOpen(true);
    } else if (action === "add-consumption") {
      setIsConsumptionModalOpen(true);
    } else     if (action === "add-recharge") {
      setIsRechargeModalOpen(true);
    }
    
    (async () => {
    const [agenciesRes, accountsRes, consumptionsRes, rechargesRes, storesRes, bankRes] = await Promise.all([
      fetch("/api/ad-agencies"),
      fetch("/api/ad-accounts"),
      fetch("/api/ad-consumptions"),
      fetch("/api/ad-recharges"),
      fetch("/api/stores"),
      fetch("/api/accounts"),
    ]);
    const loadedAgencies = agenciesRes.ok ? await agenciesRes.json() : [];
    const loadedAccounts = accountsRes.ok ? await accountsRes.json() : [];
    const loadedConsumptions = consumptionsRes.ok ? await consumptionsRes.json() : [];
    const loadedRecharges = rechargesRes.ok ? await rechargesRes.json() : [];
    const loadedStores = storesRes.ok ? await storesRes.json() : [];
    const loadedBankAccounts = bankRes.ok ? await bankRes.json() : [];
    setAgencies(loadedAgencies);
    setAdAccounts(loadedAccounts);
    setConsumptions(loadedConsumptions);
    setRecharges(loadedRecharges);
    setStores(loadedStores);
    setBankAccounts(loadedBankAccounts);
    
    // 重新计算所有账户余额
    await recalculateAccountBalances(loadedAccounts, loadedConsumptions, loadedRecharges);
    })();
  }, []);
  
  // 重新计算账户余额：当前余额 = 累计实付充值 - 累计消耗（返点不计入余额）
  const recalculateAccountBalances = async (accounts: AdAccount[], consumptions: AdConsumption[], recharges: AdRecharge[]) => {
    // 从充值记录中统计每个账户的累计实付充值（不含返点）
    const rechargesByAccount: Record<string, number> = {};
    const rebatesByAccount: Record<string, number> = {}; // 累计应收返点
    recharges.forEach((r) => {
      if (!rechargesByAccount[r.adAccountId]) {
        rechargesByAccount[r.adAccountId] = 0;
      }
      if (!rebatesByAccount[r.adAccountId]) {
        rebatesByAccount[r.adAccountId] = 0;
      }
      // 只累加实付充值金额（不含返点）
      rechargesByAccount[r.adAccountId] += r.amount;
      // 单独累加返点金额
      rebatesByAccount[r.adAccountId] += r.rebateAmount || 0;
    });
    
    // 从财务流水中统计已结算的返点（用于计算已返点金额）
    const CASH_FLOW_KEY = "cashFlow";
    let settledRebatesByAccount: Record<string, number> = {};
    let totalSettledRebate = 0; // 总已返点金额
    
    if (typeof window !== "undefined") {
      const storedFlow = window.localStorage.getItem(CASH_FLOW_KEY);
      if (storedFlow) {
        try {
          const cashFlow: Array<{
            type: "income" | "expense";
            category: string;
            amount: number;
            remark?: string;
            relatedId?: string;
            status?: string;
            isReversal?: boolean;
          }> = JSON.parse(storedFlow);
          
          cashFlow.forEach((flow) => {
            // 统计已结算的返点（分类为"运营-广告-已结算"）
            if (
              flow.category === "运营-广告-已结算" &&
              flow.type === "income" &&
              !flow.isReversal &&
              (flow.status === "confirmed" || !flow.status) &&
              flow.relatedId
            ) {
              const rebateAmount = Math.abs(flow.amount || 0);
              totalSettledRebate += rebateAmount;
              // relatedId应该是消耗记录的ID
              const consumption = consumptions.find((c) => c.id === flow.relatedId);
              if (consumption && consumption.isSettled) {
                const accountId = consumption.adAccountId;
                if (!settledRebatesByAccount[accountId]) {
                  settledRebatesByAccount[accountId] = 0;
                }
                settledRebatesByAccount[accountId] += rebateAmount;
              }
            }
          });
        } catch (e) {
          console.error("Failed to parse cash flow for balance calculation", e);
        }
      }
    }
    
    // 计算每个账户的累计消耗
    const consumptionByAccount: Record<string, number> = {};
    consumptions.forEach((c) => {
      if (!consumptionByAccount[c.adAccountId]) {
        consumptionByAccount[c.adAccountId] = 0;
      }
      consumptionByAccount[c.adAccountId] += c.amount;
    });
    
    // 更新账户余额
    const updatedAccounts = accounts.map((acc) => {
      const totalRecharge = rechargesByAccount[acc.id] || 0;
      const totalConsumption = consumptionByAccount[acc.id] || 0;
      const totalSettledRebate = settledRebatesByAccount[acc.id] || 0;
      
      const calculatedBalance = totalRecharge - totalConsumption + totalSettledRebate;
      
      // 如果计算出的余额与当前余额不同，则更新
      if (Math.abs(calculatedBalance - acc.currentBalance) > 0.01) {
        return {
          ...acc,
          currentBalance: calculatedBalance
        };
      }
      return acc;
    });
    
    // 保存更新后的账户余额和应收返点
    const hasChanges = updatedAccounts.some((acc, idx) => 
      acc.currentBalance !== accounts[idx].currentBalance || 
      (acc.rebateReceivable || 0) !== (accounts[idx].rebateReceivable || 0)
    );
    if (hasChanges) {
      await saveAdAccounts(updatedAccounts);
      setAdAccounts(updatedAccounts);
    }
  };

  // 过滤后的消耗记录
  // 过滤后的账户列表（按代理商筛选）
  const filteredAccounts = useMemo(() => {
    if (filterAgency === "all") return adAccounts;
    return adAccounts.filter((acc) => acc.agencyId === filterAgency);
  }, [adAccounts, filterAgency]);

  // 过滤后的充值列表（按代理商筛选）
  const filteredRecharges = useMemo(() => {
    if (filterAgency === "all") return recharges;
    // 通过账户ID关联到代理商
    return recharges.filter((r) => {
      const account = adAccounts.find((a) => a.id === r.adAccountId);
      return account && account.agencyId === filterAgency;
    });
  }, [recharges, adAccounts, filterAgency]);

  const filteredConsumptions = useMemo(() => {
    return consumptions.filter((c) => {
      // 月份过滤
      if (filterMonth && c.month !== filterMonth) return false;
      
      // 国家过滤
      if (filterCountry !== "all") {
        const store = c.storeId ? stores.find((s) => s.id === c.storeId) : null;
        if (!store || store.country !== filterCountry) return false;
      }
      
      // 代理商过滤
      if (filterAgency !== "all" && c.agencyId !== filterAgency) return false;
      
      // 店铺过滤
      if (filterStore !== "all" && c.storeId !== filterStore) return false;
      
      return true;
    });
  }, [consumptions, stores, filterMonth, filterCountry, filterAgency, filterStore]);

  // 生成月份选项列表（最近12个月）
  const monthOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const now = new Date();
    
    // 生成最近12个月（包含当前月份）
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // getMonth() 返回 0-11，需要 +1
      const monthStr = `${year}-${String(month).padStart(2, "0")}`;
      options.push({
        value: monthStr,
        label: monthStr // 使用 2026-01 格式
      });
    }
    
    return options;
  }, []);

  // 快速切换月份的函数
  const handleQuickFilter = (type: "current" | "last" | "quarter" | "all") => {
    setIsFilterLoading(true);
    const now = new Date();
    let monthValue = "";
    
    if (type === "current") {
      // 本月
      monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    } else if (type === "last") {
      // 上月
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      monthValue = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
    } else if (type === "quarter") {
      // 本季度（当前季度的第一个月）
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterStartMonth = currentQuarter * 3 + 1;
      monthValue = `${now.getFullYear()}-${String(quarterStartMonth).padStart(2, "0")}`;
    } else {
      // 全年（清空筛选）
      monthValue = "";
    }
    
    setFilterMonth(monthValue);
    // 模拟加载动画
    setTimeout(() => {
      setIsFilterLoading(false);
    }, 300);
  };

  // 看板统计数据
  const dashboardStats = useMemo(() => {
    // 如果未挂载，返回默认值，避免 hydration 错误
    if (!mounted || typeof window === "undefined") {
      return {
        totalRecharge: 0,
        totalConsumption: 0,
        totalAccountBalance: 0,
        totalSettledConsumption: 0,
        totalPendingSettlement: 0,
        totalRebateAmount: 0,
        totalSettledRebateAmount: 0,
        totalUnsettledRebateAmount: 0,
        countrySpendData: [],
        storeSpendData: [],
        monthlyTrendData: [],
        accountDetailData: [],
        accountBalanceCurrency: "USD",
        pendingSettlementCurrency: "USD",
        settledConsumptionCurrency: "USD",
        rebateCurrency: "USD",
        rechargeCurrency: "USD",
        consumptionCurrency: "USD",
        baseCurrency: "USD"
      };
    }
    
    // 从充值记录中统计总充值（使用过滤后的充值数据，按币种分组）
    const rechargeByCurrency: Record<string, number> = {};
    filteredRecharges.forEach((r) => {
      const currency = r.currency || "USD";
      rechargeByCurrency[currency] = (rechargeByCurrency[currency] || 0) + (r.amount || 0);
    });
    // 总返点收益（按币种分组）
    const rebateByCurrency: Record<string, number> = {};
    filteredRecharges.forEach((r) => {
      const currency = r.currency || "USD";
      rebateByCurrency[currency] = (rebateByCurrency[currency] || 0) + (r.rebateAmount || 0);
    });
    // 主币种（优先USD）
    const mainRechargeCurrency = Object.keys(rechargeByCurrency).includes("USD") ? "USD" : Object.keys(rechargeByCurrency)[0] || "USD";
    const totalRecharge = rechargeByCurrency[mainRechargeCurrency] || 0;
    const totalRebate = rebateByCurrency[mainRechargeCurrency] || 0;
    
    // 总实际消耗（按币种分组）
    const consumptionByCurrency: Record<string, number> = {};
    filteredConsumptions.forEach((c) => {
      const currency = c.currency || "USD";
      consumptionByCurrency[currency] = (consumptionByCurrency[currency] || 0) + c.amount;
    });
    // 主币种（优先USD）
    const mainConsumptionCurrency = Object.keys(consumptionByCurrency).includes("USD") ? "USD" : Object.keys(consumptionByCurrency)[0] || "USD";
    const totalConsumption = consumptionByCurrency[mainConsumptionCurrency] || 0;
    
    // 总账户余额：所有广告账户余额总和（使用过滤后的账户数据，按账户币种分组统计）
    // 注意：只累加正数余额，负数余额表示透支，不计入总余额
    const accountBalanceByCurrency: Record<string, number> = {};
    filteredAccounts.forEach((acc) => {
      const balance = Math.max(0, acc.currentBalance || 0);
      if (balance > 0) {
        const currency = acc.currency || "USD";
        accountBalanceByCurrency[currency] = (accountBalanceByCurrency[currency] || 0) + balance;
      }
    });
    // 主要币种（优先USD）
    const mainAccountCurrency = Object.keys(accountBalanceByCurrency).includes("USD") ? "USD" : Object.keys(accountBalanceByCurrency)[0] || "USD";
    const totalAccountBalance = accountBalanceByCurrency[mainAccountCurrency] || 0;
    
    // 已结算金额：已结算的消耗金额
    const settledConsumptionByCurrency: Record<string, number> = {};
    filteredConsumptions
      .filter((c) => c.isSettled === true) // 明确检查是否为 true
      .forEach((c) => {
        const currency = c.currency || "USD";
        const amount = c.amount || 0;
        if (amount > 0) {
          settledConsumptionByCurrency[currency] = (settledConsumptionByCurrency[currency] || 0) + amount;
        }
      });
    const mainSettledCurrency = Object.keys(settledConsumptionByCurrency).includes("USD") ? "USD" : Object.keys(settledConsumptionByCurrency)[0] || "USD";
    const totalSettledConsumption = settledConsumptionByCurrency[mainSettledCurrency] || 0;
    
    // 未结算金额：已消耗但尚未支付给代理商的金额（未结算的消耗）
    const pendingSettlementByCurrency: Record<string, number> = {};
    filteredConsumptions
      .filter((c) => !(c.isSettled === true)) // 明确检查是否为 true，undefined 和 false 都视为未结算
      .forEach((c) => {
        const currency = c.currency || "USD";
        const amount = c.amount || 0;
        if (amount > 0) {
          pendingSettlementByCurrency[currency] = (pendingSettlementByCurrency[currency] || 0) + amount;
        }
      });
    const mainSettlementCurrency = Object.keys(pendingSettlementByCurrency).includes("USD") ? "USD" : Object.keys(pendingSettlementByCurrency)[0] || "USD";
    const totalPendingSettlement = pendingSettlementByCurrency[mainSettlementCurrency] || 0;
    
    // 预估返点总额：累计充值额 * 返点率
    // 按代理商分组计算：每个代理商的累计充值额 * 该代理商的返点率，然后汇总
    const estimatedRebateByCurrency: Record<string, number> = {};
    
    // 按代理商分组统计充值额（按币种分组）
    const rechargeByAgencyAndCurrency: Record<string, Record<string, number>> = {};
    filteredRecharges.forEach((r) => {
      const agencyId = r.agencyId || "";
      const currency = r.currency || "USD";
      if (!rechargeByAgencyAndCurrency[agencyId]) {
        rechargeByAgencyAndCurrency[agencyId] = {};
      }
      rechargeByAgencyAndCurrency[agencyId][currency] = 
        (rechargeByAgencyAndCurrency[agencyId][currency] || 0) + (r.amount || 0);
    });
    
    // 计算每个代理商的预估返点：累计充值额 * 返点率
    Object.keys(rechargeByAgencyAndCurrency).forEach((agencyId) => {
      const agency = agencies.find((a) => a.id === agencyId);
      if (!agency) return;
      
      // 获取代理商的返点率
      const rebateRate = agency.rebateConfig?.rate || agency.rebateRate || 0;
      if (rebateRate <= 0) return;
      
      // 计算该代理商各币种的预估返点
      Object.keys(rechargeByAgencyAndCurrency[agencyId]).forEach((currency) => {
        const rechargeAmount = rechargeByAgencyAndCurrency[agencyId][currency] || 0;
        const estimatedRebate = (rechargeAmount * rebateRate) / 100;
        if (estimatedRebate > 0) {
          estimatedRebateByCurrency[currency] = 
            (estimatedRebateByCurrency[currency] || 0) + estimatedRebate;
        }
      });
    });
    
    const mainRebateCurrency = Object.keys(estimatedRebateByCurrency).includes("USD") ? "USD" : Object.keys(estimatedRebateByCurrency)[0] || "USD";
    const totalEstimatedRebate = estimatedRebateByCurrency[mainRebateCurrency] || 0;
    
    // 本季度预计待返点总额（未结算的预估返点）
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1; // 当前季度（1-4）
    const currentYear = now.getFullYear();
    const quarterStartMonth = (currentQuarter - 1) * 3 + 1; // 季度起始月份（1, 4, 7, 10）
    const quarterEndMonth = currentQuarter * 3; // 季度结束月份（3, 6, 9, 12）
    
    // 筛选本季度的未结算消耗记录
    // 注意：isSettled 字段可能不存在（旧数据），默认为 false（未结算）
    const currentQuarterConsumptions = filteredConsumptions.filter((c) => {
      if (c.isSettled === true) return false; // 已结算的不算（明确检查是否为 true）
      if (!c.month) return false;
      const [year, month] = c.month.split("-").map(Number);
      if (isNaN(year) || isNaN(month)) return false;
      return year === currentYear && month >= quarterStartMonth && month <= quarterEndMonth;
    });
    
    // 本季度预计待返点（按币种分组）
    // 注意：如果消耗记录没有 estimatedRebate 字段，尝试根据消耗金额和代理商返点率计算
    const pendingRebateByCurrency: Record<string, number> = {};
    currentQuarterConsumptions.forEach((c) => {
      const agency = c.agencyId ? agencies.find((a) => a.id === c.agencyId) : null;
      const currency = agency?.settlementCurrency || c.currency || "USD";
      // 如果有 estimatedRebate 字段，使用它；否则根据消耗金额和返点率计算
      let rebateAmount = c.estimatedRebate;
      if (rebateAmount === undefined || rebateAmount === null) {
        // 如果没有返点字段，尝试根据消耗金额和返点率计算
        if (agency && agency.rebateRate && c.amount) {
          rebateAmount = (c.amount * agency.rebateRate) / 100;
        } else if (c.rebateRate && c.amount) {
          // 如果消耗记录中有返点率，使用它
          rebateAmount = (c.amount * c.rebateRate) / 100;
        } else {
          rebateAmount = 0;
        }
      }
      if (rebateAmount > 0) {
        pendingRebateByCurrency[currency] = (pendingRebateByCurrency[currency] || 0) + rebateAmount;
      }
    });
    const mainPendingRebateCurrency = Object.keys(pendingRebateByCurrency).includes("USD") ? "USD" : Object.keys(pendingRebateByCurrency)[0] || "USD";
    const totalPendingRebate = pendingRebateByCurrency[mainPendingRebateCurrency] || 0;
    
    // 各账户当前可用头寸（余额和待结返点，使用过滤后的账户数据）
    const accountBalances = filteredAccounts.map((acc) => ({
      account: acc,
      balance: acc.currentBalance || 0,
      rebateReceivable: acc.rebateReceivable || 0
    }));
    
    // 国家占比数据：按国家统计消耗金额
    const countrySpendMap: Record<string, number> = {};
    filteredConsumptions.forEach((c) => {
      const store = c.storeId ? stores.find((s) => s.id === c.storeId) : null;
      const countryCode = store?.country || "未知";
      if (!countrySpendMap[countryCode]) {
        countrySpendMap[countryCode] = 0;
      }
      countrySpendMap[countryCode] += c.amount;
    });
    
    const countrySpendData = Object.entries(countrySpendMap)
      .map(([code, amount]) => {
        const country = getCountryByCode(code);
        return {
          name: country?.name || code,
          value: amount,
          code
        };
      })
      .sort((a, b) => b.value - a.value);
    
    // 店铺消耗数据：按店铺ID汇总消耗
    const storeSpendMap: Record<string, { name: string; amount: number }> = {};
    filteredConsumptions.forEach((c) => {
      const storeId = c.storeId || "未关联店铺";
      if (!storeSpendMap[storeId]) {
        const store = c.storeId ? stores.find((s) => s.id === c.storeId) : null;
        storeSpendMap[storeId] = {
          name: store?.name || c.storeName || storeId,
          amount: 0
        };
      }
      storeSpendMap[storeId].amount += c.amount;
    });
    
    const storeSpendData = Object.values(storeSpendMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // 只显示前10名
    
    // 月度趋势数据：过去6个月的消耗走势
    const monthlySpendMap: Record<string, number> = {};
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    
    filteredConsumptions.forEach((c) => {
      if (!c.month) return;
      const [year, month] = c.month.split("-").map(Number);
      const consumptionDate = new Date(year, month - 1);
      if (consumptionDate >= sixMonthsAgo) {
        if (!monthlySpendMap[c.month]) {
          monthlySpendMap[c.month] = 0;
        }
        monthlySpendMap[c.month] += c.amount;
      }
    });
    
    // 生成过去6个月的完整月份列表
    const monthlyTrendData: Array<{ month: string; amount: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyTrendData.push({
        month: monthStr,
        amount: monthlySpendMap[monthStr] || 0
      });
    }
    
    // 计算已返点金额和未返点金额
    // 从财务流水中统计已结算的返点
    const CASH_FLOW_KEY_FOR_REBATE = "cashFlow";
    let totalSettledRebateAmount = 0;
    if (typeof window !== "undefined") {
      const storedFlow = window.localStorage.getItem(CASH_FLOW_KEY_FOR_REBATE);
      if (storedFlow) {
        try {
          const cashFlow: Array<{
            type: "income" | "expense";
            category: string;
            amount: number;
            isReversal?: boolean;
            status?: string;
          }> = JSON.parse(storedFlow);
          cashFlow.forEach((flow) => {
            if (
              flow.category === "运营-广告-已结算" &&
              flow.type === "income" &&
              !flow.isReversal &&
              (flow.status === "confirmed" || !flow.status)
            ) {
              totalSettledRebateAmount += Math.abs(flow.amount || 0);
            }
          });
        } catch (e) {
          console.error("Failed to parse cash flow for rebate calculation", e);
        }
      }
    }
    
    const totalRebateAmount = totalEstimatedRebate; // 总返点金额 = 预估返点总额
    const totalUnsettledRebateAmount = Math.max(0, totalRebateAmount - totalSettledRebateAmount); // 未返点金额
    
    // 各账户金额详细数据：用于图表显示
    const accountDetailData = filteredAccounts.map((acc) => {
      const accountConsumptions = filteredConsumptions.filter((c) => c.adAccountId === acc.id);
      const accountRecharges = filteredRecharges.filter((r) => r.adAccountId === acc.id);
      const totalConsumption = accountConsumptions.reduce((sum, c) => sum + c.amount, 0);
      const totalRecharge = accountRecharges.reduce((sum, r) => sum + r.amount, 0);
      const settledConsumption = accountConsumptions
        .filter((c) => c.isSettled === true)
        .reduce((sum, c) => sum + c.amount, 0);
      
      return {
        accountName: acc.accountName,
        agencyName: acc.agencyName,
        currency: acc.currency,
        balance: acc.currentBalance || 0,
        totalRecharge,
        totalConsumption,
        settledConsumption,
        pendingConsumption: totalConsumption - settledConsumption,
        rebateReceivable: acc.rebateReceivable || 0
      };
    }).sort((a, b) => b.totalConsumption - a.totalConsumption); // 按消耗金额排序
    
    return {
      totalRecharge, // 累计充值额
      totalConsumption, // 总实际消耗
      totalAccountBalance, // 总账户余额
      totalSettledConsumption, // 已结算金额
      totalPendingSettlement, // 未结算金额
      totalRebateAmount, // 总返点金额
      totalSettledRebateAmount, // 已返点金额
      totalUnsettledRebateAmount, // 未返点金额
      // 图表数据
      countrySpendData,
      storeSpendData,
      monthlyTrendData,
      accountDetailData,
      // 币种信息
      accountBalanceCurrency: mainAccountCurrency,
      pendingSettlementCurrency: mainSettlementCurrency,
      settledConsumptionCurrency: mainSettledCurrency,
      rebateCurrency: mainRebateCurrency,
      rechargeCurrency: mainRechargeCurrency,
      consumptionCurrency: mainConsumptionCurrency,
      baseCurrency: "USD" // Base Currency 默认为 USD
    };
  }, [mounted, filteredAccounts, filteredConsumptions, filteredRecharges, stores, agencies]);

  const handleCreateAgency = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击", { icon: "⚠️", duration: 3000 });
      return;
    }
    
    if (!agencyForm.name.trim()) {
      toast.error("代理商名称是必填项");
      return;
    }
    const rebateRate = Number(agencyForm.rebateRate);
    if (Number.isNaN(rebateRate) || rebateRate < 0 || rebateRate > 100) {
      toast.error("返点比例需为0-100之间的数字");
      return;
    }

    const newAgency: Agency = {
      id: crypto.randomUUID(),
      name: agencyForm.name.trim(),
      platform: agencyForm.platform,
      rebateRate,
      rebateConfig: {
        rate: rebateRate,
        period: agencyForm.rebatePeriod
      },
      settlementCurrency: agencyForm.settlementCurrency,
      creditTerm: agencyForm.creditTerm.trim() || undefined,
      contact: agencyForm.contact.trim() || undefined,
      phone: agencyForm.phone.trim() || undefined,
      notes: agencyForm.notes.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    setIsSubmitting(true);
    try {
      setAgencies((prev) => [...prev, newAgency]);
      await saveAgencies([...agencies, newAgency]);
    setAgencyForm({ 
      name: "", 
      platform: "TikTok", 
      rebateRate: "", 
      rebatePeriod: "月",
      settlementCurrency: "USD",
      creditTerm: "",
      contact: "", 
      phone: "", 
      notes: "" 
    });
    setIsAgencyModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditAgency = (agency: Agency) => {
    setEditAgency(agency);
    setAgencyForm({
      name: agency.name,
      platform: agency.platform,
      rebateRate: String(agency.rebateRate),
      rebatePeriod: agency.rebateConfig?.period || "月",
      settlementCurrency: agency.settlementCurrency || "USD",
      creditTerm: agency.creditTerm || "",
      contact: agency.contact || "",
      phone: agency.phone || "",
      notes: agency.notes || ""
    });
    setIsAgencyModalOpen(true);
  };

  const handleUpdateAgency = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击", { icon: "⚠️", duration: 3000 });
      return;
    }
    
    if (!editAgency) return;
    if (!agencyForm.name.trim()) {
      toast.error("代理商名称是必填项");
      return;
    }
    const rebateRate = Number(agencyForm.rebateRate);
    if (Number.isNaN(rebateRate) || rebateRate < 0 || rebateRate > 100) {
      toast.error("返点比例需为0-100之间的数字");
      return;
    }

    const updatedAgencies = agencies.map((a) =>
      a.id === editAgency.id
        ? {
            ...a,
            name: agencyForm.name.trim(),
            platform: agencyForm.platform,
            rebateRate,
            rebateConfig: {
              rate: rebateRate,
              period: agencyForm.rebatePeriod
            },
            settlementCurrency: agencyForm.settlementCurrency,
            creditTerm: agencyForm.creditTerm.trim() || undefined,
            contact: agencyForm.contact.trim() || undefined,
            phone: agencyForm.phone.trim() || undefined,
            notes: agencyForm.notes.trim() || undefined
          }
        : a
    );

    setIsSubmitting(true);
    try {
      setAgencies(updatedAgencies);
      await saveAgencies(updatedAgencies);
    
    // 更新关联的广告账户中的代理商名称
    const updatedAccounts = adAccounts.map((acc) =>
      acc.agencyId === editAgency.id ? { ...acc, agencyName: agencyForm.name.trim() } : acc
    );
    setAdAccounts(updatedAccounts);
    await saveAdAccounts(updatedAccounts);

    setAgencyForm({ 
      name: "", 
      platform: "TikTok", 
      rebateRate: "", 
      rebatePeriod: "月",
      settlementCurrency: "USD",
      creditTerm: "",
      contact: "", 
      phone: "", 
      notes: "" 
    });
    setEditAgency(null);
    setIsAgencyModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAgency = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "删除代理商",
      message: "确定要删除这个代理商吗？关联的广告账户也会被删除！",
      type: "danger",
      onConfirm: async () => {
        try {
          const updatedAgencies = agencies.filter((a) => a.id !== id);
          setAgencies(updatedAgencies);
          await saveAgencies(updatedAgencies);
          
          // 删除关联的广告账户
          const updatedAccounts = adAccounts.filter((acc) => acc.agencyId !== id);
          setAdAccounts(updatedAccounts);
          await saveAdAccounts(updatedAccounts);
          
          // 删除关联的消耗记录
          const accountIds = adAccounts.filter((acc) => acc.agencyId === id).map((acc) => acc.id);
          const updatedConsumptions = consumptions.filter((c) => !accountIds.includes(c.adAccountId));
          setConsumptions(updatedConsumptions);
          await saveAdConsumptions(updatedConsumptions);
          setConfirmDialog(null);
        } catch (e) {
          console.error("删除代理商失败", e);
          toast.error("操作失败，请重试");
        }
      }
    });
  };

  const handleCreateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!accountForm.agencyId) {
      toast.error("请选择代理商");
      return;
    }
    if (!accountForm.accountName.trim()) {
      toast.error("账户名称是必填项");
      return;
    }
    const currentBalance = Number(accountForm.currentBalance) || 0;
    const creditLimit = Number(accountForm.creditLimit) || 0;
    if (Number.isNaN(currentBalance) || currentBalance < 0) {
      toast.error("当前余额需为非负数");
      return;
    }
    if (Number.isNaN(creditLimit) || creditLimit < 0) {
      toast.error("账期授信额度需为非负数");
      return;
    }

    const agency = agencies.find((a) => a.id === accountForm.agencyId);
    if (!agency) {
      toast.error("代理商不存在");
      return;
    }

    const newAccount: AdAccount = {
      id: crypto.randomUUID(),
      agencyId: accountForm.agencyId,
      agencyName: agency.name,
      accountName: accountForm.accountName.trim(),
      currentBalance,
      rebateReceivable: 0, // 初始应收返点为0
      creditLimit,
      currency: accountForm.currency,
      country: accountForm.country || undefined,
      notes: accountForm.notes.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    setAdAccounts((prev) => [...prev, newAccount]);
    await saveAdAccounts([...adAccounts, newAccount]);
    setAccountForm({
      agencyId: "",
      accountName: "",
      currentBalance: "",
      creditLimit: "",
      currency: "USD",
      country: "",
      notes: ""
    });
    setIsAccountModalOpen(false);
  };

  const handleEditAccount = (account: AdAccount) => {
    setEditAccount(account);
    setAccountForm({
      agencyId: account.agencyId,
      accountName: account.accountName,
      currentBalance: String(account.currentBalance),
      creditLimit: String(account.creditLimit),
      currency: account.currency,
      country: account.country || "",
      notes: account.notes || ""
    });
    setIsAccountModalOpen(true);
  };

  const handleUpdateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editAccount) return;
    if (!accountForm.accountName.trim()) {
      toast.error("账户名称是必填项");
      return;
    }
    const currentBalance = Number(accountForm.currentBalance) || 0;
    const creditLimit = Number(accountForm.creditLimit) || 0;
    if (Number.isNaN(currentBalance) || currentBalance < 0) {
      toast.error("当前余额需为非负数");
      return;
    }
    if (Number.isNaN(creditLimit) || creditLimit < 0) {
      toast.error("账期授信额度需为非负数");
      return;
    }

    const agency = agencies.find((a) => a.id === accountForm.agencyId);
    if (!agency) {
      toast.error("代理商不存在");
      return;
    }

    const updatedAccounts = adAccounts.map((a) =>
      a.id === editAccount.id
        ? {
            ...a,
            agencyId: accountForm.agencyId,
            agencyName: agency.name,
            accountName: accountForm.accountName.trim(),
            currentBalance,
            rebateReceivable: a.rebateReceivable || 0, // 保留原有应收返点
            creditLimit,
            currency: accountForm.currency,
            country: accountForm.country || undefined,
            notes: accountForm.notes.trim() || undefined
          }
        : a
    );

    setAdAccounts(updatedAccounts);
    await saveAdAccounts(updatedAccounts);

    // 更新消耗记录中的账户名称
    const updatedConsumptions = consumptions.map((c) =>
      c.adAccountId === editAccount.id ? { ...c, accountName: accountForm.accountName.trim() } : c
    );
    setConsumptions(updatedConsumptions);
    await saveAdConsumptions(updatedConsumptions);

    setAccountForm({
      agencyId: "",
      accountName: "",
      currentBalance: "",
      creditLimit: "",
      currency: "USD",
      country: "",
      notes: ""
    });
    setEditAccount(null);
    setIsAccountModalOpen(false);
  };

  const handleDeleteAccount = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "删除广告账户",
      message: "确定要删除这个广告账户吗？关联的消耗记录也会被删除！",
      type: "danger",
      onConfirm: async () => {
        try {
          const updatedAccounts = adAccounts.filter((a) => a.id !== id);
          setAdAccounts(updatedAccounts);
          await saveAdAccounts(updatedAccounts);
          
          // 删除关联的消耗记录
          const updatedConsumptions = consumptions.filter((c) => c.adAccountId !== id);
          setConsumptions(updatedConsumptions);
          await saveAdConsumptions(updatedConsumptions);
          setConfirmDialog(null);
        } catch (e) {
          console.error("删除广告账户失败", e);
          toast.error("操作失败，请重试");
        }
      }
    });
  };

  const handleCreateRecharge = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!rechargeAccount) {
      toast.error("广告账户不存在");
      return;
    }
    const amount = Number(rechargeForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("充值金额需为正数");
      return;
    }

    // 获取代理商，计算返点
    const agency = agencies.find((a) => a.id === rechargeAccount.agencyId);
    if (!agency) {
      toast.error("代理商不存在");
      return;
    }
    const rebateRate = agency?.rebateConfig?.rate || agency?.rebateRate || 0;
    const rebateAmount = (amount * rebateRate) / 100;

    // 验证凭证数据
    if (!rechargeForm.voucher || rechargeForm.voucher.trim().length < 10) {
      toast.error("请上传充值凭证");
      return;
    }

    // 显示确认框
    setConfirmRechargeModal({
      open: true,
      accountName: rechargeAccount.accountName,
      agencyName: agency.name,
      amount,
      rebateAmount,
      rebateRate,
      currency: rechargeForm.currency,
      date: rechargeForm.date,
      voucher: rechargeForm.voucher,
      notes: rechargeForm.notes
    });
    
    // 先返回，等待用户确认
    return;
  };

  // 处理确认创建充值记录
  const handleConfirmCreateRecharge = async () => {
    if (!confirmRechargeModal || !rechargeAccount) return;

    const { amount, rebateAmount, rebateRate, currency, date, voucher, notes } = confirmRechargeModal;
    const agency = agencies.find((a) => a.id === rechargeAccount.agencyId);
    if (!agency) {
      toast.error("代理商不存在");
      setConfirmRechargeModal(null);
      return;
    }

    // 关闭确认框
    setConfirmRechargeModal(null);

    // 获取充值月份（YYYY-MM格式）
    const rechargeDate = new Date(date);
    const month = `${rechargeDate.getFullYear()}-${String(rechargeDate.getMonth() + 1).padStart(2, "0")}`;

    // 创建充值记录
    const newRecharge: AdRecharge = {
      id: `recharge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      adAccountId: rechargeAccount.id,
      accountName: rechargeAccount.accountName,
      agencyId: rechargeAccount.agencyId,
      agencyName: rechargeAccount.agencyName,
      amount,
      currency: currency as "USD" | "CNY" | "HKD",
      rebateAmount: rebateAmount > 0 ? rebateAmount : undefined,
      rebateRate: rebateRate > 0 ? rebateRate : undefined,
      date: date,
      month, // 充值月份，用于月账单模块
      paymentStatus: "Pending", // 默认待付款状态
      voucher: (voucher || "").trim(), // 确保保存完整的数据
      notes: (notes || "").trim() || undefined,
      createdAt: new Date().toISOString()
    };

    // 调试：检查凭证数据长度
    console.log("保存充值记录，凭证数据长度:", newRecharge.voucher?.length || 0);
    console.log("凭证数据前缀:", newRecharge.voucher?.substring(0, 50) || "无");

    // 保存充值记录
    const updatedRecharges = [...recharges, newRecharge];
    setRecharges(updatedRecharges);
    saveAdRecharges(updatedRecharges);

    // 自动生成月账单并推送到对账中心
    try {
      const existingBills = await getMonthlyBills();
      // 查找同一关联方（代理商+账户）、同一月份、同一类型、同一币种的草稿账单
      // 确保同一个关联方的月账单合并到一个账单上
      const existingBill = existingBills.find(
        (b) => 
          b.month === month && 
          b.billType === "广告" && // 必须是广告账单
          b.agencyId === rechargeAccount.agencyId && // 同一代理商
          b.adAccountId === rechargeAccount.id && // 同一广告账户（同一关联方）
          b.currency === currency && // 同一币种（不同币种分开结算）
          b.status === "Draft" // 只合并草稿状态的账单
      );

      if (existingBill) {
        // 更新现有账单：添加充值记录ID和金额
        const updatedRechargeIds = [...(existingBill.rechargeIds || []), newRecharge.id];
        const newTotalAmount = (existingBill.totalAmount || 0) + amount; // 累计充值金额
        const newRebateAmount = (existingBill.rebateAmount || 0) + rebateAmount; // 累计返点金额
        const updatedBill: MonthlyBill = {
          ...existingBill,
          billCategory: existingBill.billCategory || "Payable" as const, // 兼容旧数据，默认为应付款
          billType: "广告" as const, // 确保账单类型正确
          rechargeIds: updatedRechargeIds,
          // 更新账单金额：累计所有充值记录的金额和返点
          totalAmount: newTotalAmount, // 充值总额（实际支付金额）
          rebateAmount: newRebateAmount, // 累计返点总额（额外收益，不计入支付金额）
          netAmount: newTotalAmount, // 净应付金额 = 充值总额（不扣除返点，真实充值多少就支付多少）
          // 更新账户信息（可能已变更）
          accountName: rechargeAccount.accountName,
          agencyName: agency.name // 更新代理商名称（可能已变更）
        };
        
        const updatedBills = existingBills.map((b) => 
          b.id === existingBill.id ? updatedBill : b
        );
        await saveMonthlyBills(updatedBills);
        console.log(`✅ 已更新月账单：${updatedBill.id}，添加充值记录 ${newRecharge.id}`);
      } else {
        // 创建新账单：基于充值记录生成月账单
        const newBill: MonthlyBill = {
          id: `bill-recharge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          month,
          billCategory: "Payable" as const, // 广告账单属于应付款
          billType: "广告" as const, // 标记为广告账单
          agencyId: rechargeAccount.agencyId,
          agencyName: agency.name,
          adAccountId: rechargeAccount.id,
          accountName: rechargeAccount.accountName,
          totalAmount: amount, // 充值金额（实际支付金额）
          currency: currency as "USD" | "CNY" | "HKD",
          rebateAmount: rebateAmount, // 返点金额（额外收益，不计入支付金额）
          netAmount: amount, // 净应付金额 = 充值金额（不扣除返点，真实充值多少就支付多少）
          consumptionIds: [], // 充值账单暂时没有消耗记录
          rechargeIds: [newRecharge.id], // 关联的充值记录ID
          status: "Draft", // 初始状态为草稿
          createdBy: "系统", // 实际应该从用户系统获取
          createdAt: new Date().toISOString(),
          notes: `自动生成：广告账户 ${rechargeAccount.accountName} ${month} 充值账单`
        };
        
        const updatedBills = [...existingBills, newBill];
        await saveMonthlyBills(updatedBills);
        console.log(`✅ 已生成月账单并推送到对账中心：${newBill.id}`);
      }
    } catch (e) {
      console.error("Failed to create/update monthly bill for recharge", e);
      // 不阻止充值流程，只记录错误
    }

    // 如果有返点，自动生成返点应收款记录和对账中心的广告返点账单
    if (rebateAmount > 0) {
      try {
        const existingReceivable = await getRebateReceivableByRechargeId(newRecharge.id);
        
        if (!existingReceivable) {
          const createRes = await fetch("/api/rebate-receivables", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rechargeId: newRecharge.id,
              rechargeDate: date,
              agencyId: rechargeAccount.agencyId,
              agencyName: agency.name,
              adAccountId: rechargeAccount.id,
              accountName: rechargeAccount.accountName,
              platform: agency.platform,
              rebateAmount,
              currency: currency as "USD" | "CNY" | "HKD",
              currentBalance: rebateAmount,
              status: "待核销",
              notes: `自动生成：广告账户 ${rechargeAccount.accountName} 充值返点`,
            }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            console.log(`✅ 已生成返点应收款记录：${created.id}，金额：${rebateAmount} ${currency}`);
          }

          // 在对账中心生成"广告返点"类型的应收款账单
          try {
            const existingBills = await getMonthlyBills();
            // 查找同一关联方（代理商+账户）、同一月份、同一类型、同一币种的草稿账单
            const existingRebateBill = existingBills.find(
              (b) =>
                b.month === month &&
                b.billType === "广告返点" && // 查找广告返点类型的账单
                b.agencyId === rechargeAccount.agencyId &&
                b.adAccountId === rechargeAccount.id &&
                b.currency === currency &&
                b.status === "Draft"
            );

            if (existingRebateBill) {
              // 更新现有账单
              const updatedRebateBill: MonthlyBill = {
                ...existingRebateBill,
                totalAmount: existingRebateBill.totalAmount + rebateAmount, // 累计返点金额
                rebateAmount: existingRebateBill.rebateAmount + rebateAmount, // 返点金额
                netAmount: existingRebateBill.netAmount + rebateAmount, // 净应收金额
                rechargeIds: [...(existingRebateBill.rechargeIds || []), newRecharge.id], // 关联充值记录ID
                notes: `更新：广告账户 ${rechargeAccount.accountName} ${month} 充值返点`
              };
              const updatedBills = existingBills.map((b) =>
                b.id === existingRebateBill.id ? updatedRebateBill : b
              );
              await saveMonthlyBills(updatedBills);
              console.log(`✅ 已更新对账中心广告返点账单：${updatedRebateBill.id}`);
            } else {
              // 创建新的应收款账单（广告返点）
              const newRebateBill: MonthlyBill = {
                id: `bill-rebate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                month,
                billCategory: "Receivable" as const, // 标记为应收款
                billType: "广告返点" as const, // 标记为广告返点
                agencyId: rechargeAccount.agencyId,
                agencyName: agency.name,
                adAccountId: rechargeAccount.id,
                accountName: rechargeAccount.accountName,
                totalAmount: rebateAmount, // 账单总金额（即返点金额）
                currency: currency as "USD" | "CNY" | "HKD",
                rebateAmount: rebateAmount, // 返点金额
                netAmount: rebateAmount, // 净应收金额
                consumptionIds: [], // 充值产生的返点，暂时没有消耗记录
                rechargeIds: [newRecharge.id], // 关联的充值记录ID
                status: "Draft", // 初始状态为草稿
                createdBy: "系统",
                createdAt: new Date().toISOString(),
                notes: `自动生成：广告账户 ${rechargeAccount.accountName} ${month} 充值返点应收款`
              };
              const updatedBills = [...existingBills, newRebateBill];
              await saveMonthlyBills(updatedBills);
              console.log(`✅ 已生成对账中心广告返点账单：${newRebateBill.id}`);
            }
          } catch (e) {
            console.error("Failed to create/update rebate bill", e);
            // 不阻止充值流程，只记录错误
          }
        }
      } catch (e) {
        console.error("Failed to create rebate receivable", e);
        // 不阻止充值流程，只记录错误
      }
    }

    // 更新广告账户余额（只增加实付金额，返点计入应收返点）- 仅更新账面余额，不扣减银行卡
    const updatedAccounts = adAccounts.map((acc) =>
      acc.id === rechargeAccount.id
        ? { 
            ...acc, 
            currentBalance: acc.currentBalance + amount, // 只增加实付金额
            rebateReceivable: (acc.rebateReceivable || 0) + rebateAmount // 返点计入应收返点
          }
        : acc
    );
    setAdAccounts(updatedAccounts);
    await saveAdAccounts(updatedAccounts);

    // 显示成功提示
    toast.success(
      `充值成功！金额：${formatCurrencyString(amount, currency)}${rebateAmount > 0 ? `，预计返点：${formatCurrencyString(rebateAmount, currency)}` : ""}`,
      {
        icon: "✅",
        duration: 4000,
      }
    );

    // 重置表单
    setRechargeForm({
      amount: "",
      currency: "USD",
      date: new Date().toISOString().slice(0, 10),
      voucher: "",
      notes: ""
    });
    setAmountError(false);
    setPreviewKey(0);
    setRechargeAccount(null);
    setIsRechargeModalOpen(false);

    // 重新计算余额
    await recalculateAccountBalances(updatedAccounts, consumptions, updatedRecharges);
  };

  const handleDeleteRecharge = (id: string) => {
    setConfirmDialog({
      open: true,
      title: "删除充值记录",
      message: "确定要删除这条充值记录吗？广告账户余额会相应扣减。",
      type: "warning",
      onConfirm: async () => {
        try {
          const recharge = recharges.find((r) => r.id === id);
          if (!recharge) {
            setConfirmDialog(null);
            return;
          }

          // 扣减广告账户余额（包括返点）
          const totalDeduction = recharge.amount + (recharge.rebateAmount || 0);
          const updatedAccounts = adAccounts.map((acc) =>
            acc.id === recharge.adAccountId
              ? { ...acc, currentBalance: Math.max(0, acc.currentBalance - totalDeduction) }
              : acc
          );
          setAdAccounts(updatedAccounts);
          await saveAdAccounts(updatedAccounts);

          // 删除充值记录
          const updatedRecharges = recharges.filter((r) => r.id !== id);
          setRecharges(updatedRecharges);
          await saveAdRecharges(updatedRecharges);

          // 重新计算余额
          await recalculateAccountBalances(updatedAccounts, consumptions, updatedRecharges);
          setConfirmDialog(null);
        } catch (e) {
          console.error("删除充值记录失败", e);
          toast.error("操作失败，请重试");
        }
      }
    });
  };

  const handleCreateConsumption = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consumptionForm.adAccountId) {
      alert("请选择广告账户");
      return;
    }
    if (!consumptionForm.month) {
      alert("请选择月份");
      return;
    }
    const amount = Number(consumptionForm.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      alert("消耗金额需为正数");
      return;
    }

    const account = adAccounts.find((a) => a.id === consumptionForm.adAccountId);
    if (!account) {
      toast.error("广告账户不存在");
      return;
    }
    
    // 查找代理商并计算预估返点
    const agency = agencies.find((a) => a.id === account.agencyId);
    const estimatedRebate = agency ? (amount * agency.rebateRate) / 100 : 0;
    
    // 查找店铺信息
    const store = consumptionForm.storeId ? stores.find((s) => s.id === consumptionForm.storeId) : null;

    // 显示确认框（自定义模态框）
    const currency = consumptionForm.currency || account.currency;
    setConfirmConsumptionModal({
      open: true,
      accountName: account.accountName,
      agencyName: agency?.name || "-",
      storeName: store?.name || "未指定",
      month: consumptionForm.month,
      date: consumptionForm.date,
      amount,
      estimatedRebate,
      rebateRate: agency?.rebateRate || 0,
      currency,
      campaignName: consumptionForm.campaignName || undefined,
      voucher: consumptionForm.voucher || undefined,
      notes: consumptionForm.notes || undefined
    });
    
    // 先返回，等待用户确认
    return;
  };

  // 处理确认创建消耗记录
  const handleConfirmCreateConsumption = async () => {
    if (!confirmConsumptionModal) return;
    
    const { accountName, month, date, amount, estimatedRebate, currency, campaignName, voucher, notes, storeName } = confirmConsumptionModal;
    const account = adAccounts.find((a) => a.accountName === accountName);
    if (!account) {
      toast.error("广告账户不存在");
      setConfirmConsumptionModal(null);
      return;
    }
    
    // 查找代理商
    const agency = agencies.find((a) => a.id === account.agencyId);
    
    // 查找店铺信息
    const store = stores.find((s) => s.name === storeName) || null;
    const storeId = store?.id || undefined;

    // 关闭确认框
    setConfirmConsumptionModal(null);

    // 自动计算预计付款日期和返点到账日期
    const dueDate = agency ? calculateDueDate(agency.creditTerm, month) : undefined;
    const rebateDueDate = agency && agency.rebateConfig 
      ? calculateRebateDueDate(agency.rebateConfig, month) 
      : undefined;

    const newConsumption: AdConsumption = {
      id: crypto.randomUUID(),
      adAccountId: account.id,
      accountName: account.accountName,
      agencyId: account.agencyId,
      agencyName: agency?.name,
      storeId,
      storeName: store?.name,
      month,
      date,
      amount,
      currency: currency || account.currency,
      estimatedRebate,
      rebateRate: agency?.rebateRate,
      campaignName: campaignName?.trim() || undefined,
      dueDate, // 预计付款日期
      rebateDueDate, // 预计返点到账日期
      isSettled: false,
      voucher: voucher || undefined,
      notes: notes?.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    // 自动核销返点：根据消耗总额，按比例自动计算出消耗掉的返点数额
    // 逻辑：消耗总额 = 实付本金 + 返点抵扣，返点抵扣金额 = 消耗总额 * (返点率 / (100 + 返点率))
    // 例如：如果返点率是10%，那么10000消耗中，约有909是返点抵扣，9091是实付本金
    try {
      const existingReceivables = await getRebateReceivables();
      // 获取该账户所有未结清的返点应收款记录（按创建时间排序，先消耗先核销）
      const unsettledReceivables = existingReceivables
        .filter((r) => 
          r.adAccountId === account.id && 
          r.status !== "已结清" && 
          r.currentBalance > 0 &&
          r.currency === (currency || account.currency) // 只核销相同币种的返点
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      let remainingConsumption = amount; // 剩余待核销的消耗金额
      const updatedReceivables = [...existingReceivables];
      
      // 计算返点抵扣比例（假设消耗总额中，返点抵扣的比例 = 返点率 / (100 + 返点率)）
      const rebateRate = agency?.rebateConfig?.rate || agency?.rebateRate || 0;
      const rebateDeductionRatio = rebateRate > 0 ? rebateRate / (100 + rebateRate) : 0;
      
      // 遍历未结清的返点应收款，按顺序核销
      for (let i = 0; i < unsettledReceivables.length && remainingConsumption > 0; i++) {
        const receivable = unsettledReceivables[i];
        const receivableIndex = updatedReceivables.findIndex((r) => r.id === receivable.id);
        if (receivableIndex === -1) continue;
        
        // 计算本次消耗中，应该抵扣的返点金额
        const writeoffAmount = Math.min(
          remainingConsumption * rebateDeductionRatio, // 本次消耗按比例应该抵扣的返点
          receivable.currentBalance // 不能超过剩余返点余额
        );
        
        if (writeoffAmount > 0) {
          // 更新返点应收款余额
          const newBalance = receivable.currentBalance - writeoffAmount;
          const newStatus: RebateReceivable["status"] = newBalance <= 0.01 ? "已结清" : (receivable.status === "待核销" ? "核销中" : receivable.status);
          
          // 添加核销记录
          const writeoffRecord = {
            id: crypto.randomUUID(),
            consumptionId: newConsumption.id,
            consumptionDate: date,
            writeoffAmount,
            remainingBalance: Math.max(0, newBalance),
            createdAt: new Date().toISOString()
          };
          
          updatedReceivables[receivableIndex] = {
            ...receivable,
            currentBalance: Math.max(0, newBalance),
            status: newStatus,
            writeoffRecords: [...receivable.writeoffRecords, writeoffRecord],
            updatedAt: new Date().toISOString()
          };
          
          // 扣减剩余待核销的消耗：已核销的返点对应的消耗部分
          // 由于返点抵扣比例 = 返点率 / (100 + 返点率)，所以对应的消耗 = 返点金额 / 返点抵扣比例
          remainingConsumption -= (rebateDeductionRatio > 0 ? writeoffAmount / rebateDeductionRatio : 0);
          
          console.log(`✅ 已核销返点：${receivable.id}，核销金额：${writeoffAmount.toFixed(2)} ${receivable.currency}，剩余余额：${newBalance.toFixed(2)} ${receivable.currency}`);
        }
      }
      
      await saveRebateReceivables(updatedReceivables);
    } catch (e) {
      console.error("Failed to writeoff rebate receivable", e);
      // 不阻止消耗流程，只记录错误
    }

    // 更新广告账户余额（减少消耗金额）
    const updatedAccounts = adAccounts.map((a) => {
      if (a.id === account.id) {
        const newBalance = a.currentBalance - amount;
        return {
          ...a,
          currentBalance: Math.max(0, newBalance) // 不允许负数余额
        };
      }
      return a;
    });

    try {
      setConsumptions((prev) => [...prev, newConsumption]);
      await saveAdConsumptions([...consumptions, newConsumption]);
      setAdAccounts(updatedAccounts);
      await saveAdAccounts(updatedAccounts);
    } catch (e) {
      console.error("保存消耗记录失败", e);
      toast.error("保存失败，请重试");
      return;
    }

    // 自动在财务流水中生成"运营-广告-待结算"记录
    if (typeof window !== "undefined") {
      try {
        const CASH_FLOW_KEY = "cashFlow";
        const storedFlow = window.localStorage.getItem(CASH_FLOW_KEY);
        const cashFlow: Array<{
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
          relatedId?: string;
          businessNumber?: string;
          status: "confirmed" | "pending";
          isReversal?: boolean;
          createdAt: string;
        }> = storedFlow ? JSON.parse(storedFlow) : [];
        
        // 生成待结算记录（收入类型，金额为预估返点）
        const settlementFlow = {
          id: crypto.randomUUID(),
          date: newConsumption.date,
          summary: `广告返点待结算 - ${account.accountName} - ${month}`,
          category: "运营-广告-待结算",
          type: "income" as const,
          amount: estimatedRebate, // 正数表示收入
          accountId: account.id, // 使用广告账户ID作为关联（如果没有对应银行账户，可能需要调整）
          accountName: account.accountName,
          currency: account.currency,
          remark: `店铺：${store?.name || "未指定"} | 消耗金额：${amount} | 返点比例：${agency?.rebateRate || 0}%`,
          relatedId: newConsumption.id, // 关联消耗记录ID
          businessNumber: `AD-${month.replace("-", "")}-${newConsumption.id.slice(0, 8)}`,
          status: "pending" as const, // 待结算状态
          isReversal: false,
          createdAt: new Date().toISOString()
        };
        
        cashFlow.push(settlementFlow);
        window.localStorage.setItem(CASH_FLOW_KEY, JSON.stringify(cashFlow));
        console.log(`✅ 已生成财务流水待结算记录：${settlementFlow.summary}`);
      } catch (e) {
        console.error("Failed to create settlement flow", e);
      }
    }

    setConsumptionForm({
      adAccountId: "",
      storeId: "",
      month: new Date().toISOString().slice(0, 7),
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      currency: "USD",
      campaignName: "",
      voucher: "",
      notes: ""
    });
    setIsConsumptionModalOpen(false);
  };

  const handleDeleteConsumption = (id: string) => {
    const consumption = consumptions.find((c) => c.id === id);
    if (!consumption) return;
    
    setConfirmDialog({
      open: true,
      title: "删除消耗记录",
      message: "确定要删除这条消耗记录吗？账户余额将恢复。",
      type: "warning",
      onConfirm: async () => {
        try {
          // 恢复广告账户余额
          const updatedAccounts = adAccounts.map((a) => {
            if (a.id === consumption.adAccountId) {
              return {
                ...a,
                currentBalance: a.currentBalance + consumption.amount
              };
            }
            return a;
          });

          const updatedConsumptions = consumptions.filter((c) => c.id !== id);
          setConsumptions(updatedConsumptions);
          await saveAdConsumptions(updatedConsumptions);
          setAdAccounts(updatedAccounts);
          await saveAdAccounts(updatedAccounts);
          setConfirmDialog(null);
        } catch (e) {
          console.error("删除消耗记录失败", e);
          toast.error("操作失败，请重试");
        }
      }
    });
  };

  // 一键结算功能
  const handleSettlement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!settlementData) return;
    
    const { month, accountId, consumptions: toSettle } = settlementData;
    const account = adAccounts.find((a) => a.id === accountId);
    if (!account) {
      toast.error("账户不存在");
      return;
    }
    
    // 计算总返点金额
    const totalRebate = toSettle.reduce((sum, c) => sum + (c.estimatedRebate || 0), 0);
    
    setConfirmDialog({
      open: true,
      title: "结算返点",
      message: `确定要结算 ${month} 的返点吗？\n结算金额：${currency(totalRebate, account.currency)}\n涉及 ${toSettle.length} 条消耗记录`,
      type: "info",
      onConfirm: async () => {
        // 更新消耗记录状态为已结算
        const updatedConsumptions = consumptions.map((c) => {
          if (toSettle.some((sc) => sc.id === c.id)) {
            return {
              ...c,
              isSettled: true,
              settledAt: new Date().toISOString()
            };
          }
          return c;
        });
        
        // 更新账户余额（增加已结算返点）
        const updatedAccounts = adAccounts.map((a) => {
          if (a.id === accountId) {
            return {
              ...a,
              currentBalance: a.currentBalance + totalRebate
            };
          }
          return a;
        });
        
        // 在财务流水中生成结算记录（收入）
        if (typeof window !== "undefined") {
          try {
            const CASH_FLOW_KEY = "cashFlow";
            const storedFlow = window.localStorage.getItem(CASH_FLOW_KEY);
            const cashFlow: Array<{
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
              relatedId?: string;
              businessNumber?: string;
              status: "confirmed" | "pending";
              isReversal?: boolean;
              createdAt: string;
            }> = storedFlow ? JSON.parse(storedFlow) : [];
            
            // 更新之前的待结算记录状态为已确认
            toSettle.forEach((c) => {
              const pendingFlow = cashFlow.find((f) => f.relatedId === c.id && f.category === "运营-广告-待结算");
              if (pendingFlow) {
                pendingFlow.status = "confirmed";
                pendingFlow.summary = `广告返点已结算 - ${account.accountName} - ${month}`;
              }
            });
            
            // 生成结算记录（从银行账户收入返点）
            // 注意：这里需要选择一个银行账户来收款，可以使用账户关联的银行账户
            // 暂时使用第一个银行账户（实际应该根据业务逻辑选择）
            const bankAccount = bankAccounts.length > 0 ? bankAccounts[0] : null;
            
            if (bankAccount) {
              const settlementFlow = {
                id: crypto.randomUUID(),
                date: new Date().toISOString().slice(0, 10),
                summary: `广告返点结算 - ${account.accountName} - ${month}`,
                category: "运营-广告-已结算",
                type: "income" as const,
                amount: totalRebate, // 正数表示收入
                accountId: bankAccount.id,
                accountName: bankAccount.name,
                currency: account.currency,
                remark: `结算月份：${month} | 账户：${account.accountName} | 消耗记录数：${toSettle.length}`,
                relatedId: toSettle.map((c) => c.id).join(","), // 关联所有消耗记录ID
                businessNumber: `AD-SETTLE-${month.replace("-", "")}`,
                status: "confirmed" as const,
                isReversal: false,
                createdAt: new Date().toISOString()
              };
              
              cashFlow.push(settlementFlow);
              window.localStorage.setItem(CASH_FLOW_KEY, JSON.stringify(cashFlow));
              
              // 更新银行账户余额
              const updatedBankAccounts = bankAccounts.map((b) => {
                if (b.id === bankAccount.id) {
                  return {
                    ...b,
                    originalBalance: b.originalBalance + totalRebate,
                    rmbBalance: b.currency === "RMB" ? b.originalBalance + totalRebate : (b.originalBalance + totalRebate) * b.exchangeRate
                  };
                }
                return b;
              });
              await saveAccounts(updatedBankAccounts);
              setBankAccounts(updatedBankAccounts);
              
              console.log(`✅ 广告返点结算成功：${settlementFlow.summary}`);
            }
          } catch (e) {
            console.error("Failed to create settlement flow", e);
          }
        }
        
        // 自动生成应收款账单并推送到对账中心
        try {
          const agency = agencies.find((a) => a.id === account.agencyId);
          if (!agency) {
            console.warn("代理商不存在，无法创建应收款账单");
          } else {
            const existingBills = await getMonthlyBills();
            // 查找同一代理商、同一账户、同一月份、类型为"广告返点"的草稿账单
            const existingBill = existingBills.find(
              (b) => 
                b.month === month && 
                b.billType === "广告返点" && // 必须是广告返点账单
                b.billCategory === "Receivable" && // 必须是应收款
                b.agencyId === account.agencyId && // 同一代理商
                b.adAccountId === account.id && // 同一广告账户
                b.currency === (agency.settlementCurrency || account.currency) && // 使用结算币种
                b.status === "Draft" // 只合并草稿状态的账单
            );

            // 计算消耗总额（用于账单明细）
            const totalConsumption = toSettle.reduce((sum, c) => sum + (c.amount || 0), 0);
            const settlementCurrency = agency.settlementCurrency || account.currency || "USD";

            if (existingBill) {
              // 更新现有账单：添加消耗记录ID和返点金额
              const updatedConsumptionIds = [...(existingBill.consumptionIds || []), ...toSettle.map((c) => c.id)];
              const newRebateAmount = (existingBill.rebateAmount || 0) + totalRebate; // 累计返点金额
              const newTotalAmount = (existingBill.totalAmount || 0) + totalConsumption; // 累计消耗总额
              const updatedBill: MonthlyBill = {
                ...existingBill,
                billCategory: "Receivable" as const, // 确保是应收款
                billType: "广告返点" as const, // 确保是广告返点
                consumptionIds: updatedConsumptionIds,
                totalAmount: newTotalAmount, // 消耗总额（账单明细）
                rebateAmount: newRebateAmount, // 返点总额（应收金额）
                netAmount: newRebateAmount, // 净应收金额 = 返点总额
                currency: settlementCurrency as "USD" | "CNY" | "HKD", // 使用结算币种
                accountName: account.accountName, // 更新账户名称（可能已变更）
                agencyName: agency.name // 更新代理商名称（可能已变更）
              };
              
              const updatedBills = existingBills.map((b) => 
                b.id === existingBill.id ? updatedBill : b
              );
              await saveMonthlyBills(updatedBills);
              console.log(`✅ 已更新应收款账单：${updatedBill.id}，添加返点记录`);
            } else {
              // 创建新应收款账单：基于返点结算生成
              const newBill: MonthlyBill = {
                id: `bill-rebate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                month,
                billCategory: "Receivable" as const, // 应收款
                billType: "广告返点" as const, // 广告返点
                agencyId: account.agencyId,
                agencyName: agency.name,
                adAccountId: account.id,
                accountName: account.accountName,
                totalAmount: totalConsumption, // 消耗总额（账单明细）
                currency: settlementCurrency as "USD" | "CNY" | "HKD", // 结算币种
                rebateAmount: totalRebate, // 返点总额（应收金额）
                netAmount: totalRebate, // 净应收金额 = 返点总额
                consumptionIds: toSettle.map((c) => c.id), // 关联的消耗记录ID列表
                status: "Draft", // 初始状态为草稿
                createdBy: "系统", // 实际应该从用户系统获取
                createdAt: new Date().toISOString(),
                notes: `自动生成：广告账户 ${account.accountName} ${month} 返点应收款账单`
              };
              
              const updatedBills = [...existingBills, newBill];
              await saveMonthlyBills(updatedBills);
              console.log(`✅ 已生成应收款账单并推送到对账中心：${newBill.id}`);
            }
          }
        } catch (e) {
          console.error("Failed to create/update receivable bill for rebate settlement", e);
          // 不阻止结算流程，只记录错误
        }
        
        try {
          setConsumptions(updatedConsumptions);
          await saveAdConsumptions(updatedConsumptions);
          setAdAccounts(updatedAccounts);
          await saveAdAccounts(updatedAccounts);
          
          setIsSettlementModalOpen(false);
          setSettlementData(null);
          setConfirmDialog(null);
        } catch (e) {
          console.error("保存结算数据失败", e);
          toast.error("结算失败，请重试");
        }
        
        toast.success(
          `结算成功！结算金额：${currency(totalRebate, account.currency)}，涉及 ${toSettle.length} 条消耗记录`,
          {
            icon: "✅",
            duration: 4000,
          }
        );
      }
    });
  };


  // 避免 hydration 错误：只在客户端挂载后显示数据
  if (!mounted) {
    return (
      <div className="space-y-4">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">广告代理管理</h1>
            <p className="mt-1 text-sm text-slate-400">管理广告代理商、账户和消耗记录</p>
          </div>
        </header>
        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">广告代理管理</h1>
          <p className="mt-1 text-sm text-slate-400">管理广告代理商、账户和消耗记录</p>
        </div>
      </header>

      {/* 标签页导航 */}
      <div className="flex gap-4 border-b border-slate-800">
        {[
          { id: "dashboard" as const, label: "数据看板" },
          { id: "agencies" as const, label: "代理商管理" },
          { id: "accounts" as const, label: "广告账户" },
          { id: "consumptions" as const, label: "消耗记录" },
          { id: "recharges" as const, label: "充值历史" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-base font-semibold transition-colors ${
              activeTab === tab.id
                ? "text-white border-b-2 border-primary-500"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 数据看板 */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          {/* 过滤器 */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="space-y-3">
              {/* 快速切换按钮 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400">快速切换：</span>
                <button
                  onClick={() => handleQuickFilter("current")}
                  disabled={isFilterLoading}
                  className={`px-3 py-1.5 text-xs rounded-md border transition ${
                    filterMonth === monthOptions[0]?.value
                      ? "bg-primary-500/20 border-primary-500 text-primary-300"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-700"
                  } ${isFilterLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  本月
                </button>
                <button
                  onClick={() => handleQuickFilter("last")}
                  disabled={isFilterLoading}
                  className={`px-3 py-1.5 text-xs rounded-md border transition ${
                    filterMonth === monthOptions[1]?.value
                      ? "bg-primary-500/20 border-primary-500 text-primary-300"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-700"
                  } ${isFilterLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  上月
                </button>
                <button
                  onClick={() => handleQuickFilter("quarter")}
                  disabled={isFilterLoading}
                  className={`px-3 py-1.5 text-xs rounded-md border transition ${
                    (() => {
                      if (!filterMonth) return false;
                      const now = new Date();
                      const currentQuarter = Math.floor(now.getMonth() / 3);
                      const quarterStartMonth = currentQuarter * 3 + 1;
                      const expectedMonth = `${now.getFullYear()}-${String(quarterStartMonth).padStart(2, "0")}`;
                      return filterMonth === expectedMonth;
                    })()
                      ? "bg-primary-500/20 border-primary-500 text-primary-300"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-700"
                  } ${isFilterLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  本季度
                </button>
                <button
                  onClick={() => handleQuickFilter("all")}
                  disabled={isFilterLoading}
                  className={`px-3 py-1.5 text-xs rounded-md border transition ${
                    filterMonth === ""
                      ? "bg-primary-500/20 border-primary-500 text-primary-300"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-700"
                  } ${isFilterLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  全年
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-slate-500">Base Currency:</span>
                  <span className="text-xs font-medium text-emerald-400">USD</span>
                </div>
              </div>

              {/* 主要筛选器 */}
              <div className="flex items-end gap-4 flex-wrap">
                {/* 月份筛选 */}
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-slate-400 mb-1.5">月份</label>
                  <div className="relative">
                    <select
                      value={filterMonth}
                      onChange={(e) => {
                        setIsFilterLoading(true);
                        setFilterMonth(e.target.value);
                        setTimeout(() => setIsFilterLoading(false), 300);
                      }}
                      disabled={isFilterLoading}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">全部</option>
                      {monthOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {isFilterLoading && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 国家筛选 */}
                <div className="min-w-[150px]">
                  <label className="block text-xs text-slate-400 mb-1.5">国家</label>
                  <select
                    value={filterCountry}
                    onChange={(e) => {
                      setIsFilterLoading(true);
                      setFilterCountry(e.target.value);
                      setTimeout(() => setIsFilterLoading(false), 300);
                    }}
                    disabled={isFilterLoading}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="all">全部</option>
                    {COUNTRIES.filter((c) => c.code !== "GLOBAL").map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 代理商筛选 */}
                <div className="min-w-[150px]">
                  <label className="block text-xs text-slate-400 mb-1.5">代理商</label>
                  <select
                    value={filterAgency}
                    onChange={(e) => {
                      setIsFilterLoading(true);
                      setFilterAgency(e.target.value);
                      setTimeout(() => setIsFilterLoading(false), 300);
                    }}
                    disabled={isFilterLoading}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="all">全部</option>
                    {agencies.map((agency) => (
                      <option key={agency.id} value={agency.id}>
                        {agency.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 店铺筛选 */}
                <div className="min-w-[150px]">
                  <label className="block text-xs text-slate-400 mb-1.5">店铺</label>
                  <select
                    value={filterStore}
                    onChange={(e) => {
                      setIsFilterLoading(true);
                      setFilterStore(e.target.value);
                      setTimeout(() => setIsFilterLoading(false), 300);
                    }}
                    disabled={isFilterLoading}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="all">全部</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 清除筛选按钮 */}
                {(filterMonth || filterCountry !== "all" || filterAgency !== "all" || filterStore !== "all") && (
                  <button
                    onClick={() => {
                      setIsFilterLoading(true);
                      setFilterMonth("");
                      setFilterCountry("all");
                      setFilterAgency("all");
                      setFilterStore("all");
                      setTimeout(() => setIsFilterLoading(false), 300);
                    }}
                    disabled={isFilterLoading}
                    className="px-4 py-1.5 text-sm text-slate-300 hover:text-slate-100 border border-slate-700 rounded-md hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    清除筛选
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 核心指标卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">累计充值额</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalRecharge,
                      dashboardStats.rechargeCurrency || dashboardStats.baseCurrency || "USD",
                      "income"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">所有充值记录汇总</p>
                </div>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">总实际消耗</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalConsumption,
                      dashboardStats.consumptionCurrency || dashboardStats.baseCurrency || "USD",
                      "expense"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">所有广告账户消耗汇总</p>
                </div>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">总账户余额</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalAccountBalance,
                      dashboardStats.accountBalanceCurrency || "USD",
                      "balance"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">所有广告账户余额总和</p>
                </div>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">已结算金额</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalSettledConsumption || 0,
                      dashboardStats.settledConsumptionCurrency || dashboardStats.baseCurrency || "USD",
                      "expense"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">已结算的消耗金额</p>
                </div>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">未结算金额</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalPendingSettlement,
                      dashboardStats.pendingSettlementCurrency || dashboardStats.baseCurrency || "USD",
                      "expense"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">已消耗但尚未支付</p>
                </div>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">总返点金额</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalRebateAmount,
                      dashboardStats.rebateCurrency || dashboardStats.baseCurrency || "USD",
                      "income"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">累计充值额 × 返点率</p>
                </div>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">已返点金额</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalSettledRebateAmount,
                      dashboardStats.rebateCurrency || dashboardStats.baseCurrency || "USD",
                      "income"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">已结算的返点金额</p>
                </div>
              </div>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">未返点金额</p>
                  <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatCurrency(
                      dashboardStats.totalUnsettledRebateAmount,
                      dashboardStats.rebateCurrency || dashboardStats.baseCurrency || "USD",
                      "income"
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">总返点 - 已返点</p>
                </div>
              </div>
            </div>
          </div>

          {/* 可视化图表 */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* 国家占比饼图 */}
            <div className="rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-sm p-4 shadow-glow-blue">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">国家占比分布</h3>
              {dashboardStats.countrySpendData.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p className="text-sm">暂无国家数据</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={dashboardStats.countrySpendData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {dashboardStats.countrySpendData.map((entry, index) => {
                        const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00ff00", "#0088fe", "#ff00ff", "#00ffff"];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined) => {
                        if (value === undefined) return "";
                        const symbol = dashboardStats.baseCurrency === "USD" ? "$" : "¥";
                        return `${symbol} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
                      }}
                      contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 店铺消耗条形图 */}
            <div className="rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-sm p-4 shadow-glow-blue">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">店铺消耗排行</h3>
              {dashboardStats.storeSpendData.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <p className="text-sm">暂无店铺数据</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dashboardStats.storeSpendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number | undefined) => {
                        if (value === undefined) return "";
                        const symbol = dashboardStats.baseCurrency === "USD" ? "$" : "¥";
                        return `${symbol} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
                      }}
                      contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }}
                    />
                    <Bar dataKey="amount" fill="#8884d8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 月度趋势图 */}
          {dashboardStats.monthlyTrendData.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-sm p-4 shadow-glow-blue">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">月度消耗趋势（过去6个月）</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardStats.monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                  />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number | undefined) => {
                      if (value === undefined) return "";
                      const symbol = dashboardStats.baseCurrency === "USD" ? "$" : "¥";
                      return `${symbol} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
                    }}
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#8884d8" strokeWidth={2} dot={{ fill: "#8884d8", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 各广告账户金额详细图表 */}
          {dashboardStats.accountDetailData.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-sm p-4 shadow-glow-blue">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">各广告账户金额详细</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={dashboardStats.accountDetailData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis 
                    dataKey="accountName" 
                    type="category" 
                    width={150}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number | undefined, name: string | undefined) => {
                      if (value === undefined) return "";
                      const symbol = "$";
                      return [`${symbol} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`, name || ""];
                    }}
                    contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#e2e8f0" }}
                  />
                  <Legend />
                  <Bar dataKey="totalRecharge" stackId="a" fill="#82ca9d" name="累计充值" />
                  <Bar dataKey="settledConsumption" stackId="b" fill="#8884d8" name="已结算消耗" />
                  <Bar dataKey="pendingConsumption" stackId="b" fill="#ffc658" name="未结算消耗" />
                  <Bar dataKey="balance" stackId="c" fill="#00ff00" name="账户余额" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 代理商管理 */}
      {activeTab === "agencies" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">代理商列表</h2>
              <p className="text-sm text-slate-400 mt-1">管理广告代理商信息、返点配置和账期规则</p>
            </div>
            <button
              onClick={() => {
                setEditAgency(null);
                setAgencyForm({ 
                  name: "", 
                  platform: "TikTok", 
                  rebateRate: "", 
                  rebatePeriod: "月",
                  settlementCurrency: "USD",
                  creditTerm: "",
                  contact: "", 
                  phone: "", 
                  notes: "" 
                });
                setIsAgencyModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
            >
              + 新增代理商
            </button>
          </div>

          {agencies.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
              <p className="text-slate-400">
                暂无代理商，请点击右上角「新增代理商」开始添加
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">代理商名称</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">平台</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">结算币种</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">返点比例</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">返点周期</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">账期规则</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">联系人</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">总充值金额</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">消耗金额</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">返点</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">账户剩余金额</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {agencies.map((agency) => {
                    // 计算该代理商的统计数据
                    const agencyAccounts = adAccounts.filter((acc) => acc.agencyId === agency.id);
                    
                    // 总充值金额：该代理商下所有账户的充值总额
                    const agencyRecharges = recharges.filter((r) => 
                      agencyAccounts.some((acc) => acc.id === r.adAccountId)
                    );
                    const totalRechargeByCurrency: Record<string, number> = {};
                    agencyRecharges.forEach((r) => {
                      const currency = r.currency || "USD";
                      totalRechargeByCurrency[currency] = (totalRechargeByCurrency[currency] || 0) + r.amount;
                    });
                    // 优先显示 USD，如果没有则显示第一个币种
                    const mainRechargeCurrency = totalRechargeByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalRechargeByCurrency)[0] || "USD";
                    const totalRecharge = totalRechargeByCurrency[mainRechargeCurrency] || 0;
                    
                    // 消耗金额：该代理商下所有账户的消耗总额
                    const agencyConsumptions = consumptions.filter((c) => 
                      agencyAccounts.some((acc) => acc.id === c.adAccountId)
                    );
                    const totalConsumptionByCurrency: Record<string, number> = {};
                    agencyConsumptions.forEach((c) => {
                      const currency = c.currency || "USD";
                      totalConsumptionByCurrency[currency] = (totalConsumptionByCurrency[currency] || 0) + (c.amount || 0);
                    });
                    // 优先显示 USD，如果没有则显示第一个币种
                    const mainConsumptionCurrency = totalConsumptionByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalConsumptionByCurrency)[0] || "USD";
                    const totalConsumption = totalConsumptionByCurrency[mainConsumptionCurrency] || 0;
                    
                    // 返点：该代理商下所有账户的返点总额 = 充值金额 * 返点比例
                    const rebateRate = agency.rebateConfig?.rate || agency.rebateRate || 0;
                    const totalRebateByCurrency: Record<string, number> = {};
                    agencyRecharges.forEach((r) => {
                      const currency = r.currency || "USD";
                      const rebate = (r.amount * rebateRate) / 100;
                      totalRebateByCurrency[currency] = (totalRebateByCurrency[currency] || 0) + rebate;
                    });
                    // 优先显示 USD，如果没有则显示第一个币种
                    const mainRebateCurrency = totalRebateByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalRebateByCurrency)[0] || "USD";
                    const totalRebate = totalRebateByCurrency[mainRebateCurrency] || 0;
                    
                    // 账户剩余金额：该代理商下所有账户的余额总和（只统计正数余额，负数表示透支）
                    const totalBalanceByCurrency: Record<string, number> = {};
                    agencyAccounts.forEach((acc) => {
                      const currency = acc.currency || "USD";
                      const balance = Math.max(0, acc.currentBalance || 0); // 只统计正数余额
                      if (balance > 0) {
                        totalBalanceByCurrency[currency] = (totalBalanceByCurrency[currency] || 0) + balance;
                      }
                    });
                    // 优先显示 USD，如果没有则显示第一个币种
                    const mainBalanceCurrency = totalBalanceByCurrency["USD"] !== undefined ? "USD" : Object.keys(totalBalanceByCurrency)[0] || "USD";
                    const totalBalance = totalBalanceByCurrency[mainBalanceCurrency] || 0;
                    
                    return (
                      <tr key={agency.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-100 font-medium">{agency.name}</td>
                        <td className="px-4 py-3 text-slate-300">{agency.platform}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {agency.settlementCurrency || "-"}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-300 font-medium">
                          {agency.rebateConfig?.rate || agency.rebateRate}%
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {agency.rebateConfig?.period || "月"}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {agency.creditTerm || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{agency.contact || "-"}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(totalRecharge, mainRechargeCurrency as "USD" | "CNY" | "HKD", "income")}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(totalConsumption, mainConsumptionCurrency as "USD" | "RMB" | "EUR" | "GBP" | "JPY", "expense")}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-300">
                          {formatCurrency(totalRebate, mainRebateCurrency as "USD" | "RMB" | "EUR" | "GBP" | "JPY", "income")}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(totalBalance, mainBalanceCurrency as "USD" | "RMB" | "EUR" | "GBP" | "JPY", "balance")}
                        </td>
                        <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleEditAgency(agency)}
                            className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeleteAgency(agency.id)}
                            className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 广告账户 */}
      {activeTab === "accounts" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">广告账户列表</h2>
              <p className="text-sm text-slate-400 mt-1">管理广告账户余额、授信额度和账户信息</p>
            </div>
            <button
              onClick={() => {
                setEditAccount(null);
                setAccountForm({
                  agencyId: "",
                  accountName: "",
                  currentBalance: "",
                  creditLimit: "",
                  currency: "USD",
                  country: "",
                  notes: ""
                });
                setIsAccountModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
            >
              + 新增广告账户
            </button>
          </div>

          {adAccounts.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
              <p className="text-slate-400">
                暂无广告账户，请点击右上角「新增广告账户」开始添加
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">账户名称</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">代理商</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">国家</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">可用余额</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">待结返点</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">授信额度</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {adAccounts.map((account) => {
                    // 计算该账户的统计信息
                    const accountConsumptions = consumptions.filter((c) => c.adAccountId === account.id);
                    const totalConsumption = accountConsumptions.reduce((sum, c) => sum + c.amount, 0);
                    const totalEstimatedRebate = accountConsumptions.reduce((sum, c) => sum + (c.estimatedRebate || 0), 0);
                    const settledRebates = accountConsumptions
                      .filter((c) => c.isSettled)
                      .reduce((sum, c) => sum + (c.estimatedRebate || 0), 0);
                    const pendingRebates = totalEstimatedRebate - settledRebates;
                    
                    // 从充值记录中统计该账户的实付充值（不含返点）
                    const accountRecharges = recharges.filter((r) => r.adAccountId === account.id);
                    const totalRecharge = accountRecharges.reduce((sum, r) => sum + r.amount, 0);
                    
                    // 从财务流水中统计该账户的已结算返点（用于余额计算）
                    let totalSettledRebate = 0;
                    if (typeof window !== "undefined") {
                      try {
                        const CASH_FLOW_KEY = "cashFlow";
                        const storedFlow = window.localStorage.getItem(CASH_FLOW_KEY);
                        if (storedFlow) {
                          const cashFlow: Array<{
                            type: "income" | "expense";
                            category: string;
                            amount: number;
                            relatedId?: string;
                            status?: string;
                            isReversal?: boolean;
                          }> = JSON.parse(storedFlow);
                          
                          cashFlow.forEach((flow) => {
                            if (
                              flow.category === "运营-广告-已结算" &&
                              flow.type === "income" &&
                              !flow.isReversal &&
                              (flow.status === "confirmed" || !flow.status) &&
                              flow.relatedId
                            ) {
                              const consumption = accountConsumptions.find((c) => c.id === flow.relatedId);
                              if (consumption && consumption.isSettled) {
                                totalSettledRebate += Math.abs(flow.amount);
                              }
                            }
                          });
                        }
                      } catch (e) {
                        console.error("Failed to parse cash flow for balance calculation", e);
                      }
                    }
                    
                    // 计算当前余额：累计实付充值 - 累计消耗 + 已结算返点（返点不计入余额，但已结算的返点会回到账户）
                    const calculatedBalance = totalRecharge - totalConsumption + totalSettledRebate;
                    // 待结返点 = 账户的应收返点字段
                    const rebateReceivable = account.rebateReceivable || 0;
                    
                    // 按月份分组未结算的消耗记录
                    const consumptionsByMonth: Record<string, AdConsumption[]> = {};
                    accountConsumptions
                      .filter((c) => !c.isSettled)
                      .forEach((c) => {
                        if (!consumptionsByMonth[c.month]) {
                          consumptionsByMonth[c.month] = [];
                        }
                        consumptionsByMonth[c.month].push(c);
                      });
                    
                    return (
                      <tr key={account.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-100 font-medium">{account.accountName}</td>
                        <td className="px-4 py-3 text-slate-300">{account.agencyName}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {account.country ? (getCountryByCode(account.country)?.name || account.country) : <span className="text-slate-500">-</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{account.currency}</td>
                        <td className="px-4 py-3 text-right">
                          <div className={`font-medium ${calculatedBalance >= 0 ? "text-blue-300" : "text-rose-400"}`}>
                            {formatCurrency(calculatedBalance, account.currency, "balance")}
                            {calculatedBalance < 0 && (
                              <span className="ml-1 text-xs text-rose-400/70" title="账户已透支">
                                (透支)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {rebateReceivable > 0 ? (
                            <div className="flex items-center justify-end gap-1">
                              <span className="font-medium text-amber-400">
                                {formatCurrency(rebateReceivable, account.currency, "balance")}
                              </span>
                              <span 
                                className="cursor-help text-amber-400 text-xs" 
                                title="返点为应收账款，后续需独立收回，不计入账户现金余额"
                              >
                                ℹ️
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300">
                          {formatCurrency(account.creditLimit, account.currency, "balance")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setRechargeAccount(account);
                                setRechargeForm({
                                  amount: "",
                                  currency: "USD", // 默认美元
                                  date: new Date().toISOString().slice(0, 10),
                                  voucher: "", // 充值凭证
                                  notes: ""
                                });
                                setAmountError(false);
                                setPreviewKey(0);
                                setIsRechargeModalOpen(true);
                              }}
                              className="px-2 py-1 rounded border border-blue-500/40 bg-blue-500/10 text-xs text-blue-100 hover:bg-blue-500/20"
                              title="充值"
                            >
                              💵 充值
                            </button>
                            {Object.keys(consumptionsByMonth).length > 0 && (
                              <button
                                onClick={() => {
                                  // 显示月份选择弹窗
                                  const months = Object.keys(consumptionsByMonth).sort().reverse();
                                  const selectedMonth = months[0]; // 默认选择最早的未结算月份
                                  setSettlementData({
                                    month: selectedMonth,
                                    accountId: account.id,
                                    consumptions: consumptionsByMonth[selectedMonth]
                                  });
                                  setIsSettlementModalOpen(true);
                                }}
                                className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-100 hover:bg-emerald-500/20"
                                title="一键结算"
                              >
                                💰 结算
                              </button>
                            )}
                            <button
                              onClick={() => handleEditAccount(account)}
                              className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(account.id)}
                              className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 消耗记录 */}
      {activeTab === "consumptions" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">消耗记录</h2>
              <p className="text-sm text-slate-400 mt-1">记录和管理广告账户的消耗明细</p>
            </div>
            <button
              onClick={() => {
                  setConsumptionForm({
                    adAccountId: "",
                    storeId: "",
                    month: new Date().toISOString().slice(0, 7),
                    date: new Date().toISOString().slice(0, 10),
                    amount: "",
                    currency: "USD",
                    campaignName: "",
                    voucher: "",
                    notes: ""
                  });
                setIsConsumptionModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
            >
              + 新增消耗记录
            </button>
          </div>

          {consumptions.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
              <p className="text-slate-400">
                暂无消耗记录，请点击右上角「新增消耗记录」开始添加
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">日期</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">账户名称</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">关联店铺</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">消耗金额</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">预估返点</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">预计付款日期</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">返点到账日期</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">结算状态</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">凭证</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {consumptions
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((consumption) => (
                      <tr key={consumption.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-300">{consumption.month || "-"}</td>
                        <td className="px-4 py-3 text-slate-300">{consumption.date}</td>
                        <td className="px-4 py-3 text-slate-100">{consumption.accountName}</td>
                        <td className="px-4 py-3 text-slate-300">{consumption.storeName || "-"}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(consumption.amount, consumption.currency || "USD", "expense")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {consumption.estimatedRebate ? formatCurrency(consumption.estimatedRebate, consumption.currency || "USD", "income") : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {consumption.dueDate || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs">
                          {consumption.rebateDueDate || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{consumption.currency}</td>
                        <td className="px-4 py-3 text-center">
                          {consumption.isSettled ? (
                            <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              已结算
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              待结算
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {consumption.voucher && consumption.voucher.length > 10 ? (
                            <button
                              onClick={() => setVoucherViewModal(consumption.voucher || null)}
                              className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                            >
                              查看
                            </button>
                          ) : (
                            <span className="text-slate-500 text-xs">无</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteConsumption(consumption.id)}
                            className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 充值历史 */}
      {activeTab === "recharges" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">充值历史</h2>
            <p className="text-sm text-slate-400 mt-1">查看所有广告账户的充值记录和返点明细</p>
          </div>
          {recharges.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
              <p className="text-slate-400">暂无充值记录</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">日期</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">月份</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">账户名称</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">国家</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">代理商</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">充值金额</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">返点金额</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">币种</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">付款状态</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">凭证</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">备注</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-300">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recharges
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((recharge) => (
                      <tr key={recharge.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-300">{recharge.date}</td>
                        <td className="px-4 py-3 text-slate-300">{recharge.month || "-"}</td>
                        <td className="px-4 py-3 text-slate-100 font-medium">{recharge.accountName}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {(() => {
                            const account = adAccounts.find((a) => a.id === recharge.adAccountId);
                            return account?.country ? getCountryByCode(account.country)?.name || account.country : "-";
                          })()}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{recharge.agencyName || "-"}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(recharge.amount, recharge.currency, "income")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {recharge.rebateAmount ? formatCurrency(recharge.rebateAmount, recharge.currency, "income") : "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{recharge.currency}</td>
                        <td className="px-4 py-3 text-center">
                          {recharge.paymentStatus === "Pending" ? (
                            <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              待付款
                            </span>
                          ) : recharge.paymentStatus === "Paid" ? (
                            <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              已付款
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              已取消
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {recharge.voucher ? (
                            <button
                              onClick={() => setVoucherViewModal(recharge.voucher || null)}
                              className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                            >
                              查看
                            </button>
                          ) : (
                            <span className="text-slate-500 text-xs">无</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-xs truncate">
                          {recharge.notes || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteRecharge(recharge.id)}
                            className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 充值表单弹窗 */}
      {isRechargeModalOpen && rechargeAccount && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm" style={{ zIndex: 50 }}>
          <div className="bg-[#0B0C10]/90 backdrop-blur-xl rounded-xl border border-cyan-500/20 p-6 w-full max-w-md shadow-[0_0_40px_rgba(6,182,212,0.2)] modal-enter" style={{ position: "relative", zIndex: 51 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">充值 - {rechargeAccount.accountName}</h2>
              <button
                onClick={() => {
                  setIsRechargeModalOpen(false);
                  setRechargeAccount(null);
                  setRechargeForm({
                    amount: "",
                    currency: "USD",
                    date: new Date().toISOString().slice(0, 10),
                    voucher: "",
                    notes: ""
                  });
                  setAmountError(false);
                  setPreviewKey(0);
                }}
                className="text-slate-400 hover:text-slate-200 transition-colors duration-200"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateRecharge} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">充值货币 *</label>
                <select
                  value={rechargeForm.currency}
                  onChange={(e) => setRechargeForm((f) => ({ ...f, currency: e.target.value as "USD" | "CNY" | "HKD" }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                >
                  <option value="USD">USD (美元)</option>
                  <option value="CNY">CNY (人民币)</option>
                  <option value="HKD">HKD (港币)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">充值金额 *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    {rechargeForm.currency === "USD" ? "$" : rechargeForm.currency === "CNY" ? "¥" : "HK$"}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={rechargeForm.amount}
                    onChange={(e) => {
                      const value = e.target.value;
                      setRechargeForm((f) => ({ ...f, amount: value }));
                      const numValue = Number(value);
                      const hasError = value !== "" && (isNaN(numValue) || numValue <= 0);
                      setAmountError(hasError);
                      if (!hasError && value !== "") {
                        setPreviewKey((prev) => prev + 1); // 触发数值跳动
                      }
                    }}
                    onBlur={(e) => {
                      const numValue = Number(e.target.value);
                      const hasError = e.target.value !== "" && (isNaN(numValue) || numValue <= 0);
                      setAmountError(hasError);
                    }}
                    className={`w-full rounded-md border pl-8 pr-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300 ${
                      amountError 
                        ? "border-rose-500 bg-slate-900/50 error" 
                        : "border-white/10 bg-slate-900/50"
                    }`}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">充值日期 *</label>
                <input
                  type="date"
                  lang="zh-CN"
                  value={rechargeForm.date}
                  onChange={(e) => setRechargeForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300 cursor-pointer"
                  style={{
                    colorScheme: "dark",
                    position: "relative",
                    zIndex: 10
                  }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">充值凭证 *</label>
                <ImageUploader
                  value={rechargeForm.voucher || ""}
                  onChange={(value) => {
                    // ImageUploader 在单图模式下（maxImages=1, multiple=false）返回字符串
                    // 在多图模式下返回数组
                    const voucherValue = typeof value === "string" ? value : (Array.isArray(value) ? value[0] || "" : "");
                    console.log("凭证更新:", voucherValue ? `${voucherValue.substring(0, 50)}...` : "空");
                    setRechargeForm((f) => ({ ...f, voucher: voucherValue }));
                  }}
                  maxImages={1}
                  multiple={false}
                />
                <p className="text-xs text-slate-400 mt-1">请上传充值凭证（如转账截图、支付凭证等）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
                <textarea
                  value={rechargeForm.notes}
                  onChange={(e) => setRechargeForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  placeholder="可选备注信息"
                />
              </div>
              {(() => {
                const agency = agencies.find((a) => a.id === rechargeAccount.agencyId);
                const rebateRate = agency?.rebateConfig?.rate || agency?.rebateRate || 0;
                const amount = Number(rechargeForm.amount) || 0;
                const rebateAmount = rebateRate > 0 ? (amount * rebateRate) / 100 : 0;
                const currentBalance = rechargeAccount.currentBalance || 0;
                const currentRebateReceivable = rechargeAccount.rebateReceivable || 0;
                const newBalance = currentBalance + amount; // 只增加实付金额，返点不计入余额
                const newRebateReceivable = currentRebateReceivable + rebateAmount; // 返点计入应收
                
                if (amount <= 0) return null;
                
                // 格式化金额函数（避免显示 [object Object]）
                const formatAmount = (val: number, curr: string) => {
                  const symbol = curr === "USD" ? "$" : curr === "CNY" ? "¥" : "HK$";
                  return `${symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };
                
                return (
                  <div key={previewKey} className="rounded-lg bg-slate-900/40 backdrop-blur-md border border-white/10 p-5 space-y-3 shadow-glow-blue">
                    {/* 实付金额 */}
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 text-sm">实付金额（本金）：</span>
                      <span className={`text-[#00E5FF] font-bold text-lg number-preview`}>
                        {formatAmount(amount, rechargeForm.currency)}
                      </span>
                    </div>
                    
                    {/* 返点信息 */}
                    {rebateRate > 0 && rebateAmount > 0 && (
                      <>
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-300 text-sm flex items-center gap-1">
                              待结返点（应收账款）
                              <span className="text-xs text-amber-400/80">ℹ️</span>
                            </span>
                            <span className="text-xs text-slate-500 leading-tight">
                              返点不计入账户余额，将作为应收账款独立核算
                            </span>
                          </div>
                          <span className={`text-amber-400 font-bold text-base number-preview`}>
                            {formatAmount(rebateAmount, rechargeForm.currency)}
                          </span>
                        </div>
                        <div className="border-t border-white/10 pt-3"></div>
                      </>
                    )}
                    
                    {/* 当前状态 */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-xs">当前可用余额：</span>
                        <span className="text-slate-100 font-medium text-sm">
                          {formatAmount(currentBalance, rechargeAccount.currency)}
                        </span>
                      </div>
                      {currentRebateReceivable > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">当前待结返点：</span>
                          <span className="text-amber-400 font-medium text-sm">
                            {formatAmount(currentRebateReceivable, rechargeAccount.currency)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 充值后状态 */}
                    <div className="border-t border-cyan-500/20 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300 font-medium text-sm">充值后可用余额：</span>
                        <span className={`text-[#00E5FF] font-bold text-xl number-preview`}>
                          {formatAmount(newBalance, rechargeAccount.currency)}
                        </span>
                      </div>
                      {rebateRate > 0 && rebateAmount > 0 && (
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-slate-300 font-medium text-sm">充值后待结返点：</span>
                          <span className={`text-amber-400 font-bold text-base number-preview`}>
                            {formatAmount(newRebateReceivable, rechargeAccount.currency)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRechargeModalOpen(false);
                    setRechargeAccount(null);
                    setRechargeForm({
                      amount: "",
                      currency: "USD",
                      date: new Date().toISOString().slice(0, 10),
                      voucher: "",
                      notes: ""
                    });
                  }}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={amountError || !rechargeForm.amount || Number(rechargeForm.amount) <= 0}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#00E5FF] via-[#3D5AFE] to-[#00E5FF] text-slate-900 font-bold hover:shadow-[0_0_20px_rgba(0,150,255,0.4)] transition-all duration-300 shadow-[0_0_20px_rgba(0,150,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[0_0_20px_rgba(0,150,255,0.3)]"
                >
                  确认充值
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 代理商表单弹窗 */}
      {isAgencyModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{editAgency ? "编辑代理商" : "新增代理商"}</h2>
              <button
                onClick={() => {
                  setIsAgencyModalOpen(false);
                  setEditAgency(null);
                  setAgencyForm({ 
                    name: "", 
                    platform: "TikTok", 
                    rebateRate: "", 
                    rebatePeriod: "月",
                    settlementCurrency: "USD",
                    creditTerm: "",
                    contact: "", 
                    phone: "", 
                    notes: "" 
                  });
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <form onSubmit={editAgency ? handleUpdateAgency : handleCreateAgency} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">代理商名称 *</label>
                <input
                  type="text"
                  value={agencyForm.name}
                  onChange={(e) => setAgencyForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">平台 *</label>
                <select
                  value={agencyForm.platform}
                  onChange={(e) => setAgencyForm((f) => ({ ...f, platform: e.target.value as Agency["platform"] }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                >
                  <option value="FB">Facebook</option>
                  <option value="Google">Google</option>
                  <option value="TikTok">TikTok</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">返点比例 (%) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={agencyForm.rebateRate}
                    onChange={(e) => setAgencyForm((f) => ({ ...f, rebateRate: e.target.value }))}
                    className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">返点周期 *</label>
                  <select
                    value={agencyForm.rebatePeriod}
                    onChange={(e) => setAgencyForm((f) => ({ ...f, rebatePeriod: e.target.value as "月" | "季" }))}
                    className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  >
                    <option value="月">月度</option>
                    <option value="季">季度</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">结算币种</label>
                <select
                  value={agencyForm.settlementCurrency}
                  onChange={(e) => setAgencyForm((f) => ({ ...f, settlementCurrency: e.target.value as "USD" | "CNY" }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">账期规则</label>
                <input
                  type="text"
                  value={agencyForm.creditTerm}
                  onChange={(e) => setAgencyForm((f) => ({ ...f, creditTerm: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  placeholder="例如：本月消耗，次月第15天结算"
                />
                <div className="text-xs text-slate-500 mt-1">
                  格式：本月消耗，次月第X天结算（X为1-31之间的数字）
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">联系人</label>
                <input
                  type="text"
                  value={agencyForm.contact}
                  onChange={(e) => setAgencyForm((f) => ({ ...f, contact: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">联系电话</label>
                <input
                  type="text"
                  value={agencyForm.phone}
                  onChange={(e) => setAgencyForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
                <textarea
                  value={agencyForm.notes}
                  onChange={(e) => setAgencyForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                  setIsAgencyModalOpen(false);
                  setEditAgency(null);
                  setAgencyForm({ 
                    name: "", 
                    platform: "TikTok", 
                    rebateRate: "", 
                    rebatePeriod: "月",
                    settlementCurrency: "USD",
                    creditTerm: "",
                    contact: "", 
                    phone: "", 
                    notes: "" 
                  });
                  }}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-[#00E5FF] text-slate-900 font-semibold hover:bg-[#00B8CC] transition-all duration-200 shadow-lg shadow-[#00E5FF]/20"
                >
                  {editAgency ? "更新" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 广告账户表单弹窗 */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{editAccount ? "编辑广告账户" : "新增广告账户"}</h2>
              <button
                onClick={() => {
                  setIsAccountModalOpen(false);
                  setEditAccount(null);
                  setAccountForm({
                    agencyId: "",
                    accountName: "",
                    currentBalance: "",
                    creditLimit: "",
                    currency: "USD",
                    country: "",
                    notes: ""
                  });
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <form onSubmit={editAccount ? handleUpdateAccount : handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">代理商 *</label>
                <select
                  value={accountForm.agencyId}
                  onChange={(e) => setAccountForm((f) => ({ ...f, agencyId: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                  disabled={!!editAccount}
                >
                  <option value="">请选择代理商</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name} ({agency.platform})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">账户名称 *</label>
                <input
                  type="text"
                  value={accountForm.accountName}
                  onChange={(e) => setAccountForm((f) => ({ ...f, accountName: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">币种 *</label>
                  <select
                    value={accountForm.currency}
                    onChange={(e) => setAccountForm((f) => ({ ...f, currency: e.target.value as AdAccount["currency"] }))}
                    className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  >
                    <option value="USD">USD</option>
                    <option value="RMB">RMB</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">所属国家</label>
                  <select
                    value={accountForm.country}
                    onChange={(e) => setAccountForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  >
                    <option value="">不指定</option>
                    {COUNTRIES.filter((c) => c.code !== "GLOBAL").map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">当前余额</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={accountForm.currentBalance}
                  onChange={(e) => setAccountForm((f) => ({ ...f, currentBalance: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">账期授信额度</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={accountForm.creditLimit}
                  onChange={(e) => setAccountForm((f) => ({ ...f, creditLimit: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
                <textarea
                  value={accountForm.notes}
                  onChange={(e) => setAccountForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountModalOpen(false);
                    setEditAccount(null);
                    setAccountForm({
                      agencyId: "",
                      accountName: "",
                      currentBalance: "",
                      creditLimit: "",
                      currency: "USD",
                      country: "",
                      notes: ""
                    });
                  }}
                  className="px-4 py-2 rounded-md border border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-[#00E5FF] text-slate-900 font-semibold hover:bg-[#00B8CC] transition-all duration-200 shadow-lg shadow-[#00E5FF]/20"
                >
                  {editAccount ? "更新" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 消耗记录确认框 */}
      {confirmConsumptionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm modal-enter">
          <div className="bg-[#0B0C10]/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 p-6 w-full max-w-lg shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">确认新增消耗记录</h2>
              <button
                onClick={() => setConfirmConsumptionModal(null)}
                className="text-slate-400 hover:text-slate-200 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 格式化金额函数 */}
              {(() => {
                const formatAmount = (val: number, curr: string) => {
                  const symbol = curr === "USD" ? "$" : curr === "CNY" ? "¥" : curr === "HKD" ? "HK$" : curr;
                  return `${symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };
                
                return (
                  <div className="rounded-lg bg-slate-900/40 backdrop-blur-md border border-white/10 p-5 space-y-3 shadow-glow-blue">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400">广告账户：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.accountName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">代理商：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.agencyName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">店铺：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.storeName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">月份：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.month}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">消耗日期：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.date}</span>
                      </div>
                      {confirmConsumptionModal.campaignName && (
                        <div className="col-span-2">
                          <span className="text-slate-400">广告系列：</span>
                          <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.campaignName}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="border-t border-white/10 pt-3 space-y-2">
                      {/* 消耗金额 */}
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300 text-sm">消耗金额：</span>
                        <span className="text-red-400 font-bold text-lg">
                          {formatAmount(confirmConsumptionModal.amount, confirmConsumptionModal.currency)}
                        </span>
                      </div>
                      
                      {/* 预估返点 */}
                      {confirmConsumptionModal.estimatedRebate > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-white/10">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-300 text-sm">预估返点：</span>
                            <span className="text-xs text-slate-500">返点比例：{confirmConsumptionModal.rebateRate}%</span>
                          </div>
                          <span className="text-emerald-400 font-bold text-base">
                            {formatAmount(confirmConsumptionModal.estimatedRebate, confirmConsumptionModal.currency)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 凭证 */}
                    {confirmConsumptionModal.voucher && confirmConsumptionModal.voucher.length > 10 && (
                      <div className="pt-2 border-t border-white/10">
                        <span className="text-slate-400 text-sm mb-2 block">消耗凭证：</span>
                        <div className="relative rounded-lg overflow-hidden border border-white/10">
                          <img 
                            src={confirmConsumptionModal.voucher} 
                            alt="消耗凭证" 
                            className="w-full max-h-48 object-contain bg-white/5"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
                            }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* 备注 */}
                    {confirmConsumptionModal.notes && (
                      <div className="pt-2 border-t border-white/10">
                        <span className="text-slate-400 text-sm">备注：</span>
                        <p className="text-slate-300 text-sm mt-1">{confirmConsumptionModal.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* 操作按钮 */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setConfirmConsumptionModal(null)}
                  className="px-6 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmCreateConsumption}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#00E5FF] via-[#3D5AFE] to-[#00E5FF] text-slate-900 font-bold hover:shadow-[0_0_20px_rgba(0,150,255,0.4)] transition-all duration-300 shadow-[0_0_20px_rgba(0,150,255,0.3)]"
                >
                  确认创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 充值确认弹窗 */}
      {confirmRechargeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm modal-enter">
          <div className="bg-[#0B0C10]/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 p-6 w-full max-w-lg shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">确认新增充值记录</h2>
              <button
                onClick={() => setConfirmRechargeModal(null)}
                className="text-slate-400 hover:text-slate-200 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {(() => {
                const formatAmount = (val: number, curr: string) => {
                  const symbol = curr === "USD" ? "$" : curr === "CNY" ? "¥" : curr === "HKD" ? "HK$" : curr;
                  return `${symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };
                
                return (
                  <div className="rounded-lg bg-slate-900/40 backdrop-blur-md border border-white/10 p-5 space-y-3 shadow-glow-blue">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400">广告账户：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmRechargeModal.accountName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">代理商：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmRechargeModal.agencyName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">充值日期：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmRechargeModal.date}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">币种：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmRechargeModal.currency}</span>
                      </div>
                    </div>
                    
                    <div className="border-t border-white/10 pt-3 space-y-2">
                      {/* 充值金额 */}
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300 text-sm">充值金额：</span>
                        <span className="text-blue-400 font-bold text-lg">
                          {formatAmount(confirmRechargeModal.amount, confirmRechargeModal.currency)}
                        </span>
                      </div>
                      
                      {/* 返点金额 */}
                      {confirmRechargeModal.rebateAmount > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-white/10">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-300 text-sm">返点金额：</span>
                            <span className="text-xs text-slate-500">返点比例：{confirmRechargeModal.rebateRate}%</span>
                          </div>
                          <span className="text-emerald-400 font-bold text-base">
                            {formatAmount(confirmRechargeModal.rebateAmount, confirmRechargeModal.currency)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 凭证 */}
                    {confirmRechargeModal.voucher && confirmRechargeModal.voucher.length > 10 && (
                      <div className="pt-2 border-t border-white/10">
                        <span className="text-slate-400 text-sm mb-2 block">充值凭证：</span>
                        <div className="relative rounded-lg overflow-hidden border border-white/10">
                          {(() => {
                            const isBase64 = confirmRechargeModal.voucher && (
                              confirmRechargeModal.voucher.startsWith('data:image/') ||
                              /^data:[^;]*;base64,/.test(confirmRechargeModal.voucher) ||
                              /^[A-Za-z0-9+/=]+$/.test(confirmRechargeModal.voucher) && confirmRechargeModal.voucher.length > 100
                            );
                            let imageSrc = confirmRechargeModal.voucher;
                            if (confirmRechargeModal.voucher && /^[A-Za-z0-9+/=]+$/.test(confirmRechargeModal.voucher) && confirmRechargeModal.voucher.length > 100 && !confirmRechargeModal.voucher.startsWith('data:')) {
                              imageSrc = `data:image/jpeg;base64,${confirmRechargeModal.voucher}`;
                            }
                            return (
                              <img 
                                src={imageSrc} 
                                alt="充值凭证" 
                                className="w-full max-h-48 object-contain bg-white/5"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = "none";
                                }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    
                    {/* 备注 */}
                    {confirmRechargeModal.notes && (
                      <div className="pt-2 border-t border-white/10">
                        <span className="text-slate-400 text-sm">备注：</span>
                        <p className="text-slate-300 text-sm mt-1">{confirmRechargeModal.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* 操作按钮 */}
              <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                <button
                  onClick={() => setConfirmRechargeModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800/50 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmCreateRecharge}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#00E5FF] via-[#3D5AFE] to-[#00E5FF] text-slate-900 font-bold hover:shadow-[0_0_20px_rgba(0,150,255,0.4)] transition-all duration-300 shadow-[0_0_20px_rgba(0,150,255,0.3)]"
                >
                  确认充值
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 消耗记录表单弹窗 */}
      {isConsumptionModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm" style={{ zIndex: 50 }}>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-md" style={{ position: "relative", zIndex: 51 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">新增消耗记录</h2>
              <button
                onClick={() => {
                  setIsConsumptionModalOpen(false);
                  setConsumptionForm({
                    adAccountId: "",
                    storeId: "",
                    month: new Date().toISOString().slice(0, 7),
                    date: new Date().toISOString().slice(0, 10),
                    amount: "",
                    currency: "USD",
                    campaignName: "",
                    voucher: "",
                    notes: ""
                  });
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateConsumption} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">广告账户 *</label>
                <select
                  value={consumptionForm.adAccountId}
                  onChange={(e) => {
                    const account = adAccounts.find((a) => a.id === e.target.value);
                    const agency = account ? agencies.find((a) => a.id === account.agencyId) : null;
                    setConsumptionForm((f) => ({
                      ...f,
                      adAccountId: e.target.value,
                      currency: account?.currency || "USD",
                      month: f.month || new Date().toISOString().slice(0, 7)
                    }));
                  }}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                >
                  <option value="">请选择广告账户</option>
                  {adAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName} ({account.agencyName}) - 余额: {currency(account.currentBalance, account.currency)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">月份 *</label>
                <input
                  type="month"
                  value={consumptionForm.month}
                  onChange={(e) => setConsumptionForm((f) => ({ ...f, month: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">关联店铺</label>
                <select
                  value={consumptionForm.storeId}
                  onChange={(e) => setConsumptionForm((f) => ({ ...f, storeId: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                >
                  <option value="">请选择店铺（可选）</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.platform}) - {store.country}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">消耗日期 *</label>
                <input
                  type="date"
                  lang="zh-CN"
                  value={consumptionForm.date}
                  onChange={(e) => setConsumptionForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300 cursor-pointer"
                  style={{
                    colorScheme: "dark",
                    position: "relative",
                    zIndex: 10
                  }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">消耗金额 *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={consumptionForm.amount}
                  onChange={(e) => setConsumptionForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                />
                {consumptionForm.adAccountId && consumptionForm.amount && (() => {
                  const account = adAccounts.find((a) => a.id === consumptionForm.adAccountId);
                  const agency = account ? agencies.find((a) => a.id === account.agencyId) : null;
                  const estimatedRebate = agency && consumptionForm.amount ? (Number(consumptionForm.amount) * agency.rebateRate) / 100 : 0;
                  return estimatedRebate > 0 ? (
                    <div className="text-xs text-emerald-400 mt-1">
                      预估返点：{currency(estimatedRebate, consumptionForm.currency || account?.currency || "USD")} ({agency?.rebateRate || 0}%)
                    </div>
                  ) : null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">币种 *</label>
                <select
                  value={consumptionForm.currency}
                  onChange={(e) => setConsumptionForm((f) => ({ ...f, currency: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                  required
                >
                  <option value="USD">USD</option>
                  <option value="RMB">RMB</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">广告系列名称</label>
                <input
                  type="text"
                  value={consumptionForm.campaignName}
                  onChange={(e) => setConsumptionForm((f) => ({ ...f, campaignName: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">消耗凭证</label>
                <ImageUploader
                  value={consumptionForm.voucher || ""}
                  onChange={(value) => {
                    const voucherValue = typeof value === "string" ? value : (Array.isArray(value) ? value[0] || "" : "");
                    setConsumptionForm((f) => ({ ...f, voucher: voucherValue }));
                  }}
                  maxImages={1}
                  multiple={false}
                />
                <p className="text-xs text-slate-400 mt-1">请上传消耗凭证（如广告截图、账单等）</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
                <textarea
                  value={consumptionForm.notes}
                  onChange={(e) => setConsumptionForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-white/10 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none input-glow transition-all duration-300"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConsumptionModalOpen(false);
                    setConsumptionForm({
                      adAccountId: "",
                      storeId: "",
                      month: new Date().toISOString().slice(0, 7),
                      date: new Date().toISOString().slice(0, 10),
                      amount: "",
                      currency: "USD",
                      campaignName: "",
                      voucher: "",
                      notes: ""
                    });
                  }}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button type="submit" className="px-4 py-2 rounded-md bg-[#00E5FF] text-slate-900 font-semibold hover:bg-[#00B8CC] transition-all duration-200 shadow-lg shadow-[#00E5FF]/20">
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 结算弹窗 */}
      {isSettlementModalOpen && settlementData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">一键结算返点</h2>
              <button
                onClick={() => {
                  setIsSettlementModalOpen(false);
                  setSettlementData(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSettlement} className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-sm text-slate-300 mb-2">
                  <span className="font-medium">结算月份：</span>
                  <span className="text-emerald-300">{settlementData.month}</span>
                </div>
                <div className="text-sm text-slate-300 mb-2">
                  <span className="font-medium">广告账户：</span>
                  <span className="text-emerald-300">
                    {adAccounts.find((a) => a.id === settlementData.accountId)?.accountName || "-"}
                  </span>
                </div>
                <div className="text-sm text-slate-300 mb-2">
                  <span className="font-medium">消耗记录数：</span>
                  <span className="text-blue-300">{settlementData.consumptions.length} 条</span>
                </div>
                <div className="text-sm text-slate-300">
                  <span className="font-medium">结算返点总额：</span>
                  <span className="text-2xl font-semibold text-emerald-300 ml-2">
                    {currency(
                      settlementData.consumptions.reduce((sum, c) => sum + (c.estimatedRebate || 0), 0),
                      adAccounts.find((a) => a.id === settlementData.accountId)?.currency || "USD"
                    )}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 max-h-60 overflow-y-auto">
                <div className="text-sm font-medium text-slate-300 mb-2">消耗记录明细：</div>
                <div className="space-y-2">
                  {settlementData.consumptions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs text-slate-400 py-1 border-b border-slate-800">
                      <div>
                        <span>{c.date}</span>
                        {c.storeName && <span className="ml-2">| {c.storeName}</span>}
                      </div>
                      <div className="text-right">
                        <div>消耗：{currency(c.amount, c.currency)}</div>
                        <div className="text-emerald-400">返点：{currency(c.estimatedRebate || 0, c.currency)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettlementModalOpen(false);
                    setSettlementData(null);
                  }}
                  className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  确认结算
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 消耗记录确认框 */}
      {confirmConsumptionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm modal-enter">
          <div className="bg-[#0B0C10]/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 p-6 w-full max-w-lg shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">确认新增消耗记录</h2>
              <button
                onClick={() => setConfirmConsumptionModal(null)}
                className="text-slate-400 hover:text-slate-200 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 格式化金额函数 */}
              {(() => {
                const formatAmount = (val: number, curr: string) => {
                  const symbol = curr === "USD" ? "$" : curr === "CNY" ? "¥" : curr === "HKD" ? "HK$" : curr;
                  return `${symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                };
                
                return (
                  <div className="rounded-lg bg-slate-900/40 backdrop-blur-md border border-white/10 p-5 space-y-3 shadow-glow-blue">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400">广告账户：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.accountName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">代理商：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.agencyName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">店铺：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.storeName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">月份：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.month}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">消耗日期：</span>
                        <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.date}</span>
                      </div>
                      {confirmConsumptionModal.campaignName && (
                        <div className="col-span-2">
                          <span className="text-slate-400">广告系列：</span>
                          <span className="text-slate-100 font-medium ml-2">{confirmConsumptionModal.campaignName}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="border-t border-white/10 pt-3 space-y-2">
                      {/* 消耗金额 */}
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300 text-sm">消耗金额：</span>
                        <span className="text-red-400 font-bold text-lg">
                          {formatAmount(confirmConsumptionModal.amount, confirmConsumptionModal.currency)}
                        </span>
                      </div>
                      
                      {/* 预估返点 */}
                      {confirmConsumptionModal.estimatedRebate > 0 && (
                        <div className="flex justify-between items-center pt-2 border-t border-white/10">
                          <div className="flex flex-col gap-1">
                            <span className="text-slate-300 text-sm">预估返点：</span>
                            <span className="text-xs text-slate-500">返点比例：{confirmConsumptionModal.rebateRate}%</span>
                          </div>
                          <span className="text-emerald-400 font-bold text-base">
                            {formatAmount(confirmConsumptionModal.estimatedRebate, confirmConsumptionModal.currency)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* 备注 */}
                    {confirmConsumptionModal.notes && (
                      <div className="pt-2 border-t border-white/10">
                        <span className="text-slate-400 text-sm">备注：</span>
                        <p className="text-slate-300 text-sm mt-1">{confirmConsumptionModal.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* 操作按钮 */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setConfirmConsumptionModal(null)}
                  className="px-6 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmCreateConsumption}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#00E5FF] via-[#3D5AFE] to-[#00E5FF] text-slate-900 font-bold hover:shadow-[0_0_20px_rgba(0,150,255,0.4)] transition-all duration-300 shadow-[0_0_20px_rgba(0,150,255,0.3)]"
                >
                  确认创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 凭证查看弹窗 */}
      {voucherViewModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 9999 }}
          onClick={() => setVoucherViewModal(null)}
        >
          <div className="relative max-w-5xl max-h-[95vh] p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setVoucherViewModal(null)}
              className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300 z-10 bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
            >
              ✕
            </button>
            {(() => {
              // 检查是否为有效的图片数据格式
              const isBase64 = voucherViewModal && (
                voucherViewModal.startsWith('data:image/') ||
                voucherViewModal.startsWith('data:application/') ||
                /^data:[^;]*;base64,/.test(voucherViewModal) ||
                // 检查是否是纯 base64 字符串（没有 data: 前缀）
                /^[A-Za-z0-9+/=]+$/.test(voucherViewModal) && voucherViewModal.length > 100
              );
              
              const isUrl = voucherViewModal && (
                voucherViewModal.startsWith('http://') ||
                voucherViewModal.startsWith('https://') ||
                voucherViewModal.startsWith('/')
              );

              // 如果是 base64 但没有 data: 前缀，添加前缀
              let imageSrc = voucherViewModal;
              if (voucherViewModal && /^[A-Za-z0-9+/=]+$/.test(voucherViewModal) && voucherViewModal.length > 100 && !voucherViewModal.startsWith('data:')) {
                // 尝试检测图片类型，默认使用 jpeg
                imageSrc = `data:image/jpeg;base64,${voucherViewModal}`;
              }

              if (isBase64 || isUrl) {
                return (
                  <>
                    <img 
                      src={imageSrc || voucherViewModal} 
                      alt="充值凭证" 
                      className="max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5"
                      onError={(e) => {
                        console.error("图片加载失败:", voucherViewModal?.substring(0, 100));
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        // 显示错误提示
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.error-message')) {
                          const errorDiv = document.createElement("div");
                          errorDiv.className = "error-message text-white text-center p-8 bg-rose-500/20 rounded-lg border border-rose-500/40";
                          errorDiv.innerHTML = `
                            <div class="text-rose-300 text-lg mb-2">❌ 图片加载失败</div>
                            <div class="text-slate-300 text-sm">请检查图片格式或数据是否正确</div>
                            <div class="text-slate-400 text-xs mt-2">数据长度: ${voucherViewModal?.length || 0} 字符</div>
                            <div class="text-slate-500 text-xs mt-2 break-all max-w-md mx-auto">${voucherViewModal?.substring(0, 100)}...</div>
                          `;
                          parent.appendChild(errorDiv);
                        }
                      }}
                      onLoad={(e) => {
                        // 隐藏错误提示（如果存在）
                        const target = e.target as HTMLImageElement;
                        const errorDiv = target.parentElement?.querySelector('.error-message');
                        if (errorDiv) {
                          errorDiv.remove();
                        }
                      }}
                    />
                  </>
                );
              } else {
                // 即使格式看起来不对，也尝试直接显示（让浏览器处理）
                return (
                  <>
                    <img 
                      src={voucherViewModal || ''} 
                      alt="充值凭证" 
                      className="max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5"
                      onError={(e) => {
                        console.error("图片加载失败:", voucherViewModal?.substring(0, 100));
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        // 显示详细错误提示
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.error-message')) {
                          const errorDiv = document.createElement("div");
                          errorDiv.className = "error-message text-white text-center p-8 bg-rose-500/20 rounded-lg border border-rose-500/40";
                          errorDiv.innerHTML = `
                            <div class="text-rose-300 text-lg mb-2">❌ 图片加载失败</div>
                            <div class="text-slate-300 text-sm mb-2">图片数据格式不正确或已损坏</div>
                            <div class="text-slate-400 text-xs mt-2">数据长度: ${voucherViewModal?.length || 0} 字符</div>
                            <div class="text-slate-400 text-xs mt-1">数据前缀: ${voucherViewModal?.substring(0, 50) || '无'}...</div>
                            <div class="text-slate-500 text-xs mt-2 break-all max-w-md mx-auto">${voucherViewModal?.substring(0, 200)}...</div>
                          `;
                          parent.appendChild(errorDiv);
                        }
                      }}
                      onLoad={(e) => {
                        // 隐藏错误提示（如果存在）
                        const target = e.target as HTMLImageElement;
                        const errorDiv = target.parentElement?.querySelector('.error-message');
                        if (errorDiv) {
                          errorDiv.remove();
                        }
                      }}
                    />
                  </>
                );
              }
            })()}
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type || "warning"}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
