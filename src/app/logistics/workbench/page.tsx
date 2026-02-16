"use client";

import Link from "next/link";
import { Truck, Package, Clock, CheckCircle2, AlertCircle, ArrowRight, Eye, Plus } from "lucide-react";
import {
  PageHeader,
  StatCard,
  ActionButton,
  EmptyState
} from "@/components/ui";
import {
  useLogisticsTracking,
  useInboundOrders,
  useOutboundOrders,
  useLogisticsStats,
  formatDate,
  getStatusColor,
  getStatusLabel
} from "@/logistics/hooks";
import type { LogisticsTracking as LogisticsTrackingType, PendingInbound } from "@/logistics/types";

// 状态标签映射
const STATUS_LABELS: Record<string, string> = {
  Pending: "待发货",
  "In Transit": "运输中",
  Delivered: "已送达",
  Exception: "异常"
};

export default function LogisticsWorkbenchPage() {
  // 使用统一 Hooks 获取数据
  const { tracking, isLoading: trackingLoading } = useLogisticsTracking();
  const { inboundOrders, isLoading: inboundLoading } = useInboundOrders();
  const { outboundOrders, isLoading: outboundLoading } = useOutboundOrders();
  const { stats, isLoading: statsLoading } = useLogisticsStats();

  const isLoading = trackingLoading || inboundLoading || outboundLoading || statsLoading;

  // 获取待处理的物流跟踪
  const urgentTracking = tracking
    .filter((t: LogisticsTrackingType) => 
      t.currentStatus === "Pending" || 
      t.currentStatus === "In Transit" || 
      t.currentStatus === "Exception"
    )
    .sort((a: LogisticsTrackingType, b: LogisticsTrackingType) => 
      new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
    )
    .slice(0, 5);

  // 获取待入库的订单
  const urgentInbound = inboundOrders
    .filter((i: PendingInbound) => i.status === "待入库" || i.status === "部分入库")
    .sort((a: PendingInbound, b: PendingInbound) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

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

      {/* 统计面板 - 使用统一统计 */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard title="物流跟踪总数" value={stats.tracking.total} icon={Truck} />
          <StatCard title="待发货" value={stats.tracking.pending} icon={Clock} />
          <StatCard title="运输中" value={stats.tracking.inTransit} icon={Truck} />
          <StatCard title="已送达" value={stats.tracking.delivered} icon={CheckCircle2} />
          <StatCard title="异常" value={stats.tracking.exception} icon={AlertCircle} />
          <StatCard title="待入库数量" value={stats.inbound.pendingQty} icon={Package} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 待处理物流跟踪 */}
        <TrackingList tracking={urgentTracking} isLoading={trackingLoading} />

        {/* 待入库订单 */}
        <InboundList inboundOrders={urgentInbound} isLoading={inboundLoading} />
      </div>

      {/* 快速操作 */}
      <QuickActions />
    </div>
  );
}

// ==================== 子组件：物流跟踪列表 ====================

interface TrackingListProps {
  tracking: LogisticsTrackingType[];
  isLoading: boolean;
}

function TrackingList({ tracking, isLoading }: TrackingListProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="h-6 w-32 bg-slate-800 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">待处理物流跟踪</h2>
        <Link href="/logistics/tracking">
          <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
            查看全部
          </ActionButton>
        </Link>
      </div>

      {tracking.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="暂无待处理物流"
          description="所有物流跟踪正常"
        />
      ) : (
        <div className="space-y-3">
          {tracking.map((t) => {
            const colors = getStatusColor(t.currentStatus);
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
                        {getStatusLabel(t.currentStatus)}
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
  );
}

// ==================== 子组件：入库订单列表 ====================

interface InboundListProps {
  inboundOrders: PendingInbound[];
  isLoading: boolean;
}

function InboundList({ inboundOrders, isLoading }: InboundListProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="h-6 w-32 bg-slate-800 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">待入库订单</h2>
        <Link href="/logistics/inbound">
          <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
            查看全部
          </ActionButton>
        </Link>
      </div>

      {inboundOrders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无待入库订单"
          description="所有订单已入库"
        />
      ) : (
        <div className="space-y-3">
          {inboundOrders.map((inbound) => {
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
  );
}

// ==================== 子组件：快速操作 ====================

function QuickActions() {
  const actions = [
    { href: "/logistics/tracking", icon: Truck, color: "primary", title: "物流跟踪", desc: "管理物流单号" },
    { href: "/logistics/inbound", icon: Package, color: "emerald", title: "国内入库", desc: "管理入库批次" },
    { href: "/logistics/channels", icon: Truck, color: "blue", title: "物流渠道", desc: "配置物流商" },
    { href: "/inventory", icon: Package, color: "purple", title: "库存查询", desc: "查看库存分布" }
  ];

  const colorMap: Record<string, { bg: string; icon: string }> = {
    primary: { bg: "bg-primary-500/20", icon: "text-primary-400" },
    emerald: { bg: "bg-emerald-500/20", icon: "text-emerald-400" },
    blue: { bg: "bg-blue-500/20", icon: "text-blue-400" },
    purple: { bg: "bg-purple-500/20", icon: "text-purple-400" }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-4">快速操作</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {actions.map((action) => {
          const colors = colorMap[action.color];
          return (
            <Link key={action.href} href={action.href}>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-primary-500/50 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg ${colors.bg} p-2`}>
                    <action.icon className={`h-5 w-5 ${colors.icon}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{action.title}</div>
                    <div className="text-xs text-slate-400">{action.desc}</div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
