"use client";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

interface UnpaidDepositItem {
  poNumber: string;
  supplierName: string;
  amount: number;
  poId: string;
}

interface UnpaidDepositsListProps {
  items: UnpaidDepositItem[];
}

export function UnpaidDepositsList({ items }: UnpaidDepositsListProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-100">待付定金</h2>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">暂无待付定金</div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((dep) => (
            <div key={dep.poId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-100">{dep.supplierName}</div>
                  <div className="text-xs text-slate-400">{dep.poNumber}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-100">{currency(dep.amount)}</div>
                </div>
              </div>
            </div>
          ))}
          {items.length > 5 && (
            <div className="text-xs text-slate-500 text-center pt-2">
              还有 {items.length - 5} 笔待付定金
            </div>
          )}
        </div>
      )}
    </div>
  );
}

