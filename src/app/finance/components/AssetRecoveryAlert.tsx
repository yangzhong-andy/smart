"use client";

import Link from "next/link";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

interface AssetRecoveryItem {
  poId: string;
  poNumber: string;
  supplierName: string;
  pendingQuantity: number;
  pendingValue: number;
}

interface AssetRecoveryAlertProps {
  alerts: AssetRecoveryItem[];
  totalValue: number;
}

export function AssetRecoveryAlert({ alerts, totalValue }: AssetRecoveryAlertProps) {
  if (!alerts.length) return null;

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <h2 className="text-sm font-semibold text-amber-200">资产待回收提醒</h2>
        </div>
        <Link href="/supply-chain/factories" className="text-xs text-amber-300 hover:text-amber-200 underline">
          查看工厂管理 →
        </Link>
      </div>
      <p className="text-xs text-amber-300/80 mb-3">
        发现 {alerts.length} 笔订单已清款但仍有待拿货数量，待回收资产总额：{currency(totalValue)}
      </p>
      <div className="space-y-2">
        {alerts.slice(0, 3).map((alert) => (
          <div key={alert.poId} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-amber-200">{alert.supplierName}</div>
                <div className="text-xs text-amber-300/70">{alert.poNumber}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-amber-200">待拿货：{alert.pendingQuantity} 件</div>
                <div className="text-xs text-amber-300/70">货值：{currency(alert.pendingValue)}</div>
              </div>
            </div>
          </div>
        ))}
        {alerts.length > 3 && (
          <div className="text-xs text-amber-300/70 text-center pt-2">
            还有 {alerts.length - 3} 笔待回收订单，前往{" "}
            <Link href="/supply-chain/factories" className="text-amber-200 hover:underline">
              工厂管理
            </Link>{" "}
            查看详情
          </div>
        )}
      </div>
    </section>
  );
}

