"use client";

import { useState, useEffect } from "react";
import { Wallet, TrendingUp, DollarSign, Coins, Settings } from "lucide-react";
import type { AccountSummary, AccountStatsRates } from "./types";

// 模块级常量（不会每次渲染重建）
const STORAGE_KEY = "account-stats-cards-visibility";
const DEFAULT_VISIBLE: Record<string, boolean> = {
  totalAssets: true,
  usd: true,
  jpy: true,
  brl: true,
  cny: true,
  summary: true,
};

// 从 localStorage 读取（fallback）
function loadFromLocal(): Record<string, boolean> {
  if (typeof window === "undefined") return DEFAULT_VISIBLE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_VISIBLE, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_VISIBLE;
}

// 从数据库 API 读取（优先），失败时回退 localStorage
async function loadVisibleCards(): Promise<Record<string, boolean>> {
  try {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return loadFromLocal();
    const res = await fetch("/api/users/me/preferences", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return loadFromLocal();
    const data = await res.json();
    const cards = data?.preferences?.accounts?.statsCardsVisible;
    if (cards && typeof cards === "object") {
      return { ...DEFAULT_VISIBLE, ...cards };
    }
  } catch {}
  return loadFromLocal();
}

// 保存到数据库 + localStorage（双写）
async function saveVisibleCards(cards: Record<string, boolean>): Promise<void> {
  // localStorage 即时写入
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards)); } catch {}
  // 异步写数据库（不阻塞）
  try {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    await fetch("/api/users/me/preferences", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: { statsCardsVisible: cards } }),
    });
  } catch {}
}

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
  totalBRL: number;
  totalUSDRMB: number;
  totalJPYRMB: number;
  totalBRLRMB: number;
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
  totalBRL,
  totalUSDRMB,
  totalJPYRMB,
  totalBRLRMB,
  totalRMBAccountBalance,
  exchangeRates,
  ratesError,
  onRefreshRates,
  accountSummary,
  accountsLoading,
}: AccountsStatsProps) {
  const CARD_LABELS: Record<string, string> = {
    totalAssets: "总资产",
    usd: "USD 美金",
    jpy: "JPY 日元",
    brl: "BRL 巴西雷亚尔",
    cny: "CNY 人民币",
    summary: "账户统计摘要",
  };

  const [visibleCards, setVisibleCards] = useState<Record<string, boolean>>(DEFAULT_VISIBLE);
  const [showConfig, setShowConfig] = useState(false);

  // 挂载后从数据库读取（优先），失败回退 localStorage
  useEffect(() => {
    loadVisibleCards().then(cards => setVisibleCards(cards));
  }, []);

  const toggleCard = (key: string) => {
    setVisibleCards(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const saveCards = () => {
    saveVisibleCards(visibleCards);
    setShowConfig(false);
  };

  const visibleCardCount = ["totalAssets", "usd", "jpy", "brl", "cny"]
    .filter(k => visibleCards[k]).length;
  const gridColsClass = visibleCardCount >= 4 ? "md:grid-cols-4" : visibleCardCount === 3 ? "md:grid-cols-3" : visibleCardCount === 2 ? "md:grid-cols-2" : "md:grid-cols-1";

  return (
    <>
      {/* 资金全景看板 + 自定义按钮 */}
      <div className="relative">
        <div className="absolute right-0 -top-1 z-20">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 transition"
            title="自定义统计卡片"
          >
            <Settings className="h-3.5 w-3.5" />
            自定义卡片
          </button>
          {showConfig && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl z-30">
              <div className="mb-2 text-xs font-medium text-slate-300">选择要显示的卡片</div>
              <div className="space-y-1.5 mb-3">
                {Object.entries(CARD_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-slate-100">
                    <input
                      type="checkbox"
                      checked={visibleCards[key] ?? true}
                      onChange={() => toggleCard(key)}
                      className="rounded border-slate-600 bg-slate-800"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { loadVisibleCards().then(cards => setVisibleCards(cards)); setShowConfig(false); }}
                  className="flex-1 rounded-lg border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={saveCards}
                  className="flex-1 rounded-lg bg-primary-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-primary-500"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      <section className={`grid gap-6 ${gridColsClass}`}>
        {visibleCards.totalAssets && (
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
              {exchangeRates ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span>1 USD = {(exchangeRates.USD || 0).toFixed(4)} CNY</span>
                    <span>1 BRL = {(exchangeRates.BRL || 0).toFixed(4)} CNY</span>
                    <span>1 JPY = {(exchangeRates.JPY || 0).toFixed(4)} CNY</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-white/40">
                    {exchangeRates.lastUpdated && (
                      <span>更新于 {new Date(exchangeRates.lastUpdated).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    <button onClick={() => onRefreshRates()} className="text-cyan-400 underline hover:text-cyan-300" title="手动刷新汇率">
                      刷新
                    </button>
                  </div>
                </div>
              ) : ratesError ? (
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
        )}

        {visibleCards.usd && (
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
        )}

        {visibleCards.jpy && (
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
        )}

        {visibleCards.cny && (
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
        )}

        {visibleCards.brl && (
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Coins className="h-6 w-6 text-white" />
              </div>
              <div className="text-xs font-medium text-white/80">巴西雷亚尔总额</div>
            </div>
            <div className="mb-1 text-xs font-medium text-white/70">BRL 账户</div>
            <div className="mb-2 text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalBRL, "BRL")}
            </div>
            <div className="mb-1 text-xs text-white/60">预估 CNY（基于实时或账户汇率）</div>
            <div className="mb-2 text-xl font-semibold text-white/90" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalBRLRMB, "CNY")}
            </div>
            <div className="text-xs text-white/60">
              {exchangeRates?.BRL ? (
                <div className="flex items-center gap-2">
                  <span>实时汇率: 1 BRL = {exchangeRates.BRL.toFixed(4)} CNY</span>
                  {exchangeRates.lastUpdated && (
                    <span className="text-[10px] text-white/40">
                      ({new Date(exchangeRates.lastUpdated).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })})
                    </span>
                  )}
                  <button
                    onClick={() => onRefreshRates()}
                    className="text-[10px] text-cyan-200 underline hover:text-cyan-100"
                    title="手动刷新汇率"
                  >
                    刷新
                  </button>
                </div>
              ) : (
                "BRL 账户原币余额按账户汇率折算"
              )}
            </div>
          </div>
        </div>
        )}
      </section>
      </div>

      {/* 账户统计摘要 */}
      {visibleCards.summary && (
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
      )}
    </>
  );
}
