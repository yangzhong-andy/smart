"use client";
import React from "react";
import { Package, Layers3, CheckCircle2, ClipboardList } from "lucide-react";
export type ProductSummary = {
  totalCount: number; onSaleCount: number; offSaleCount: number; avgCost: number;
  costByCurrency?: Record<string, number>; skuCount?: number; incompleteCount?: number;
};
export function ProductsStats({ summary }: { summary: ProductSummary }) {
  const items = [
    { label: "产品系列", value: summary.totalCount, hint: "当前筛选范围", icon: Package, color: "text-cyan-300" },
    { label: "SKU 规格", value: summary.skuCount ?? 0, hint: "各产品下的独立编码", icon: Layers3, color: "text-violet-300" },
    { label: "在售产品", value: summary.onSaleCount, hint: "下架 " + summary.offSaleCount + " 个", icon: CheckCircle2, color: "text-emerald-300" },
    { label: "待完善 SKU", value: summary.incompleteCount ?? 0, hint: "缺成本或重量、长宽高", icon: ClipboardList, color: "text-amber-300" },
  ];
  return <section aria-label="产品资料概况" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {items.map(({ label, value, hint, icon: Icon, color }) => <div key={label} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-5 py-4">
      <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>
      <Icon className={"h-6 w-6 " + color} />
    </div>)}
  </section>;
}
