"use client";

import { Truck, Ship, Package, Warehouse } from "lucide-react";

type ContainerStatsSummary = {
  total: number;
  inTransit: number;
  arrivedPort: number;
  inWarehouse: number;
};

interface ContainerStatsProps {
  summary: ContainerStatsSummary;
}

export function ContainerStats({ summary }: ContainerStatsProps) {
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
          <div className="mb-4 rounded-xl bg-white/20 p-3 w-fit backdrop-blur-sm">
            <Truck className="h-6 w-6 text-white" />
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">柜子总数</div>
          <div className="text-3xl font-bold text-white">{summary.total}</div>
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
          <div className="mb-4 rounded-xl bg-white/20 p-3 w-fit backdrop-blur-sm">
            <Ship className="h-6 w-6 text-white" />
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">在途柜</div>
          <div className="text-3xl font-bold text-white">{summary.inTransit}</div>
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
          <div className="mb-4 rounded-xl bg-white/20 p-3 w-fit backdrop-blur-sm">
            <Package className="h-6 w-6 text-white" />
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">已到港</div>
          <div className="text-3xl font-bold text-white">{summary.arrivedPort}</div>
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
          <div className="mb-4 rounded-xl bg-white/20 p-3 w-fit backdrop-blur-sm">
            <Warehouse className="h-6 w-6 text-white" />
          </div>
          <div className="text-xs font-medium text-white/80 mb-1">已入仓</div>
          <div className="text-3xl font-bold text-white">{summary.inWarehouse}</div>
        </div>
      </div>
    </section>
  );
}

