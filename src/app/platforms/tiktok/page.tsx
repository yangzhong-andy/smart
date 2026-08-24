import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, CreditCard, Link2, MessageSquare, Package, RefreshCw, ShoppingBag, Store } from "lucide-react";

const modules = [
  { label: "店铺与授权", href: "/settings/tiktok", icon: Link2, tone: "text-cyan-300" },
  { label: "订单管理", href: "/tiktok/orders", icon: ShoppingBag, tone: "text-blue-300" },
  { label: "售后管理", href: "/platforms/tiktok/after-sales", icon: RefreshCw, tone: "text-amber-300" },
  { label: "履约物流", href: "/logistics/tracking", icon: Package, tone: "text-violet-300" },
  { label: "结算财务", href: "/tiktok/finance", icon: CreditCard, tone: "text-emerald-300" },
  { label: "商品管理", href: "/product-center/products", icon: Boxes, tone: "text-orange-300" },
  { label: "达人合作", href: "/tiktok/affiliate", icon: MessageSquare, tone: "text-pink-300" },
  { label: "数据分析", href: "/tiktok/analytics", icon: BarChart3, tone: "text-sky-300" },
];

export default function TikTokPlatformPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300">
              <Store className="h-4 w-4" /> 平台中心
            </div>
            <h1 className="text-2xl font-semibold">TikTok Shop</h1>
            <p className="mt-1 text-sm text-slate-400">按平台集中进入店铺、订单、售后与财务业务。</p>
          </div>
          <Link href="/settings/tiktok" className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400 hover:text-cyan-200">
            管理授权 <ArrowRight className="h-4 w-4" />
          </Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(({ label, href, icon: Icon, tone }) => (
            <Link key={href} href={href} className="group border border-slate-800 bg-slate-900/70 p-4 transition-colors hover:border-slate-600 hover:bg-slate-900">
              <div className="flex items-center justify-between">
                <Icon className={`h-5 w-5 ${tone}`} />
                <ArrowRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-slate-300" />
              </div>
              <div className="mt-5 text-sm font-medium text-slate-100">{label}</div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
