"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate as swrMutate } from "swr";
import Link from "next/link";
import { type BankAccount } from "@/lib/finance-store";
import { ArrowRight, Search, TrendingUp, TrendingDown, Coins } from "lucide-react";
import TransferEntry from "../cash-flow/components/TransferEntry";
import { renderGroupedAccountOptions } from "@/lib/account-grouped-options";
import { Pagination, usePaginationState, paginate } from "@/components/Pagination";
import ImageUploader from "@/components/ImageUploader";

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
  category: string; // 内部划拨 / 换汇
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
  if (!Number.isFinite(n)) return "0.000000";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(n);
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
  // 使用 SWR 加载流水数据（分页接口返回 { data, pagination }）
  const { data: cashFlowData } = useSWR<CashFlow[] | { data: CashFlow[]; pagination: unknown }>('/api/cash-flow?page=1&pageSize=5000&noCache=true', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
    dedupingInterval: 5000
  });

  const cashFlowListRaw = Array.isArray(cashFlowData) ? cashFlowData : (cashFlowData?.data ?? []);

  // 使用 SWR 加载账户数据（分页接口返回 { data, pagination }）
  const { data: accountsData } = useSWR<BankAccount[] | { data: BankAccount[]; pagination: unknown }>('/api/accounts?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    keepPreviousData: true,
    dedupingInterval: 5000
  });

  const accounts = Array.isArray(accountsData) ? accountsData : (accountsData?.data ?? []);
  
  // 根据流水计算实时余额（与账户列表页面一致）
  // 优先使用 initialCapital（初始资金），没有则用 originalBalance
  const accountsWithBalance = useMemo(() => {
    // API 已经计算好了 originalBalance = initialCapital + 流水
    // 直接用，不重新计算，避免重复加流水
    return accounts.map((acc: any) => ({
      ...acc,
      initialCapital: 0, // 设为0，避免 TransferEntry 重复加 initialCapital
    }));
  }, [accounts]);
  const [activeModal, setActiveModal] = useState<"transfer" | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const { page: pgPage, pageSize: pgPageSize, setPage: setPgPage, setPageSize: setPgPageSize } = usePaginationState(20);
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterFromAccount, setFilterFromAccount] = useState<string>("all");
  const [filterToAccount, setFilterToAccount] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [editTransferBN, setEditTransferBN] = useState<string | null>(null);
  const [supplementTransfer, setSupplementTransfer] = useState<{ id: string; summary: string; date: string } | null>(null);
  const [supplementVoucherValue, setSupplementVoucherValue] = useState<string | string[]>("");
  const [filterTransferType, setFilterTransferType] = useState<string>("all");
  const [voucherViewModal, setVoucherViewModal] = useState<string | null>(null);
  const [voucherRotation, setVoucherRotation] = useState(0);

  // 将两条流水记录合并为一条划拨记录
  const transfers = useMemo(() => {
    if (!cashFlowListRaw.length) return [];

    const status = (f: any) => String(f.status ?? f.flowStatus ?? "").toLowerCase();
    const transferFlows = cashFlowListRaw.filter(
      (flow) => (flow.category === "内部划拨" || flow.category === "换汇") && (flow.relatedId || (flow as any).relatedOrderId) && (status(flow) === "confirmed" || status(flow) === "pending") && !flow.isReversal
    );
    
    // 按 relatedId 分组（兼容 relatedOrderId）
    const grouped = transferFlows.reduce((acc, flow) => {
      const relatedId = (flow.relatedId || (flow as any).relatedOrderId)!;
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
      
      const outFlow = flows.find((f) => String(f.type || "").toLowerCase() === "expense");
      const inFlow = flows.find((f) => String(f.type || "").toLowerCase() === "income");
      
      if (!outFlow || !inFlow) return;
      
      // 从 exchangeRate 字段读取（优先），否则从备注中解析
      const remarkText = ((outFlow as any).notes || (outFlow as any).remark || "");
      let exchangeRate = Number((outFlow as any).exchangeRate) || 0;
      if (!exchangeRate) {
        const rateMatch = remarkText.match(/汇率\s*([\d.]+)/);
        exchangeRate = rateMatch ? Number(rateMatch[1]) : 0;
      }
      const isManualRate = remarkText.includes("手动汇率");

      // 直接显示完整备注
      const remark = remarkText.replace(/汇率\s*[\d.]+（手动汇率）?，?/g, "").trim();
      
      transferRecords.push({
        id: relatedId,
        date: outFlow.date,
        category: outFlow.category,
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
        voucher: (outFlow as any).paymentVoucher || (outFlow as any).transferVoucher || outFlow.voucher || (inFlow as any).paymentVoucher || (inFlow as any).transferVoucher || inFlow.voucher,
        createdAt: outFlow.createdAt,
        outFlowId: outFlow.id,
        inFlowId: inFlow.id,
        status: (String((outFlow as any).flowStatus ?? (outFlow as any).status ?? "confirmed")).toLowerCase() === "pending" ? "pending" : "confirmed",
        businessNumber: (outFlow as any).businessNumber || (inFlow as any).businessNumber || "",
      });
    });
    
    // 按日期倒序排序
    return transferRecords.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }, [cashFlowListRaw]);

  // 筛选后的划拨记录
  const filteredTransfers = useMemo(() => {
    // API 返回的 date 为 ISO 字符串（含时间），比较时取日期部分 YYYY-MM-DD
    const toDateOnly = (d: string) => d.slice(0, 10);
    return transfers.filter((transfer) => {
      // 日期筛选
      if (filterDateFrom && toDateOnly(transfer.date) < filterDateFrom) return false;
      if (filterDateTo && toDateOnly(transfer.date) > filterDateTo) return false;
      
      // 转出账户筛选
      if (filterFromAccount !== "all" && transfer.fromAccountId !== filterFromAccount) return false;
      
      // 转入账户筛选
      if (filterToAccount !== "all" && transfer.toAccountId !== filterToAccount) return false;
      
      // 关键词搜索
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.toLowerCase();
        // 确认换汇（PENDING → CONFIRMED）
  const handleConfirmTransfer = async (transferId: string) => {
    const transfer = filteredTransfers.find((t) => t.id === transferId);
    if (!transfer) {
      toast.error("未找到记录");
      return;
    }
    const flowIds = [transfer.outFlowId, transfer.inFlowId].filter(Boolean);
    if (flowIds.length === 0) {
      toast.error("未找到关联流水ID");
      return;
    }
    try {
      for (const flowId of flowIds) {
        const res = await fetch(`/api/cash-flow/${flowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "confirmed" }),
          credentials: "same-origin",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "更新失败");
        }
      }
      swrMutate("/api/cash-flow?page=1&pageSize=5000&noCache=true");
      swrMutate("/api/accounts?page=1&pageSize=500");
      toast.success("换汇已确认");
    } catch (e: any) {
      toast.error(e?.message || "确认失败");
    }
  };

  // 删除换汇（PENDING 状态可删除）
  const handleDeleteTransfer = async (transferId: string) => {
    if (!confirm("确定要删除这笔待确认的换汇记录吗？")) return;
    try {
      const transfer = filteredTransfers.find((t) => t.id === transferId);
      const flowIds = transfer ? [transfer.outFlowId, transfer.inFlowId].filter(Boolean) : [];
      for (const flowId of flowIds) {
        await fetch(`/api/cash-flow/${flowId}`, { method: "DELETE" });
      }
      swrMutate("/api/cash-flow?page=1&pageSize=5000&noCache=true");
      toast.success("已删除");
    } catch {
      toast.error("删除失败");
    }
  };

  return (
          transfer.fromAccountName.toLowerCase().includes(keyword) ||
          transfer.toAccountName.toLowerCase().includes(keyword) ||
          transfer.remark.toLowerCase().includes(keyword) ||
          String(transfer.fromAmount || '').includes(keyword) ||
          String(transfer.toAmount || '').includes(keyword) ||
          String(Math.abs(transfer.fromAmount || 0)).includes(keyword) ||
          String(Math.abs(transfer.toAmount || 0)).includes(keyword)
        );
      }
      
      // 划拨类型筛选
      if (filterTransferType !== "all" && transfer.category !== filterTransferType) return false;
      
      return true;
    });
  }, [transfers, filterDateFrom, filterDateTo, filterFromAccount, filterToAccount, searchKeyword, filterTransferType]);

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
    const accountStats = Array.isArray(accounts) ? accounts.map((account) => {
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
      // 按币种分别统计净额
      const netByCurrency: Record<string, number> = {};
      transfersOut.forEach(t => {
        const cur = t.fromCurrency || account.currency || "CNY";
        netByCurrency[cur] = (netByCurrency[cur] || 0) - t.fromAmount;
      });
      transfersIn.forEach(t => {
        const cur = t.toCurrency || account.currency || "CNY";
        netByCurrency[cur] = (netByCurrency[cur] || 0) + t.toAmount;
      });
      // 如果只有一种币种，netAmount 用该币种值；多种币种则用主币种
      const currencyKeys = Object.keys(netByCurrency);
      const netAmount = currencyKeys.length === 1 ? netByCurrency[currencyKeys[0]] : (totalIn - totalOut);
      
      return {
        accountId: account.id,
        accountName: account.name,
        accountCurrency: account.currency,
        netByCurrency,
        outCount: transfersOut.length,
        inCount: transfersIn.length,
        totalOut,
        totalIn,
        netAmount,
        outByCurrency,
        inByCurrency
      };
    }).filter((stat) => stat.outCount > 0 || stat.inCount > 0) : []; // 只显示有划拨记录的账户
    
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
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="text-xs font-medium text-white/70 mb-2">划拨总数</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{stats.totalCount}</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #be123c 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2"><TrendingDown className="h-4 w-4 text-rose-300/70" /><div className="text-xs font-medium text-white/70">转出总额</div></div>
            {Object.entries(stats.fromAmountByCurrency).map(([curr, amount]) => (
              <div key={curr} className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{curr === "RMB" ? currency(amount, "CNY") : currency(amount, curr)}</div>
            ))}
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-4 w-4 text-emerald-300/70" /><div className="text-xs font-medium text-white/70">转入总额</div></div>
            {Object.entries(stats.toAmountByCurrency).length > 0 ? Object.entries(stats.toAmountByCurrency).map(([curr, amount]) => (
              <div key={curr} className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{curr === "RMB" ? currency(amount, "CNY") : currency(amount, curr)}</div>
            )) : <div className="text-slate-500 text-sm">-</div>}
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2"><Coins className="h-4 w-4 text-purple-300/70" /><div className="text-xs font-medium text-white/70">平均汇率</div></div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{stats.totalCount > 0 ? formatNumber(filteredTransfers.reduce((sum, t) => sum + t.exchangeRate, 0) / stats.totalCount) : "0.000000"}</div>
          </div>
        </div>
      </section>

      {/* 账户维度统计 */}
      {stats.accountStats && stats.accountStats.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">账户划拨统计</h2>
          <div className="grid gap-4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
            {stats.accountStats.map((accountStat, idx) => {
              const acctGradients = ["linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)", "linear-gradient(135deg, #065f46 0%, #0f172a 100%)", "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)", "linear-gradient(135deg, #b45309 0%, #0f172a 100%)", "linear-gradient(135deg, #be123c 0%, #0f172a 100%)", "linear-gradient(135deg, #0e7490 0%, #0f172a 100%)"];
              const acctGrad = acctGradients[idx % acctGradients.length];
              return (
              <Link key={accountStat.accountId} href={`/finance/accounts?accountId=${accountStat.accountId}`} className="group relative overflow-hidden rounded-2xl border p-4 transition-all hover:scale-[1.02] hover:shadow-xl" style={{ background: acctGrad, border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="absolute top-0 right-0 -mt-4 -mr-4 h-16 w-16 rounded-full bg-white/5 blur-2xl" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-white">{accountStat.accountName}</div>
                    <span className="text-xs px-2 py-0.5 rounded-full border border-white/20 text-white/70 backdrop-blur-sm">{accountStat.accountCurrency}</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-white/50">划出</span>
                      <span className="text-rose-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{accountStat.outCount}次</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/50">划入</span>
                      <span className="text-emerald-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{accountStat.inCount}次</span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
                      <span className="text-white/50">净额</span>
                      <div className="text-right space-y-0.5">
                        {Object.entries(accountStat.netByCurrency || {}).map(([cur, amt]: [string, number]) => (
                          <div key={cur} className={`font-semibold ${amt >= 0 ? "text-emerald-400" : "text-rose-400"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {cur === "CNY" || cur === "RMB" ? currency(amt, "CNY") : currency(amt, cur)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
            })}
          </div>
        </section>
      )}

      {/* 筛选区域 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
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
              {renderGroupedAccountOptions(accountsWithBalance)}
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
              {renderGroupedAccountOptions(accountsWithBalance)}
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
          <div className="space-y-1">
            <label className="text-xs text-slate-400">划拨类型</label>
            <select value={filterTransferType} onChange={(e) => setFilterTransferType(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400">
              <option value="all">全部类型</option>
              <option value="内部划拨">划拨(同币种)</option>
              <option value="换汇">换汇(跨币种)</option>
            </select>
          </div>
        </div>
      </section>

      {/* 划拨记录列表 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-xs">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-400 w-24">类型</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 w-32">日期</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[150px]">转出账户</th>
                <th className="px-3 py-2 text-right font-medium text-slate-400 w-32">转出金额</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-16"></th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[150px]">转入账户</th>
                <th className="px-3 py-2 text-right font-medium text-slate-400 w-32">转入金额</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-24">汇率</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-20">状态</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[120px]">备注</th>
                <th className="px-3 py-2 text-left font-medium text-slate-400 w-32">单号</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-16">凭证</th>
                <th className="px-3 py-2 text-center font-medium text-slate-400 w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {filteredTransfers.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-500" colSpan={12}>
                    暂无划拨记录
                  </td>
                </tr>
              )}
              {paginate(filteredTransfers, pgPage, pgPageSize).map((transfer) => (
                <tr key={transfer.id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${transfer.category === "换汇" ? "bg-purple-500/20 text-purple-300" : "bg-blue-500/20 text-blue-300"}`}>
                      {transfer.category === "换汇" ? "换汇" : "划拨"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{formatDate(transfer.date)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/finance/accounts?accountId=${transfer.fromAccountId}`} className="text-slate-200 font-medium hover:text-cyan-300 transition-colors">{transfer.fromAccountName}</Link>
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
                    <Link href={`/finance/accounts?accountId=${transfer.toAccountId}`} className="text-slate-200 font-medium hover:text-cyan-300 transition-colors">{transfer.toAccountName}</Link>
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
                  <td className="px-3 py-2 text-center">
                    {transfer.status === "pending" ? (
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-300 border border-amber-500/40">待确认</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">已确认</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-400 text-xs">{transfer.remark || "-"}</td>
                  <td className="px-3 py-2 text-xs">
                    {editTransferBN === transfer.id ? (
                      <input
                        type="text"
                        defaultValue={transfer.businessNumber || ""}
                        className="w-24 rounded border border-slate-600 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-100 outline-none focus:border-primary-400"
                        placeholder="关联单号"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setEditTransferBN(null);
                        }}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (val !== (transfer.businessNumber || "")) {
                            try {
                              await fetch(`/api/cash-flow/${transfer.outFlowId}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                credentials: "same-origin",
                                body: JSON.stringify({ businessNumber: val || null }),
                              });
                              toast.success(val ? "单号已更新" : "单号已清除");
                              swrMutate("/api/cash-flow?page=1&pageSize=5000&noCache=true");
                            } catch { toast.error("更新失败"); }
                          }
                          // 同时更新转入流水
                          if (val) {
                            try { await fetch(`/api/cash-flow/${transfer.inFlowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ businessNumber: val }) }); } catch {}
                          }
                          setEditTransferBN(null);
                        }}
                      />
                    ) : transfer.businessNumber ? (
                      <span className="text-primary-400 font-mono">{transfer.businessNumber} <button onClick={() => setEditTransferBN(transfer.id)} className="text-slate-600 hover:text-primary-400 ml-0.5">✏</button></span>
                    ) : (
                      <button onClick={() => setEditTransferBN(transfer.id)} className="text-slate-600 hover:text-primary-400 text-[10px]">+ 添加单号</button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {transfer.voucher && transfer.voucher.length > 10 ? (
                      <button
                        onClick={() => {
                          let v = transfer.voucher || "";
                          try {
                            const parsed = JSON.parse(v);
                            if (Array.isArray(parsed) && parsed.length > 0) v = parsed[0];
                            else if (typeof parsed === "string") v = parsed;
                          } catch {}
                          setVoucherViewModal(v || null);
                        }}
                        className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 transition"
                      >
                        查看
                      </button>
                    ) : (
                      <span className="text-slate-500 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {transfer.status === "pending" ? (
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => { console.log("confirm clicked", transfer.id); handleConfirmTransfer(transfer.id); }}
                          className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-100 hover:bg-emerald-500/20"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => handleDeleteTransfer(transfer.id)}
                          className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                        >
                          删除
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-600 text-xs">-</span>
                    )}
                    <button
                      onClick={() => setSupplementTransfer({ id: transfer.outFlowId, summary: transfer.remark || transfer.category, date: transfer.date })}
                      className="mt-1 px-2 py-1 rounded border border-blue-500/40 bg-blue-500/10 text-xs text-blue-100 hover:bg-blue-500/20 block mx-auto"
                    >
                      补充凭证
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      <Pagination total={filteredTransfers.length} page={pgPage} pageSize={pgPageSize} onPageChange={setPgPage} onPageSizeChange={setPgPageSize} />
        </div>
      </section>

      {/* 补充凭证弹窗 */}
      {supplementTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">补充凭证</h3>
              <button onClick={() => { setSupplementTransfer(null); setSupplementVoucherValue(""); }} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <p className="text-xs text-slate-400 mb-3">{supplementTransfer.summary} · {supplementTransfer.date}</p>
            <div className="space-y-3 mb-4">
              <label className="block text-sm font-medium text-slate-300">划拨凭证</label>
              <ImageUploader
                value={supplementVoucherValue}
                onChange={(v) => setSupplementVoucherValue(v)}
                multiple
                label="上传凭证"
                placeholder="点击上传或 Ctrl+V 粘贴"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setSupplementTransfer(null); setSupplementVoucherValue(""); }} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">取消</button>
              <button
                onClick={async () => {
                  const voucherStr = Array.isArray(supplementVoucherValue)
                    ? JSON.stringify(supplementVoucherValue)
                    : supplementVoucherValue || null;
                  try {
                    await fetch(`/api/cash-flow/${supplementTransfer.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      credentials: "same-origin",
                      body: JSON.stringify({
                        paymentVoucher: voucherStr,
                        transferVoucher: voucherStr,
                      }),
                    });
                    toast.success("凭证已补充");
                    swrMutate("/api/cash-flow?page=1&pageSize=5000&noCache=true");
                  } catch { toast.error("保存失败"); }
                  setSupplementTransfer(null);
                  setSupplementVoucherValue("");
                }}
                className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="absolute top-2 right-2 z-10 flex gap-2">
              <button
                onClick={() => setVoucherRotation((r) => (r - 90) % 360)}
                className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                title="向左旋转"
              >↺</button>
              <button
                onClick={() => setVoucherRotation((r) => (r + 90) % 360)}
                className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                title="向右旋转"
              >↻</button>
              <button
                onClick={() => { setVoucherViewModal(null); setVoucherRotation(0); }}
                className="text-white text-2xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
              >✕</button>
            </div>
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
                    className="max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5 transition-transform duration-300"
                    style={{ transform: `rotate(${voucherRotation}deg)` }}
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
          accounts={accountsWithBalance}
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
              // 强力刷新：清除SWR缓存 + 触发页面重新加载
              swrMutate(key => typeof key === "string" && key.includes("cash-flow"), undefined, { revalidate: true });
              swrMutate(key => typeof key === "string" && key.includes("accounts"), undefined, { revalidate: true });
              if (typeof window !== "undefined") {
                const cacheKey = "swr-cache-v29";
                try {
                  const stored = window.localStorage.getItem(cacheKey);
                  if (stored) {
                    const entries = JSON.parse(stored);
                    const filtered = entries.filter(([k]: [string, unknown]) => !k.includes("cash-flow") && !k.includes("accounts"));
                    window.localStorage.setItem(cacheKey, JSON.stringify(filtered));
                  }
                } catch {}
              }
              
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
