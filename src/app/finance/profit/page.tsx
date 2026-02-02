"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, FileText } from "lucide-react";
import type { BankAccount } from "@/lib/finance-store";
import type { Store } from "@/lib/store-store";
import { COUNTRIES, getCountryByCode } from "@/lib/country-config";
import { getCashFlowFromAPI, type CashFlow } from "@/lib/cash-flow-store";

// 确保 CashFlow 类型完整
type CashFlowWithDefaults = CashFlow & {
  status?: "confirmed" | "pending";
  isReversal?: boolean;
  accountId?: string;
  currency?: string;
};

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export default function ProfitPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowWithDefaults[]>([]);
  const [filterCountry, setFilterCountry] = useState<string>("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
    const [accRes, storesRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch("/api/stores"),
    ]);
    setAccounts(accRes.ok ? await accRes.json() : []);
    setStores(storesRes.ok ? await storesRes.json() : []);
    const flowList = await getCashFlowFromAPI();
    setCashFlow(flowList as CashFlowWithDefaults[]);
    })();
  }, []);

  // 按国家汇总资产
  const assetsByCountry = useMemo(() => {
    const grouped: Record<string, { accounts: BankAccount[]; totalRMB: number }> = {};
    
    accounts.forEach((acc) => {
      const country = (acc as any).country || "CN";
      if (!grouped[country]) {
        grouped[country] = { accounts: [], totalRMB: 0 };
      }
      grouped[country].accounts.push(acc);
      grouped[country].totalRMB += acc.rmbBalance || 0;
    });

    return Object.entries(grouped).map(([code, data]) => {
      const country = getCountryByCode(code);
      return {
        code,
        name: country?.name || code,
        ...data
      };
    }).sort((a, b) => b.totalRMB - a.totalRMB);
  }, [accounts]);

  // 全球总资产
  const globalTotalAssets = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + (acc.rmbBalance || 0), 0);
  }, [accounts]);

  // 按国家筛选的店铺
  const filteredStores = useMemo(() => {
    if (filterCountry === "all") return stores;
    return stores.filter((s) => s.country === filterCountry);
  }, [stores, filterCountry]);

  // 按国家筛选的收入
  const filteredIncomes = useMemo(() => {
    let filtered = cashFlow.filter(
      (flow) => flow.type === "income" && !(flow.isReversal) && (flow.status === "confirmed" || !flow.status)
    );
    
    if (filterCountry !== "all") {
      const storeAccountIds = stores
        .filter((s) => s.country === filterCountry && s.accountId)
        .map((s) => s.accountId)
        .filter(Boolean);
      if (storeAccountIds.length > 0) {
        filtered = filtered.filter((flow) => flow.accountId && storeAccountIds.includes(flow.accountId));
      }
    }
    
    return filtered;
  }, [cashFlow, stores, filterCountry]);

  // 本月收入
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthIncomes = filteredIncomes.filter((flow) => {
    if (!flow.date) return false;
    const d = new Date(flow.date);
    if (isNaN(d.getTime())) return false;
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const thisMonthTotal = thisMonthIncomes.reduce((sum, flow) => {
    const account = flow.accountId ? accounts.find((a) => a.id === flow.accountId) : null;
    const amount = Math.abs(flow.amount || 0);
    if (account) {
      const currency = flow.currency || account.currency || "RMB";
      return sum + (currency === "RMB" ? amount : amount * (account.exchangeRate || 1));
    }
    // 如果没有账户，假设是RMB
    return sum + amount;
  }, 0);

  // 累计收入
  const totalIncome = filteredIncomes.reduce((sum, flow) => {
    const account = flow.accountId ? accounts.find((a) => a.id === flow.accountId) : null;
    const amount = Math.abs(flow.amount || 0);
    if (account) {
      const currency = flow.currency || account.currency || "RMB";
      return sum + (currency === "RMB" ? amount : amount * (account.exchangeRate || 1));
    }
    // 如果没有账户，假设是RMB
    return sum + amount;
  }, 0);

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">利润看板</h1>
          <p className="mt-1 text-sm text-slate-400">按国家/站点维度核算利润，支持全球资产汇总</p>
        </div>
      </header>

      {/* 全球资产看板 */}
      <section className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">全球资产看板（按国家汇总）</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {assetsByCountry.map((item) => (
            <div key={item.code} className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/60 to-slate-800/30 p-4 hover:border-emerald-500/50 transition-all duration-200 shadow-lg hover:shadow-xl">
              <div className="text-xs text-slate-400 mb-1">{item.name}</div>
              <div className="text-xl font-semibold text-emerald-300">
                {currency(item.totalRMB, "CNY")}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {item.accounts.length} 个账户
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-primary-500/50 bg-gradient-to-br from-primary-500/20 to-primary-600/10 p-4 hover:border-primary-500/70 transition-all duration-200 shadow-lg shadow-primary-500/10">
            <div className="text-xs text-slate-400 mb-1">全球总计</div>
            <div className="text-xl font-semibold text-primary-300">
              {currency(globalTotalAssets, "CNY")}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {accounts.length} 个账户
            </div>
          </div>
        </div>
      </section>

      {/* 国家筛选器 */}
      <section className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-4 backdrop-blur-sm shadow-xl">
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300 font-medium">国家/站点筛选：</span>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="rounded-lg border border-slate-800/50 bg-slate-900/50 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-500/50 focus:bg-slate-900 transition-all"
            >
              <option value="all">全部</option>
              {COUNTRIES.filter((c) => c.code !== "GLOBAL").map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.code})
                </option>
              ))}
            </select>
          </div>
          {filterCountry !== "all" && (
            <div className="text-xs text-slate-400">
              已筛选：{getCountryByCode(filterCountry)?.name || filterCountry} · {filteredStores.length} 个店铺
            </div>
          )}
        </div>
      </section>

      {/* 利润统计 */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 backdrop-blur-sm hover:border-emerald-500/50 transition-all duration-300 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <div className="text-xs text-slate-400">累计收入（折算CNY）</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{currency(totalIncome, "CNY")}</div>
        </div>
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 backdrop-blur-sm hover:border-blue-500/50 transition-all duration-300 shadow-lg shadow-blue-500/5">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <div className="text-xs text-slate-400">本月收入（折算CNY）</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{currency(thisMonthTotal, "CNY")}</div>
        </div>
        <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-5 backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300 shadow-lg shadow-purple-500/5">
          <div className="flex items-center justify-between mb-3">
            <FileText className="h-5 w-5 text-purple-400" />
            <div className="text-xs text-slate-400">店铺数量</div>
          </div>
          <div className="text-2xl font-bold text-slate-100">{filteredStores.length}</div>
        </div>
      </section>

      {/* 店铺列表 */}
      {filteredStores.length > 0 && (
        <section className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
          <h2 className="text-lg font-semibold text-slate-100 mb-5">店铺列表</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800/50 text-sm">
              <thead className="bg-slate-800/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">店铺名称</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">平台</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">国家/站点</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">币种</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">VAT/税务识别号</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredStores.map((store) => {
                  const country = getCountryByCode(store.country);
                  return (
                    <tr key={store.id} className="hover:bg-slate-800/40 transition-all duration-200 group">
                      <td className="px-4 py-2 text-slate-100 font-medium">{store.name}</td>
                      <td className="px-4 py-2 text-slate-300">{store.platform}</td>
                      <td className="px-4 py-2 text-slate-300">
                        {country ? `${country.name} (${country.code})` : store.country}
                      </td>
                      <td className="px-4 py-2 text-slate-300">{store.currency}</td>
                      <td className="px-4 py-2 text-slate-300">
                        {store.vatNumber || store.taxId || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
