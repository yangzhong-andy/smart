"use client";

import { formatCurrency } from "@/lib/currency-utils";
import { Building2, TrendingUp, Wallet, Gift } from "lucide-react";

export interface AgencyStatsData {
  agencyCount: number;
  totalRecharge: number;
  totalConsumption: number;
  totalRebate: number;
  totalBalance: number;
  mainCurrency: string;
}

interface AgencyStatsProps {
  stats: AgencyStatsData;
}

const cardStyle = {
  background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
};

export function AgencyStats({ stats }: AgencyStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={cardStyle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-500/20">
            <Building2 className="h-5 w-5 text-primary-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">合作代理数</p>
            <p className="text-xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.agencyCount}
            </p>
          </div>
        </div>
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={cardStyle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <Wallet className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">总充值金额</p>
            <p className="text-xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(stats.totalRecharge, stats.mainCurrency as "USD" | "CNY" | "HKD", "income")}
            </p>
          </div>
        </div>
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={cardStyle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <TrendingUp className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">总投放/消耗金额</p>
            <p className="text-xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(stats.totalConsumption, stats.mainCurrency as "USD" | "CNY" | "HKD", "expense")}
            </p>
          </div>
        </div>
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={cardStyle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-500/20">
            <Gift className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">总返点金额</p>
            <p className="text-xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(stats.totalRebate, stats.mainCurrency as "USD" | "CNY" | "HKD", "income")}
            </p>
          </div>
        </div>
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
        style={cardStyle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Wallet className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">账户剩余金额</p>
            <p className="text-xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(stats.totalBalance, stats.mainCurrency as "USD" | "CNY" | "HKD", "balance")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
