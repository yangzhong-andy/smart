"use client";

import Link from "next/link";
import { useMemo } from "react";
import useSWR from "swr";
import { Factory, FileText, Package, Truck, ClipboardList, Boxes, ArrowRight, TrendingUp, Wallet } from "lucide-react";
import { PageHeader, StatCard, ActionButton, EmptyState } from "@/components/ui";
import { useSuppliers, useContracts, useDeliveryOrders, usePendingInbound } from "@/procurement/hooks";
import { computeDeliveryOrderTailAmount } from "@/lib/delivery-orders-store";
import { getCashFlowFromAPI, type CashFlow } from "@/lib/cash-flow-store";

export default function ProcurementDashboardPage() {
  const { suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { contracts, isLoading: contractsLoading } = useContracts({ pageSize: 500 });
  const { deliveryOrders, isLoading: deliveryLoading } = useDeliveryOrders({ pageSize: 500 });
  const { inboundOrders, isLoading: inboundLoading } = usePendingInbound({ pageSize: 500 });

  // 当月时间范围（用于月度统计）
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dateFrom = monthStart.toISOString().slice(0, 10);
  const dateTo = monthEnd.toISOString().slice(0, 10);

  // 本月采购支出流水（支出方向）
  const { data: monthlyCashFlow = [] } = useSWR<CashFlow[]>(
    ["procurement-monthly-cash", dateFrom, dateTo],
    () => getCashFlowFromAPI({ type: "expense", dateFrom, dateTo, pageSize: 500 }),
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const isLoading = suppliersLoading || contractsLoading || deliveryLoading || inboundLoading;

  const stats = useMemo(() => {
    const s = Array.isArray(suppliers) ? suppliers : [];
    const cts = Array.isArray(contracts) ? contracts : [];
    const dos = Array.isArray(deliveryOrders) ? deliveryOrders : [];
    const ins = Array.isArray(inboundOrders) ? inboundOrders : [];
    const flows = Array.isArray(monthlyCashFlow) ? monthlyCashFlow : [];

    const supplierCount = s.length;
    const contractCount = cts.length;
    const activeContracts = cts.filter(
      (c: any) => !["COMPLETED", "CANCELLED", "已结清", "已取消"].includes(String(c.status))
    ).length;
    const deliveryCount = dos.length;
    const inTransit = dos.filter((o: any) =>
      ["PENDING", "SHIPPED", "IN_TRANSIT", "待发货", "已发货", "运输中"].includes(String(o.status))
    ).length;
    const pendingInboundCount = ins.length;
    // 本月拿货金额（按拿货单创建时间 + 变体数量×单价求和）
    let monthlyDeliveryAmount = 0;
    for (const o of dos) {
      if (!o?.createdAt) continue;
      const d = new Date(o.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      if (d < monthStart || d > monthEnd) continue;
      const contract = cts.find((c: any) => c.id === o.contractId);
      if (!contract) continue;
      try {
        monthlyDeliveryAmount += computeDeliveryOrderTailAmount(contract, o);
      } catch {
        // 忽略单条异常，避免影响整体看板
      }
    }
    // 本月采购支出金额（现金流），仅统计采购相关的支出
    const monthlyPaidAmount = flows.reduce((sum, f) => {
      if (!f?.date) return sum;
      const d = new Date(f.date);
      if (Number.isNaN(d.getTime())) return sum;
      if (d < monthStart || d > monthEnd) return sum;
      // 仅统计类别中包含“采购”的支出
      if (!String(f.category || "").includes("采购")) return sum;
      return sum + (Number(f.amount) || 0);
    }, 0);

    return {
      supplierCount,
      contractCount,
      activeContracts,
      deliveryCount,
      inTransit,
      pendingInboundCount,
      monthlyDeliveryAmount,
      monthlyPaidAmount
    };
  }, [suppliers, contracts, deliveryOrders, inboundOrders, monthlyCashFlow, monthStart, monthEnd]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="供应链看板"
        description="采购、供应商、拿货、入库与账期的统一入口"
        actions={
          <div className="flex gap-2">
            <Link href="/procurement/purchase-orders">
              <ActionButton variant="primary" icon={FileText}>新建采购合同</ActionButton>
            </Link>
            <Link href="/procurement/suppliers">
              <ActionButton variant="secondary" icon={Factory}>供应商库</ActionButton>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="供应商" value={stats.supplierCount} icon={Factory} />
        <StatCard title="采购合同" value={stats.contractCount} icon={FileText} />
        <StatCard title="进行中合同" value={stats.activeContracts} icon={TrendingUp} />
        <StatCard title="运输/待发货" value={stats.inTransit} icon={Truck} />
      </div>

      {/* 采购月度统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="本月拿货金额"
          value={stats.monthlyDeliveryAmount}
          icon={Package}
          hint="按拿货单数量×单价汇总"
        />
        <StatCard
          title="本月采购支出"
          value={stats.monthlyPaidAmount}
          icon={Wallet}
          hint="来自收支明细中的采购支出"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-100">快捷入口</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            <QuickLink href="/procurement/suppliers" icon={Factory} title="供应商库" desc="新增/维护供应商档案" />
            <QuickLink href="/procurement/purchase-orders" icon={FileText} title="采购合同" desc="分批拿货、定金/尾款、进度" />
            <QuickLink href="/procurement/delivery-orders" icon={Truck} title="拿货单" desc="运输状态、入库、月账单生成" />
            <QuickLink href="/procurement/pending-inbound" icon={Boxes} title="待入库" desc="待收货与入库处理" />
            <QuickLink href="/procurement/production-progress" icon={ClipboardList} title="生产进度" desc="完工数量与交期跟进" />
            <QuickLink href="/product-center/products" icon={Package} title="产品库" desc="按供应商过滤与关联" />
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          {isLoading ? (
            <div className="h-40 rounded-xl bg-slate-800/50 animate-pulse" />
          ) : stats.supplierCount === 0 && stats.contractCount === 0 ? (
            <EmptyState
              icon={Factory}
              title="供应链尚未初始化"
              description="建议先新增供应商，再创建采购合同并发起拿货。"
            />
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-100">待处理提醒</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiTile title="待入库单" value={stats.pendingInboundCount} hint="去处理入库" href="/procurement/pending-inbound" />
                <KpiTile title="拿货单总数" value={stats.deliveryCount} hint="查看运输与入库" href="/procurement/delivery-orders" />
                <KpiTile title="进行中合同" value={stats.activeContracts} hint="跟进生产/交期" href="/procurement/production-progress" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-800 bg-slate-900/40 p-3 hover:bg-slate-800/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary-500/15 border border-primary-500/20 p-2 text-primary-200">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-slate-100 truncate">{title}</div>
            <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
          </div>
          <div className="mt-0.5 text-xs text-slate-400 line-clamp-2">{desc}</div>
        </div>
      </div>
    </Link>
  );
}

function KpiTile({ title, value, hint, href }: { title: string; value: number; hint: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors"
    >
      <div className="text-xs text-slate-400">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      <div className="mt-2 text-xs text-primary-300">{hint}</div>
    </Link>
  );
}
