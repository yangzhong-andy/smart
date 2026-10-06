"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Package, RefreshCw, Search, ShoppingBag, Store } from "lucide-react";
import { toast } from "sonner";
import { Pagination } from "@/components/Pagination";
import { formatOrderDateTime } from "@/lib/order-business-time";

type Item = {
  id: string;
  itemSku: string | null;
  modelSku: string | null;
  itemName: string | null;
  modelName: string | null;
  quantity: number;
  originalPrice: string | null;
  discountedPrice: string | null;
  imageUrl: string | null;
};

type Settlement = {
  currency: string | null;
  buyerTotalAmount: string | null;
  orderSellingPrice: string | null;
  originalPrice: string | null;
  sellerDiscount: string | null;
  shopeeDiscount: string | null;
  commissionFee: string | null;
  netCommissionFee: string | null;
  serviceFee: string | null;
  netServiceFee: string | null;
  sellerTransactionFee: string | null;
  amsCommissionFee: string | null;
  adsEscrowFee: string | null;
  campaignFee: string | null;
  actualShippingFee: string | null;
  finalShippingFee: string | null;
  estimatedShippingFee: string | null;
  shopeeShippingRebate: string | null;
  reverseShippingFee: string | null;
  sellerReturnRefund: string | null;
  adjustableRefund: string | null;
  withholdingTax: string | null;
  escrowAmount: string | null;
  escrowAmountAfterAdjust: string | null;
  syncedAt: string;
};

type OrderIncomeState = {
  loading: boolean;
  available: boolean;
  data: Settlement | null;
  source: "official" | "cache" | null;
  reason: string | null;
  warning?: string | null;
  error?: string | null;
};

type Order = {
  id: string;
  orderSn: string;
  shopId: string;
  status: string | null;
  currency: string | null;
  totalAmount: string | null;
  buyerUsername: string | null;
  paymentMethod: string | null;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  createTime: string | null;
  updateTime: string | null;
  items: Item[];
  settlement: Settlement | null;
  shopSetting: { shopName: string | null; region: string };
};

type ShopOption = {
  shopId: string;
  shopName: string | null;
  region: string;
  lastSyncAt: string | null;
  orderSyncCheckpoint: { status: string; lastError: string | null; lastSuccessfulSyncAt: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  UNPAID: "未付款",
  READY_TO_SHIP: "待发货",
  PROCESSED: "待揽收",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  IN_CANCEL: "取消中",
  CANCELLED: "已取消",
  TO_CONFIRM_RECEIVE: "待确认收货",
};

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  CANCELLED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  IN_CANCEL: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  READY_TO_SHIP: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  PROCESSED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  SHIPPED: "border-blue-500/30 bg-blue-500/10 text-blue-300",
};

function money(value: string | null, currency: string | null) {
  if (value === null || value === undefined || value === "") return "--";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(amount);
}

function feeMoney(value: string | null, currency: string | null) {
  if (value === null || value === undefined || value === "") return "--";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  if (amount === 0) return money("0", currency);
  return `${amount > 0 ? "−" : "+"}${money(String(Math.abs(amount)), currency)}`;
}

