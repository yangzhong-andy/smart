"use client";

import { Wallet, DollarSign, Package, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

interface StatCardsProps {
  totalAssets: number;
  netAvailableAssets: number;
  totalPendingPayments: number;
  inventoryAssetValue: number;
  thisMonthIncome: number;
  thisMonthExpense: number;
}

export function StatCards({
  totalAssets,
  netAvailableAssets,
  totalPendingPayments,
  inventoryAssetValue,
  thisMonthIncome,
  thisMonthExpense,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-1">当前总资产</p>
            <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalAssets)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">所有账户余额加总</p>
          </div>
          <Wallet className="h-8 w-8 text-emerald-300 opacity-50" />
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-1">净可用资产</p>
            <p className="text-2xl font-bold text-primary-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(netAvailableAssets)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">总资产 - 待付款项</p>
          </div>
          <DollarSign className="h-8 w-8 text-primary-300 opacity-50" />
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #9a3412 0%, #0f172a 100%)",
          border: "1px solid rgba(248, 250, 252, 0.12)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-300 mb-1">拿货未付款金额</p>
            <p className="text-2xl font-bold text-amber-200" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(totalPendingPayments)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">包含待付定金 + 待付尾款</p>
          </div>
          <AlertCircle className="h-8 w-8 text-amber-300 opacity-60" />
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-1">存货资产总值</p>
            <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(inventoryAssetValue)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">工厂现货+国内待发+海运中</p>
          </div>
          <Package className="h-8 w-8 text-purple-300 opacity-50" />
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-1">本月总收入</p>
            <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(thisMonthIncome)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">来自收支明细记录</p>
          </div>
          <TrendingUp className="h-8 w-8 text-emerald-300 opacity-50" />
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #7f1d1d 0%, #0f172a 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 mb-1">本月总支出</p>
            <p className="text-2xl font-bold text-rose-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(thisMonthExpense)}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">采购货款、广告费等</p>
          </div>
          <TrendingDown className="h-8 w-8 text-rose-300 opacity-50" />
        </div>
      </div>
    </div>
  );
}

