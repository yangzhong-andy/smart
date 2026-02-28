"use client";

import { Package, DollarSign, Coins, TrendingUp } from "lucide-react";
import { currency } from "./types";
import type { ContractSummary } from "./types";

interface PurchaseOrderStatsProps {
  summary: ContractSummary;
}

export function PurchaseOrderStats({ summary }: PurchaseOrderStatsProps) {
  const cardClass =
    "group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]";
  const cardStyle = { border: "1px solid rgba(255, 255, 255, 0.1)" };

  return (
    <section className="grid gap-6 md:grid-cols-4">
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
              <Package className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">总合同数</div>
          <div
            className="text-3xl font-bold text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {summary.totalCount}
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
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">合同总额</div>
          <div
            className="text-2xl font-bold text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {currency(summary.totalAmount)}
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
              <Coins className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">已付总额</div>
          <div
            className="text-2xl font-bold text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {currency(summary.totalPaid)}
          </div>
        </div>
      </div>

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
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">拿货进度</div>
          <div
            className="text-3xl font-bold text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {summary.avgProgress.toFixed(1)}%
          </div>
        </div>
      </div>
    </section>
  );
}
