"use client";

import { Wallet, TrendingUp, DollarSign, Coins } from "lucide-react";
import type { AccountSummary, AccountStatsRates } from "./types";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

type AccountsStatsProps = {
  totalAssetsRMB: number;
  totalUSD: number;
  totalJPY: number;
  totalUSDRMB: number;
  totalJPYRMB: number;
  totalRMBAccountBalance: number;
  exchangeRates: AccountStatsRates;
  ratesError: Error | null;
  onRefreshRates: () => void;
  accountSummary: AccountSummary;
  accountsLoading: boolean;
};

export function AccountsStats({
  totalAssetsRMB,
  totalUSD,
  totalJPY,
  totalUSDRMB,
  totalJPYRMB,
  totalRMBAccountBalance,
  exchangeRates,
  ratesError,
  onRefreshRates,
  accountSummary,
  accountsLoading,
}: AccountsStatsProps) {
  return (
    <>
      {/* 资金全景看板 */}
      <section className="grid gap-6 md:grid-cols-4">
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">总资产</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">折算CNY</div>
            <div className="mb-2 text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalAssetsRMB, "CNY")}
            </div>
            <div className="text-xs text-white/60">
              {exchangeRates
                ? "使用实时汇率折算"
                : ratesError ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span title={ratesError.message}>{ratesError.message}</span>
                      <button
                        type="button"
                        onClick={() => onRefreshRates()}
                        className="text-cyan-400 underline hover:text-cyan-300"
                        title="重新请求汇率"
                      >
                        重试
                      </button>
                    </span>
                  ) : (
                    "所有账户按汇率折算"
                  )}
            </div>
          </div>
        </div>

        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">美金总额</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">USD 账户</div>
            <div className="mb-2 text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalUSD, "USD")}
            </div>
            <div className="mb-1 text-xs text-white/60">预估 CNY</div>
            <div className="mb-2 text-xl font-semibold text-white/90" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalUSDRMB, "CNY")}
            </div>
            <div className="text-xs text-white/60">
              {exchangeRates ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>实时汇率: 1 USD = {exchangeRates.USD.toFixed(4)} CNY</span>
                  {exchangeRates.lastUpdated && (
                    <span className="text-[10px] text-white/40">
                      ({new Date(exchangeRates.lastUpdated).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })})
                    </span>
                  )}
                  <button onClick={() => onRefreshRates()} className="text-[10px] text-cyan-400 underline hover:text-cyan-300" title="手动刷新汇率">
                    刷新
                  </button>
                </div>
              ) : ratesError ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span title={ratesError.message}>{ratesError.message}</span>
                  <button type="button" onClick={() => onRefreshRates()} className="text-cyan-400 underline hover:text-cyan-300" title="重新请求汇率">
                    重试
                  </button>
                </span>
              ) : (
                "USD 账户原币余额"
              )}
            </div>
          </div>
        </div>

        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Coins className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">日元总额</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">JPY 账户</div>
            <div className="mb-2 text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              ¥{formatNumber(totalJPY)} JPY
            </div>
            <div className="mb-1 text-xs text-white/60">预估 CNY</div>
            <div className="mb-2 text-xl font-semibold text-white/90" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalJPYRMB, "CNY")}
            </div>
            <div className="text-xs text-white/60">
              {exchangeRates ? (
                <div className="flex items-center gap-2">
                  <span>实时汇率: 1 JPY = {exchangeRates.JPY.toFixed(6)} CNY</span>
                  {exchangeRates.lastUpdated && (
                    <span className="text-[10px] text-white/40">
                      ({new Date(exchangeRates.lastUpdated).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })})
                    </span>
                  )}
                  <button onClick={() => onRefreshRates()} className="text-[10px] text-cyan-400 underline hover:text-cyan-300" title="手动刷新汇率">
                    刷新
                  </button>
                </div>
              ) : ratesError ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span title={ratesError.message}>{ratesError.message}</span>
                  <button type="button" onClick={() => onRefreshRates()} className="text-cyan-400 underline hover:text-cyan-300" title="重新请求汇率">
                    重试
                  </button>
                </span>
              ) : (
                "JPY 账户原币余额"
              )}
            </div>
          </div>
        </div>

        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">人民币账户金额</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">CNY 账户</div>
            <div className="mb-2 text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalRMBAccountBalance, "CNY")}
            </div>
            <div className="text-xs text-white/60">CNY 账户原币余额（含初始资金）</div>
          </div>
        </div>
      </section>

      {/* 账户统计摘要 */}
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-4">
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-400">账户总数</div>
          <div className="text-2xl font-bold text-slate-100" suppressHydrationWarning>
            {accountsLoading ? "-" : accountSummary.totalCount}
          </div>
        </div>
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-400">主账户</div>
          <div className="text-2xl font-bold text-primary-300" suppressHydrationWarning>
            {accountsLoading ? "-" : accountSummary.primaryCount}
          </div>
        </div>
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-400">虚拟子账号</div>
          <div className="text-2xl font-bold text-blue-300" suppressHydrationWarning>
            {accountsLoading ? "-" : accountSummary.virtualCount}
          </div>
        </div>
        <div className="text-center">
          <div className="mb-1 text-xs text-slate-400">平均余额（CNY）</div>
          <div className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {currency(accountSummary.avgRMBBalance, "CNY")}
          </div>
        </div>
      </section>
    </>
  );
}
