"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Building2, CreditCard, Wallet, Globe, Calculator, List, Pencil, Trash2, Info, Settings } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { BankAccount } from "./types";
import { COUNTRIES, getCountryByCode } from "@/lib/country-config";

const CURRENCY_STORAGE_KEY = "account-cards-currency-visibility";

// 从 localStorage 读取（fallback）
function loadHiddenFromLocal(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}

// 从数据库 API 读取（优先），失败回退 localStorage
async function loadHiddenCurrencies(): Promise<Set<string>> {
  try {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return loadHiddenFromLocal();
    const res = await fetch("/api/users/me/preferences", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return loadHiddenFromLocal();
    const data = await res.json();
    const hidden = data?.preferences?.accounts?.hiddenCurrencies;
    if (Array.isArray(hidden)) return new Set(hidden);
  } catch {}
  return loadHiddenFromLocal();
}

// 保存到数据库 + localStorage（双写）
async function saveHiddenCurrencies(hidden: Set<string>): Promise<void> {
  const arr = Array.from(hidden);
  try { window.localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(arr)); } catch {}
  try {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    await fetch("/api/users/me/preferences", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: { hiddenCurrencies: arr } }),
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

const formatAccountNumber = (accountNumber: string | undefined): string => {
  if (!accountNumber) return "-";
  if (accountNumber.length <= 4) return accountNumber;
  return `****${accountNumber.slice(-4)}`;
};

function getAccountIcon(account: BankAccount) {
  if (account.accountCategory === "PRIMARY") return Building2;
  if (account.accountPurpose?.includes("回款") || account.accountPurpose?.includes("收款")) return Wallet;
  return CreditCard;
}

type CountryLike = { name: string; code: string };
type StoreLike = { id: string; name: string; country: string; platform?: string; currency?: string };

type AccountsTableProps = {
  accounts: BankAccount[];
  allAccounts: BankAccount[];
  storesList: StoreLike[];
  accountTrendData: Record<string, Array<{ date: string; balance: number }>>;
  exchangeRates: { USD: number; JPY: number; BRL?: number } | null;
  hoveredAccountId: string | null;
  setHoveredAccountId: (id: string | null) => void;
  onViewFlow: (account: BankAccount) => void;
  onEdit: (account: BankAccount) => void;
  onDelete: (id: string) => void;
  onViewDetail?: (account: BankAccount) => void;
  isLoading: boolean;
};

export function AccountsTable({
  accounts,
  allAccounts,
  storesList,
  accountTrendData,
  exchangeRates,
  hoveredAccountId,
  setHoveredAccountId,
  onViewFlow,
  onEdit,
  onDelete,
  onViewDetail,
  isLoading,
}: AccountsTableProps) {
  const router = useRouter();

  // 按币种自定义显示/隐藏账户卡片（数据库持久化 + localStorage fallback）
  const [hiddenCurrencies, setHiddenCurrencies] = useState<Set<string>>(new Set());
  const [showCurrencyConfig, setShowCurrencyConfig] = useState(false);

  useEffect(() => {
    loadHiddenCurrencies().then(s => setHiddenCurrencies(s));
  }, []);

  // 当前列表中出现的所有币种
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach(a => set.add(a.currency === "RMB" ? "CNY" : a.currency));
    return Array.from(set).sort();
  }, [accounts]);

  const toggleCurrency = (curr: string) => {
    setHiddenCurrencies(prev => {
      const next = new Set(prev);
      if (next.has(curr)) next.delete(curr);
      else next.add(curr);
      return next;
    });
  };

  const saveCurrencies = () => {
    saveHiddenCurrencies(hiddenCurrencies);
    setShowCurrencyConfig(false);
  };

  // 过滤掉隐藏币种的账户
  const filteredAccounts = accounts.filter(acc => {
    const curr = acc.currency === "RMB" ? "CNY" : acc.currency;
    return !hiddenCurrencies.has(curr);
  });

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="py-8 text-center text-slate-500">加载中...</div>
      </section>
    );
  }

  if (accounts.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="py-8 text-center text-slate-500">暂无账户，请点击右上角"新增账户"</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      {/* 标题 + 自定义按钮 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-300">
          账户卡片
          {hiddenCurrencies.size > 0 && (
            <span className="ml-2 text-xs text-slate-500">（已隐藏 {hiddenCurrencies.size} 个币种）</span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowCurrencyConfig(!showCurrencyConfig)}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 transition"
            title="按币种自定义显示"
          >
            <Settings className="h-3.5 w-3.5" />
            自定义币种
          </button>
          {showCurrencyConfig && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl z-30">
              <div className="mb-2 text-xs font-medium text-slate-300">选择要显示的币种</div>
              <div className="space-y-1.5 mb-3">
                {availableCurrencies.map(curr => (
                  <label key={curr} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-slate-100">
                    <input
                      type="checkbox"
                      checked={!hiddenCurrencies.has(curr)}
                      onChange={() => toggleCurrency(curr)}
                      className="rounded border-slate-600 bg-slate-800"
                    />
                    {curr}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { loadHiddenCurrencies().then(s => setHiddenCurrencies(s)); setShowCurrencyConfig(false); }}
                  className="flex-1 rounded-lg border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={saveCurrencies}
                  className="flex-1 rounded-lg bg-primary-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-primary-500"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        className="grid gap-6"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}
      >
        {filteredAccounts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 text-sm">
            没有可显示的账户卡片（所有币种已被隐藏）
          </div>
        ) : filteredAccounts.map((acc) => {
          const IconComponent = getAccountIcon(acc);
          const trendData = accountTrendData[acc.id] || [];
          const displayBalance = acc.originalBalance || 0;
          const purposeLabel = acc.accountPurpose;
          const associatedStore = acc.storeId ? storesList.find((s) => s.id === acc.storeId) : null;
          const accountCountry = COUNTRIES.find((c: CountryLike) => c.code === (acc.country || "CN"));
          const isHovered = hoveredAccountId === acc.id;
          const childCount =
            acc.accountCategory === "PRIMARY" ? allAccounts.filter((a) => a.parentId === acc.id).length : 0;
          const parentAccount = acc.parentId ? allAccounts.find((a) => a.id === acc.parentId) : null;

          const formatCreatedAt = (dateStr?: string) => {
            if (!dateStr) return "-";
            try {
              return new Date(dateStr).toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
            } catch {
              return dateStr;
            }
          };

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
              case "BRL":
                return "bg-green-600/20 text-green-200 border-green-400/30";
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
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-sm ${currencyBadgeStyle}`}>
                  <Globe className="h-4 w-4" />
                  <span className="text-sm font-bold">{currencyLabel}</span>
                </div>
                <div
                  className="relative z-30 flex gap-1"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    setHoveredAccountId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/finance/accounts/balance-detail?accountId=${acc.id}&name=${encodeURIComponent(acc.name)}`);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="查看余额计算详情"
                  >
                    <Calculator className="h-4 w-4" />
                  </button>
                  {onViewDetail && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetail(acc);
                      }}
                      className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                      title="详情"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewFlow(acc);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="查看流水"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(acc);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="编辑"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(acc.id);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center gap-3">
                  <div className="rounded-lg bg-white/10 p-2 backdrop-blur-sm">
                    <IconComponent className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 truncate text-lg font-semibold text-white">{acc.name}</div>
                    <div className="font-mono text-xs text-white/70">{formatAccountNumber(acc.accountNumber)}</div>
                    {acc.owner && (
                      <div className="mt-1 text-xs text-white/60">
                        <span className="text-white/50">归属人：</span>
                        <span className="font-medium text-amber-300">{acc.owner}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {acc.accountType && (
                    <span
                      className={`inline-block rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                        acc.accountType === "对公"
                          ? "border-blue-400/30 bg-blue-500/30 text-blue-200"
                          : acc.accountType === "对私"
                            ? "border-purple-400/30 bg-purple-500/30 text-purple-200"
                            : "border-amber-400/30 bg-amber-500/30 text-amber-200"
                      }`}
                    >
                      {acc.accountType}
                    </span>
                  )}
                  {purposeLabel && (
                    <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
                      {purposeLabel}
                    </span>
                  )}
                </div>
                {childCount > 0 && (
                  <div className="mt-2 text-xs text-white/70">
                    <span className="text-white/50">子账户：</span>
                    <span className="ml-1 font-medium text-primary-300">{childCount} 个</span>
                  </div>
                )}
                {parentAccount && (
                  <div className="mt-2 text-xs text-white/70">
                    <span className="text-white/50">父账户：</span>
                    <span className="ml-1 truncate font-medium text-blue-300">{parentAccount.name}</span>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <div className="mb-1 font-medium text-white/70 text-xs">账户余额</div>
                <div className="text-3xl font-bold text-white drop-shadow-lg" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {acc.currency === "RMB"
                    ? currency(displayBalance, "CNY")
                    : acc.currency === "USD"
                      ? currency(displayBalance, "USD")
                      : acc.currency === "JPY"
                        ? `¥${formatNumber(displayBalance)}`
                        : acc.currency === "BRL"
                          ? currency(displayBalance, "BRL")
                          : `${formatNumber(displayBalance)} ${acc.currency}`}
                </div>
                {acc.currency !== "RMB" && (
                  <div className="mt-1 text-xs text-white/60">
                    约{" "}
                    {currency(
                      (() => {
                        let rate = acc.exchangeRate || 1;
                        if (exchangeRates) {
                          if (acc.currency === "USD") rate = exchangeRates.USD;
                          else if (acc.currency === "JPY") rate = exchangeRates.JPY;
                          else if (acc.currency === "BRL") rate = exchangeRates.BRL || rate;
                        }
                        return displayBalance * rate;
                      })(),
                      "CNY"
                    )}
                    {exchangeRates && <span className="ml-1 text-[10px] text-cyan-400/70">(实时)</span>}
                  </div>
                )}
              </div>

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
                      <Area type="monotone" dataKey="balance" stroke="#60a5fa" strokeWidth={2} fill={`url(#gradient-${acc.id})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">暂无数据</div>
                )}
              </div>

              
            </div>
          );
        })}
      </div>
    </section>
  );
}
