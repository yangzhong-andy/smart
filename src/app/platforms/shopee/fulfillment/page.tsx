"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Pagination } from "@/components/Pagination";
import { formatOrderDateTime } from "@/lib/order-business-time";

type PackageSnapshot = {
  packageNumber: string | null;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  logisticsStatus: string | null;
};

type FulfillmentOrder = {
  id: string;
  shopId: string;
  orderSn: string;
  status: string | null;
  createTime: string | null;
  updateTime: string | null;
  shipByDate: string | null;
  syncedAt: string;
  itemQuantity: number;
  packages: PackageSnapshot[];
  shopSetting: { shopName: string | null; region: string };
};

type TrackingTimeline = {
  logisticsStatus: string | null;
  timeline: Array<{ updateTime: string | null; description: string | null; logisticsStatus: string | null }>;
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  UNPAID: "未付款",
  READY_TO_SHIP: "待发货",
  PROCESSED: "待揽收",
  SHIPPED: "运输中",
  TO_CONFIRM_RECEIVE: "待确认收货",
  COMPLETED: "已完成",
  IN_CANCEL: "取消中",
  CANCELLED: "已取消",
};

const STAGE_OPTIONS = [
  ["", "全部履约状态"],
  ["pending", "待发货 / 待揽收"],
  ["shipping", "运输中"],
  ["completed", "已完成"],
  ["cancelled", "已取消"],
] as const;

function trackingKey(orderSn: string, packageNumber: string | null) {
  return `${orderSn}:${packageNumber || "default"}`;
}

