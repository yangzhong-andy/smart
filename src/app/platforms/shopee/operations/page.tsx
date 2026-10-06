"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FilePenLine,
  Loader2,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";

type OrderItem = {
  key: string;
  itemId: string;
  modelId: string;
  orderItemId: string | null;
  promotionGroupId: string | null;
  name: string | null;
  modelName: string | null;
  sku: string | null;
  quantity: number;
};

type PackageSnapshot = {
  packageNumber: string | null;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  logisticsStatus: string | null;
};

type OperationLog = {
  id: string;
  action: string;
  status: string;
  actorName: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type OperationOrder = {
  id: string;
  orderSn: string;
  status: string | null;
  shopId: string;
  shopName: string | null;
  shopStatus: string;
  shippingCarrier: string | null;
  trackingNumber: string | null;
  packages: PackageSnapshot[];
  items: OrderItem[];
};

type OperationData = {
  order: OperationOrder;
  shippingParameter: Record<string, any> | null;
  parameterError: string | null;
  logs: OperationLog[];
};

type PickupSlot = {
  pickupTimeId: string;
  label: string;
};

type PickupAddress = {
  addressId: string;
  label: string;
  slots: PickupSlot[];
};

type PendingOperation = {
  action: string;
  payload?: Record<string, unknown>;
  title: string;
  message: string;
  confirmText: string;
  type: "danger" | "warning" | "info";
};

const STATUS_LABELS: Record<string, string> = {
  UNPAID: "未付款",
  READY_TO_SHIP: "待发货",
  PROCESSED: "待揽收",
  SHIPPED: "运输中",
  TO_CONFIRM_RECEIVE: "待确认收货",
  COMPLETED: "已完成",
  IN_CANCEL: "取消中",
  CANCELLED: "已取消",
};

const ACTION_LABELS: Record<string, string> = {
  set_note: "修改订单备注",
  accept_cancellation: "接受买家取消",
  reject_cancellation: "拒绝买家取消",
  ship_pickup: "预约揽收发货",
  split: "拆分包裹",
  merge: "恢复整单",
};

function dateTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false, timeZone: "America/Sao_Paulo" })
    : "--";
}

function pickupAddresses(parameter: Record<string, any> | null): PickupAddress[] {
  const source = parameter?.pickup?.address_list;
  if (!Array.isArray(source)) return [];
  return source.flatMap((address: Record<string, any>) => {
    const addressId = String(address.address_id ?? "");
    if (!addressId) return [];
    const parts = [
      address.address,
      address.district,
      address.city,
      address.state,
      address.zipcode,
    ].filter(Boolean);
    const rawSlots = Array.isArray(address.time_slot_list) ? address.time_slot_list : [];
    const slots = rawSlots.flatMap((slot: Record<string, any>) => {
      const pickupTimeId = String(slot.pickup_time_id ?? "");
      if (!pickupTimeId) return [];
      const label = [slot.date, slot.time_text || slot.time_slot].filter(Boolean).join(" ") || pickupTimeId;
      return [{ pickupTimeId, label }];
    });
    return [{ addressId, label: parts.join(" · ") || `地址 ${addressId}`, slots }];
  });
}

function packageLabel(item: PackageSnapshot, index: number) {
  return item.packageNumber || `默认包裹 ${index + 1}`;
}

