"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate as swrMutate } from "swr";
import { type BankAccount } from "@/lib/finance-store";
import { ArrowRight, Search } from "lucide-react";
import TransferEntry from "../cash-flow/components/TransferEntry";

type CashFlow = {
  id: string;
  uid?: string;
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
  status: "confirmed" | "pending";
  isReversal?: boolean;
  reversedById?: string;
  voucher?: string;
  createdAt: string;
};

type TransferRecord = {
  id: string; // relatedId
  date: string;
  fromAccountId: string;
  fromAccountName: string;
  fromCurrency: string;
  fromAmount: number;
  toAccountId: string;
  toAccountName: string;
  toCurrency: string;
  toAmount: number;
  exchangeRate: number;
  isManualRate: boolean;
  remark: string;
  voucher?: string;
  createdAt: string;
  outFlowId: string;
  inFlowId: string;
};

// SWR fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.0000";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
};

const formatDate = (d: string) => {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch (e) {
    return d;
  }
};

export default function TransferPage() {
  // 使用 SWR 加载流水数据
  const { data: cashFlowData = [] } = useSWR<CashFlow[]>('/api/cash-flow', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true
  });
  
  // 使用 SWR 加载账户数据
  const { data: accountsData = [] } = useSWR<BankAccount[]>('/api/accounts', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    keepPreviousData: true
  });
  
  const accounts = accountsData || [];
  const [activeModal, setActiveModal] = useState<"transfer" | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterFromAccount, setFilterFromAccount] = useState<string>("all");
  const [filterToAccount, setFilterToAccount] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);

  // 将两条流水记录合并为一条划拨记录
  const transfers = useMemo(() => {
    if (!Array.isArray(cashFlowData)) return [];
    
    // 筛选出内部划拨的记录
    const transferFlows = cashFlowData.filter(
      (flow) => flow.category === "内部划拨" && flow.relatedId && flow.status === "confirmed" && !flow.isReversal
    );
    
    // 按 relatedId 分组
    const grouped = transferFlows.reduce((acc, flow) => {
      const relatedId = flow.relatedId!;
      if (!acc[relatedId]) {
        acc[relatedId] = [];
      }
      acc[relatedId].push(flow);
      return acc;
    }, {} as Record<string, CashFlow[]>);
    
    // 将每组的两条记录合并为一条划拨记录
    const transferRecords: TransferRecord[] = [];
    
    Object.entries(grouped).forEach(([relatedId, flows]) => {
      if (flows.length !== 2) return; // 必须是两条记录（转出和转入）
      
      const outFlow = flows.find((f) => f.type === "expense");
      const inFlow = flows.find((f) => f.type === "income");
      
      if (!outFlow || !inFlow) return;
      
      // 从备注中提取汇率信息
      const rateMatch = outFlow.remark.match(/汇率\s*([\d.]+)/);
      const exchangeRate = rateMatch ? Number(rateMatch[1]) : 0;
      const isManualRate = outFlow.remark.includes("手动汇率");
      
      // 提取备注（去掉汇率信息）
      const remarkMatch = outFlow.remark.match(/，(.+)$/);
      const remark = remarkMatch ? remarkMatch[1].replace(/汇率\s*[\d.]+（手动汇率）?，?/g, "").trim() : "";
      
      transferRecords.push({
        id: relatedId,
        date: outFlow.date,
        fromAccountId: outFlow.accountId,
        fromAccountName: outFlow.accountName,
        fromCurrency: outFlow.currency,
        fromAmount: Math.abs(outFlow.amount),
        toAccountId: inFlow.accountId,
        toAccountName: inFlow.accountName,
        toCurrency: inFlow.currency,
        toAmount: inFlow.amount,
        exchangeRate,
        isManualRate,
        remark,
        voucher: outFlow.voucher || inFlow.voucher,
        createdAt: outFlow.createdAt,
        outFlowId: outFlow.id,
        inFlowId: inFlow.id
      });
    });
    
    // 按日期倒序排序
    return transferRecords.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [cashFlowData]);

  // 筛选后的划拨记录
  const filteredTransfers = useMemo(() => {
    return transfers.filter((transfer) => {
      // 日期筛选
      if (filterDateFrom && transfer.date < filterDateFrom) return false;
      if (filterDateTo && transfer.date > filterDateTo) return false;
      
      // 转出账户筛选
      if (filterFromAccount !== "all" && transfer.fromAccountId !== filterFromAccount) return false;
      
      // 转入账户筛选
      if (filterToAccount !== "all" && transfer.toAccountId !== filterToAccount) return false;
      
      // 关键词搜索
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.toLowerCase();
        return (
          transfer.fromAccountName.toLowerCase().includes(keyword) ||
          transfer.toAccountName.toLowerCase().includes(keyword) ||
          transfer.remark.toLowerCase().includes(keyword)
        );
      }
      
      return true;
    });
  }, [transfers, filterDateFrom, filterDateTo, filterFromAccount, filterToAccount, searchKeyword]);

  // 统计信息
  const stats = useMemo(() => {
    const totalCount = filteredTransfers.length;
    const totalFromAmount = filteredTransfers.reduce((sum, t) => sum + t.fromAmount, 0);
    const totalToAmount = filteredTransfers.reduce((sum, t) => sum + t.toAmount, 0);
    
    // 按币种统计转出金额
    const fromAmountByCurrency = filteredTransfers.reduce((acc, t) => {
      acc[t.fromCurrency] = (acc[t.fromCurrency] || 0) + t.fromAmount;
      return acc;
    }, {} as Record<string, number>);
    
    // 按币种统计转入金额
    const toAmountByCurrency = filteredTransfers.reduce((acc, t) => {
      acc[t.toCurrency] = (acc[t.toCurrency] || 0) + t.toAmount;
      return acc;
    }, {} as Record<string, number>);
    
    // 按账户统计划出和划入
    const accountStats = accounts.map((account) => {
      const transfersOut = filteredTransfers.filter((t) => t.fromAccountId === account.id);
      const transfersIn = filteredTransfers.filter((t) => t.toAccountId === account.id);
      
      // 按币种统计划出金额
      const outByCurrency = transfersOut.reduce((acc, t) => {
        acc[t.fromCurrency] = (acc[t.fromCurrency] || 0) + t.fromAmount;
        return acc;
      }, {} as Record<string, number>);
      
      // 按币种统计划入金额
      const inByCurrency = transfersIn.reduce((acc, t) => {
        acc[t.toCurrency] = (acc[t.toCurrency] || 0) + t.toAmount;
        return acc;
      }, {} as Record<string, number>);
      
      const totalOut = transfersOut.reduce((sum, t) => sum + t.fromAmount, 0);
      const totalIn = transfersIn.reduce((sum, t) => sum + t.toAmount, 0);
      const netAmount = totalIn - totalOut; // 净划入（正数表示净流入，负数表示净流出）
      
      return {
        accountId: account.id,
        accountName: account.name,
        accountCurrency: account.currency,
        outCount: transfersOut.length,
        inCount: transfersIn.length,
        totalOut,
        totalIn,
        netAmount,
        outByCurrency,
        inByCurrency
      };
    }).filter((stat) => stat.outCount > 0 || stat.inCount > 0); // 只显示有划拨记录的账户
    
    // 按净划入金额排序（从大到小）
    accountStats.sort((a, b) => b.netAmount - a.netAmount);
    
    return {
      totalCount,
      totalFromAmount,
      totalToAmount,
      fromAmountByCurrency,
      toAmountByCurrency,
      accountStats
    };
  }, [filteredTransfers, accounts]);

  const handleAddTransfer = async (outFlow: CashFlow, inFlow: CashFlow) => {
    // 这个函数会被 TransferEntry 调用，但 TransferEntry 已经处理了保存逻辑
    // 这里只需要关闭弹窗
    setActiveModal(null);
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">内部划拨管理</h1>
          <p className="mt-1 text-sm text-slate-400">
            统一管理所有内部账户划拨记录，清晰展示转出和转入信息
          </p>
        </div>
        <button
          onClick={() => setActiveModal("transfer")}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/20"
        >
          + 新增划拨
        </button>
      </header>

      {/* 统计卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400 mb-1">划拨总数</div>
          <div className="text-2xl font-bold text-slate-100">{stats.totalCount}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400 mb-1">转出总额</div>
          <div className="text-lg font-semibold text-rose-300">
            {Object.entries(stats.fromAmountByCurrency).map(([curr, amount]) => (
              <div key={curr}>
                {curr === "RMB" ? currency(amount, "CNY") : curr === "USD" ? currency(amount, "USD") : `${curr} ${amount.toLocaleString("zh-CN")}`}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400 mb-1">转入总额</div>
          <div className="text-lg font-semibold text-emerald-300">
            {Object.entries(stats.toAmountByCurrency).length > 0 ? (
              Object.entries(stats.toAmountByCurrency).map(([curr, amount]) => (
                <div key={curr}>
                  {curr === "RMB" ? currency(amount, "CNY") : curr === "USD" ? currency(amount, "USD") : `${curr} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
              ))
            ) : (
              <div className="text-slate-500">-</div>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400 mb-1">平均汇率</div>
          <div className="text-lg font-semibold text-slate-300">
            {stats.totalCount > 0
              ? formatNumber(
                  filteredTransfers.reduce((sum, t) => sum + t.exchangeRate, 0) / stats.totalCount
                )
              : "0.0000"}
          </div>
        </div>
      </section>

      {/* 账户维度统计 */}
      {stats.accountStats && stats.accountStats.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">账户划拨统计</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.accountStats.map((accountStat) => (
              <div
                key={accountStat.accountId}
                className="rounded-lg border border-slate-700 bg-slate-900/80 p-3 hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-200">{accountStat.accountName}</div>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                      {accountStat.accountCurrency}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">划出次数：</span>
                    <span className="text-rose-300 font-medium">{accountStat.outCount} 次</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">划出总额：</span>
                    <div className="text-rose-300 font-medium text-right">
                      {Object.entries(accountStat.outByCurrency).length > 0 ? (
                        Object.entries(accountStat.outByCurrency).map(([curr, amount]) => (
                          <div key={curr}>
                            {curr === "RMB" ? currency(amount, "CNY") : curr === "USD" ? currency(amount, "USD") : `${curr} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-1 border-t border-slate-700">
                    <span className="text-slate-400">划入次数：</span>
                    <span className="text-emerald-300 font-medium">{accountStat.inCount} 次</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">划入总额：</span>
                    <div className="text-emerald-300 font-medium text-right">
                      {Object.entries(accountStat.inByCurrency).length > 0 ? (
                        Object.entries(accountStat.inByCurrency).map(([curr, amount]) => (
                          <div key={curr}>
                            {curr === "RMB" ? currency(amount, "CNY") : curr === "USD" ? currency(amount, "USD") : `${curr} ${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-1 border-t border-slate-700 mt-1">
                    <span className="text-slate-400">净划入：</span>
                    <span className={`font-semibold ${accountStat.netAmount >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {accountStat.accountCurrency === "RMB"
                        ? currency(accountStat.netAmount, "CNY")
                        : accountStat.accountCurrency === "USD"
                          ? currency(accountStat.netAmount, "USD")
                          : `${accountStat.accountCurrency} ${accountStat.netAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 筛选区域 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">开始日期</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">结束日期</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">转出账户</label>
            <select
              value={filterFromAccount}
              onChange={(e) => setFilterFromAccount(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            >
              <option value="all">全部账户</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">转入账户</label>
            <select
              value={filterToAccount}
              onChange={(e) => setFilterToAccount(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            >
              <option value="all">全部账户</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">关键词搜索</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索账户名称、备注..."
                className="w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 划拨记录列表 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-xs">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-400 w-32">日期</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[150px]">转出账户</th>
                <th className="px-3 py-2 text-right font-medium text-slate-400 w-32">转出金额</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-16"></th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[150px]">转入账户</th>
                <th className="px-3 py-2 text-right font-medium text-slate-400 w-32">转入金额</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-24">汇率</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[120px]">备注</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-16">凭证</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {filteredTransfers.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>
                    暂无划拨记录
                  </td>
                </tr>
              )}
              {filteredTransfers.map((transfer) => (
                <tr key={transfer.id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-slate-300">{formatDate(transfer.date)}</td>
                  <td className="px-3 py-2">
                    <div className="text-slate-200 font-medium">{transfer.fromAccountName}</div>
                    <div className="text-xs text-slate-500">{transfer.fromCurrency}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-rose-300 font-medium">
                      {transfer.fromCurrency === "RMB"
                        ? currency(transfer.fromAmount, "CNY")
                        : transfer.fromCurrency === "USD"
                          ? currency(transfer.fromAmount, "USD")
                          : `${transfer.fromCurrency} ${transfer.fromAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ArrowRight className="inline text-blue-400" size={18} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-200 font-medium">{transfer.toAccountName}</div>
                    <div className="text-xs text-slate-500">{transfer.toCurrency}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-emerald-300 font-medium">
                      {transfer.toCurrency === "RMB"
                        ? currency(transfer.toAmount, "CNY")
                        : transfer.toCurrency === "USD"
                          ? currency(transfer.toAmount, "USD")
                          : `${transfer.toCurrency} ${transfer.toAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="text-slate-300 font-medium">{formatNumber(transfer.exchangeRate)}</div>
                    {transfer.isManualRate && (
                      <div className="text-xs text-amber-400">手动</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{transfer.remark || "-"}</td>
                  <td className="px-3 py-2 text-center">
                    {transfer.voucher && transfer.voucher.length > 10 ? (
                      <button
                        onClick={() => setVoucherViewModal(transfer.voucher || null)}
                        className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                      >
                        查看
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 凭证查看弹窗 */}
      {voucherViewModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
          style={{ zIndex: 9999 }}
          onClick={() => setVoucherViewModal(null)}
        >
          <div 
            className="relative max-w-5xl max-h-[95vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setVoucherViewModal(null)}
              className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-2 hover:bg-black/70 z-10"
            >
              ✕
            </button>
            <div className="bg-slate-900 rounded-lg p-4">
              {(() => {
                const isBase64 = voucherViewModal && (
                  voucherViewModal.startsWith('data:image/') ||
                  /^data:[^;]*;base64,/.test(voucherViewModal) ||
                  /^[A-Za-z0-9+/=]+$/.test(voucherViewModal) && voucherViewModal.length > 100
                );
                const isUrl = voucherViewModal && (
                  voucherViewModal.startsWith('http://') ||
                  voucherViewModal.startsWith('https://') ||
                  voucherViewModal.startsWith('/')
                );
                let imageSrc = voucherViewModal;
                if (voucherViewModal && /^[A-Za-z0-9+/=]+$/.test(voucherViewModal) && voucherViewModal.length > 100 && !voucherViewModal.startsWith('data:')) {
                  imageSrc = `data:image/jpeg;base64,${voucherViewModal}`;
                }
                return (
                  <img 
                    src={imageSrc || voucherViewModal} 
                    alt="凭证" 
                    className="max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector('.error-message')) {
                        const errorDiv = document.createElement("div");
                        errorDiv.className = "error-message text-white text-center p-8 bg-rose-500/20 rounded-lg border border-rose-500/40";
                        errorDiv.innerHTML = `<div class="text-rose-300 text-lg mb-2">❌ 图片加载失败</div><div class="text-slate-300 text-sm">请检查图片格式或数据是否正确</div>`;
                        parent.appendChild(errorDiv);
                      }
                    }}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 新增划拨弹窗 */}
      {activeModal === "transfer" && (
        <TransferEntry
          accounts={accounts}
          onClose={() => setActiveModal(null)}
          onSave={async (flow: CashFlow) => {
            // TransferEntry 会调用两次 onSave（转出和转入）
            // 直接调用 API 保存
            try {
              const response = await fetch('/api/cash-flow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(flow)
              });
              
              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || '创建失败');
              }
              
              // 使用 SWR 的 mutate 刷新数据
              swrMutate('/api/cash-flow');
              swrMutate('/api/accounts');
              
              toast.success("划拨记录创建成功");
            } catch (error: any) {
              console.error('Failed to create transfer:', error);
              toast.error(error.message || '创建划拨记录失败');
            }
          }}
        />
      )}
    </div>
  );
}
