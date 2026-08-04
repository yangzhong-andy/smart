"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, TrendingUp, ShoppingCart, DollarSign, Percent, Package, Truck, Clock, Gift, Calendar } from "lucide-react";

type Analytics = {
  summary: {
    totalSales: number; validOrders: number; cancelledOrders: number; unpaidOrders: number;
    totalOrders: number; totalItems: number; avgPrice: number; cancelRate: number;
    avgShipHours: number; currency: string;
  };
  dailyTrend: { date: string; orders: number; sales: number; cancelled: number }[];
  statusDistribution: { name: string; count: number }[];
  funnel: { total: number; paid: number; shipped: number; delivered: number; completed: number };
  productRanking: { sku: string; name: string; qty: number; sales: number; image?: string }[];
  paymentMethods: { name: string; count: number }[];
  cancelReasons: { reason: string; count: number }[];
  shippingProviders: { name: string; count: number }[];
  shopComparison: { shopName: string; orders: number; sales: number; cancelled: number; avgPrice: number }[];
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "已完成", DELIVERED: "已送达", IN_TRANSIT: "运输中",
  AWAITING_COLLECTION: "待揽收", AWAITING_SHIPMENT: "待发货",
  CANCELLED: "已取消", UNPAID: "未付款", ON_HOLD: "暂停",
};
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#10b981", DELIVERED: "#3b82f6", IN_TRANSIT: "#8b5cf6",
  AWAITING_COLLECTION: "#f59e0b", AWAITING_SHIPMENT: "#f97316",
  CANCELLED: "#ef4444", UNPAID: "#6b7280", ON_HOLD: "#a78bfa",
};

