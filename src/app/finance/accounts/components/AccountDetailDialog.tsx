"use client";

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

type StoreLike = { id: string; name: string };
type ExchangeRatesLike = { USD: number; JPY: number } | null;

type AccountDetailDialogProps = {
  open: boolean;
  account: BankAccount | null;
  allAccounts: BankAccount[];
  storesList: StoreLike[];
  exchangeRates: ExchangeRatesLike;
  onClose: () => void;
};

export function AccountDetailDialog({
  open,
  account,
  allAccounts,
  storesList,
  exchangeRates,
  onClose,
}: AccountDetailDialogProps) {
  if (!open || !account) return null;

  const acc = account;
  const displayBalance = acc.originalBalance || 0;
  const associatedStore = acc.storeId ? storesList.find((s) => s.id === acc.storeId) : null;
  const accountCountry = COUNTRIES.find((c) => c.code === (acc.country || "CN"));
  const childCount = acc.accountCategory === "PRIMARY" ? allAccounts.filter((a) => a.parentId === acc.id).length : 0;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">账户详情 - {acc.name}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <div className="mb-3 text-xs font-semibold text-slate-400">基本信息</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">账户类别</span>
                <span className="text-slate-200">
                  {acc.accountCategory === "PRIMARY" ? "主账户" : acc.accountCategory === "VIRTUAL" ? "虚拟子账号" : acc.accountType}
                </span>
              </div>
              {acc.accountType && (
                <div className="flex justify-between">
                  <span className="text-slate-400">账户类型</span>
                  <span className="text-slate-200">{acc.accountType}</span>
                </div>
              )}
              {acc.accountPurpose && (
                <div className="flex justify-between">
                  <span className="text-slate-400">账户用途</span>
                  <span className="text-slate-200">{acc.accountPurpose}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">币种</span>
                <span className="text-slate-200">{acc.currency}</span>
              </div>
              {acc.accountNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-400">账号</span>
                  <span className="font-mono text-xs text-slate-200">{acc.accountNumber}</span>
                </div>
              )}
              {acc.accountType === "平台" && acc.platformAccount && (
                <div className="flex justify-between">
                  <span className="text-slate-400">平台账号</span>
                  <span className="font-mono text-xs text-slate-200">{acc.platformAccount}</span>
                </div>
              )}
              {acc.accountType === "平台" && acc.platformUrl && (
                <div className="flex justify-between">
                  <span className="text-slate-400">登入网站</span>
                  <a
                    href={acc.platformUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs text-blue-300 underline hover:text-blue-200"
                  >
                    {acc.platformUrl}
                  </a>
                </div>
              )}
            </div>
          </div>

          {(acc.owner || acc.companyEntity || accountCountry || associatedStore || parentAccount || childCount > 0) && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-3 text-xs font-semibold text-slate-400">关联信息</div>
              <div className="space-y-2">
                {acc.owner && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">账号归属人</span>
                    <span className="text-amber-300">{acc.owner}</span>
                  </div>
                )}
                {acc.companyEntity && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">公司主体</span>
                    <span className="text-slate-200">{acc.companyEntity}</span>
                  </div>
                )}
                {accountCountry && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">国家/地区</span>
                    <span className="text-slate-200">
                      {accountCountry.name} ({accountCountry.code})
                    </span>
                  </div>
                )}
                {associatedStore && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">关联店铺</span>
                    <span className="text-emerald-300">{associatedStore.name}</span>
                  </div>
                )}
                {parentAccount && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">父账户</span>
                    <span className="text-blue-300">{parentAccount.name}</span>
                  </div>
                )}
                {childCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">子账户数量</span>
                    <span className="text-primary-300">{childCount} 个</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <div className="mb-3 text-xs font-semibold text-slate-400">余额信息</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">原币余额</span>
                <span className="font-medium text-slate-200" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {acc.currency === "RMB"
                    ? currency(displayBalance, "CNY")
                    : acc.currency === "USD"
                      ? currency(displayBalance, "USD")
                      : acc.currency === "JPY"
                        ? `¥${formatNumber(displayBalance)}`
                        : `${formatNumber(displayBalance)} ${acc.currency}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">折算CNY</span>
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
                <div className="flex justify-between">
                  <span className="text-slate-400">汇率</span>
                  <span className="text-slate-200">
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
          </div>

          {(acc.notes || acc.createdAt) && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-3 text-xs font-semibold text-slate-400">其他信息</div>
              <div className="space-y-2">
                {acc.createdAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">创建时间</span>
                    <span className="text-xs text-slate-200">{formatCreatedAt(acc.createdAt)}</span>
                  </div>
                )}
                {acc.notes && (
                  <div>
                    <div className="mb-1 text-slate-400">备注</div>
                    <div className="rounded border border-slate-600 bg-slate-800/30 p-2 text-xs text-slate-200">{acc.notes}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
