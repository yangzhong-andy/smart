import Link from "next/link";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";

export default function TikTokAfterSalesPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/platforms/tiktok" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300">
              <ArrowLeft className="h-4 w-4" /> TikTok Shop
            </Link>
            <h1 className="text-2xl font-semibold">售后管理</h1>
            <p className="mt-1 text-sm text-slate-400">退货、退款和售后状态统一关联原订单。</p>
          </div>
          <button type="button" disabled className="inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4" /> 同步售后
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[["待处理", "—"], ["退款中", "—"], ["已完成", "—"]].map(([label, value]) => (
            <div key={label} className="border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-xs text-slate-400">{label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-200">{value}</div>
            </div>
          ))}
        </div>

        <section className="border border-slate-800 bg-slate-900/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-4">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input disabled placeholder="订单号 / 售后单号" className="w-full rounded-md border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-500" />
            </div>
            <select disabled className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-500"><option>全部店铺</option></select>
            <select disabled className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-500"><option>全部状态</option></select>
          </div>
          <div className="p-12 text-center text-sm text-slate-500">售后接口接入后将在这里显示退货、退款及处理记录。</div>
        </section>
      </div>
    </main>
  );
}
