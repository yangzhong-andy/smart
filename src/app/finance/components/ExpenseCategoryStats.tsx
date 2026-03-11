"use client";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: curr,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

interface ExpenseCategoryItem {
  name: string;
  value: number;
}

interface ExpenseCategoryStatsProps {
  items: ExpenseCategoryItem[];
}

export function ExpenseCategoryStats({ items }: ExpenseCategoryStatsProps) {
  if (!items.length) return null;

  const total = items.reduce((sum, i) => sum + i.value, 0);
  const colors = [
    "bg-rose-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-yellow-500",
    "bg-lime-500",
    "bg-emerald-500",
    "bg-cyan-500",
    "bg-blue-500",
  ];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-4 text-sm font-medium text-slate-100">本月支出分类统计</h2>
      <div className="space-y-3">
        {items.map((item, index) => {
          const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
          const color = colors[index % colors.length];
          return (
            <div key={item.name} className="flex items-center gap-3">
              <div className="flex items-center gap-2 min-w-[120px]">
                <div className={`w-3 h-3 rounded ${color}`}></div>
                <span className="text-sm text-slate-300">{item.name}</span>
              </div>
              <div className="flex-1">
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }}></div>
                </div>
              </div>
              <div className="text-right min-w-[100px]">
                <span className="text-sm font-medium text-slate-100">{currency(item.value)}</span>
                <span className="text-xs text-slate-400 ml-2">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

