"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Wallet, TrendingUp, TrendingDown, AlertCircle, ArrowRight } from "lucide-react";
import { type Store, getStores } from "@/lib/store-store";
import { type BankAccount, getAccounts } from "@/lib/finance-store";
import type { CashFlow } from "./finance/cash-flow/page";
import { getPendingApprovalCount } from "@/lib/reconciliation-store";
import Link from "next/link";

const CASH_FLOW_KEY = "cashFlow";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export default function HomePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const loadedStores = getStores();
      setStores(loadedStores);
      const loadedAccounts = getAccounts();
      setAccounts(loadedAccounts);
      const stored = window.localStorage.getItem(CASH_FLOW_KEY);
      if (stored) {
        try {
          const parsed: CashFlow[] = JSON.parse(stored);
          setCashFlow(parsed);
        } catch (e) {
          console.error("Failed to parse cash flow", e);
        }
      }
      
      // 获取待审批账单数量
      try {
        const count = getPendingApprovalCount();
        setPendingApprovalCount(count);
      } catch (e) {
        console.error("Failed to get pending approval count", e);
      }
    } catch (e) {
      console.error("Failed to initialize page", e);
    }
  }, []);

  // 计算店铺贡献排行
  const storeRanking = useMemo(() => {
    return stores
      .map((store) => {
        const storeIncomes = cashFlow.filter(
          (flow) =>
            flow.type === "income" &&
            flow.accountId === store.accountId &&
            !(flow as any).isReversal &&
            ((flow as any).status === "confirmed" || !(flow as any).status)
        );
        const account = accounts.find((a) => a.id === store.accountId);
        const exchangeRate = account?.exchangeRate || 1;
        const totalIncome = storeIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount || 0), 0);
        const totalIncomeRMB = store.currency === "RMB" ? totalIncome : totalIncome * exchangeRate;

        // 本月回款
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        const thisMonthIncomes = storeIncomes.filter((flow) => {
          if (!flow.date) return false;
          const d = new Date(flow.date);
          if (isNaN(d.getTime())) return false;
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        });
        const thisMonthIncome = thisMonthIncomes.reduce((sum, flow) => sum + Math.abs(flow.amount || 0), 0);
        const thisMonthIncomeRMB = store.currency === "RMB" ? thisMonthIncome : thisMonthIncome * exchangeRate;

        return {
          store,
          totalIncomeRMB,
          thisMonthIncomeRMB
        };
      })
      .sort((a, b) => b.totalIncomeRMB - a.totalIncomeRMB)
      .slice(0, 5); // 取前5名
  }, [stores, cashFlow, accounts]);

  // 总资产统计（包含初始资金）
  const totalAssets = useMemo(() => {
    return accounts.reduce((sum, acc) => {
      // 计算账户总余额 = 初始资金 + 当前余额
      const accountTotal = (acc.initialCapital || 0) + (acc.originalBalance || 0);
      // 转换为RMB
      const rmbValue = acc.currency === "RMB" 
        ? accountTotal 
        : accountTotal * (acc.exchangeRate || 1);
      return sum + rmbValue;
    }, 0);
  }, [accounts]);

  // 本月收支统计
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthFlow = cashFlow.filter((f) => {
    if (!f.date) return false;
    const d = new Date(f.date);
    if (isNaN(d.getTime())) return false;
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear && !(f as any).isReversal;
  });
  const thisMonthIncome = thisMonthFlow.filter((f) => f.type === "income").reduce((sum, f) => sum + Math.abs(f.amount || 0), 0);
  const thisMonthExpense = thisMonthFlow.filter((f) => f.type === "expense").reduce((sum, f) => sum + Math.abs(f.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            欢迎使用 <span className="text-primary-300">TK Smart ERP</span> 国内端管理
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            左侧导航已为你准备好国内端的核心模块，点击任意菜单进入对应的业务子模块。
          </p>
        </div>
      </div>

      {/* 财务概览统计面板 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">总资产</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(totalAssets, "CNY")}
              </p>
              <Link
                href="/finance/accounts"
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 mt-3 transition-colors"
              >
                查看账户列表 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <Wallet className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">本月收入</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(thisMonthIncome, "CNY")}
              </p>
              <Link
                href="/finance/cash-flow"
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 mt-3 transition-colors"
              >
                查看流水明细 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <TrendingUp className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">本月支出</p>
              <p className="text-2xl font-bold text-rose-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {currency(thisMonthExpense, "CNY")}
              </p>
              <Link
                href="/finance/cash-flow"
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 mt-3 transition-colors"
              >
                查看流水明细 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <TrendingDown className="h-8 w-8 text-rose-300 opacity-50" />
          </div>
        </div>
      </div>

      {/* 店铺贡献排行 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">店铺贡献排行</h2>
            <p className="text-xs text-slate-400 mt-1">按累计回款额排序，一眼看出哪个店是"现金奶牛"</p>
          </div>
          <Link
            href="/finance/store-report"
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            查看详细统计 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {storeRanking.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <LayoutDashboard className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">暂无店铺数据</p>
            <p className="text-xs mt-2">
              请先前往 <Link href="/settings/stores" className="text-primary-400 hover:text-primary-300">店铺管理中心</Link> 创建店铺
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {storeRanking.map((item, index) => (
              <div
                key={item.store.id}
                className="relative overflow-hidden rounded-2xl border p-4 transition-all hover:scale-[1.02]"
                style={{
                  background: index === 0
                    ? "linear-gradient(135deg, #fbbf24 0%, #0f172a 100%)"
                    : index === 1
                      ? "linear-gradient(135deg, #64748b 0%, #0f172a 100%)"
                      : index === 2
                        ? "linear-gradient(135deg, #d97706 0%, #0f172a 100%)"
                        : "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                  border: "1px solid rgba(255, 255, 255, 0.1)"
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0
                            ? "bg-yellow-500/30 text-yellow-200"
                            : index === 1
                              ? "bg-slate-500/30 text-slate-200"
                              : index === 2
                                ? "bg-amber-600/30 text-amber-200"
                                : "bg-slate-700/30 text-slate-300"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-100">{item.store.name}</div>
                        <div className="text-xs text-slate-400">
                          {item.store.platform} · {item.store.currency}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xs text-slate-400 mb-1">累计回款</div>
                      <div className="text-xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {currency(item.totalIncomeRMB, "CNY")}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        本月：{currency(item.thisMonthIncomeRMB, "CNY")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

