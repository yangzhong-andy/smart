"use client";

import { Package, TrendingUp, DollarSign } from "lucide-react";
import { formatNumber } from "./constants";

export type ProductSummary = {
  totalCount: number;
  onSaleCount: number;
  offSaleCount: number;
  avgCost: number;
  costByCurrency?: Record<string, number>;
};

type ProductsStatsProps = {
  summary: ProductSummary;
};

export function ProductsStats({ summary }: ProductsStatsProps) {
  return (
    <section className="grid gap-6 md:grid-cols-4">
      <div
        className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)"
        }}
      >
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <Package className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">总产品数</div>
          <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {summary.totalCount}
          </div>
        </div>
      </div>

      <div
        className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)"
        }}
      >
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">在售产品</div>
          <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {summary.onSaleCount}
          </div>
        </div>
      </div>

      <div
        className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #6b7280 0%, #374151 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)"
        }}
      >
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <Package className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">下架产品</div>
          <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {summary.offSaleCount}
          </div>
        </div>
      </div>

      <div
        className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
        style={{
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          border: "1px solid rgba(255, 255, 255, 0.1)"
        }}
      >
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">平均成本</div>
          <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {formatNumber(summary.avgCost)}
          </div>
        </div>
      </div>
    </section>
  );
}
