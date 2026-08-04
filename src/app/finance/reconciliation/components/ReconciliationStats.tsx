"use client";

import { formatCurrency } from "./types";
import type { InventoryStats } from "./types";

interface ReconciliationStatsProps {
  stats: InventoryStats;
}

export function ReconciliationStats({ stats }: ReconciliationStatsProps) {
  const cardClass =
    "group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]";
  const cardStyle = { border: "1px solid rgba(255, 255, 255, 0.1)" };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-100">库存资产统计</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div
          className={cardClass}
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
            ...cardStyle,
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">存货资产总值</div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(stats.totalValue, "CNY", "income")}
            </div>
            <div className="text-xs text-white/60 mt-2">
              总计 {stats.factoryQty + stats.domesticQty + stats.transitQty} 件
            </div>
          </div>
        </div>

        <div
          className={cardClass}
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
            ...cardStyle,
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">工厂现货</div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.factoryQty.toLocaleString("zh-CN")}
            </div>
            <div className="text-xs text-white/60 mt-2">
              {formatCurrency(stats.factoryValue, "CNY", "income")}
            </div>
          </div>
        </div>

        <div
          className={cardClass}
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
            ...cardStyle,
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">国内待发</div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.domesticQty.toLocaleString("zh-CN")}
            </div>
            <div className="text-xs text-white/60 mt-2">
              {formatCurrency(stats.domesticValue, "CNY", "income")}
            </div>
          </div>
        </div>

        <div
          className={cardClass}
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            ...cardStyle,
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">海运中</div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {stats.transitQty.toLocaleString("zh-CN")}
            </div>
            <div className="text-xs text-white/60 mt-2">
              {formatCurrency(stats.transitValue, "CNY", "income")}
            </div>
          </div>
        </div>
      </div>
      <div className="text-xs text-slate-400 text-center">
        详细库存管理请前往：供应链 → 库存查询
      </div>
    </div>
  );
}