export default function ShopeeOperationsPage() {
  const [orderSnInput, setOrderSnInput] = useState("");
  const [data, setData] = useState<OperationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [operating, setOperating] = useState(false);
  const [note, setNote] = useState("");
  const [addressId, setAddressId] = useState("");
  const [pickupTimeId, setPickupTimeId] = useState("");
  const [packageNumber, setPackageNumber] = useState("");
  const [splitAssignments, setSplitAssignments] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<PendingOperation | null>(null);

  const addresses = useMemo(() => pickupAddresses(data?.shippingParameter || null), [data?.shippingParameter]);
  const selectedAddress = addresses.find((item) => item.addressId === addressId) || null;
  const order = data?.order || null;

  const loadOrder = async (orderSn = orderSnInput.trim()) => {
    if (!orderSn) {
      toast.error("请输入 Shopee 订单号");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ orderSn });
      if (data?.order.shopId && data.order.orderSn === orderSn) params.set("shopId", data.order.shopId);
      const response = await fetch(`/api/shopee/operations?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Shopee 订单加载失败");
      setData(body);
      setOrderSnInput(body.order.orderSn);
      setAddressId("");
      setPickupTimeId("");
      setPackageNumber(body.order.packages?.[0]?.packageNumber || "");
      setSplitAssignments(Object.fromEntries((body.order.items || []).map((item: OrderItem, index: number) => [item.key, index === 0 ? 1 : 2])));
    } catch (error) {
      setData(null);
      toast.error(error instanceof Error ? error.message : "Shopee 订单加载失败");
    } finally {
      setLoading(false);
    }
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    void loadOrder();
  };

  const runOperation = async () => {
    if (!pending || !order) return;
    setOperating(true);
    try {
      const response = await fetch("/api/shopee/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderSn: order.orderSn,
          shopId: order.shopId,
          action: pending.action,
          confirmation: "CONFIRM_SHOPEE_OPERATION",
          ...pending.payload,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Shopee 操作失败");
      toast.success(`${ACTION_LABELS[pending.action] || "操作"}成功`);
      setPending(null);
      if (pending.action === "set_note") setNote("");
      await loadOrder(order.orderSn);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shopee 操作失败");
      setPending(null);
      await loadOrder(order.orderSn);
    } finally {
      setOperating(false);
    }
  };

  const ask = (operation: PendingOperation) => {
    if (operating) return;
    setPending(operation);
  };

  const canShip = order && ["READY_TO_SHIP", "PROCESSED"].includes(order.status || "");
  const canSplit = order?.status === "READY_TO_SHIP" && order.items.length >= 2;
  const alreadySplit = (order?.packages.length || 0) > 1;

  return (
    <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <PackageCheck className="h-6 w-6 text-orange-400" />Shopee 包裹与订单操作
          </h1>
          <p className="mt-1 text-sm text-slate-400">查询单笔订单后执行官方操作；每次写操作均二次确认并保留审计流水。</p>
        </div>
        {order && (
          <button onClick={() => void loadOrder(order.orderSn)} disabled={loading || operating} className="flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新订单
          </button>
        )}
      </div>

      <form onSubmit={search} className="flex max-w-3xl">
        <input value={orderSnInput} onChange={(event) => setOrderSnInput(event.target.value)} placeholder="输入完整 Shopee 订单号" className="h-11 min-w-0 flex-1 rounded-l-md border border-slate-700 bg-slate-900 px-4 text-sm outline-none focus:border-orange-400" />
        <button disabled={loading} className="flex h-11 items-center gap-2 rounded-r-md bg-orange-600 px-5 text-sm font-medium hover:bg-orange-500 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}查询
        </button>
      </form>

      {!order && !loading && (
        <div className="flex h-56 flex-col items-center justify-center border-y border-slate-800 text-slate-500">
          <PackageOpen className="mb-3 h-9 w-9" />
          <span>输入订单号后查看可用操作</span>
        </div>
      )}

      {order && data && (
        <>
          <section className="border-y border-slate-800 py-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="text-xs text-slate-500">订单号</div><div className="mt-1 font-mono text-sm">{order.orderSn}</div></div>
              <div><div className="text-xs text-slate-500">店铺</div><div className="mt-1 flex items-center gap-2 text-sm"><Store className="h-4 w-4 text-orange-400" />{order.shopName || order.shopId}</div></div>
              <div><div className="text-xs text-slate-500">订单状态</div><div className="mt-1"><span className="inline-flex rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs">{STATUS_LABELS[order.status || ""] || order.status || "未知"}</span></div></div>
              <div><div className="text-xs text-slate-500">承运商 / 运单号</div><div className="mt-1 text-sm">{order.shippingCarrier || "--"}<div className="font-mono text-xs text-slate-500">{order.trackingNumber || "--"}</div></div></div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
            <div className="space-y-5">
              <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium">订单商品</div>
                <div className="divide-y divide-slate-800">
                  {order.items.map((item) => (
                    <div key={item.key} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_120px_90px] sm:items-center">
                      <div className="min-w-0"><div className="truncate text-slate-200">{item.name || "未命名商品"}</div><div className="mt-1 truncate text-xs text-slate-500">{item.modelName || "默认规格"} · SKU {item.sku || "--"}</div></div>
                      <div className="text-xs text-slate-400">数量 <b className="text-slate-200">{item.quantity}</b></div>
                      {canSplit ? (
                        <select value={splitAssignments[item.key] || 1} onChange={(event) => setSplitAssignments((current) => ({ ...current, [item.key]: Number(event.target.value) }))} className="h-9 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs">
                          {Array.from({ length: Math.min(10, order.items.length) }, (_, index) => <option key={index + 1} value={index + 1}>包裹 {index + 1}</option>)}
                        </select>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium">当前包裹</div>
                {order.packages.length === 0 ? <div className="px-4 py-5 text-sm text-slate-500">接口暂未返回包裹</div> : <div className="divide-y divide-slate-800">{order.packages.map((item, index) => (
                  <div key={`${item.packageNumber || "default"}-${index}`} className="grid gap-2 px-4 py-3 text-xs text-slate-400 sm:grid-cols-4">
                    <div>包裹<div className="mt-1 font-medium text-slate-200">{packageLabel(item, index)}</div></div>
                    <div>承运商<div className="mt-1 text-slate-200">{item.shippingCarrier || "--"}</div></div>
                    <div>运单号<div className="mt-1 font-mono text-slate-200">{item.trackingNumber || "--"}</div></div>
                    <div>物流状态<div className="mt-1 text-slate-200">{item.logisticsStatus || "--"}</div></div>
                  </div>
                ))}</div>}
              </section>

              <section className="rounded-md border border-slate-800 bg-slate-900 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Truck className="h-4 w-4 text-blue-400" />预约揽收发货</div>
                {!canShip ? <p className="text-sm text-slate-500">当前状态不可预约揽收。</p> : data.parameterError ? <div className="flex gap-2 text-sm text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{data.parameterError}</div> : addresses.length === 0 ? <p className="text-sm text-slate-500">Shopee 未返回可用揽收地址。</p> : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-400">揽收地址<select value={addressId} onChange={(event) => { setAddressId(event.target.value); setPickupTimeId(""); }} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"><option value="">请选择地址</option>{addresses.map((item) => <option key={item.addressId} value={item.addressId}>{item.label}</option>)}</select></label>
                    <label className="text-xs text-slate-400">揽收时间<select value={pickupTimeId} onChange={(event) => setPickupTimeId(event.target.value)} disabled={!selectedAddress} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 disabled:opacity-50"><option value="">请选择时间</option>{selectedAddress?.slots.map((slot) => <option key={slot.pickupTimeId} value={slot.pickupTimeId}>{slot.label}</option>)}</select></label>
                    {order.packages.length > 1 && <label className="text-xs text-slate-400">操作包裹<select value={packageNumber} onChange={(event) => setPackageNumber(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">{order.packages.map((item, index) => <option key={`${item.packageNumber}-${index}`} value={item.packageNumber || ""}>{packageLabel(item, index)}</option>)}</select></label>}
                    <div className="flex items-end"><button disabled={!addressId || !pickupTimeId} onClick={() => ask({ action: "ship_pickup", payload: { packageNumber: packageNumber || undefined, pickup: { address_id: Number(addressId), pickup_time_id: pickupTimeId } }, title: "确认预约揽收发货", message: `订单 ${order.orderSn}\n提交后 Shopee 将按所选地址和时间安排揽收。`, confirmText: "确认发货", type: "warning" })} className="flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"><Truck className="h-4 w-4" />确认发货</button></div>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-md border border-slate-800 bg-slate-900 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium"><FilePenLine className="h-4 w-4 text-orange-400" />订单备注</div>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={4} placeholder="填写 Shopee 卖家备注" className="w-full resize-y rounded-md border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-orange-400" />
                <div className="mt-2 flex items-center justify-between"><span className="text-xs text-slate-500">{note.length}/500</span><button disabled={!note.trim()} onClick={() => ask({ action: "set_note", payload: { note: note.trim() }, title: "确认修改订单备注", message: `订单 ${order.orderSn}\n新备注将直接写入 Shopee。`, confirmText: "保存备注", type: "info" })} className="rounded-md border border-orange-500/40 px-3 py-2 text-xs text-orange-300 hover:bg-orange-500/10 disabled:opacity-50">保存备注</button></div>
              </section>

              {order.status === "IN_CANCEL" && <section className="rounded-md border border-rose-500/30 bg-slate-900 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-medium text-rose-300"><ShieldAlert className="h-4 w-4" />买家取消申请</div><div className="flex gap-2"><button onClick={() => ask({ action: "accept_cancellation", title: "确认接受买家取消", message: `订单 ${order.orderSn}\n接受后订单将进入取消流程。`, confirmText: "接受取消", type: "danger" })} className="flex h-10 items-center gap-2 rounded-md bg-rose-600 px-3 text-sm hover:bg-rose-500"><CheckCircle2 className="h-4 w-4" />接受取消</button><button onClick={() => ask({ action: "reject_cancellation", title: "确认拒绝买家取消", message: `订单 ${order.orderSn}\n拒绝后订单将继续履约。`, confirmText: "拒绝取消", type: "warning" })} className="flex h-10 items-center gap-2 rounded-md border border-slate-600 px-3 text-sm hover:bg-slate-800"><XCircle className="h-4 w-4" />拒绝取消</button></div></section>}

              {(canSplit || alreadySplit) && <section className="rounded-md border border-slate-800 bg-slate-900 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><PackageOpen className="h-4 w-4 text-violet-400" />包裹拆分</div>{canSplit && <button onClick={() => ask({ action: "split", payload: { splitAssignments }, title: "确认拆分包裹", message: `订单 ${order.orderSn}\n系统将按商品右侧选择的包裹提交到 Shopee。`, confirmText: "确认拆包", type: "warning" })} className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-violet-600 text-sm hover:bg-violet-500"><PackageOpen className="h-4 w-4" />按当前分组拆包</button>}{alreadySplit && order.status === "READY_TO_SHIP" && <button onClick={() => ask({ action: "merge", title: "确认恢复整单", message: `订单 ${order.orderSn}\nShopee 中已拆分的包裹将恢复为整单。`, confirmText: "恢复整单", type: "warning" })} className={`${canSplit ? "mt-2" : ""} flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-600 text-sm hover:bg-slate-800`}><Undo2 className="h-4 w-4" />恢复整单</button>}</section>}

              <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium">操作流水</div>
                {data.logs.length === 0 ? <div className="px-4 py-5 text-sm text-slate-500">暂无操作记录</div> : <div className="divide-y divide-slate-800">{data.logs.map((log) => <div key={log.id} className="px-4 py-3"><div className="flex items-center justify-between gap-3 text-sm"><span>{ACTION_LABELS[log.action] || log.action}</span><span className={`inline-flex items-center gap-1 text-xs ${log.status === "success" ? "text-emerald-300" : log.status === "failed" ? "text-rose-300" : "text-amber-300"}`}>{log.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : log.status === "failed" ? <XCircle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{log.status === "success" ? "成功" : log.status === "failed" ? "失败" : "处理中"}</span></div><div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{log.actorName || "系统用户"}</span><time>{dateTime(log.createdAt)}</time></div>{log.error && <div className="mt-2 text-xs text-rose-300">{log.error}</div>}</div>)}</div>}
              </section>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title}
        message={pending?.message || ""}
        confirmText={pending?.confirmText}
        type={pending?.type}
        onConfirm={runOperation}
        onCancel={() => { if (!operating) setPending(null); }}
      />
    </div>
  );
}
