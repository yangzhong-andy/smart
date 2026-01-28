"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Megaphone, TrendingUp, DollarSign, Clock, AlertCircle, ArrowRight, Eye, Plus, CreditCard, BarChart3 } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import Link from "next/link";
import {
  getAgencies,
  getAdAccounts,
  getAdConsumptions,
  getAdRecharges,
  type Agency,
  type AdAccount,
  type AdConsumption,
  type AdRecharge
} from "@/lib/ad-agency-store";
import { getMonthlyBills, type MonthlyBill } from "@/lib/reconciliation-store";

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

const formatCurrency = (amount: number, currency: string = "USD") => {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2
  }).format(amount);
};

export default function AdAgencyWorkbenchPage() {
  const [initialized, setInitialized] = useState(false);

  // SWR fetcher 函数
  const fetcher = useCallback(async (key: string) => {
    if (typeof window === "undefined") return null;
    switch (key) {
      case "agencies":
        return getAgencies();
      case "ad-accounts":
        return getAdAccounts();
      case "consumptions":
        return getAdConsumptions();
      case "recharges":
        return getAdRecharges();
      case "monthly-bills":
        return await getMonthlyBills();
      default:
        return null;
    }
  }, []);

  // 使用 SWR 获取数据（优化：增加去重间隔以减少数据库访问）
  const { data: agenciesData } = useSWR("agencies", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: adAccountsData } = useSWR("ad-accounts", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: consumptionsData } = useSWR("consumptions", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: rechargesData } = useSWR("recharges", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 10分钟内去重
  });
  const { data: monthlyBillsData } = useSWR("monthly-bills", fetcher, { 
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000 // 优化：增加到10分钟内去重
  });

  // 确保数据是数组并指定类型
  const agencies: Agency[] = Array.isArray(agenciesData) ? (agenciesData as Agency[]) : [];
  const adAccounts: AdAccount[] = Array.isArray(adAccountsData) ? (adAccountsData as AdAccount[]) : [];
  const consumptions: AdConsumption[] = Array.isArray(consumptionsData) ? (consumptionsData as AdConsumption[]) : [];
  const recharges: AdRecharge[] = Array.isArray(rechargesData) ? (rechargesData as AdRecharge[]) : [];
  const monthlyBills: MonthlyBill[] = Array.isArray(monthlyBillsData) ? (monthlyBillsData as MonthlyBill[]) : [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    setInitialized(true);
  }, []);

  // 统计信息
  const stats = useMemo(() => {
    // 基础统计
    const agencyCount = agencies.length;
    const accountCount = adAccounts.length;
    
    // 当前月份
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    // 本月消耗统计
    const thisMonthConsumptions = consumptions.filter((c) => c.month === currentMonth);
    const thisMonthConsumptionTotal = thisMonthConsumptions.reduce((sum, c) => sum + (c.amount || 0), 0);
    
    // 本月充值统计
    const thisMonthRecharges = recharges.filter((r) => r.month === currentMonth && r.paymentStatus === "Paid");
    const thisMonthRechargeTotal = thisMonthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
    
    // 待结算消耗（未结算的消耗）
    const unsettledConsumptions = consumptions.filter((c) => !c.isSettled);
    const unsettledTotal = unsettledConsumptions.reduce((sum, c) => sum + (c.amount || 0), 0);
    
    // 待审批充值（待付款的充值）
    const pendingRecharges = recharges.filter((r) => r.paymentStatus === "Pending");
    const pendingRechargeTotal = pendingRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
    
    // 余额不足的账户（余额小于等于0或接近信用额度）
    const lowBalanceAccounts = adAccounts.filter((acc) => {
      const balance = acc.currentBalance || 0;
      const creditLimit = acc.creditLimit || 0;
      return balance <= 0 || (creditLimit > 0 && balance < creditLimit * 0.1);
    });
    
    // 待生成账单的消耗（有消耗但未生成账单的月份）
    const monthsWithConsumption = new Set(consumptions.map((c) => c.month));
    const monthsWithBills = new Set(Array.isArray(monthlyBills) ? monthlyBills.map((b) => b.month) : []);
    const monthsNeedingBills = Array.from(monthsWithConsumption).filter((m) => !monthsWithBills.has(m));
    
    return {
      agency: {
        count: agencyCount
      },
      account: {
        count: accountCount,
        lowBalance: lowBalanceAccounts.length
      },
      consumption: {
        thisMonth: thisMonthConsumptionTotal,
        unsettled: unsettledTotal,
        unsettledCount: unsettledConsumptions.length
      },
      recharge: {
        thisMonth: thisMonthRechargeTotal,
        pending: pendingRechargeTotal,
        pendingCount: pendingRecharges.length
      },
      bill: {
        needsGeneration: monthsNeedingBills.length
      }
    };
  }, [agencies, adAccounts, consumptions, recharges, monthlyBills]);

  // 待结算消耗（最近5条）
  const urgentConsumptions = useMemo(() => {
    return consumptions
      .filter((c) => !c.isSettled)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [consumptions]);

  // 待审批充值（最近5条）
  const urgentRecharges = useMemo(() => {
    return recharges
      .filter((r) => r.paymentStatus === "Pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [recharges]);

  // 余额不足的账户（最近5个）
  const lowBalanceAccounts = useMemo(() => {
    return adAccounts
      .filter((acc) => {
        const balance = acc.currentBalance || 0;
        const creditLimit = acc.creditLimit || 0;
        return balance <= 0 || (creditLimit > 0 && balance < creditLimit * 0.1);
      })
      .sort((a, b) => (a.currentBalance || 0) - (b.currentBalance || 0))
      .slice(0, 5);
  }, [adAccounts]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="广告代理工作台"
        description="代理商管理、账户监控、消耗结算、充值审批"
        actions={
          <>
            <Link href="/advertising/agencies?tab=dashboard">
              <ActionButton variant="secondary" icon={Megaphone}>
                代理管理
              </ActionButton>
            </Link>
          </>
        }
      />

      {/* 统计面板 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard title="代理商数量" value={stats.agency.count} icon={Megaphone} />
        <StatCard title="广告账户数" value={stats.account.count} icon={CreditCard} />
        <StatCard title="本月消耗" value={formatCurrency(stats.consumption.thisMonth)} icon={TrendingUp} />
        <StatCard title="本月充值" value={formatCurrency(stats.recharge.thisMonth)} icon={DollarSign} />
        <StatCard title="待结算消耗" value={stats.consumption.unsettledCount} icon={Clock} />
        <StatCard title="待审批充值" value={stats.recharge.pendingCount} icon={AlertCircle} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 待结算消耗 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">待结算消耗</h2>
            <Link href="/advertising/agencies?tab=consumptions">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {urgentConsumptions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无待结算消耗</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentConsumptions.map((consumption) => {
                return (
                  <div
                    key={consumption.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-primary-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-slate-300 mb-1">{consumption.accountName}</div>
                        <div className="text-xs text-slate-400">
                          {formatCurrency(consumption.amount, consumption.currency)}
                          {consumption.storeName && ` · ${consumption.storeName}`}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {consumption.month} · {formatDate(consumption.date)}
                        </div>
                      </div>
                      <Link href="/advertising/agencies?tab=consumptions">
                        <ActionButton variant="ghost" size="sm" icon={Eye}>
                          查看
                        </ActionButton>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 待审批充值 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">待审批充值</h2>
            <Link href="/advertising/agencies?tab=recharges">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {urgentRecharges.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无待审批充值</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentRecharges.map((recharge) => {
                return (
                  <div
                    key={recharge.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-primary-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-slate-300 mb-1">{recharge.accountName}</div>
                        <div className="text-xs text-slate-400">
                          {formatCurrency(recharge.amount, recharge.currency)}
                          {recharge.rebateAmount && recharge.rebateAmount > 0 && (
                            <span className="text-emerald-400 ml-1">
                              (返点: {formatCurrency(recharge.rebateAmount, recharge.currency)})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {formatDate(recharge.date)}
                        </div>
                      </div>
                      <Link href="/advertising/agencies?tab=recharges">
                        <ActionButton variant="ghost" size="sm" icon={Eye}>
                          查看
                        </ActionButton>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 余额不足账户 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">余额不足账户</h2>
            <Link href="/advertising/agencies?tab=accounts">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {lowBalanceAccounts.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">所有账户余额正常</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowBalanceAccounts.map((account) => {
                const balance = account.currentBalance || 0;
                const creditLimit = account.creditLimit || 0;
                const isNegative = balance <= 0;
                
                return (
                  <div
                    key={account.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-primary-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-slate-300 mb-1">{account.accountName}</div>
                        <div className={`text-xs font-medium ${isNegative ? "text-rose-400" : "text-amber-400"}`}>
                          余额: {formatCurrency(balance, account.currency)}
                        </div>
                        {creditLimit > 0 && (
                          <div className="text-xs text-slate-500 mt-1">
                            信用额度: {formatCurrency(creditLimit, account.currency)}
                          </div>
                        )}
                      </div>
                      <Link href="/advertising/agencies?tab=accounts">
                        <ActionButton variant="ghost" size="sm" icon={Eye}>
                          查看
                        </ActionButton>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 快速操作 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">快速操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Link href="/advertising/agencies?tab=agencies">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary-500/20 p-2">
                  <Megaphone className="h-5 w-5 text-primary-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">代理管理</div>
                  <div className="text-xs text-slate-400">管理代理商</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/advertising/agencies?tab=accounts">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/20 p-2">
                  <CreditCard className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">账户管理</div>
                  <div className="text-xs text-slate-400">管理广告账户</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/advertising/agencies?tab=consumptions">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/20 p-2">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">消耗记录</div>
                  <div className="text-xs text-slate-400">记录广告消耗</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/advertising/agencies?tab=accounts">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/20 p-2">
                  <DollarSign className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">账户充值</div>
                  <div className="text-xs text-slate-400">为广告账户充值</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/advertising/agencies?tab=recharges">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/20 p-2">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">充值记录</div>
                  <div className="text-xs text-slate-400">查看充值历史</div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
