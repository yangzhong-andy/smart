"use client";

import { useRouter } from "next/navigation";
import { Building2, CreditCard, Wallet, Globe, Calculator, List, Pencil, Trash2, Info } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { BankAccount } from "./types";
import { COUNTRIES, getCountryByCode } from "@/lib/country-config";

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
  exchangeRates: { USD: number; JPY: number } | null;
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
      <div
        className="grid gap-6"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}
      >
        {accounts.map((acc) => {
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
              onMouseEnter={() => setHoveredAccountId(acc.id)}
              onMouseLeave={() => setHoveredAccountId(null)}
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

              {isHovered && (
                <div className="absolute inset-0 z-10 flex flex-col justify-between overflow-y-auto rounded-2xl bg-black/80 p-5 backdrop-blur-sm">
                  <div className="space-y-2 text-xs">
                    <div className="border-b border-white/10 pb-2">
                      <div className="mb-2 text-xs font-semibold text-slate-300">基本信息</div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">账户类别：</span>
                        <span className="font-medium text-white">
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
                        <span className="font-medium text-white">{acc.currency}</span>
                      </div>
                      {acc.accountNumber && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">账号：</span>
                          <span className="font-mono text-xs text-white">{acc.accountNumber}</span>
                        </div>
                      )}
                      {acc.accountType === "平台" && acc.platformAccount && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">平台账号：</span>
                          <span className="font-mono text-xs text-white">{acc.platformAccount}</span>
                        </div>
                      )}
                      {acc.accountType === "平台" && acc.platformUrl && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">登入网站：</span>
                          <a
                            href={acc.platformUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[200px] truncate text-xs text-blue-300 underline hover:text-blue-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {acc.platformUrl}
                          </a>
                        </div>
                      )}
                    </div>

                    {(acc.owner || acc.companyEntity || accountCountry || associatedStore || parentAccount || childCount > 0) && (
                      <div className="border-b border-white/10 pb-2">
                        <div className="mb-2 text-xs font-semibold text-slate-300">关联信息</div>
                        {acc.owner && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">账号归属人：</span>
                            <span className="font-medium text-amber-300">{acc.owner}</span>
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
                            <span className="text-white">
                              {accountCountry.name} ({accountCountry.code})
                            </span>
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
                            <span className="font-medium text-primary-300">{childCount} 个</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-b border-white/10 pb-2">
                      <div className="mb-2 text-xs font-semibold text-slate-300">余额信息</div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">原币余额：</span>
                        <span className="font-medium text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
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
                        <span className="text-slate-400">折算CNY：</span>
                        <span className="font-medium text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {(() => {
                            const totalOriginalBalance = acc.originalBalance || 0;
                            if (acc.currency === "RMB") return currency(totalOriginalBalance, "CNY");
                            let rate = acc.exchangeRate || 1;
                            if (exchangeRates) {
                              if (acc.currency === "USD") rate = exchangeRates.USD;
                              else if (acc.currency === "JPY") rate = exchangeRates.JPY;
                            }
                            return currency(totalOriginalBalance * rate, "CNY");
                          })()}
                        </span>
                      </div>
                      {acc.currency !== "RMB" && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">汇率：</span>
                          <span className="text-white">
                            {exchangeRates
                              ? acc.currency === "USD"
                                ? `${formatNumber(exchangeRates.USD)} (实时)`
                                : acc.currency === "JPY"
                                  ? `${formatNumber(exchangeRates.JPY)} (实时)`
                                  : formatNumber(acc.exchangeRate || 1)
                              : formatNumber(acc.exchangeRate || 1)}
                          </span>
                        </div>
                      )}
                    </div>

                    {(acc.notes || acc.createdAt) && (
                      <div>
                        <div className="mb-2 text-xs font-semibold text-slate-300">其他信息</div>
                        {acc.createdAt && (
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-slate-400">创建时间：</span>
                            <span className="text-xs text-white">{formatCreatedAt(acc.createdAt)}</span>
                          </div>
                        )}
                        {acc.notes && (
                          <div>
                            <div className="mb-1 text-slate-400">备注：</div>
                            <div className="rounded border border-white/10 bg-white/5 p-2 text-xs text-white">{acc.notes}</div>
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
    </section>
  );
}