export default function ShopeeFulfillmentPage() {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [shops, setShops] = useState<Array<{ shopId: string; shopName: string | null; region: string }>>([]);
  const [stageCounts, setStageCounts] = useState({ pending: 0, shipping: 0, completed: 0, cancelled: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [shopId, setShopId] = useState("");
  const [stage, setStage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<Record<string, TrackingTimeline>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (shopId) params.set("shopId", shopId);
      if (stage) params.set("stage", stage);
      if (keyword) params.set("keyword", keyword);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const response = await fetch(`/api/shopee/fulfillment?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Shopee 履约数据加载失败");
      setOrders(data.data || []);
      setShops(data.shops || []);
      setStageCounts(data.stageCounts || { pending: 0, shipping: 0, completed: 0, cancelled: 0 });
      setTotal(data.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shopee 履约数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [endDate, keyword, page, pageSize, shopId, stage, startDate]);

  useEffect(() => { void load(); }, [load]);

  const fetchTracking = async (order: FulfillmentOrder, item: PackageSnapshot) => {
    const key = trackingKey(order.orderSn, item.packageNumber);
    setTrackingLoading(key);
    try {
      const params = new URLSearchParams({ shopId: order.shopId, orderSn: order.orderSn });
      if (item.packageNumber) params.set("packageNumber", item.packageNumber);
      const response = await fetch(`/api/shopee/fulfillment/tracking?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "物流轨迹查询失败");
      setTrackingData((current) => ({ ...current, [key]: data }));
      if (!data.timeline?.length) toast.info("Shopee 暂未返回物流轨迹节点");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "物流轨迹查询失败");
    } finally {
      setTrackingLoading(null);
    }
  };

  return <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Truck className="h-6 w-6 text-orange-400" />Shopee 履约物流</h1>
        <p className="mt-1 text-sm text-slate-400">按订单查看包裹、承运商、运单号和 Shopee 实时物流轨迹。</p>
      </div>
      <button onClick={() => void load()} disabled={loading} className="flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm hover:bg-slate-800 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新
      </button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <button onClick={() => { setStage("pending"); setPage(1); }} className="rounded-md border border-amber-500/20 bg-slate-900 p-4 text-left hover:border-amber-500/50"><div className="flex items-center gap-2 text-xs text-amber-300"><Clock3 className="h-4 w-4" />待发货 / 待揽收</div><div className="mt-1 text-2xl font-semibold">{stageCounts.pending.toLocaleString()}</div></button>
      <button onClick={() => { setStage("shipping"); setPage(1); }} className="rounded-md border border-blue-500/20 bg-slate-900 p-4 text-left hover:border-blue-500/50"><div className="flex items-center gap-2 text-xs text-blue-300"><Truck className="h-4 w-4" />运输中</div><div className="mt-1 text-2xl font-semibold">{stageCounts.shipping.toLocaleString()}</div></button>
      <button onClick={() => { setStage("completed"); setPage(1); }} className="rounded-md border border-emerald-500/20 bg-slate-900 p-4 text-left hover:border-emerald-500/50"><div className="flex items-center gap-2 text-xs text-emerald-300"><PackageCheck className="h-4 w-4" />已完成</div><div className="mt-1 text-2xl font-semibold">{stageCounts.completed.toLocaleString()}</div></button>
      <button onClick={() => { setStage(""); setPage(1); }} className="rounded-md border border-slate-700 bg-slate-900 p-4 text-left hover:border-slate-500"><div className="text-xs text-slate-400">当前筛选</div><div className="mt-1 text-2xl font-semibold">{total.toLocaleString()}</div></button>
    </div>

    <div className="flex flex-wrap items-center gap-3 border-y border-slate-800 py-4">
      <select value={shopId} onChange={(event) => { setShopId(event.target.value); setPage(1); }} className="h-10 min-w-48 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm">
        <option value="">全部 Shopee 店铺</option>{shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName || shop.shopId}</option>)}
      </select>
      <select value={stage} onChange={(event) => { setStage(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm">
        {STAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm" />
      <span className="text-slate-500">至</span>
      <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm" />
      <form onSubmit={(event) => { event.preventDefault(); setKeyword(keywordInput.trim()); setPage(1); }} className="flex min-w-64 flex-1">
        <input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="订单号、运单号或承运商" className="h-10 min-w-0 flex-1 rounded-l-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus:border-orange-400" />
        <button className="flex h-10 w-10 items-center justify-center rounded-r-md bg-slate-700 hover:bg-slate-600" title="搜索"><Search className="h-4 w-4" /></button>
      </form>
    </div>

    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
      {loading ? <div className="flex h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div> : orders.length === 0 ? <div className="flex h-52 flex-col items-center justify-center text-slate-500"><Truck className="mb-3 h-8 w-8" /><span>当前筛选暂无履约订单</span></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-800/80 text-xs text-slate-400"><tr><th className="w-10 px-3 py-3" /><th className="px-3 py-3">订单</th><th className="px-3 py-3">店铺</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">商品数量</th><th className="px-3 py-3">包裹</th><th className="px-3 py-3">最晚发货</th><th className="px-3 py-3">更新时间</th></tr></thead>
        <tbody className="divide-y divide-slate-800">{orders.map((order) => <Fragment key={order.id}>
          <tr className="hover:bg-slate-800/40"><td className="px-3 py-3"><button onClick={() => setExpanded(expanded === order.id ? null : order.id)} className="rounded p-1 text-slate-400 hover:bg-slate-700" title="查看包裹">{expanded === order.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td><td className="px-3 py-3 font-mono text-xs">{order.orderSn}</td><td className="px-3 py-3">{order.shopSetting.shopName || order.shopId}</td><td className="px-3 py-3"><span className="inline-flex rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs">{ORDER_STATUS_LABELS[order.status || ""] || order.status || "未知"}</span></td><td className="px-3 py-3">{order.itemQuantity} 件</td><td className="px-3 py-3">{order.packages.length} 个</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{formatOrderDateTime(order.shipByDate, order.shopSetting.region)}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{formatOrderDateTime(order.updateTime, order.shopSetting.region)}</td></tr>
          {expanded === order.id && <tr><td colSpan={8} className="bg-slate-950/60 px-5 py-4"><div className="space-y-3">{order.packages.map((item, index) => {
            const key = trackingKey(order.orderSn, item.packageNumber);
            const tracking = trackingData[key];
            return <section key={key} className="border-l-2 border-slate-700 pl-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-x-8 gap-y-1 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4"><span>包裹：<b className="text-slate-200">{item.packageNumber || `默认包裹 ${index + 1}`}</b></span><span>承运商：<b className="text-slate-200">{item.shippingCarrier || "--"}</b></span><span>运单号：<b className="font-mono text-slate-200">{item.trackingNumber || "--"}</b></span><span>物流状态：<b className="text-slate-200">{tracking?.logisticsStatus || item.logisticsStatus || "--"}</b></span></div>
                <button onClick={() => void fetchTracking(order, item)} disabled={trackingLoading === key} className="flex h-9 items-center gap-2 rounded-md border border-blue-500/40 px-3 text-xs text-blue-300 hover:bg-blue-500/10 disabled:opacity-50">{trackingLoading === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}{tracking ? "刷新轨迹" : "查询轨迹"}</button>
              </div>
              {tracking && <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">{tracking.timeline.length === 0 ? <p className="text-xs text-slate-500">Shopee 暂未返回物流节点</p> : tracking.timeline.map((event, eventIndex) => <div key={`${key}-${eventIndex}`} className="flex gap-3 text-xs"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" /><time className="w-36 shrink-0 text-slate-500">{formatOrderDateTime(event.updateTime, order.shopSetting.region)}</time><div><div className="text-slate-200">{event.description || event.logisticsStatus || "物流状态已更新"}</div>{event.description && event.logisticsStatus ? <div className="mt-0.5 text-slate-500">{event.logisticsStatus}</div> : null}</div></div>)}</div>}
            </section>;
          })}</div></td></tr>}
        </Fragment>)}</tbody>
      </table></div>}
      <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} showAllOption={false} />
    </div>
  </div>;
}