const fmtMoney = (v: number, currency = "BRL") => `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const fmtDate = (d: string) => d.substring(5); // MM-DD

export default function TikTokAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [shopId, setShopId] = useState("");
  const [shops, setShops] = useState<{shopId:string;shopName:string}[]>([]);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    fetch("/api/tiktok/data?type=shops").then(r => r.json()).then(d => setShops(d.shops || [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (useCustomDate && customStart && customEnd) {
        params.set("startDate", customStart);
        params.set("endDate", customEnd);
      } else {
        params.set("days", String(days));
      }
      if (shopId) params.set("shopId", shopId);
      const res = await fetch(`/api/tiktok/analytics?${params}`);
      const d = await res.json();
      setData(d);
    } catch { toast.error("加载失败"); }
    setLoading(false);
  }, [days, shopId, useCustomDate, customStart, customEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
      </div>
    );
  }

  const s = data.summary;
  const maxDailySales = Math.max(...data.dailyTrend.map(d => d.sales), 1);
  const maxDailyOrders = Math.max(...data.dailyTrend.map(d => d.orders), 1);
  const maxProductQty = Math.max(...data.productRanking.map(p => p.qty), 1);

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      {/* 标题 + 筛选 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">📊 订单分析面板</h1>
          <p className="text-sm text-slate-400 mt-1">
            {shops.length > 1 && !shopId ? "全部店铺" : shops.find(x=>x.shopId===shopId)?.shopName || "全部店铺"} · {useCustomDate && customStart ? `${customStart} 至 ${customEnd}` : `最近 ${days} 天`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {shops.length > 1 && (
            <select value={shopId} onChange={(e) => setShopId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
              <option value="">全部店铺</option>
              {shops.map(s => <option key={s.shopId} value={s.shopId}>{s.shopName}</option>)}
            </select>
          )}
          <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => { setDays(d); setUseCustomDate(false); }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${!useCustomDate && days === d ? "bg-primary-500 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {d}天
              </button>
            ))}
            <button onClick={() => setUseCustomDate(!useCustomDate)}
              className={`rounded px-3 py-1.5 text-sm font-medium flex items-center gap-1 ${useCustomDate ? "bg-primary-500 text-white" : "text-slate-400 hover:text-slate-200"}`}>
              <Calendar className="h-3.5 w-3.5" />自定义
            </button>
          </div>
          {useCustomDate && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200" />
              <span className="text-slate-500 text-sm">至</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200" />
            </div>
          )}
        </div>
      </div>

      {/* 今日数据 */}
      {data.today && (
        <div className="rounded-xl border border-primary-800/40 bg-primary-900/10 p-5">
          <h3 className="text-base font-semibold text-primary-300 mb-4">📅 今日数据</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">今日销售额</div>
              <div className="text-lg font-bold text-emerald-300 mt-1">{fmtMoney(data.today.sales, s.currency)}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">今日订单</div>
              <div className="text-lg font-bold text-blue-300 mt-1">{data.today.orders}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">今日售出</div>
              <div className="text-lg font-bold text-cyan-300 mt-1">{data.today.items}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">今日客单价</div>
              <div className="text-lg font-bold text-purple-300 mt-1">{fmtMoney(data.today.avgPrice, s.currency)}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">今日取消</div>
              <div className="text-lg font-bold text-rose-300 mt-1">{data.today.cancelled}</div>
            </div>
          </div>
        </div>
      )}

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <MetricCard icon={<DollarSign className="h-5 w-5" />} label="总销售额" value={fmtMoney(s.totalSales, s.currency)} color="text-emerald-400 bg-emerald-500/10" />
        <MetricCard icon={<ShoppingCart className="h-5 w-5" />} label="有效订单" value={s.validOrders.toLocaleString("en-US")} color="text-blue-400 bg-blue-500/10" />
        <MetricCard icon={<TrendingUp className="h-5 w-5" />} label="客单价" value={fmtMoney(s.avgPrice, s.currency)} color="text-purple-400 bg-purple-500/10" />
        <MetricCard icon={<Percent className="h-5 w-5" />} label="取消率" value={`${s.cancelRate}%`} sub={`${s.cancelledOrders}单`} color="text-rose-400 bg-rose-500/10" />
        <MetricCard icon={<Clock className="h-5 w-5" />} label="平均发货" value={`${(s.avgShipHours / 24).toFixed(1)}天`} color="text-amber-400 bg-amber-500/10" />
        <MetricCard icon={<Package className="h-5 w-5" />} label="售出商品" value={s.totalItems.toLocaleString("en-US")} color="text-cyan-400 bg-cyan-500/10" />
        <MetricCard icon={<Gift className="h-5 w-5" />} label="免费样品" value={(s.sampleOrders || 0).toLocaleString("en-US")} sub="未计入销售" color="text-pink-400 bg-pink-500/10" />
      </div>

      {/* 每日销售趋势 */}
      <ChartCard title="📈 每日销售趋势">
        <div className="flex items-end gap-1 h-48 mt-4">
          {data.dailyTrend.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* 销售额柱 */}
              <div className="w-full bg-emerald-500/60 rounded-t hover:bg-emerald-400 transition-colors relative"
                style={{ height: `${(d.sales / maxDailySales) * 160}px`, minHeight: d.sales > 0 ? "2px" : "0" }}>
              </div>
              {/* 订单数指示器 */}
              <div className="w-full bg-blue-500/60 rounded-b"
                style={{ height: `${(d.orders / maxDailyOrders) * 20}px`, minHeight: d.orders > 0 ? "1px" : "0" }}>
              </div>
              {/* 悬浮提示 */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs whitespace-nowrap z-10 shadow-xl">
                <div className="text-slate-400">{fmtDate(d.date)}</div>
                <div className="text-emerald-400">💰 {fmtMoney(d.sales)}</div>
                <div className="text-blue-400">📦 {d.orders}单</div>
                {d.cancelled > 0 && <div className="text-rose-400">❌ 取消{d.cancelled}单</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500/60 rounded"></span>销售额</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500/60 rounded"></span>订单数</span>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 订单漏斗 */}
        <ChartCard title="🔻 订单转化漏斗">
          <div className="space-y-3 mt-4">
            {[
              { label: "总下单", value: data.funnel.total, color: "bg-slate-600", width: 100 },
              { label: "已付款", value: data.funnel.paid, color: "bg-blue-600", width: data.funnel.total > 0 ? (data.funnel.paid / data.funnel.total) * 100 : 0 },
              { label: "已发货", value: data.funnel.shipped, color: "bg-purple-600", width: data.funnel.total > 0 ? (data.funnel.shipped / data.funnel.total) * 100 : 0 },
              { label: "已送达", value: data.funnel.delivered, color: "bg-cyan-600", width: data.funnel.total > 0 ? (data.funnel.delivered / data.funnel.total) * 100 : 0 },
              { label: "已完成", value: data.funnel.completed, color: "bg-emerald-600", width: data.funnel.total > 0 ? (data.funnel.completed / data.funnel.total) * 100 : 0 },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="text-sm text-slate-400 w-16">{f.label}</div>
                <div className="flex-1 relative h-8 bg-slate-800 rounded-lg overflow-hidden">
                  <div className={`h-full ${f.color} flex items-center justify-end px-3 transition-all`}
                    style={{ width: `${Math.max(f.width, 5)}%` }}>
                    <span className="text-xs text-white font-medium">{f.value.toLocaleString("en-US")}</span>
                  </div>
                </div>
                <div className="text-xs text-slate-500 w-12 text-right">
                  {i > 0 && data.funnel.total > 0 ? `${((f.value / data.funnel.total) * 100).toFixed(0)}%` : ""}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* 订单状态分布 */}
        <ChartCard title="🍩 订单状态分布">
          <div className="space-y-2 mt-4">
            {data.statusDistribution.sort((a,b) => b.count - a.count).map((s) => {
              const pct = data.summary.totalOrders > 0 ? (s.count / data.summary.totalOrders) * 100 : 0;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24">
                    <span className="w-3 h-3 rounded" style={{ background: STATUS_COLORS[s.name] || "#6b7280" }}></span>
                    <span className="text-sm text-slate-300">{STATUS_LABELS[s.name] || s.name}</span>
                  </div>
                  <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: STATUS_COLORS[s.name] || "#6b7280" }}></div>
                  </div>
                  <div className="text-sm text-slate-400 w-20 text-right">{s.count} ({pct.toFixed(1)}%)</div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      {/* 商品销量排行 */}
      <ChartCard title="🏷️ 商品销量排行">
        <div className="space-y-3 mt-4">
          {data.productRanking.map((p, i) => (
            <div key={p.sku} className="flex items-center gap-4">
              <div className="text-slate-500 font-bold w-6">#{i+1}</div>
              {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-300 truncate">{p.sku}</div>
                <div className="text-xs text-slate-500 truncate">{p.name}</div>
              </div>
              <div className="w-48 h-6 bg-slate-800 rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded transition-all"
                  style={{ width: `${(p.qty / maxProductQty) * 100}%` }}></div>
              </div>
              <div className="text-right w-32">
                <div className="text-sm text-slate-200 font-medium">{p.qty} 件</div>
                <div className="text-xs text-emerald-400">{fmtMoney(p.sales, s.currency)}</div>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 店铺对比 */}
        <ChartCard title="🏪 店铺对比">
          <div className="space-y-3 mt-4">
            {data.shopComparison.map(shop => (
              <div key={shop.shopName} className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                <div className="text-sm font-medium text-slate-200 mb-2">{shop.shopName}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-500">订单:</span> <span className="text-blue-400">{shop.orders}</span></div>
                  <div><span className="text-slate-500">销售额:</span> <span className="text-emerald-400">{fmtMoney(shop.sales, s.currency)}</span></div>
                  <div><span className="text-slate-500">客单价:</span> <span className="text-purple-400">{fmtMoney(shop.avgPrice, s.currency)}</span></div>
                  <div><span className="text-slate-500">取消:</span> <span className="text-rose-400">{shop.cancelled}</span></div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* 支付方式 */}
        <ChartCard title="💳 支付方式">
          <div className="space-y-2 mt-4">
            {data.paymentMethods.slice(0, 8).map(p => {
              const max = data.paymentMethods[0]?.count || 1;
              return (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-32 truncate">{p.name}</span>
                  <div className="flex-1 h-5 bg-slate-800 rounded overflow-hidden">
                    <div className="h-full bg-amber-500/60 rounded" style={{ width: `${(p.count / max) * 100}%` }}></div>
                  </div>
                  <span className="text-xs text-slate-400 w-10 text-right">{p.count}</span>
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* 取消原因 */}
        <ChartCard title="❌ 取消原因 TOP5">
          <div className="space-y-2 mt-4">
            {data.cancelReasons.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs text-rose-400 w-8">{r.count}单</span>
                <span className="text-xs text-slate-400 flex-1">{r.reason}</span>
              </div>
            ))}
            {data.cancelReasons.length === 0 && <div className="text-sm text-slate-500">无取消订单</div>}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color} mb-3`}>{icon}</div>
      <div className="text-xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}{sub && <span className="text-slate-500 ml-1">({sub})</span>}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      {children}
    </div>
  );
}
