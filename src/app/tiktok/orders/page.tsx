"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShoppingBag, Search, ChevronDown, ChevronRight, Package, Truck, MapPin, CreditCard } from "lucide-react";
import { Pagination } from "@/components/Pagination";

type Order = {
  id: string;
  orderId: string;
  status: string;
  totalAmount: string | null;
  currency: string;
  createTime: string | null;
  updateTime: string | null;
  lineItems: any[];
  itemSummary: any[];
  shippingProvider: string | null;
  trackingNumber: string | null;
  rtsTime: string | null;
  deliveryTime: string | null;
  deliveryType: string | null;
  buyerName: string | null;
  buyerAddress: string | null;
  paymentMethod: string | null;
  payment: any;
};

const STATUS_LABELS: Record<string, string> = {
  UNPAID: "未付款",
  ON_HOLD: "暂停",
  IN_TRANSIT: "运输中",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  AWAITING_COLLECTION: "待揽收",
  AWAITING_SHIPMENT: "待发货",
  IN_REVIEW: "审核中",
  PARTIAL_SHIPPING: "部分发货",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  CANCELLED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  DELIVERED: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  AWAITING_COLLECTION: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  AWAITING_SHIPMENT: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  UNPAID: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  IN_TRANSIT: "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

const fmtMoney = (v: string | number | null, currency = "BRL") => {
  if (v === null || v === undefined) return "-";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "-";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

const fmtDate = (d: string | Date | null) => {
  if (!d) return "-";
  // 统一显示巴西时间（UTC-3），与TikTok店铺后台一致
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

export default function TikTokOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [shopFilter, setShopFilter] = useState("");
  const [shops, setShops] = useState<{shopId:string; shopName:string}[]>([]);

  // 加载店铺列表，默认选中第一个店铺
  useEffect(() => {
    fetch("/api/tiktok/data?type=shops").then(r => r.json()).then(d => {
      const list = d.shops || [];
      setShops(list);
      // 多店铺时默认选第一个，避免数据混在一起
      if (list.length > 1 && !shopFilter) {
        setShopFilter(list[0].shopId);
      }
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: "orders", page: String(page), pageSize: String(pageSize) });
      if (statusFilter) params.set("status", statusFilter);
      if (shopFilter) params.set("shopId", shopFilter);
      if (keyword) params.set("keyword", keyword);
      const res = await fetch(`/api/tiktok/data?${params}`);
      const d = await res.json();
      setOrders(d.data || []);
      setTotal(d.total || 0);
    } catch {
      toast.error("加载订单失败");
    }
    setLoading(false);
  }, [page, pageSize, statusFilter, keyword, shopFilter]);


  // 访问页面自动同步最近1天订单
  useEffect(() => {
    fetch("/api/tiktok/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataType: "orders", days: 1 }),
    }).catch(() => {});
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    toast.info("同步订单数据中...");
    try {
      const res = await fetch("/api/tiktok/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataType: "orders", days: 30 }),
      });
      const d = await res.json();
      if (d.success) {
        for (const r of d.results) {
          toast.success(`${r.shopName}: 订单 ${r.orders || 0} 条`);
        }
        fetchData();
      }
    } catch (e: any) { toast.error("同步失败"); }
    setSyncing(false);
  };

  const stats = orders.reduce((acc, o) => {
    acc.total += 1;
    if (o.status === "COMPLETED") acc.completed += 1;
    if (o.status === "CANCELLED") acc.cancelled += 1;
    return acc;
  }, { total: 0, completed: 0, cancelled: 0 });

  return (
    <div className="space-y-4 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-blue-400" />
            TikTok 订单管理
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {shops.length > 1 ? `${shops.length} 个店铺` : shops[0]?.shopName || "巴西店铺"}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "同步中..." : "同步订单"}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">订单总数</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">{total}</div>
        </div>
        <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
          <div className="text-xs text-emerald-400">已完成</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{stats.completed}</div>
        </div>
        <div className="rounded-lg border border-rose-800/50 bg-rose-900/20 p-4">
          <div className="text-xs text-rose-400">已取消</div>
          <div className="text-2xl font-bold text-rose-300 mt-1">{stats.cancelled}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">完成率</div>
          <div className="text-2xl font-bold text-slate-100 mt-1">
            {total > 0 ? ((stats.completed / total) * 100).toFixed(0) : 0}%
          </div>
        </div>
      </div>

      {/* 店铺标签切换（多店铺时显示） */}
      {shops.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {shops.map(s => (
            <button
              key={s.shopId}
              onClick={() => { setShopFilter(s.shopId); setPage(1); }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                shopFilter === s.shopId
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {s.shopName}
            </button>
          ))}
          <button
            onClick={() => { setShopFilter(""); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              shopFilter === ""
                ? "bg-slate-600 text-white"
                : "bg-slate-800/50 text-slate-400 hover:bg-slate-700"
            }`}
          >
            全部
          </button>
        </div>
      )}

      {/* 筛选 */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">全部状态</option>
          <option value="COMPLETED">已完成</option>
          <option value="CANCELLED">已取消</option>
          <option value="DELIVERED">已送达</option>
          <option value="AWAITING_COLLECTION">待揽收</option>
          <option value="AWAITING_SHIPMENT">待发货</option>
        </select>
        <input
          type="text"
          placeholder="搜索订单号..."
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
        />
      </div>

      {/* 订单表格 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            加载中...
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-slate-500">暂无订单数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-800 bg-slate-800/30">
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">订单</th>
                  <th className="px-4 py-3">客户</th>
                  <th className="px-4 py-3">商品</th>
                  <th className="px-4 py-3 text-center">数量</th>
                  <th className="px-4 py-3">订单状态</th>
                  <th className="px-4 py-3">物流方式</th>
                  <th className="px-4 py-3">物流选项</th>
                  <th className="px-4 py-3 text-right">合计</th>
                  <th className="px-4 py-3">下单时间</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <>
                    <tr
                      key={o.orderId}
                      onClick={() => setExpanded(expanded === o.orderId ? null : o.orderId)}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        {expanded === o.orderId
                          ? <ChevronDown className="h-4 w-4 text-slate-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        {o.orderId}
                        {(o as any).isSampleOrder && (
                          <span className="ml-1 inline-block rounded bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">免费样品</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{(o as any).buyerName || "-"}</td>
                      <td className="px-4 py-3 text-slate-300 max-w-xs truncate">
                        {o.itemSummary?.[0]?.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-200 font-medium">
                        {o.lineItems?.length || 0}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[o.status || ""] || "text-slate-400 bg-slate-500/10 border-slate-500/30"}`}>
                          {STATUS_LABELS[o.status || ""] || o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{(o.status === "UNPAID" || o.status === "CANCELLED") ? "-" : ((o as any).deliveryType === "HOME_DELIVERY" ? "平台发货" : (o as any).deliveryType || "-")}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{(o.status === "UNPAID" || o.status === "CANCELLED") ? "-" : ((o as any).deliveryOptionName || "-")}</td>
                      <td className="px-4 py-3 text-right text-slate-100 font-medium">
                        {fmtMoney(o.totalAmount, o.currency)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(o.createTime)}</td>
                    </tr>
                    {expanded === o.orderId && (
                      <tr className="bg-slate-800/20">
                        <td colSpan={10} className="px-8 py-4">
                          <div className="grid grid-cols-2 gap-6">
                            {/* 商品详情 */}
                            <div>
                              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                                <Package className="h-3.5 w-3.5" /> 商品详情
                              </h4>
                              <div className="space-y-2">
                                {(o.itemSummary || []).map((item: any, i: number) => (
                                  <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-900/40 p-2">
                                    {item.image && (
                                      <img src={`/api/tiktok/image-proxy?url=${encodeURIComponent(item.image)}`} alt="" className="h-12 w-12 rounded object-cover" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs text-slate-200 truncate">{item.name}</div>
                                      <div className="text-xs text-slate-500">SKU: {item.sku}</div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-xs text-slate-300">{fmtMoney(item.price, o.currency)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 物流 + 买家信息 */}
                            <div className="space-y-4">
                              <div>
                                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                                  <Truck className="h-3.5 w-3.5" /> 物流信息
                                </h4>
                                <div className="rounded-lg bg-slate-900/40 p-3 space-y-1 text-xs">
                                  <div className="flex justify-between"><span className="text-slate-500">物流商</span><span className="text-slate-300">{o.shippingProvider || "-"}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">物流单号</span><span className="text-slate-300 font-mono">{o.trackingNumber || "-"}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">发货时间</span><span className="text-slate-300">{fmtDate(o.rtsTime)}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">送达时间</span><span className="text-slate-300">{fmtDate(o.deliveryTime)}</span></div>
                                </div>
                              </div>

                              <div>
                                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
                                  <MapPin className="h-3.5 w-3.5" /> 买家信息
                                </h4>
                                <div className="rounded-lg bg-slate-900/40 p-3 space-y-1 text-xs">
                                  <div className="flex justify-between"><span className="text-slate-500">收件人</span><span className="text-slate-300">{o.buyerName || "-"}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">地址</span><span className="text-slate-300 text-right max-w-[200px]">{o.buyerAddress || "-"}</span></div>
                                  <div className="flex justify-between items-center"><span className="text-slate-500">支付方式</span><span className="flex items-center gap-1 text-slate-300"><CreditCard className="h-3 w-3" />{o.paymentMethod || "-"}</span></div>
                                </div>
                              </div>
                            </div>

                            {/* 支付明细 */}
                            {o.payment && (
                              <div className="col-span-2">
                                <h4 className="text-xs font-semibold text-slate-300 mb-2">支付明细</h4>
                                <div className="grid grid-cols-4 gap-2">
                                  <div className="rounded-lg bg-slate-900/40 p-2 text-center">
                                    <div className="text-xs text-slate-500">商品金额</div>
                                    <div className="text-sm text-slate-200">{fmtMoney(o.payment.sub_total, o.currency)}</div>
                                  </div>
                                  <div className="rounded-lg bg-slate-900/40 p-2 text-center">
                                    <div className="text-xs text-slate-500">运费</div>
                                    <div className="text-sm text-slate-200">{fmtMoney(o.payment.shipping_fee, o.currency)}</div>
                                  </div>
                                  <div className="rounded-lg bg-slate-900/40 p-2 text-center">
                                    <div className="text-xs text-slate-500">卖家折扣</div>
                                    <div className="text-sm text-amber-400">-{fmtMoney(o.payment.seller_discount, o.currency)}</div>
                                  </div>
                                  <div className="rounded-lg bg-emerald-900/30 p-2 text-center border border-emerald-800/30">
                                    <div className="text-xs text-emerald-400">实付</div>
                                    <div className="text-sm text-emerald-300 font-medium">{fmtMoney(o.payment.total_amount, o.currency)}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {total > pageSize && (
          <div className="p-4 border-t border-slate-800">
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
