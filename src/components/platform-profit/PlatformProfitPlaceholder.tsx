"use client";

import { BarChart3, CircleAlert, Store } from "lucide-react";

export function PlatformProfitPlaceholder({ platform, description }: { platform: string; description: string }) {
  return <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <header><h1 className="flex items-center gap-2 text-2xl font-semibold"><BarChart3 className="h-6 w-6 text-slate-400" />{platform} 精细利润核算</h1><p className="mt-1 text-sm text-slate-400">{description}</p></header>
    <section className="grid gap-3 rounded-md border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-4">
      <label className="text-xs text-slate-400">店铺<select disabled className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-500"><option>暂无已授权店铺</option></select></label>
      <label className="text-xs text-slate-400">开始日期<input type="date" disabled className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-500" /></label>
      <label className="text-xs text-slate-400">结束日期<input type="date" disabled className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-500" /></label>
      <label className="text-xs text-slate-400">订单号<input disabled placeholder="平台接入后可搜索" className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-500" /></label>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{["订单数", "GMV", "已知成本", "贡献利润", "利润覆盖"].map((label) => <div key={label} className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold text-slate-600">--</div><div className="mt-1 text-xs text-slate-600">待平台数据接入</div></div>)}</section>
    <section className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-slate-700 bg-slate-900/50 px-6 text-center"><Store className="mb-3 h-10 w-10 text-slate-600" /><h2 className="text-base font-medium text-slate-300">{platform} 尚未接入订单 API</h2><p className="mt-2 max-w-xl text-sm text-slate-500">当前页面和核算字段已经预留。完成平台授权与订单、结算同步后，这里会自动显示逐单利润，不会使用虚构数据。</p><div className="mt-4 inline-flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300"><CircleAlert className="h-4 w-4" />当前无可核算数据</div></section>
  </div>;
}