function AmountRow({ label, value, currency, fee = false, note }: { label: string; value: string | null; currency: string | null; fee?: boolean; note?: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-slate-800/70 py-2 last:border-0">
    <div className="min-w-0 text-xs text-slate-400"><span>{label}</span>{note ? <span className="ml-1 text-[10px] text-slate-600">{note}</span> : null}</div>
    <div className={`shrink-0 text-sm font-medium tabular-nums ${fee && value !== null ? "text-rose-300" : "text-slate-200"}`}>{fee ? feeMoney(value, currency) : money(value, currency)}</div>
  </div>;
}

function OrderIncomePanel({ order, state, onRefresh }: { order: Order; state: OrderIncomeState; onRefresh: () => void }) {
  const settlement = state.data;
  const currency = settlement?.currency || order.currency;
  const commission = settlement?.netCommissionFee ?? settlement?.commissionFee ?? null;
  const service = settlement?.netServiceFee ?? settlement?.serviceFee ?? null;

  return <div className="mb-4 rounded-lg border border-emerald-500/20 bg-slate-900/80">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
      <div>
        <div className="font-medium text-slate-100">订单收入明细</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {settlement ? `更新于 ${formatOrderDateTime(settlement.syncedAt, order.shopSetting.region)}` : "来自 Shopee 官方订单收入接口"}
          {state.source === "official" ? <span className="ml-2 text-emerald-400">已实时刷新</span> : state.source === "cache" ? <span className="ml-2 text-amber-400">同步缓存</span> : null}
        </div>
      </div>
      <button type="button" onClick={onRefresh} disabled={state.loading} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-700 px-3 text-xs text-slate-300 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${state.loading ? "animate-spin" : ""}`} />{state.loading ? "读取中" : "刷新收入明细"}
      </button>
    </div>
    {state.error && !settlement ? <div className="px-4 py-5 text-sm text-rose-300">{state.error}</div>
      : !settlement ? <div className="flex min-h-24 items-center justify-center px-4 py-5 text-sm text-slate-500">{state.loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在读取 Shopee 官方收入明细…</> : state.reason || "等待 Shopee 生成收入明细"}</div>
      : <>
        {state.warning ? <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">{state.warning}</div> : null}
        <div className="grid gap-px bg-slate-800 lg:grid-cols-4">
          <div className="bg-slate-900 p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-300">商品金额</div>
            <AmountRow label="商品售价" value={settlement.orderSellingPrice} currency={currency} />
            <AmountRow label="商品原价" value={settlement.originalPrice} currency={currency} />
            <AmountRow label="卖家 / PIX 优惠" value={settlement.sellerDiscount} currency={currency} fee />
            <AmountRow label="Shopee 优惠" value={settlement.shopeeDiscount} currency={currency} />
            <AmountRow label="买家支付总额" value={settlement.buyerTotalAmount} currency={currency} />
          </div>
          <div className="bg-slate-900 p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-300">物流明细</div>
            <AmountRow label="预估运费" value={settlement.estimatedShippingFee} currency={currency} />
            <AmountRow label="实际运费" value={settlement.actualShippingFee} currency={currency} />
            <AmountRow label="最终运费" value={settlement.finalShippingFee} currency={currency} />
            <AmountRow label="平台运费补贴" value={settlement.shopeeShippingRebate} currency={currency} />
            <AmountRow label="逆向物流费" value={settlement.reverseShippingFee} currency={currency} fee />
          </div>
          <div className="bg-slate-900 p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-300">平台费用</div>
            <AmountRow label="平台佣金" value={commission} currency={currency} fee note={settlement.netCommissionFee !== null ? "净额" : undefined} />
            <AmountRow label="服务费" value={service} currency={currency} fee note={settlement.netServiceFee !== null ? "净额" : undefined} />
            <AmountRow label="联盟达人佣金" value={settlement.amsCommissionFee} currency={currency} fee />
            <AmountRow label="广告充值费" value={settlement.adsEscrowFee} currency={currency} fee />
            <AmountRow label="活动费" value={settlement.campaignFee} currency={currency} fee />
            <AmountRow label="交易手续费" value={settlement.sellerTransactionFee} currency={currency} fee />
            <AmountRow label="预扣税" value={settlement.withholdingTax} currency={currency} fee />
          </div>
          <div className="bg-slate-900 p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">订单收入</div>
            <AmountRow label="退货退款" value={settlement.sellerReturnRefund} currency={currency} fee />
            <AmountRow label="调整退款" value={settlement.adjustableRefund} currency={currency} fee />
            <AmountRow label="收入金额" value={settlement.escrowAmount} currency={currency} />
            <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="text-xs text-emerald-300">预计订单收入（调整后）</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-300">{money(settlement.escrowAmountAfterAdjust, currency)}</div>
            </div>
          </div>
        </div>
      </>}
  </div>;
}

export default function ShopeeOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [shopId, setShopId] = useState("");
  const [status, setStatus] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [syncDays, setSyncDays] = useState(365);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [incomeByOrder, setIncomeByOrder] = useState<Record<string, OrderIncomeState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (shopId) params.set("shopId", shopId);
      if (status) params.set("status", status);
      if (keyword) params.set("keyword", keyword);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const response = await fetch(`/api/shopee/orders?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Shopee 订单加载失败");
      setOrders(data.data || []);
      setTotal(data.total || 0);
      setStatusCounts(data.statusCounts || {});
      setShops(data.shops || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shopee 订单加载失败");
    } finally {
      setLoading(false);
    }
  }, [endDate, keyword, page, pageSize, shopId, startDate, status]);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/shopee/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: syncDays, shopId: shopId || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Shopee 订单同步失败");
      const saved = (data.results || []).reduce((sum: number, result: { saved?: number }) => sum + (result.saved || 0), 0);
      if (data.errors?.length) {
        toast.error(data.errors.map((item: { shopId: string; error: string }) => `${item.shopId}: ${item.error}`).join("；"));
      } else {
        toast.success(`同步完成，写入或更新 ${saved} 条订单`);
      }
      setPage(1);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shopee 订单同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const loadOrderIncome = async (order: Order) => {
    setIncomeByOrder((current) => ({
      ...current,
      [order.id]: {
        loading: true,
        available: current[order.id]?.available ?? Boolean(order.settlement),
        data: current[order.id]?.data ?? order.settlement,
        source: current[order.id]?.source ?? (order.settlement ? "cache" : null),
        reason: null,
        warning: null,
        error: null,
      },
    }));
    try {
      const response = await fetch(`/api/shopee/orders/${encodeURIComponent(order.orderSn)}/income?shopId=${encodeURIComponent(order.shopId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Shopee 订单收入明细获取失败");
      setIncomeByOrder((current) => ({
        ...current,
        [order.id]: {
          loading: false,
          available: Boolean(result.available),
          data: result.settlement || null,
          source: result.source || null,
          reason: result.reason || null,
          warning: result.warning || null,
          error: null,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shopee 订单收入明细获取失败";
      setIncomeByOrder((current) => ({
        ...current,
        [order.id]: {
          loading: false,
          available: Boolean(current[order.id]?.data || order.settlement),
          data: current[order.id]?.data ?? order.settlement,
          source: current[order.id]?.source ?? (order.settlement ? "cache" : null),
          reason: null,
          warning: current[order.id]?.data || order.settlement ? message : null,
          error: current[order.id]?.data || order.settlement ? null : message,
        },
      }));
    }
  };

  const toggleExpanded = (order: Order) => {
    if (expanded === order.id) {
      setExpanded(null);
      return;
    }
    setExpanded(order.id);
    void loadOrderIncome(order);
  };

  const selectedShop = shops.find((shop) => shop.shopId === shopId);
  const itemQuantity = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity, 0);

  return <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShoppingBag className="h-6 w-6 text-orange-400" />Shopee 订单管理</h1>
        <p className="mt-1 text-sm text-slate-400">Shopee 独立订单底表，当前不参与利润、库存和仓库扣费。</p>
      </div>
      <div className="flex items-center gap-2">
        <select value={syncDays} onChange={(event) => setSyncDays(Number(event.target.value))} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200">
          <option value={365}>完整历史（最近 365 天）</option><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option><option value={180}>最近 180 天</option>
        </select>
        <button onClick={() => void sync()} disabled={syncing || shops.length === 0} className="flex h-10 items-center gap-2 rounded-md bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{syncing ? "同步中" : "同步订单"}
        </button>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="text-xs text-slate-400">筛选订单</div><div className="mt-1 text-2xl font-semibold">{total.toLocaleString()}</div></div>
      <div className="rounded-md border border-amber-500/20 bg-slate-900 p-4"><div className="text-xs text-amber-300">待发货</div><div className="mt-1 text-2xl font-semibold">{(statusCounts.READY_TO_SHIP || 0).toLocaleString()}</div></div>
      <div className="rounded-md border border-blue-500/20 bg-slate-900 p-4"><div className="text-xs text-blue-300">已发货</div><div className="mt-1 text-2xl font-semibold">{(statusCounts.SHIPPED || 0).toLocaleString()}</div></div>
      <div className="rounded-md border border-emerald-500/20 bg-slate-900 p-4"><div className="text-xs text-emerald-300">已完成</div><div className="mt-1 text-2xl font-semibold">{(statusCounts.COMPLETED || 0).toLocaleString()}</div></div>
    </div>

    <div className="flex flex-wrap items-center gap-3 border-y border-slate-800 py-4">
      <select value={shopId} onChange={(event) => { setShopId(event.target.value); setPage(1); }} className="h-10 min-w-48 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm">
        <option value="">全部 Shopee 店铺</option>{shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName || shop.shopId}</option>)}
      </select>
      <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm">
        <option value="">全部状态</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm" />
      <span className="text-slate-500">至</span>
      <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm" />
      <form onSubmit={(event) => { event.preventDefault(); setKeyword(keywordInput.trim()); setPage(1); }} className="flex min-w-64 flex-1">
        <input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="订单号、买家或物流单号" className="h-10 min-w-0 flex-1 rounded-l-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus:border-orange-400" />
        <button className="flex h-10 w-10 items-center justify-center rounded-r-md bg-slate-700 hover:bg-slate-600" title="搜索"><Search className="h-4 w-4" /></button>
      </form>
      {(selectedShop || shops.length === 1) && <div className="w-full text-xs text-slate-500">最近同步：{formatOrderDateTime((selectedShop || shops[0])?.lastSyncAt || null, (selectedShop || shops[0])?.region)}{(selectedShop || shops[0])?.orderSyncCheckpoint?.lastError ? <span className="ml-3 text-rose-300">{(selectedShop || shops[0]).orderSyncCheckpoint?.lastError}</span> : null}</div>}
    </div>

    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
      {loading ? <div className="flex h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-400" /></div> : orders.length === 0 ? <div className="flex h-52 flex-col items-center justify-center text-slate-500"><Package className="mb-3 h-8 w-8" /><span>暂无 Shopee 订单</span></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-800/80 text-xs text-slate-400"><tr><th className="w-10 px-3 py-3" /><th className="px-3 py-3">订单</th><th className="px-3 py-3">店铺</th><th className="px-3 py-3">商品</th><th className="px-3 py-3">金额</th><th className="px-3 py-3">状态</th><th className="px-3 py-3">物流</th><th className="px-3 py-3">下单时间</th></tr></thead>
        <tbody className="divide-y divide-slate-800">{orders.map((order) => <Fragment key={order.id}>
          <tr className="hover:bg-slate-800/40"><td className="px-3 py-3"><button onClick={() => toggleExpanded(order)} className="rounded p-1 text-slate-400 hover:bg-slate-700" title="查看订单明细">{expanded === order.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td><td className="px-3 py-3 font-mono text-xs text-slate-200">{order.orderSn}<div className="mt-1 font-sans text-slate-500">{order.buyerUsername || "买家信息未授权"}</div></td><td className="px-3 py-3"><span className="flex items-center gap-1.5"><Store className="h-4 w-4 text-orange-400" />{order.shopSetting.shopName || order.shopId}</span></td><td className="px-3 py-3">{order.items.length} 个 SKU / {itemQuantity(order)} 件</td><td className="px-3 py-3 font-medium">{money(order.totalAmount, order.currency)}</td><td className="px-3 py-3"><span className={`inline-flex rounded border px-2 py-1 text-xs ${STATUS_STYLE[order.status || ""] || "border-slate-700 bg-slate-800 text-slate-300"}`}>{STATUS_LABELS[order.status || ""] || order.status || "未知"}</span></td><td className="px-3 py-3 text-xs"><div>{order.shippingCarrier || "--"}</div><div className="mt-1 font-mono text-slate-500">{order.trackingNumber || "--"}</div></td><td className="px-3 py-3 whitespace-nowrap text-xs text-slate-400">{formatOrderDateTime(order.createTime, order.shopSetting.region)}</td></tr>
          {expanded === order.id && <tr><td colSpan={8} className="bg-slate-950/60 px-6 py-4">
            <div className="mb-3 flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-400"><span>付款方式：{order.paymentMethod || "--"}</span><span>更新时间：{formatOrderDateTime(order.updateTime, order.shopSetting.region)}</span></div>
            <OrderIncomePanel
              order={order}
              state={incomeByOrder[order.id] || { loading: false, available: Boolean(order.settlement), data: order.settlement, source: order.settlement ? "cache" : null, reason: order.settlement ? null : "等待 Shopee 生成收入明细" }}
              onRefresh={() => void loadOrderIncome(order)}
            />
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">商品明细</div>
            <div className="grid gap-2 md:grid-cols-2">{order.items.map((item) => <div key={item.id} className="flex min-w-0 gap-3 border-l-2 border-slate-700 bg-slate-900 px-3 py-2">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-slate-800"><Package className="h-5 w-5 text-slate-600" /></div>}<div className="min-w-0"><div className="truncate text-sm text-slate-200">{item.itemName || "未命名商品"}</div><div className="mt-1 truncate text-xs text-slate-500">{item.modelName || "默认规格"} · SKU {item.modelSku || item.itemSku || "--"}</div><div className="mt-1 text-xs text-slate-400">{item.quantity} 件 · {money(item.discountedPrice || item.originalPrice, order.currency)}</div></div></div>)}</div>
          </td></tr>}
        </Fragment>)}</tbody>
      </table></div>}
      <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} showAllOption={false} />
    </div>
  </div>;
}
