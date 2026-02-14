"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Truck, Package, Clock, CheckCircle2, AlertCircle, ArrowRight, Eye, Plus } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import Link from "next/link";
import { type LogisticsTracking, type TrackingStatus } from "@/lib/logistics-store";
import { type PendingInbound } from "@/lib/pending-inbound-store";
import { type DeliveryOrder } from "@/lib/delivery-orders-store";

const STATUS_COLORS: Record<TrackingStatus, { bg: string; text: string }> = {
  Pending: {
    text: "text-slate-300",
    bg: "bg-slate-500/10"
  },
  "In Transit": {
    text: "text-primary-300",
    bg: "bg-primary-500/10"
  },
  Delivered: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10"
  },
  Exception: {
    text: "text-rose-300",
    bg: "bg-rose-500/10"
  }
};

const STATUS_LABELS: Record<TrackingStatus, string> = {
  Pending: "待发货",
  "In Transit": "运输中",
  Delivered: "已送达",
  Exception: "异常"
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("zh-CN");
  } catch {
    return dateString;
  }
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

export default function LogisticsWorkbenchPage() {
  const { data: trackingRaw } = useSWR<any>("/api/logistics-tracking?page=1&pageSize=500", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });
  const { data: pendingInboundRaw } = useSWR<any>("/api/pending-inbound?page=1&pageSize=500", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });
  const { data: deliveryOrdersRaw } = useSWR<any>("/api/delivery-orders?page=1&pageSize=500", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });

  const tracking = (Array.isArray(trackingRaw) ? trackingRaw : (trackingRaw?.data ?? [])) as LogisticsTracking[];
  const pendingInbound = (Array.isArray(pendingInboundRaw) ? pendingInboundRaw : (pendingInboundRaw?.data ?? [])) as PendingInbound[];
  const deliveryOrders = (Array.isArray(deliveryOrdersRaw) ? deliveryOrdersRaw : (deliveryOrdersRaw?.data ?? [])) as DeliveryOrder[];

  // 统计信息
  const stats = useMemo(() => {
    // 物流跟踪统计
    const trackingTotal = tracking.length;
    const trackingPending = tracking.filter((t) => t.currentStatus === "Pending").length;
    const trackingInTransit = tracking.filter((t) => t.currentStatus === "In Transit").length;
    const trackingDelivered = tracking.filter((t) => t.currentStatus === "Delivered").length;
    const trackingException = tracking.filter((t) => t.currentStatus === "Exception").length;

    // 待入库统计
    const inboundTotal = pendingInbound.length;
    const inboundPending = pendingInbound.filter((i) => i.status === "待入库").length;
    const inboundPartial = pendingInbound.filter((i) => i.status === "部分入库").length;
    const inboundCompleted = pendingInbound.filter((i) => i.status === "已入库").length;
    const inboundPendingQty = pendingInbound.reduce((sum, i) => sum + (i.qty - i.receivedQty), 0);

    // 拿货单统计
    const deliveryTotal = deliveryOrders.length;
    const deliveryInTransit = deliveryOrders.filter((o) => o.status === "运输中").length;
    const deliveryReceived = deliveryOrders.filter((o) => o.status === "已入库").length;

    return {
      tracking: {
        total: trackingTotal,
        pending: trackingPending,
        inTransit: trackingInTransit,
        delivered: trackingDelivered,
        exception: trackingException
      },
      inbound: {
        total: inboundTotal,
        pending: inboundPending,
        partial: inboundPartial,
        completed: inboundCompleted,
        pendingQty: inboundPendingQty
      },
      delivery: {
        total: deliveryTotal,
        inTransit: deliveryInTransit,
        received: deliveryReceived
      }
    };
  }, [tracking, pendingInbound, deliveryOrders]);

  // 获取待处理的物流跟踪（待发货、运输中、异常）
  const urgentTracking = useMemo(() => {
    return tracking
      .filter((t) => t.currentStatus === "Pending" || t.currentStatus === "In Transit" || t.currentStatus === "Exception")
      .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime())
      .slice(0, 5);
  }, [tracking]);

  // 获取待入库的订单（待入库、部分入库）
  const urgentInbound = useMemo(() => {
    return pendingInbound
      .filter((i) => i.status === "待入库" || i.status === "部分入库")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [pendingInbound]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="物流工作台"
        description="物流跟踪、入库管理、任务处理"
        actions={
          <>
            <Link href="/logistics/tracking">
              <ActionButton variant="secondary" icon={Truck}>
                物流跟踪
              </ActionButton>
            </Link>
            <Link href="/logistics/inbound">
              <ActionButton variant="secondary" icon={Package}>
                国内入库
              </ActionButton>
            </Link>
          </>
        }
      />

      {/* 统计面板 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard title="物流跟踪总数" value={stats.tracking.total} icon={Truck} />
        <StatCard title="待发货" value={stats.tracking.pending} icon={Clock} />
        <StatCard title="运输中" value={stats.tracking.inTransit} icon={Truck} />
        <StatCard title="已送达" value={stats.tracking.delivered} icon={CheckCircle2} />
        <StatCard title="异常" value={stats.tracking.exception} icon={AlertCircle} />
        <StatCard title="待入库数量" value={stats.inbound.pendingQty} icon={Package} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 待处理物流跟踪 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">待处理物流跟踪</h2>
            <Link href="/logistics/tracking">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {urgentTracking.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无待处理物流</p>
              <p className="text-xs text-slate-600 mt-1">所有物流跟踪正常</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentTracking.map((t) => {
                const colors = STATUS_COLORS[t.currentStatus];
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-primary-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${colors.bg.replace('/10', '')}`}></span>
                          <span className={`text-sm font-medium ${colors.text}`}>
                            {STATUS_LABELS[t.currentStatus]}
                          </span>
                        </div>
                        <div className="text-sm text-slate-300 mb-1">{t.internalOrderNumber}</div>
                        <div className="text-xs text-slate-400">
                          物流单号：{t.trackingNumber} · {t.channelName}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          最后更新：{formatDate(t.lastUpdatedAt)}
                        </div>
                      </div>
                      <Link href="/logistics/tracking">
                        <ActionButton variant="ghost" size="sm" icon={Eye}>
                          查看
                        </ActionButton>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 待入库订单 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100">待入库订单</h2>
            <Link href="/logistics/inbound">
              <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                查看全部
              </ActionButton>
            </Link>
          </div>

          {urgentInbound.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无待入库订单</p>
              <p className="text-xs text-slate-600 mt-1">所有订单已入库</p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentInbound.map((inbound) => {
                const remainingQty = inbound.qty - inbound.receivedQty;
                const statusColors = inbound.status === "待入库"
                  ? { bg: "bg-slate-500/20", text: "text-slate-300" }
                  : { bg: "bg-amber-500/20", text: "text-amber-300" };

                return (
                  <div
                    key={inbound.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-primary-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs ${statusColors.bg} ${statusColors.text}`}>
                            {inbound.status}
                          </span>
                        </div>
                        <div className="text-sm text-slate-300 mb-1">{inbound.inboundNumber}</div>
                        <div className="text-xs text-slate-400">
                          拿货单：{inbound.deliveryNumber} · SKU：{inbound.sku}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          待入库：{remainingQty} / {inbound.qty}
                        </div>
                      </div>
                      <Link href="/logistics/inbound">
                        <ActionButton variant="ghost" size="sm" icon={Eye}>
                          查看
                        </ActionButton>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 快速操作 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">快速操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/logistics/tracking">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary-500/20 p-2">
                  <Truck className="h-5 w-5 text-primary-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">物流跟踪</div>
                  <div className="text-xs text-slate-400">管理物流单号</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/logistics/inbound">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/20 p-2">
                  <Package className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">国内入库</div>
                  <div className="text-xs text-slate-400">管理入库批次</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/logistics/channels">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/20 p-2">
                  <Truck className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">物流渠道</div>
                  <div className="text-xs text-slate-400">配置物流商</div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/inventory">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/20 p-2">
                  <Package className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">库存查询</div>
                  <div className="text-xs text-slate-400">查看库存分布</div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
