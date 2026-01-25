"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import useSWR, { mutate as swrMutate } from "swr";
import {
  type BankAccount,
  getAccountStats,
  calculateRMBBalance,
  getAccountTree,
  calculatePrimaryAccountBalance
} from "@/lib/finance-store";
import { type Store, getStores, saveStores } from "@/lib/store-store";
import { COUNTRIES, getCountriesByRegion, getCountryByCode } from "@/lib/country-config";
import { type FinanceRates } from "@/lib/exchange";
import { Wallet, CreditCard, Building2, Pencil, Trash2, List, TrendingUp, DollarSign, Coins, Search, X, SortAsc, SortDesc, Info, Download, Globe, Calculator } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

// 格式化账号（显示后四位）
const formatAccountNumber = (accountNumber: string | undefined): string => {
  if (!accountNumber) return "-";
  if (accountNumber.length <= 4) return accountNumber;
  return `****${accountNumber.slice(-4)}`;
};

type CashFlow = {
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
  voucher?: string;
  createdAt: string;
};

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function BankAccountsPage() {
  const router = useRouter();
  
  // 使用 SWR 加载账户数据
  const { data: accountsData = [], isLoading: accountsLoading, mutate: mutateAccounts } = useSWR<BankAccount[]>('/api/accounts', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true
  });
  
  // 使用 SWR 加载流水数据（用于计算余额）
  const { data: cashFlowData = [] } = useSWR<any[]>('/api/cash-flow', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true
  });
  
  // 基于 API 数据和流水重新计算余额
  const accounts = useMemo(() => {
    if (!accountsData.length) return [];
    
    // 重置所有账户的余额，从 initialCapital 开始重新计算（从流水记录重新计算）
    let updatedAccounts = accountsData.map((acc) => {
      const hasChildren = accountsData.some((a) => a.parentId === acc.id);
      if (acc.accountCategory === "PRIMARY" && hasChildren) {
        // 主账户有子账户，余额应该从子账户汇总，先重置为0
        return {
          ...acc,
          originalBalance: 0,
          rmbBalance: 0,
          initialCapital: acc.initialCapital || 0
        };
      } else {
        // 其他账户（独立账户、没有子账户的主账户、虚拟子账户）
        // 从 initialCapital 开始计算，originalBalance 会通过流水记录累加
        const initialCapital = acc.initialCapital || 0;
        return {
          ...acc,
          originalBalance: initialCapital, // 从初始资金开始
          rmbBalance: acc.currency === "RMB" 
            ? initialCapital 
            : initialCapital * (acc.exchangeRate || 1),
          initialCapital: initialCapital
        };
      }
    });

    // 遍历所有流水记录，更新账户余额（在 initialCapital 基础上累加）
    if (cashFlowData.length > 0) {
      cashFlowData.forEach((flow) => {
        if (flow.status === "confirmed" && !flow.isReversal && flow.accountId) {
          const account = updatedAccounts.find((a) => a.id === flow.accountId);
          if (account) {
            const hasChildren = updatedAccounts.some((a) => a.parentId === account.id);
            
            // 如果账户不是主账户，或者主账户没有子账户，则直接更新余额
            if (account.accountCategory !== "PRIMARY" || !hasChildren) {
              // 直接使用 flow.amount，因为：
              // - 收入类型：amount 是正数
              // - 支出类型：amount 是负数（包括划拨转出）
              // 不需要 Math.abs，直接相加即可
              // 注意：originalBalance 已经包含了 initialCapital，所以直接累加流水即可
              const change = Number(flow.amount);
              const newBalance = account.originalBalance + change;
              
              account.originalBalance = newBalance;
              account.rmbBalance = account.currency === "RMB"
                ? newBalance
                : newBalance * (account.exchangeRate || 1);
            }
          }
        }
      });
    }
    
    // 重新计算所有主账户的余额（汇总子账户，如果有子账户的话）
    updatedAccounts = updatedAccounts.map((acc) => {
      if (acc.accountCategory === "PRIMARY") {
        const hasChildren = updatedAccounts.some((a) => a.parentId === acc.id);
        if (hasChildren) {
          const calculated = calculatePrimaryAccountBalance(acc, updatedAccounts);
          return {
            ...acc,
            originalBalance: calculated.originalBalance,
            rmbBalance: calculated.rmbBalance
          };
        }
      }
      return acc;
    });
    
    return updatedAccounts;
  }, [accountsData, cashFlowData]);
  
  const [stores, setStores] = useState<Store[]>([]);
  const accountsReady = !accountsLoading;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const [filterAccountType, setFilterAccountType] = useState<string>("all");
  const [selectedAccountForFlow, setSelectedAccountForFlow] = useState<BankAccount | null>(null);
  const [accountFlowModalOpen, setAccountFlowModalOpen] = useState(false);
  
  // 从 SWR 数据中筛选出选中账户的流水，并分类
  const accountFlows = useMemo(() => {
    if (!selectedAccountForFlow || !cashFlowData.length) return { normal: [], transfers: [] };
    const allFlows = cashFlowData
      .filter((flow) => flow.accountId === selectedAccountForFlow.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // 分类：正常收入支出 和 划拨记录
    const normal = allFlows.filter((flow) => flow.category !== "内部划拨");
    const transfers = allFlows.filter((flow) => flow.category === "内部划拨");
    
    return { normal, transfers };
  }, [selectedAccountForFlow, cashFlowData]);
  
  // 新增状态：搜索、排序、快速筛选
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"balance" | "name" | "none">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterCategory, setFilterCategory] = useState<string>("all"); // all, 对公, 对私, 平台
  const [hoveredAccountId, setHoveredAccountId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    accountNumber: "",
    accountType: "对公" as BankAccount["accountType"],
    accountCategory: "PRIMARY" as BankAccount["accountCategory"],
    accountPurpose: "",
    currency: "RMB" as BankAccount["currency"],
    country: "CN",
    originalBalance: "",
    initialCapital: "",
    exchangeRate: "",
    parentId: "",
    storeId: "",
    companyEntity: "",
    owner: "",
    notes: "",
    platformAccount: "",
    platformPassword: "",
    platformUrl: ""
  });

  const countriesByRegion = useMemo(() => getCountriesByRegion(), []);

  // 当选择店铺时，自动同步国家
  useEffect(() => {
    if (form.storeId) {
      const selectedStore = stores.find((s) => s.id === form.storeId);
      if (selectedStore) {
        setForm((f) => ({
          ...f,
          country: selectedStore.country,
          currency: selectedStore.currency as BankAccount["currency"]
        }));
      }
    }
  }, [form.storeId, stores]);

  // 当选择父账户时，同步币种和国家
  useEffect(() => {
    if (form.parentId && form.accountCategory === "VIRTUAL") {
      const parentAccount = accounts.find((a) => a.id === form.parentId);
      if (parentAccount) {
        setForm((f) => ({
          ...f,
          currency: parentAccount.currency,
          country: parentAccount.country
        }));
      }
    }
  }, [form.parentId, form.accountCategory, accounts]);

  // 获取主账户列表（用于虚拟子账号选择父账户）
  const primaryAccounts = useMemo(() => {
    return accounts.filter((acc) => acc.accountCategory === "PRIMARY");
  }, [accounts]);

  // 获取账户树形结构
  const accountTree = useMemo(() => {
    return getAccountTree(accounts);
  }, [accounts]);

  // 加载店铺数据（暂时仍用 localStorage，后续迁移）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadedStores = getStores();
    setStores(loadedStores);
  }, []);

  // 使用 SWR 获取实时汇率
  const { data: financeRatesData, isLoading: ratesLoading, mutate: mutateRates } = useSWR<{ success: boolean; data?: FinanceRates; error?: string }>(
    '/api/finance-rates',
    fetcher,
    {
      revalidateOnFocus: true, // 窗口获得焦点时刷新
      revalidateOnReconnect: true,
      refreshInterval: 3600000, // 每 1 小时刷新一次
      keepPreviousData: true,
      dedupingInterval: 60000, // 1 分钟内去重，避免重复请求
    }
  );
  
  // 提取汇率数据
  const exchangeRates = useMemo(() => {
    if (!financeRatesData) return null;
    if (financeRatesData.success && financeRatesData.data) {
      return financeRatesData.data;
    }
    return null;
  }, [financeRatesData]);
  
  // 调试：打印汇率数据
  useEffect(() => {
    console.log('🔍 [汇率调试] SWR 状态:', {
      isLoading: ratesLoading,
      hasData: !!financeRatesData,
      success: financeRatesData?.success,
      error: financeRatesData?.error,
      errorCode: financeRatesData?.errorCode
    });
    
    if (exchangeRates) {
      console.log('💱 [汇率调试] 实时汇率已加载:', {
        USD: exchangeRates.USD,
        JPY: exchangeRates.JPY,
        THB: exchangeRates.THB,
        lastUpdated: exchangeRates.lastUpdated
      });
    } else if (financeRatesData) {
      if (!financeRatesData.success) {
        console.error('❌ [汇率调试] 汇率加载失败:', {
          error: financeRatesData.error,
          errorCode: financeRatesData.errorCode
        });
        // 如果是环境变量未配置的错误，显示提示
        if (financeRatesData.error?.includes('EXCHANGERATE_API_KEY') || 
            financeRatesData.errorCode === 'MISSING_API_KEY') {
          console.error('❌ 请在生产环境配置 EXCHANGERATE_API_KEY 环境变量');
          console.error('   如果使用 Vercel: 在项目设置 -> Environment Variables 中添加');
          console.error('   如果使用其他平台: 请在对应平台的环境变量配置中添加 EXCHANGERATE_API_KEY=942adb4f011e406f282a658f');
        }
      } else {
        console.warn('⚠️ [汇率调试] financeRatesData.success 为 true，但 exchangeRates 为 null');
      }
    } else if (ratesLoading) {
      console.log('⏳ [汇率调试] 正在加载汇率数据...');
    } else {
      console.warn('⚠️ [汇率调试] 没有汇率数据，也没有加载状态');
    }
  }, [exchangeRates, financeRatesData, ratesLoading]);

  // 使用 finance-store 的统计函数（基础数据）
  const { totalUSD, totalJPY } = useMemo(() => getAccountStats(accounts), [accounts]);

  // 计算人民币账户总金额（只统计币种为RMB的账户）
  // 注意：originalBalance 已经包含了 initialCapital，所以不需要再加
  const totalRMBAccountBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      if (acc.currency === "RMB") {
        // originalBalance 已经包含了 initialCapital + 所有流水
        return sum + (acc.originalBalance || 0);
      }
      return sum;
    }, 0);
  }, [accounts]);

  // 计算USD账户的预估RMB金额（使用实时汇率）
  // 注意：originalBalance 已经包含了 initialCapital，所以不需要再加
  const totalUSDRMB = useMemo(() => {
    // 优先使用实时汇率，如果没有则使用账户中存储的汇率
    const usdRate = exchangeRates?.USD || 1;
    
    return accounts.reduce((sum, acc) => {
      // 只统计USD账户
      if (acc.currency === "USD") {
        // originalBalance 已经包含了 initialCapital + 所有流水
        // 使用实时汇率计算，如果没有实时汇率则回退到账户汇率
        const rate = exchangeRates?.USD || acc.exchangeRate || 1;
        const rmbValue = (acc.originalBalance || 0) * rate;
        return sum + rmbValue;
      }
      return sum;
    }, 0);
  }, [accounts, exchangeRates]);

  // 计算JPY账户的预估RMB金额（使用实时汇率）
  // 注意：originalBalance 已经包含了 initialCapital，所以不需要再加
  const totalJPYRMB = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      // 只统计JPY账户
      if (acc.currency === "JPY") {
        // originalBalance 已经包含了 initialCapital + 所有流水
        // 使用实时汇率计算，如果没有实时汇率则回退到账户汇率
        const rate = exchangeRates?.JPY || acc.exchangeRate || 1;
        const rmbValue = (acc.originalBalance || 0) * rate;
        return sum + rmbValue;
      }
      return sum;
    }, 0);
  }, [accounts, exchangeRates]);

  // 计算总资产（使用实时汇率）
  const totalAssetsRMB = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      if (acc.currency === "RMB") {
        // RMB 账户直接使用原币余额
        return sum + (acc.originalBalance || 0);
      } else if (acc.currency === "USD") {
        // USD 账户使用实时汇率
        const rate = exchangeRates?.USD || acc.exchangeRate || 1;
        return sum + (acc.originalBalance || 0) * rate;
      } else if (acc.currency === "JPY") {
        // JPY 账户使用实时汇率
        const rate = exchangeRates?.JPY || acc.exchangeRate || 1;
        return sum + (acc.originalBalance || 0) * rate;
      } else {
        // 其他币种使用账户中存储的汇率
        return sum + (acc.originalBalance || 0) * (acc.exchangeRate || 1);
      }
    }, 0);
  }, [accounts, exchangeRates]);

  // 筛选后的账户树（只显示主账户和独立账户，子账号通过树形结构显示）
  const filteredAccountTree = useMemo(() => {
    let filtered = accounts.filter((acc) => {
      if (filterCurrency !== "all" && acc.currency !== filterCurrency) return false;
      if (filterAccountType !== "all" && acc.accountType !== filterAccountType) return false;
      return true;
    });
    return getAccountTree(filtered);
  }, [accounts, filterCurrency, filterAccountType]);

  // 扁平化账户列表（展平主账户和虚拟子账号）
  const flattenedAccountsBase = useMemo(() => {
    const result: BankAccount[] = [];
    filteredAccountTree.forEach((acc) => {
      // 添加主账户或独立账户
      result.push(acc);
      // 添加子账号
      if (acc.children && acc.children.length > 0) {
        acc.children.forEach((child) => result.push(child));
      }
    });
    return result;
  }, [filteredAccountTree]);

  // 添加搜索、排序、筛选后的账户列表
  const flattenedAccounts = useMemo(() => {
    let result = [...flattenedAccountsBase];

    // 1. 快速筛选（账号类型）
    if (filterCategory !== "all") {
      result = result.filter((acc) => {
        return acc.accountType === filterCategory;
      });
    }

    // 2. 搜索（按账户名称、账号后四位）
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter((acc) => {
        const nameMatch = acc.name.toLowerCase().includes(query);
        const accountNumberMatch = acc.accountNumber
          ? acc.accountNumber.slice(-4).toLowerCase().includes(query) ||
            acc.accountNumber.toLowerCase().includes(query)
          : false;
        return nameMatch || accountNumberMatch;
      });
    }

    // 3. 排序
    if (sortBy !== "none") {
      result.sort((a, b) => {
        if (sortBy === "balance") {
          const balanceA = a.originalBalance || 0;
          const balanceB = b.originalBalance || 0;
          return sortOrder === "desc" ? balanceB - balanceA : balanceA - balanceB;
        } else if (sortBy === "name") {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          if (sortOrder === "desc") {
            return nameB.localeCompare(nameA, "zh-CN");
          } else {
            return nameA.localeCompare(nameB, "zh-CN");
          }
        }
        return 0;
      });
    }

    return result;
  }, [flattenedAccountsBase, filterCategory, searchQuery, sortBy, sortOrder]);

  // 账户统计摘要（基于筛选后的账户列表）
  const accountSummary = useMemo(() => {
    const totalCount = flattenedAccounts.length;
    const primaryCount = flattenedAccounts.filter((acc) => acc.accountCategory === "PRIMARY").length;
    const virtualCount = flattenedAccounts.filter((acc) => acc.accountCategory === "VIRTUAL").length;
    
    // 计算总余额（originalBalance 已经包含了 initialCapital）
    const totalBalance = flattenedAccounts.reduce((sum, acc) => {
      // originalBalance 已经包含了 initialCapital + 所有流水
      return sum + (acc.originalBalance || 0);
    }, 0);
    const avgBalance = totalCount > 0 ? totalBalance / totalCount : 0;
    
    // 计算总RMB余额（originalBalance 已经包含了 initialCapital）
    const totalRMBBalance = flattenedAccounts.reduce((sum, acc) => {
      // originalBalance 已经包含了 initialCapital + 所有流水
      const rmbValue = acc.currency === "RMB" 
        ? (acc.originalBalance || 0)
        : (acc.originalBalance || 0) * (acc.exchangeRate || 1);
      return sum + rmbValue;
    }, 0);
    const avgRMBBalance = totalCount > 0 ? totalRMBBalance / totalCount : 0;

    return {
      totalCount,
      primaryCount,
      virtualCount,
      avgBalance,
      avgRMBBalance
    };
  }, [flattenedAccounts]);

  // 现金流水数据已通过 SWR 加载（cashFlowData）

  // 计算每个账户的7天余额趋势数据（基于所有账户，不受筛选影响）
  const accountTrendData = useMemo(() => {
    const result: Record<string, Array<{ date: string; balance: number }>> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 确保 cashFlowData 是数组
    const flows = Array.isArray(cashFlowData) ? cashFlowData : [];

    flattenedAccountsBase.forEach((acc) => {
      const trend: Array<{ date: string; balance: number }> = [];
      // 获取账户初始余额 = 初始资金（用于趋势图计算）
      // 注意：originalBalance 已经包含了 initialCapital + 所有流水，所以趋势图应该从 initialCapital 开始
      let baseBalance = acc.initialCapital || 0;

      // 计算过去7天的日期
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];

        // 计算该日期之前的余额
        const flowsBeforeDate = flows.filter((flow) => {
          if (!flow || flow.accountId !== acc.id) return false;
          if (flow.status !== "confirmed" || flow.isReversal) return false;
          if (!flow.date) return false;
          const flowDate = new Date(flow.date).toISOString().split("T")[0];
          return flowDate <= dateStr;
        });

        // 从 initialCapital 开始，累加该日期之前的所有流水
        let balance = baseBalance;
        flowsBeforeDate.forEach((flow) => {
          // 直接使用 flow.amount，因为收入是正数，支出是负数（包括划拨转出）
          const change = Number(flow.amount);
          balance += change;
        });

        trend.push({ date: dateStr, balance });
      }

      result[acc.id] = trend;
    });

    return result;
  }, [flattenedAccounts, cashFlowData]);

  // 获取账户图标
  const getAccountIcon = (account: BankAccount) => {
    if (account.accountCategory === "PRIMARY") {
      return Building2;
    }
    if (account.accountPurpose?.includes("回款") || account.accountPurpose?.includes("收款")) {
      return Wallet;
    }
    return CreditCard;
  };

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isCreating) {
      toast.loading("正在创建，请勿重复点击");
      return;
    }
    if (!form.name.trim()) {
      toast.error("账户名称是必填项");
      return;
    }
    
    // VIRTUAL 账户必须关联父账户
    if (form.accountCategory === "VIRTUAL" && !form.parentId) {
      toast.error("虚拟子账号必须关联一个主账户");
      return;
    }
    
    const originalBalance = form.accountCategory === "PRIMARY" ? 0 : Number(form.originalBalance);
    const exchangeRate = Number(form.exchangeRate);
    if (form.accountCategory !== "PRIMARY" && Number.isNaN(originalBalance)) {
      toast.error("原币余额需为数字");
      return;
    }
    if (form.currency !== "RMB" && (Number.isNaN(exchangeRate) || exchangeRate <= 0)) {
      toast.error("非人民币账户需填写有效汇率");
      return;
    }
    const rmbBalance = form.accountCategory === "PRIMARY"
      ? 0
      : calculateRMBBalance(
      originalBalance,
      form.currency === "RMB" ? 1 : exchangeRate,
          form.currency as BankAccount["currency"]
    );
    const newAccount: BankAccount = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      accountNumber: form.accountNumber.trim(),
      accountType: form.accountType,
      accountCategory: form.accountCategory,
      accountPurpose: form.accountPurpose.trim(),
      currency: form.currency,
      country: form.country || "CN",
      originalBalance,
      initialCapital: form.initialCapital ? Number(form.initialCapital) : originalBalance,
      exchangeRate: form.currency === "RMB" ? 1 : exchangeRate,
      rmbBalance,
      parentId: form.accountCategory === "VIRTUAL" ? form.parentId || undefined : undefined,
      storeId: form.accountCategory === "VIRTUAL" ? (form.storeId || undefined) : (form.storeId || undefined),
      companyEntity: form.companyEntity.trim() || undefined,
      owner: form.owner.trim() || undefined,
      notes: form.notes.trim(),
      createdAt: new Date().toISOString(),
      platformAccount: form.accountType === "平台" ? (form.platformAccount.trim() || undefined) : undefined,
      platformPassword: form.accountType === "平台" ? (form.platformPassword.trim() || undefined) : undefined,
      platformUrl: form.accountType === "平台" ? (form.platformUrl.trim() || undefined) : undefined
    };
    setIsCreating(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount)
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Create account error:', error);
        throw new Error(error.error || error.message || '创建失败');
      }
      
      await mutateAccounts(); // 重新获取账户列表
      toast.success("账户创建成功");
      resetForm();
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Failed to create account:', error);
      toast.error(error.message || '创建账户失败');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = (account: BankAccount) => {
    setEditAccount(account);
    setForm({
      name: account.name,
      accountNumber: account.accountNumber,
      accountType: account.accountType,
      accountCategory: account.accountCategory || "PRIMARY",
      accountPurpose: account.accountPurpose,
      currency: account.currency,
      country: account.country || "CN",
      originalBalance: account.accountCategory === "PRIMARY" ? "" : String(account.originalBalance),
      initialCapital: account.initialCapital !== undefined ? String(account.initialCapital) : "",
      exchangeRate: String(account.exchangeRate),
      parentId: account.parentId || "",
      storeId: account.storeId || "",
      companyEntity: account.companyEntity || "",
      owner: account.owner || "",
      notes: account.notes,
      platformAccount: account.platformAccount || "",
      platformPassword: account.platformPassword || "",
      platformUrl: account.platformUrl || ""
    });
    setIsModalOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isUpdating) {
      toast.loading("正在更新，请勿重复点击");
      return;
    }
    
    if (!editAccount) return;
    if (!form.name.trim()) {
      toast.error("账户名称是必填项");
      return;
    }
    
    // VIRTUAL 账户必须关联父账户
    if (form.accountCategory === "VIRTUAL" && !form.parentId) {
      toast.error("虚拟子账号必须关联一个主账户");
      return;
    }
    
    const originalBalance = form.accountCategory === "PRIMARY" ? 0 : Number(form.originalBalance);
    const exchangeRate = Number(form.exchangeRate);
    if (form.accountCategory !== "PRIMARY" && Number.isNaN(originalBalance)) {
      toast.error("原币余额需为数字");
      return;
    }
    if (form.currency !== "RMB" && (Number.isNaN(exchangeRate) || exchangeRate <= 0)) {
      toast.error("非人民币账户需填写有效汇率");
      return;
    }
    const rmbBalance = form.accountCategory === "PRIMARY"
      ? 0
      : calculateRMBBalance(
      originalBalance,
      form.currency === "RMB" ? 1 : exchangeRate,
          form.currency as BankAccount["currency"]
    );
    try {
      const updatedAccount = {
        ...editAccount,
        name: form.name.trim(),
        accountNumber: form.accountNumber.trim(),
        accountType: form.accountType,
        accountCategory: form.accountCategory,
        accountPurpose: form.accountPurpose.trim(),
        currency: form.currency,
        country: form.country || "CN",
        originalBalance,
        initialCapital: form.initialCapital ? Number(form.initialCapital) : originalBalance,
        exchangeRate: form.currency === "RMB" ? 1 : exchangeRate,
        rmbBalance,
        parentId: form.accountCategory === "VIRTUAL" ? form.parentId || undefined : undefined,
        storeId: form.storeId || undefined,
        companyEntity: form.companyEntity.trim() || undefined,
        owner: form.owner.trim() || undefined,
        notes: form.notes.trim(),
        platformAccount: form.accountType === "平台" ? (form.platformAccount.trim() || undefined) : undefined,
        platformPassword: form.accountType === "平台" ? (form.platformPassword.trim() || undefined) : undefined,
        platformUrl: form.accountType === "平台" ? (form.platformUrl.trim() || undefined) : undefined
      };
      
      setIsUpdating(true);
      const response = await fetch(`/api/accounts/${editAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedAccount)
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error('Update account error:', error);
        throw new Error(error.error || error.message || '更新失败');
      }
      
      await mutateAccounts(); // 重新获取账户列表
      toast.success("账户更新成功");
      resetForm();
      setEditAccount(null);
      setIsModalOpen(false);
    } catch (error: any) {
      console.error('Failed to update account:', error);
      toast.error(error.message || '更新账户失败');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此账户吗？")) return;
    
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }
      
      await mutateAccounts(); // 重新获取账户列表
      toast.success("账户已删除");
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      toast.error(error.message || '删除账户失败');
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      accountNumber: "",
      accountType: "对公" as BankAccount["accountType"],
      accountCategory: "PRIMARY" as BankAccount["accountCategory"],
      accountPurpose: "",
      currency: "RMB" as BankAccount["currency"],
      country: "CN",
      originalBalance: "",
      initialCapital: "",
      exchangeRate: "",
      parentId: "",
      storeId: "",
      companyEntity: "",
      owner: "",
      notes: "",
      platformAccount: "",
      platformPassword: "",
      platformUrl: ""
    });
    setEditAccount(null);
  };

  // 实时计算当前表单的RMB余额
  const currentRMBBalance = useMemo(() => {
    if (form.accountCategory === "PRIMARY") {
      return 0;
    }
    const original = Number(form.originalBalance) || 0;
    const rate = Number(form.exchangeRate) || 0;
    if (!Number.isFinite(original) || !Number.isFinite(rate) || rate <= 0) {
      return 0;
    }
    const exchangeRateValue = form.currency === "RMB" ? 1 : rate;
    return calculateRMBBalance(original, exchangeRateValue, form.currency as BankAccount["currency"]);
  }, [form.originalBalance, form.exchangeRate, form.currency, form.accountCategory]);

  // 导出账户数据为CSV
  const handleExportData = () => {
    if (flattenedAccounts.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    // 准备CSV数据
    const headers = [
      "账户名称",
      "账号",
      "账户类别",
      "账号类型",
      "账号用途",
      "币种",
      "国家/地区",
      "原币余额",
      "汇率",
      "折算RMB余额",
      "账号归属人",
      "公司主体",
      "关联店铺",
      "父账户",
      "平台账号",
      "登入网站",
      "创建时间",
      "备注"
    ];

    const rows = flattenedAccounts.map((acc) => {
      const associatedStore = acc.storeId ? stores.find((s) => s.id === acc.storeId) : null;
      const parentAccount = acc.parentId ? accounts.find((a) => a.id === acc.parentId) : null;
      const accountCountry = COUNTRIES.find((c) => c.code === (acc.country || "CN"));
      
      // 计算显示余额 = originalBalance（已经包含了 initialCapital + 所有流水）
      // 注意：originalBalance 已经包含了 initialCapital，所以不需要再加
      let displayBalance = acc.originalBalance || 0;
      if (acc.accountCategory === "PRIMARY") {
        const calculated = calculatePrimaryAccountBalance(acc, accounts);
        // 主账户的余额已经包含了子账户的 initialCapital + 流水
        displayBalance = calculated.originalBalance || 0;
      }

      return [
        acc.name || "",
        acc.accountNumber || "",
        acc.accountCategory === "PRIMARY" ? "主账户" : "虚拟子账号",
        acc.accountType || "",
        acc.accountPurpose || "",
        acc.currency || "",
        accountCountry ? `${accountCountry.name} (${accountCountry.code})` : acc.country || "",
        formatNumber(displayBalance),
        formatNumber(acc.exchangeRate || 1),
        formatNumber(acc.rmbBalance || 0),
        acc.owner || "",
        acc.companyEntity || "",
        associatedStore ? associatedStore.name : "",
        parentAccount ? parentAccount.name : "",
        acc.platformAccount || "",
        acc.platformUrl || "",
        acc.createdAt ? new Date(acc.createdAt).toLocaleString("zh-CN") : "",
        acc.notes || ""
      ];
    });

    // 转换为CSV格式
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    // 添加BOM以支持Excel中文显示
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `账户管理_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`已导出 ${flattenedAccounts.length} 条账户数据`);
  };

  // 确保在服务器端和客户端都有相同的初始渲染
  const isMounted = typeof window !== 'undefined';
  
  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen" suppressHydrationWarning>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">公司账户管理</h1>
          <p className="mt-1 text-sm text-slate-400">管理资金账户，支持多币种、汇率自动折算与实时资产统计</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            className="flex items-center gap-2 rounded-lg border border-slate-800/50 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-300 shadow-lg hover:bg-slate-800/50 hover:border-slate-700 transition-all duration-200"
          >
            <Download className="h-4 w-4" />
            导出数据
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-primary-500/20 hover:from-primary-600 hover:to-primary-700 hover:shadow-xl transition-all duration-200"
          >
            新增账户
          </button>
        </div>
      </header>

      {/* 资金全景看板 */}
      <section className="grid gap-6 md:grid-cols-4">
        {/* 总资产卡片 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">总资产</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">折算RMB</div>
            <div
              className="mb-2 text-3xl font-bold text-white"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {currency(totalAssetsRMB, "CNY")}
            </div>
            <div className="text-xs text-white/60">
              {exchangeRates ? "使用实时汇率折算" : "所有账户按汇率折算"}
            </div>
          </div>
        </div>

        {/* 美金总额卡片 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">美金总额</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">USD 账户</div>
            <div
              className="mb-2 text-3xl font-bold text-white"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {currency(totalUSD, "USD")}
            </div>
            <div className="mb-1 text-xs text-white/60">预估 RMB</div>
            <div
              className="mb-2 text-xl font-semibold text-white/90"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {currency(totalUSDRMB, "CNY")}
            </div>
            <div className="text-xs text-white/60">
              {exchangeRates 
                ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>实时汇率: 1 USD = {exchangeRates.USD.toFixed(4)} CNY</span>
                    {exchangeRates.lastUpdated && (
                      <span className="text-white/40 text-[10px]">
                        ({new Date(exchangeRates.lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                    <button
                      onClick={() => mutateRates()}
                      className="text-cyan-400 hover:text-cyan-300 text-[10px] underline"
                      title="手动刷新汇率"
                    >
                      刷新
                    </button>
                  </div>
                )
                : "USD 账户原币余额"}
            </div>
          </div>
        </div>

        {/* 日元总额卡片 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Coins className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">日元总额</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">JPY 账户</div>
            <div
              className="mb-2 text-3xl font-bold text-white"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              ¥{formatNumber(totalJPY)} JPY
            </div>
            <div className="mb-1 text-xs text-white/60">预估 RMB</div>
            <div
              className="mb-2 text-xl font-semibold text-white/90"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {currency(totalJPYRMB, "CNY")}
            </div>
            <div className="text-xs text-white/60">
              {exchangeRates 
                ? (
                  <div className="flex items-center gap-2">
                    <span>实时汇率: 1 JPY = {exchangeRates.JPY.toFixed(6)} CNY</span>
                    {exchangeRates.lastUpdated && (
                      <span className="text-white/40 text-[10px]">
                        ({new Date(exchangeRates.lastUpdated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                    <button
                      onClick={() => mutateRates()}
                      className="text-cyan-400 hover:text-cyan-300 text-[10px] underline"
                      title="手动刷新汇率"
                    >
                      刷新
                    </button>
                  </div>
                )
                : "JPY 账户原币余额"}
            </div>
          </div>
        </div>

        {/* 人民币账户金额卡片 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">人民币账户金额</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">RMB 账户</div>
            <div
              className="mb-2 text-3xl font-bold text-white"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {currency(totalRMBAccountBalance, "CNY")}
            </div>
            <div className="text-xs text-white/60">RMB 账户原币余额（含初始资金）</div>
          </div>
        </div>
      </section>

      {/* 账户统计摘要 */}
      <section className="grid gap-4 md:grid-cols-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">账户总数</div>
          <div className="text-2xl font-bold text-slate-100" suppressHydrationWarning>
            {accountsLoading ? "-" : accountSummary.totalCount}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">主账户</div>
          <div className="text-2xl font-bold text-primary-300" suppressHydrationWarning>
            {accountsLoading ? "-" : accountSummary.primaryCount}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">虚拟子账号</div>
          <div className="text-2xl font-bold text-blue-300" suppressHydrationWarning>
            {accountsLoading ? "-" : accountSummary.virtualCount}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 mb-1">平均余额（RMB）</div>
          <div className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {currency(accountSummary.avgRMBBalance, "CNY")}
          </div>
        </div>
      </section>

      {/* 搜索、筛选、排序工具栏 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索账户名称或账号后四位..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 rounded-md border border-slate-700 bg-slate-900 text-sm text-slate-300 outline-none focus:border-primary-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 快速筛选标签和排序 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 快速筛选标签 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">快速筛选：</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterCategory("all")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterCategory === "all"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterCategory("对公")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterCategory === "对公"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                对公
              </button>
              <button
                onClick={() => setFilterCategory("对私")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterCategory === "对私"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                对私
              </button>
              <button
                onClick={() => setFilterCategory("平台")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterCategory === "平台"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                平台
              </button>
            </div>
          </div>

          {/* 排序按钮 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400">排序：</span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  if (sortBy === "balance" && sortOrder === "desc") {
                    setSortBy("balance");
                    setSortOrder("asc");
                  } else {
                    setSortBy("balance");
                    setSortOrder("desc");
                  }
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  sortBy === "balance"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                余额
                {sortBy === "balance" && (sortOrder === "desc" ? <SortDesc className="h-3 w-3" /> : <SortAsc className="h-3 w-3" />)}
              </button>
              <button
                onClick={() => {
                  if (sortBy === "name" && sortOrder === "asc") {
                    setSortBy("name");
                    setSortOrder("desc");
                  } else {
                    setSortBy("name");
                    setSortOrder("asc");
                  }
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  sortBy === "name"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                名称
                {sortBy === "name" && (sortOrder === "asc" ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />)}
              </button>
              {sortBy !== "none" && (
                <button
                  onClick={() => setSortBy("none")}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                  title="清除排序"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* 原有筛选器 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">币种：</span>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
            >
              <option value="all">全部</option>
              <option value="RMB">RMB</option>
              <option value="USD">USD</option>
              <option value="JPY">JPY</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">类型：</span>
            <select
              value={filterAccountType}
              onChange={(e) => setFilterAccountType(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 outline-none focus:border-primary-400"
            >
              <option value="all">全部</option>
              <option value="对公">对公</option>
              <option value="对私">对私</option>
              <option value="平台">平台</option>
            </select>
          </div>
        </div>
      </section>

      {/* 账户列表 - 卡片Grid布局 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        {accountsLoading ? (
          <div className="py-8 text-center text-slate-500">
            加载中...
          </div>
        ) : flattenedAccounts.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            暂无账户，请点击右上角"新增账户"
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "24px"
            }}
          >
            {flattenedAccounts.map((acc) => {
              const IconComponent = getAccountIcon(acc);
              const trendData = accountTrendData[acc.id] || [];
              // 显示余额 = originalBalance（已经包含了 initialCapital + 所有流水）
              // 注意：originalBalance 已经包含了 initialCapital，所以不需要再加
              const displayBalance = acc.originalBalance || 0;
              const purposeLabel = acc.accountPurpose;
              const associatedStore = acc.storeId ? stores.find((s) => s.id === acc.storeId) : null;
              const accountCountry = COUNTRIES.find((c) => c.code === (acc.country || "CN"));
              const isHovered = hoveredAccountId === acc.id;
              
              // 计算子账户数量（如果是主账户）
              const childCount = acc.accountCategory === "PRIMARY" 
                ? accounts.filter((a) => a.parentId === acc.id).length 
                : 0;
              
              // 查找父账户（如果是虚拟子账号）
              const parentAccount = acc.parentId 
                ? accounts.find((a) => a.id === acc.parentId) 
                : null;
              
              // 格式化创建时间
              const formatCreatedAt = (dateStr?: string) => {
                if (!dateStr) return "-";
                try {
                  const date = new Date(dateStr);
                  return date.toLocaleString("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit"
                  });
                } catch {
                  return dateStr;
                }
              };

              // 加载流水记录的函数（现在使用 SWR 数据）
              const handleViewFlow = () => {
                setSelectedAccountForFlow(acc);
                setAccountFlowModalOpen(true);
              };

              // 根据币种设置徽章样式（卡片背景统一）
              const getCurrencyBadgeStyle = () => {
                switch (acc.currency) {
                  case "RMB":
                    return "bg-red-500/20 text-red-200 border-red-400/30";
                  case "USD":
                    return "bg-blue-500/20 text-blue-200 border-blue-400/30";
                  case "JPY":
                    return "bg-purple-500/20 text-purple-200 border-purple-400/30";
                  case "EUR":
                    return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
                  default:
                    return "bg-slate-500/20 text-slate-200 border-slate-400/30";
                }
              };

              const currencyBadgeStyle = getCurrencyBadgeStyle();
              const currencyLabel = acc.currency === "RMB" ? "CNY" : acc.currency;

              return (
                <div
                  key={acc.id}
                  className="group relative overflow-hidden rounded-2xl border p-5 transition-all"
                  style={{
                    background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                    borderRadius: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.1)"
                  }}
                  onMouseEnter={() => setHoveredAccountId(acc.id)}
                  onMouseLeave={() => setHoveredAccountId(null)}
                >
                  {/* 币种标识 - 顶部显眼位置 */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-sm ${currencyBadgeStyle}`}>
                      <Globe className="h-4 w-4" />
                      <span className="text-sm font-bold">{currencyLabel}</span>
                    </div>
                    {/* 操作按钮 */}
                    <div 
                      className="flex gap-1 relative z-30"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        setHoveredAccountId(null);
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/finance/accounts/balance-detail?accountId=${acc.id}&name=${encodeURIComponent(acc.name)}`);
                        }}
                        className="rounded-lg bg-white/10 p-1.5 text-white/80 hover:bg-white/20 transition-colors backdrop-blur-sm"
                        title="查看余额计算详情"
                      >
                        <Calculator className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewFlow();
                        }}
                        className="rounded-lg bg-white/10 p-1.5 text-white/80 hover:bg-white/20 transition-colors backdrop-blur-sm"
                        title="查看流水"
                      >
                        <List className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(acc);
                        }}
                        className="rounded-lg bg-white/10 p-1.5 text-white/80 hover:bg-white/20 transition-colors backdrop-blur-sm"
                        title="编辑"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(acc.id);
                        }}
                        className="rounded-lg bg-white/10 p-1.5 text-white/80 hover:bg-white/20 transition-colors backdrop-blur-sm"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* 账户信息 */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="rounded-lg bg-white/10 p-2 backdrop-blur-sm">
                        <IconComponent className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-lg mb-1 truncate">{acc.name}</div>
                        <div className="text-xs text-white/70 font-mono">{formatAccountNumber(acc.accountNumber)}</div>
                        {acc.owner && (
                          <div className="text-xs text-white/60 mt-1">
                            <span className="text-white/50">归属人：</span>
                            <span className="text-amber-300 font-medium">{acc.owner}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 账号类型和用途标签 */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {acc.accountType && (
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                          acc.accountType === "对公" 
                            ? "bg-blue-500/30 text-blue-200 border border-blue-400/30" 
                            : acc.accountType === "对私"
                            ? "bg-purple-500/30 text-purple-200 border border-purple-400/30"
                            : "bg-amber-500/30 text-amber-200 border border-amber-400/30"
                        }`}>
                          {acc.accountType}
                        </span>
                      )}
                      {purposeLabel && (
                        <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
                          {purposeLabel}
                        </span>
                      )}
                    </div>
                    {/* 子账号信息 */}
                    {childCount > 0 && (
                      <div className="mt-2 text-xs text-white/70">
                        <span className="text-white/50">子账户：</span>
                        <span className="text-primary-300 font-medium ml-1">{childCount} 个</span>
                      </div>
                    )}
                    {parentAccount && (
                      <div className="mt-2 text-xs text-white/70">
                        <span className="text-white/50">父账户：</span>
                        <span className="text-blue-300 font-medium ml-1 truncate">{parentAccount.name}</span>
                      </div>
                    )}
                  </div>

                  {/* 余额显示 */}
                  <div className="mb-4">
                    <div className="text-xs text-white/70 mb-1 font-medium">账户余额</div>
                    <div
                      className="text-3xl font-bold text-white drop-shadow-lg"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {acc.currency === "RMB"
                        ? currency(displayBalance, "CNY")
                        : acc.currency === "USD"
                        ? currency(displayBalance, "USD")
                        : acc.currency === "JPY"
                        ? `¥${formatNumber(displayBalance)}`
                        : `${formatNumber(displayBalance)} ${acc.currency}`}
                    </div>
                    {acc.currency !== "RMB" && (
                      <div className="mt-1 text-xs text-white/60">
                        约 {currency(
                          (() => {
                            // 优先使用实时汇率，如果没有则使用账户存储的汇率
                            let rate = acc.exchangeRate || 1;
                            if (exchangeRates) {
                              if (acc.currency === "USD") {
                                rate = exchangeRates.USD;
                              } else if (acc.currency === "JPY") {
                                rate = exchangeRates.JPY;
                              }
                            }
                            return displayBalance * rate;
                          })(),
                          "CNY"
                        )}
                        {exchangeRates && (
                          <span className="ml-1 text-cyan-400/70 text-[10px]">
                            (实时)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 底部：7天余额波形图 */}
                  <div className="h-20">
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}>
                          <defs>
                            <linearGradient id={`gradient-${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area
                            type="monotone"
                            dataKey="balance"
                            stroke="#60a5fa"
                            strokeWidth={2}
                            fill={`url(#gradient-${acc.id})`}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        暂无数据
                      </div>
                    )}
                  </div>

                  {/* 详情预览（悬停时显示） */}
                  {isHovered && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-2xl p-5 flex flex-col justify-between z-10 overflow-y-auto">
                      <div className="space-y-2 text-xs">
                        {/* 基本信息 */}
                        <div className="pb-2 border-b border-white/10">
                          <div className="text-xs font-semibold text-slate-300 mb-2">基本信息</div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">账户类别：</span>
                            <span className="text-white font-medium">
                              {acc.accountCategory === "PRIMARY" ? "主账户" : acc.accountCategory === "VIRTUAL" ? "虚拟子账号" : acc.accountType}
                            </span>
                          </div>
                          {acc.accountType && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">账户类型：</span>
                              <span className="text-white">{acc.accountType}</span>
                            </div>
                          )}
                          {acc.accountPurpose && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">账户用途：</span>
                              <span className="text-white">{acc.accountPurpose}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">币种：</span>
                            <span className="text-white font-medium">{acc.currency}</span>
                          </div>
                          {acc.accountNumber && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">账号：</span>
                              <span className="text-white font-mono text-xs">{acc.accountNumber}</span>
                            </div>
                          )}
                          {acc.accountType === "平台" && acc.platformAccount && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">平台账号：</span>
                              <span className="text-white font-mono text-xs">{acc.platformAccount}</span>
                            </div>
                          )}
                          {acc.accountType === "平台" && acc.platformUrl && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">登入网站：</span>
                              <a
                                href={acc.platformUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-300 hover:text-blue-200 underline text-xs truncate max-w-[200px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {acc.platformUrl}
                              </a>
                            </div>
                          )}
                        </div>

                        {/* 关联信息 */}
                        {(acc.owner || acc.companyEntity || accountCountry || associatedStore || parentAccount || childCount > 0) && (
                          <div className="pb-2 border-b border-white/10">
                            <div className="text-xs font-semibold text-slate-300 mb-2">关联信息</div>
                            {acc.owner && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">账号归属人：</span>
                                <span className="text-amber-300 font-medium">{acc.owner}</span>
                              </div>
                            )}
                            {acc.companyEntity && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">公司主体：</span>
                                <span className="text-white">{acc.companyEntity}</span>
                              </div>
                            )}
                            {accountCountry && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">国家/地区：</span>
                                <span className="text-white">{accountCountry.name} ({accountCountry.code})</span>
                              </div>
                            )}
                            {associatedStore && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">关联店铺：</span>
                                <span className="text-emerald-300">{associatedStore.name}</span>
                              </div>
                            )}
                            {parentAccount && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">父账户：</span>
                                <span className="text-blue-300">{parentAccount.name}</span>
                              </div>
                            )}
                            {childCount > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">子账户数量：</span>
                                <span className="text-primary-300 font-medium">{childCount} 个</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 余额信息 */}
                        <div className="pb-2 border-b border-white/10">
                          <div className="text-xs font-semibold text-slate-300 mb-2">余额信息</div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">原币余额：</span>
                            <span className="text-white font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {acc.currency === "RMB"
                                ? currency(displayBalance, "CNY")
                                : acc.currency === "USD"
                                ? currency(displayBalance, "USD")
                                : acc.currency === "JPY"
                                ? `¥${formatNumber(displayBalance)}`
                                : `${formatNumber(displayBalance)} ${acc.currency}`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">折算RMB：</span>
                            <span className="text-emerald-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {(() => {
                                // 计算 RMB 余额（originalBalance 已经包含了 initialCapital）
                                const totalOriginalBalance = acc.originalBalance || 0;
                                if (acc.currency === "RMB") {
                                  return currency(totalOriginalBalance, "CNY");
                                }
                                // 优先使用实时汇率
                                let rate = acc.exchangeRate || 1;
                                if (exchangeRates) {
                                  if (acc.currency === "USD") {
                                    rate = exchangeRates.USD;
                                  } else if (acc.currency === "JPY") {
                                    rate = exchangeRates.JPY;
                                  }
                                }
                                return currency(totalOriginalBalance * rate, "CNY");
                              })()}
                            </span>
                          </div>
                          {acc.currency !== "RMB" && (
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">汇率：</span>
                              <span className="text-white">
                                {(() => {
                                  // 显示实时汇率或账户汇率
                                  if (exchangeRates) {
                                    if (acc.currency === "USD") {
                                      return `${formatNumber(exchangeRates.USD)} (实时)`;
                                    } else if (acc.currency === "JPY") {
                                      return `${formatNumber(exchangeRates.JPY)} (实时)`;
                                    }
                                  }
                                  return formatNumber(acc.exchangeRate || 1);
                                })()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 其他信息 */}
                        {(acc.notes || acc.createdAt) && (
                          <div>
                            <div className="text-xs font-semibold text-slate-300 mb-2">其他信息</div>
                            {acc.createdAt && (
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-slate-400">创建时间：</span>
                                <span className="text-white text-xs">{formatCreatedAt(acc.createdAt)}</span>
                              </div>
                            )}
                            {acc.notes && (
                              <div>
                                <div className="text-slate-400 mb-1">备注：</div>
                                <div className="text-white text-xs bg-white/5 p-2 rounded border border-white/10">{acc.notes}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 新增/编辑弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{editAccount ? "编辑账户" : "新增账户"}</h2>
                <p className="text-xs text-slate-400">账户名称是必填项，汇率将自动计算折算RMB余额。</p>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={editAccount ? handleUpdate : handleCreate} className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">
                    账户名称 <span className="text-rose-400">*</span>
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：寻汇美金、招行公户"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">账号（卡号）</span>
                  <input
                    value={form.accountNumber}
                    onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">账户类别 <span className="text-rose-400">*</span></span>
                  <select
                    value={form.accountCategory}
                    onChange={(e) => {
                      const category = e.target.value as BankAccount["accountCategory"];
                      setForm((f) => ({
                        ...f,
                        accountCategory: category,
                        parentId: category === "VIRTUAL" ? f.parentId : "",
                        storeId: category === "VIRTUAL" ? f.storeId : "",
                        originalBalance: category === "PRIMARY" ? "" : f.originalBalance
                      }));
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                  >
                    <option value="PRIMARY">主账户（汇总子账号余额）</option>
                    <option value="VIRTUAL">虚拟子账号（必须绑定店铺）</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">账号类型</span>
                  <select
                    value={form.accountType}
                    onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value as BankAccount["accountType"] }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="对公">对公</option>
                    <option value="对私">对私</option>
                    <option value="平台">平台</option>
                  </select>
                </label>
                {form.accountType === "平台" && (
                  <>
                    <label className="space-y-1">
                      <span className="text-slate-300">平台账号</span>
                      <input
                        value={form.platformAccount}
                        onChange={(e) => setForm((f) => ({ ...f, platformAccount: e.target.value }))}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        placeholder="请输入平台账号"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-300">账号密码</span>
                      <input
                        type="password"
                        value={form.platformPassword}
                        onChange={(e) => setForm((f) => ({ ...f, platformPassword: e.target.value }))}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        placeholder="请输入账号密码"
                      />
                    </label>
                    <label className="space-y-1 col-span-2">
                      <span className="text-slate-300">登入网站</span>
                      <input
                        type="url"
                        value={form.platformUrl}
                        onChange={(e) => setForm((f) => ({ ...f, platformUrl: e.target.value }))}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        placeholder="如：https://example.com"
                      />
                    </label>
                  </>
                )}
                {form.accountCategory === "VIRTUAL" && (
                  <label className="space-y-1 col-span-2">
                    <span className="text-slate-300">
                      关联主账户 <span className="text-rose-400">*</span>
                    </span>
                    <select
                      value={form.parentId}
                      onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      required
                    >
                      <option value="">请选择主账户</option>
                      {primaryAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.currency})
                        </option>
                      ))}
                    </select>
                    {primaryAccounts.length === 0 && (
                      <div className="text-xs text-amber-400 mt-1">
                        请先创建主账户
                      </div>
                    )}
                  </label>
                )}
                <label className="space-y-1">
                  <span className="text-slate-300">账号用途</span>
                  <input
                    value={form.accountPurpose}
                    onChange={(e) => setForm((f) => ({ ...f, accountPurpose: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：采购货款、广告费"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">公司主体</span>
                  <input
                    value={form.companyEntity}
                    onChange={(e) => setForm((f) => ({ ...f, companyEntity: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：XX有限公司、XX贸易公司"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">账号归属人</span>
                  <input
                    value={form.owner}
                    onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：张三、李四"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">币种</span>
                  {form.storeId ? (
                    <input
                      type="text"
                      value={form.currency}
                      readOnly
                      className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 outline-none text-slate-400 cursor-not-allowed"
                    />
                  ) : (
                  <select
                    value={form.currency}
                    onChange={(e) => {
                      const newCurrency = e.target.value as BankAccount["currency"];
                      setForm((f) => ({
                        ...f,
                        currency: newCurrency,
                        exchangeRate: newCurrency === "RMB" ? "1" : f.exchangeRate
                      }));
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="RMB">RMB (人民币)</option>
                    <option value="USD">USD (美元)</option>
                    <option value="JPY">JPY (日元)</option>
                    <option value="EUR">EUR (欧元)</option>
                      <option value="GBP">GBP (英镑)</option>
                      <option value="HKD">HKD (港币)</option>
                      <option value="SGD">SGD (新加坡元)</option>
                      <option value="AUD">AUD (澳元)</option>
                  </select>
                  )}
                  {form.storeId && (
                    <div className="text-xs text-slate-500 mt-1">
                      已锁定（与关联店铺同步）
                    </div>
                  )}
                </label>
                {form.accountCategory === "VIRTUAL" && (
                  <label className="space-y-1 col-span-2">
                    <span className="text-slate-300">
                      关联店铺
                    </span>
                    <select
                      value={form.storeId}
                      onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    >
                      <option value="">不关联店铺（可选）</option>
                      {stores.map((store) => {
                        const country = getCountryByCode(store.country);
                        return (
                          <option key={store.id} value={store.id}>
                            {store.name} ({store.platform}) - {country?.name || store.country} - {store.currency}
                          </option>
                        );
                      })}
                    </select>
                    {form.storeId && (
                      <div className="text-xs text-emerald-400 mt-1">
                        已关联店铺，国家/币种已自动同步并锁定
                      </div>
                    )}
                    {stores.length === 0 && (
                      <div className="text-xs text-amber-400 mt-1">
                        暂无店铺，请先前往"系统设置 - 店铺管理"创建店铺
                      </div>
                    )}
                  </label>
                )}
                {form.accountCategory !== "VIRTUAL" && (
                  <label className="space-y-1 col-span-2">
                    <span className="text-slate-300">关联店铺（可选）</span>
                    <select
                      value={form.storeId}
                      onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    >
                      <option value="">不关联店铺</option>
                      {stores.map((store) => {
                        const country = getCountryByCode(store.country);
                        return (
                          <option key={store.id} value={store.id}>
                            {store.name} ({store.platform}) - {country?.name || store.country} - {store.currency}
                          </option>
                        );
                      })}
                  </select>
                    {form.storeId && (
                      <div className="text-xs text-emerald-400 mt-1">
                        已关联店铺，国家/币种已自动同步并锁定
                      </div>
                    )}
                </label>
                )}
                <label className="space-y-1">
                  <span className="text-slate-300">所属国家/地区</span>
                  <input
                    type="text"
                    value={form.storeId ? (() => {
                      const selectedStore = stores.find((s) => s.id === form.storeId);
                      if (selectedStore) {
                        const country = getCountryByCode(selectedStore.country);
                        return country ? `${country.name} (${country.code})` : selectedStore.country;
                      }
                      return "";
                    })() : (() => {
                      const country = getCountryByCode(form.country);
                      return country ? `${country.name} (${country.code})` : form.country;
                    })()}
                    readOnly
                    className={`w-full rounded-md border border-slate-700 px-3 py-2 outline-none ${
                      form.storeId
                        ? "bg-slate-800/50 text-slate-400 cursor-not-allowed"
                        : "bg-slate-900 text-slate-300"
                    }`}
                  />
                  {!form.storeId && (
                    <select
                      value={form.country}
                      onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 mt-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    >
                      {Object.entries(countriesByRegion).map(([region, countries]) => (
                        <optgroup key={region} label={region}>
                          {countries.map((country) => (
                            <option key={country.code} value={country.code}>
                              {country.name} ({country.code})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                  {form.storeId && (
                    <div className="text-xs text-slate-500 mt-1">
                      已锁定（与关联店铺同步）
                    </div>
                  )}
                </label>
                {form.accountCategory !== "PRIMARY" && (
                <label className="space-y-1">
                  <span className="text-slate-300">原币余额 <span className="text-rose-400">*</span></span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.originalBalance}
                    onChange={(e) => {
                      const value = e.target.value;
                      // 允许空字符串、负数和正数
                      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                        setForm((f) => ({ ...f, originalBalance: value }));
                      }
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-300"
                    placeholder="请输入原币余额，如：1000.00"
                    required
                    min="0"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    当前账户的原币余额（会随流水变化）
                  </div>
                </label>
                )}
                {form.accountCategory === "PRIMARY" && (
                  <label className="space-y-1">
                    <span className="text-slate-300">原币余额</span>
                    <input
                      type="text"
                      value="自动汇总（子账号余额）"
                      readOnly
                      className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 outline-none text-slate-400 cursor-not-allowed"
                    />
                    <div className="text-xs text-slate-500 mt-1">
                      主账户余额自动汇总所有子账号
                    </div>
                  </label>
                )}
                <label className="space-y-1">
                  <span className="text-slate-300">
                    汇率（对RMB）{form.currency === "RMB" && <span className="text-slate-500">(固定为1)</span>}
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.currency === "RMB" ? "1" : form.exchangeRate}
                    onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="如：7.2500"
                    disabled={form.currency === "RMB"}
                    required={form.currency !== "RMB"}
                  />
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">折算RMB余额（自动计算）</span>
                  <div className="w-full rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-emerald-300 font-medium">
                    {currency(currentRMBBalance, "CNY")}
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">原始资金</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.initialCapital}
                    onChange={(e) => {
                      const value = e.target.value;
                      // 允许空字符串、负数和正数
                      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                        setForm((f) => ({ ...f, initialCapital: value }));
                      }
                    }}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-slate-300"
                    placeholder="请输入账户的初始资金，如：10000.00"
                    min="0"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    账户创建时的初始资金（固定值，不受流水影响）
                    {form.accountCategory === "PRIMARY" && "，主账户的原始资金用于记录初始投入"}
                  </div>
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-slate-300">使用说明</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    rows={3}
                    placeholder="多行文本备注"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isCreating || isUpdating}
                >
                  {isCreating || isUpdating 
                    ? (editAccount ? "更新中..." : "创建中...") 
                    : (editAccount ? "保存修改" : "保存")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 账户流水明细模态框 */}
      {accountFlowModalOpen && selectedAccountForFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  账户流水明细 - {selectedAccountForFlow.name}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedAccountForFlow.accountNumber && `账号：${selectedAccountForFlow.accountNumber} | `}
                  币种：{selectedAccountForFlow.currency} | 
                  当前余额：{selectedAccountForFlow.currency === "RMB"
                    ? currency(selectedAccountForFlow.originalBalance || 0, "CNY")
                    : selectedAccountForFlow.currency === "USD"
                      ? currency(selectedAccountForFlow.originalBalance || 0, "USD")
                      : `${formatNumber(selectedAccountForFlow.originalBalance || 0)} ${selectedAccountForFlow.currency}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setAccountFlowModalOpen(false);
                  setSelectedAccountForFlow(null);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* 正常收入支出 */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <div className="bg-slate-800/60 px-4 py-3 border-b border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-200">正常收入支出</h3>
                </div>
                {accountFlows.normal.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    暂无收入支出记录
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">日期</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">类型</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">摘要</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">分类</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">金额</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">备注</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">状态</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">业务单号</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {accountFlows.normal.map((flow) => (
                        <tr key={flow.id} className="hover:bg-slate-800/40">
                          <td className="px-3 py-2 text-slate-300">
                            {new Date(flow.createdAt || flow.date).toLocaleString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false
                            })}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                flow.type === "income"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-rose-500/20 text-rose-300"
                              }`}
                            >
                              {flow.type === "income" ? "收入" : "支出"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-300">{flow.summary}</td>
                          <td className="px-3 py-2 text-slate-400">{flow.category || "-"}</td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${
                              flow.type === "income" ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {flow.currency === "RMB"
                              ? currency(Math.abs(flow.amount), "CNY")
                              : flow.currency === "USD"
                                ? currency(Math.abs(flow.amount), "USD")
                                : `${formatNumber(Math.abs(flow.amount))} ${flow.currency}`}
                          </td>
                          <td className="px-3 py-2 text-slate-400 max-w-xs truncate" title={flow.remark}>
                            {flow.remark || "-"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                flow.status === "confirmed"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {flow.status === "confirmed" ? "已确认" : "待核对"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs">
                            {flow.businessNumber || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                      <tfoot className="bg-slate-800/40">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right font-medium text-slate-300">
                            合计：
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="space-y-1">
                              <div className="text-emerald-300 font-medium">
                                收入：{selectedAccountForFlow.currency === "RMB"
                                  ? currency(
                                      accountFlows.normal
                                        .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                        .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                      "CNY"
                                    )
                                  : selectedAccountForFlow.currency === "USD"
                                    ? currency(
                                        accountFlows.normal
                                          .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                        "USD"
                                      )
                                    : `${formatNumber(
                                        accountFlows.normal
                                          .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                      )} ${selectedAccountForFlow.currency}`}
                              </div>
                              <div className="text-rose-300 font-medium">
                                支出：{selectedAccountForFlow.currency === "RMB"
                                  ? currency(
                                      accountFlows.normal
                                        .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                        .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                      "CNY"
                                    )
                                  : selectedAccountForFlow.currency === "USD"
                                    ? currency(
                                        accountFlows.normal
                                          .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                        "USD"
                                      )
                                    : `${formatNumber(
                                        accountFlows.normal
                                          .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                      )} ${selectedAccountForFlow.currency}`}
                              </div>
                            </div>
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* 内部划拨记录 */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <div className="bg-slate-800/60 px-4 py-3 border-b border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-200">内部划拨记录</h3>
                </div>
                {accountFlows.transfers.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    暂无划拨记录
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">日期</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">类型</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">摘要</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-400">金额</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">备注</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {accountFlows.transfers.map((flow) => (
                          <tr key={flow.id} className="hover:bg-slate-800/40">
                            <td className="px-3 py-2 text-slate-300">
                              {new Date(flow.createdAt || flow.date).toLocaleString("zh-CN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false
                              })}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  flow.type === "income"
                                    ? "bg-blue-500/20 text-blue-300"
                                    : "bg-purple-500/20 text-purple-300"
                                }`}
                              >
                                {flow.type === "income" ? "划入" : "划出"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-300">{flow.summary}</td>
                            <td
                              className={`px-3 py-2 text-right font-medium ${
                                flow.type === "income" ? "text-blue-300" : "text-purple-300"
                              }`}
                            >
                              {flow.currency === "RMB"
                                ? currency(Math.abs(flow.amount), "CNY")
                                : flow.currency === "USD"
                                  ? currency(Math.abs(flow.amount), "USD")
                                  : `${formatNumber(Math.abs(flow.amount))} ${flow.currency}`}
                            </td>
                            <td className="px-3 py-2 text-slate-400 max-w-xs truncate" title={flow.remark}>
                              {flow.remark || "-"}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs ${
                                  flow.status === "confirmed"
                                    ? "bg-blue-500/20 text-blue-300"
                                    : "bg-amber-500/20 text-amber-300"
                                }`}
                              >
                                {flow.status === "confirmed" ? "已确认" : "待核对"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-800/40">
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-right font-medium text-slate-300">
                            合计：
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="space-y-1">
                              <div className="text-blue-300 font-medium">
                                划入：{selectedAccountForFlow.currency === "RMB"
                                  ? currency(
                                      accountFlows.transfers
                                        .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                        .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                      "CNY"
                                    )
                                  : selectedAccountForFlow.currency === "USD"
                                    ? currency(
                                        accountFlows.transfers
                                          .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                        "USD"
                                      )
                                    : `${formatNumber(
                                        accountFlows.transfers
                                          .filter((f) => f.type === "income" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                      )} ${selectedAccountForFlow.currency}`}
                              </div>
                              <div className="text-purple-300 font-medium">
                                划出：{selectedAccountForFlow.currency === "RMB"
                                  ? currency(
                                      accountFlows.transfers
                                        .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                        .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                      "CNY"
                                    )
                                  : selectedAccountForFlow.currency === "USD"
                                    ? currency(
                                        accountFlows.transfers
                                          .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0),
                                        "USD"
                                      )
                                    : `${formatNumber(
                                        accountFlows.transfers
                                          .filter((f) => f.type === "expense" && f.status === "confirmed" && !f.isReversal)
                                          .reduce((sum, f) => sum + Math.abs(f.amount), 0)
                                      )} ${selectedAccountForFlow.currency}`}
                              </div>
                            </div>
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setAccountFlowModalOpen(false);
                  setSelectedAccountForFlow(null);
                }}
                className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
