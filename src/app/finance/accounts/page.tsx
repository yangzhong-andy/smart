"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  type BankAccount,
  getAccountStats,
  calculateRMBBalance,
  getAccountTree,
  calculatePrimaryAccountBalance
} from "@/lib/finance-store";
import { type Store } from "@/lib/store-store";
import { COUNTRIES, getCountriesByRegion, getCountryByCode } from "@/lib/country-config";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { Download } from "lucide-react";
import { AccountsStats } from "./components/AccountsStats";
import { AccountsFilters } from "./components/AccountsFilters";
import { AccountsTable } from "./components/AccountsTable";
import { AccountFormDialog, type AccountFormState } from "./components/AccountFormDialog";
import { AccountDetailDialog } from "./components/AccountDetailDialog";
import { AccountFlowDialog } from "./components/AccountFlowDialog";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BankAccountsPage() {
  
  // 使用 SWR 加载账户数据（分页接口返回 { data, pagination }，需取 data；pageSize 拉取全部）
  const { data: accountsData, isLoading: accountsLoading, mutate: mutateAccounts } = useSWR<BankAccount[] | { data: BankAccount[]; pagination: unknown }>('/api/accounts?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false, // 优化：关闭重连自动刷新
    keepPreviousData: true,
    dedupingInterval: 600000 // 10分钟内去重
  });
  
  // 使用 SWR 加载流水数据（分页接口返回 { data, pagination }；pageSize 拉取全部用于算余额）
  const { data: cashFlowData } = useSWR<any[] | { data: any[]; pagination: unknown }>('/api/cash-flow?page=1&pageSize=5000', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false, // 优化：关闭重连自动刷新
    keepPreviousData: true,
    dedupingInterval: 600000 // 10分钟内去重
  });
  
  // 兼容 API 返回 { data, pagination } 或直接数组
  const accountsListRaw = Array.isArray(accountsData) ? accountsData : (accountsData?.data ?? []);
  const cashFlowListRaw = Array.isArray(cashFlowData) ? cashFlowData : (cashFlowData?.data ?? []);
  // 统一流水 status 为小写，兼容 API 返回的 CONFIRMED / flowStatus
  const cashFlowList = useMemo(
    () =>
      cashFlowListRaw.map((f: any) => ({
        ...f,
        status: (String(f.flowStatus ?? f.status ?? "").toLowerCase() || "pending") as "confirmed" | "pending"
      })),
    [cashFlowListRaw]
  );

  // 基于 API 数据和流水重新计算余额
  const accounts = useMemo(() => {
    if (!accountsListRaw.length) return [];

    // 重置所有账户的余额，从 initialCapital 开始重新计算（从流水记录重新计算）
    let updatedAccounts = accountsListRaw.map((acc) => {
      const hasChildren = accountsListRaw.some((a) => a.parentId === acc.id);
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

    // 遍历所有流水记录，更新账户余额（含冲销记录，冲销金额为反向）
    if (cashFlowList.length > 0) {
      cashFlowList.forEach((flow) => {
        if (flow.status === "confirmed" && flow.accountId) {
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
  }, [accountsListRaw, cashFlowList]);
  
  const [stores, setStores] = useState<Store[]>([]);
  const storesList = Array.isArray(stores) ? stores : [];
  const accountsReady = !accountsLoading;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const [filterAccountType, setFilterAccountType] = useState<string>("all");
  const [selectedAccountForFlow, setSelectedAccountForFlow] = useState<BankAccount | null>(null);
  const [accountFlowModalOpen, setAccountFlowModalOpen] = useState(false);
  
  // 从 SWR 数据中筛选出选中账户的流水，并分类
  const accountFlows = useMemo(() => {
    if (!selectedAccountForFlow || !cashFlowList.length) return { normal: [], transfers: [] };
    const allFlows = cashFlowList
      .filter((flow) => flow.accountId === selectedAccountForFlow.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // 分类：正常收入支出 和 划拨记录
    const normal = allFlows.filter((flow) => flow.category !== "内部划拨");
    const transfers = allFlows.filter((flow) => flow.category === "内部划拨");
    
    return { normal, transfers };
  }, [selectedAccountForFlow, cashFlowList]);
  
  // 新增状态：搜索、排序、快速筛选
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"balance" | "name" | "none">("none");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterCategory, setFilterCategory] = useState<string>("all"); // all, 对公, 对私, 平台
  const [hoveredAccountId, setHoveredAccountId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>({
    name: "",
    accountNumber: "",
    accountType: "对公",
    accountCategory: "PRIMARY",
    accountPurpose: "",
    currency: "CNY",
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
      const selectedStore = storesList.find((s) => s.id === form.storeId);
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

  // 加载店铺数据（API）
  useEffect(() => {
    if (typeof window === "undefined") return;
    fetch("/api/stores")
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => setStores(Array.isArray(json) ? json : (json?.data ?? [])));
  }, []);

  // 使用统一汇率接口 /api/exchange-rates（与顶栏等一致）
  const { getRate, rates, date, isLoading: ratesLoading, error: ratesError, refresh: mutateRates } = useExchangeRate();
  const exchangeRates = useMemo(() => {
    const USD = getRate("USD");
    const JPY = getRate("JPY");
    const THB = getRate("THB");
    if (!rates || (USD === 0 && JPY === 0 && THB === 0)) return null;
    return { USD, JPY, THB, lastUpdated: date || "" };
  }, [rates, getRate, date]);

  // 使用 finance-store 的统计函数（基础数据）
  const { totalUSD, totalJPY } = useMemo(() => getAccountStats(accounts), [accounts]);

  // 计算人民币账户总金额（只统计币种为CNY的账户）
  // 注意：originalBalance 已经包含了 initialCapital，所以不需要再加
  const totalRMBAccountBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      if (acc.currency === "CNY" || acc.currency === "RMB") {
        // originalBalance 已经包含了 initialCapital + 所有流水
        return sum + (acc.originalBalance || 0);
      }
      return sum;
    }, 0);
  }, [accounts]);

  // 计算USD账户的预估CNY金额（使用实时汇率）
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

  // 计算JPY账户的预估CNY金额（使用实时汇率）
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
      if (acc.currency === "CNY" || acc.currency === "RMB") {
        // CNY 账户直接使用原币余额
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
    
    // 计算总CNY余额（originalBalance 已经包含了 initialCapital）
    const totalRMBBalance = flattenedAccounts.reduce((sum, acc) => {
      // originalBalance 已经包含了 initialCapital + 所有流水
      const rmbValue = acc.currency === "CNY" || acc.currency === "RMB" 
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

    const flows = cashFlowList;

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
  }, [flattenedAccounts, cashFlowList]);

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
    if (form.currency !== "CNY" && form.currency !== "RMB" && (Number.isNaN(exchangeRate) || exchangeRate <= 0)) {
      toast.error("非人民币账户需填写有效汇率");
      return;
    }
    const rmbBalance = form.accountCategory === "PRIMARY"
      ? 0
      : calculateRMBBalance(
      originalBalance,
      (form.currency === "CNY" || form.currency === "RMB") ? 1 : exchangeRate,
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
      exchangeRate: (form.currency === "CNY" || form.currency === "RMB") ? 1 : exchangeRate,
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
    if (form.currency !== "CNY" && form.currency !== "RMB" && (Number.isNaN(exchangeRate) || exchangeRate <= 0)) {
      toast.error("非人民币账户需填写有效汇率");
      return;
    }
    const rmbBalance = form.accountCategory === "PRIMARY"
      ? 0
      : calculateRMBBalance(
      originalBalance,
      (form.currency === "CNY" || form.currency === "RMB") ? 1 : exchangeRate,
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
        exchangeRate: (form.currency === "CNY" || form.currency === "RMB") ? 1 : exchangeRate,
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
      accountType: "对公",
      accountCategory: "PRIMARY",
      accountPurpose: "",
      currency: "CNY",
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
    const exchangeRateValue = (form.currency === "CNY" || form.currency === "RMB") ? 1 : rate;
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
      "折算CNY余额",
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
      const associatedStore = acc.storeId ? storesList.find((s) => s.id === acc.storeId) : null;
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

      <AccountsStats
        totalAssetsRMB={totalAssetsRMB}
        totalUSD={totalUSD}
        totalJPY={totalJPY}
        totalUSDRMB={totalUSDRMB}
        totalJPYRMB={totalJPYRMB}
        totalRMBAccountBalance={totalRMBAccountBalance}
        exchangeRates={exchangeRates}
        ratesError={ratesError}
        onRefreshRates={mutateRates}
        accountSummary={accountSummary}
        accountsLoading={accountsLoading}
      />

      <AccountsFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        sortBy={sortBy}
        sortOrder={sortOrder}
        setSortBy={setSortBy}
        setSortOrder={setSortOrder}
        filterCurrency={filterCurrency}
        setFilterCurrency={setFilterCurrency}
        filterAccountType={filterAccountType}
        setFilterAccountType={setFilterAccountType}
      />

      {/* 账户列表 */}
      <AccountsTable
        accounts={flattenedAccounts}
        allAccounts={accounts}
        storesList={storesList}
        accountTrendData={accountTrendData}
        exchangeRates={exchangeRates}
        hoveredAccountId={hoveredAccountId}
        setHoveredAccountId={setHoveredAccountId}
        onViewFlow={(acc) => {
          setSelectedAccountForFlow(acc);
          setAccountFlowModalOpen(true);
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onViewDetail={(acc) => setSelectedDetailAccount(acc)}
        isLoading={accountsLoading}
      />
      <AccountFormDialog
        open={isModalOpen}
        editAccount={editAccount}
        form={form}
        setForm={setForm}
        primaryAccounts={primaryAccounts}
        storesList={storesList}
        countriesByRegion={countriesByRegion}
        currentRMBBalance={currentRMBBalance}
        isCreating={isCreating}
        isUpdating={isUpdating}
        onSubmit={editAccount ? handleUpdate : handleCreate}
        onClose={() => {
          resetForm();
          setIsModalOpen(false);
        }}
      />
      <AccountDetailDialog
        open={!!selectedDetailAccount}
        account={selectedDetailAccount}
        allAccounts={accounts}
        storesList={storesList}
        exchangeRates={exchangeRates}
        onClose={() => setSelectedDetailAccount(null)}
      />
      <AccountFlowDialog
        open={accountFlowModalOpen && !!selectedAccountForFlow}
        account={selectedAccountForFlow}
        flows={accountFlows}
        onClose={() => {
          setAccountFlowModalOpen(false);
          setSelectedAccountForFlow(null);
        }}
      />
    </div>
  );
}
