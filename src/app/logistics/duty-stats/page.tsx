"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Receipt, Filter, RefreshCw } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar } from "@/components/ui";
import { toast } from "sonner";

type Container = {
  id: string;
  containerNo: string;
  destinationCountry?: string;
  overseasCompanyId?: string;
  overseasCompanyName?: string;
  declaredValue?: string;
  declaredCurrency?: string;
  dutyAmount?: string;
  dutyPayer?: string;
  dutyCurrency?: string;
  dutyPaidAmount?: string;
  returnAmount?: string;
  returnDate?: string;
  returnCurrency?: string;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DutyStatsPage() {
  const [filterPayer, setFilterPayer] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });

  const { data, isLoading, mutate } = useSWR("/api/containers?page=1&pageSize=500", fetcher);
  const containers: Container[] = Array.isArray(data?.data) ? data.data : [];

  // 过滤有关税记录的柜子
  const dutyContainers = useMemo(() => {
    return containers.filter((c) => c.dutyAmount && parseFloat(c.dutyAmount) > 0);
  }, [containers]);

  // 根据筛选条件过滤
  const filtered = useMemo(() => {
    let result = [...dutyContainers];
    
    if (filterPayer !== "all") {
      result = result.filter((c) => c.dutyPayer === filterPayer);
    }
    
    if (dateRange.start) {
      result = result.filter((c) => c.createdAt >= dateRange.start);
    }
    if (dateRange.end) {
      result = result.filter((c) => c.createdAt <= dateRange.end);
    }
    
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [dutyContainers, filterPayer, dateRange]);

  // 汇总统计
  const stats = useMemo(() => {
    let totalDuty = 0;
    let totalPaid = 0;
    let totalReturn = 0;
    let currencyStats: Record<string, { duty: number; paid: number; returnAmount: number }> = {};

    filtered.forEach((c) => {
      const dutyCurrency = c.dutyCurrency || "USD";
      const returnCurrency = c.returnCurrency || "USD";
      
      // 关税
      if (c.dutyAmount) {
        const amount = parseFloat(c.dutyAmount) || 0;
        totalDuty += amount;
        if (!currencyStats[dutyCurrency]) {
          currencyStats[dutyCurrency] = { duty: 0, paid: 0, returnAmount: 0 };
        }
        currencyStats[dutyCurrency].duty += amount;
      }
      
      // 已付关税
      if (c.dutyPaidAmount) {
        const amount = parseFloat(c.dutyPaidAmount) || 0;
        totalPaid += amount;
        if (currencyStats[dutyCurrency]) {
          currencyStats[dutyCurrency].paid += amount;
        }
      }
      
      // 回款
      if (c.returnAmount) {
        const amount = parseFloat(c.returnAmount) || 0;
        totalReturn += amount;
        if (!currencyStats[returnCurrency]) {
          currencyStats[returnCurrency] = { duty: 0, paid: 0, returnAmount: 0 };
        }
        currencyStats[returnCurrency].returnAmount += amount;
      }
    });

    return { totalDuty, totalPaid, totalReturn, currencyStats };
  }, [filtered]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="柜子关税统计"
        description="查看柜子关税、已付金额及回款统计"
        actions={
          <ActionButton variant="secondary" icon={RefreshCw} onClick={() => mutate()}>
            刷新
          </ActionButton>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="关税总额"
          value={stats.totalDuty.toLocaleString()}
          icon={Receipt}
        />
        <StatCard
          title="已付关税"
          value={stats.totalPaid.toLocaleString()}
          icon={Receipt}
        />
        <StatCard
          title="回款总额"
          value={stats.totalReturn.toLocaleString()}
          icon={Receipt}
        />
      </div>
      
      {/* 按币种统计 */}
      {Object.keys(stats.currencyStats).length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">按币种统计</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(stats.currencyStats).map(([cur, v]) => (
              <div key={cur} className="p-3 rounded-lg bg-slate-800/50">
                <div className="text-xs text-slate-400 mb-2">{cur}</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-slate-500">关税</div>
                    <div className="text-slate-200 font-medium">{v.duty.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">已付</div>
                    <div className="text-emerald-400">{v.paid.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">回款</div>
                    <div className="text-amber-400">{v.returnAmount.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 筛选区 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-300">筛选：</span>
        </div>
        <select
          value={filterPayer}
          onChange={(e) => setFilterPayer(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部付款主体</option>
          <option value="国内">国内</option>
          <option value="海外">海外</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">创建时间：</span>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          />
          <span className="text-slate-500">-</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          />
        </div>
        <button
          onClick={() => {
            setFilterPayer("all");
            setDateRange({ start: "", end: "" });
          }}
          className="text-sm text-primary-400 hover:text-primary-300"
        >
          重置
        </button>
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">柜号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">目的国</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">海外公司</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">申报金额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">关税金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">付款主体</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">已付金额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">回款金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">回款日期</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">加载中...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">暂无关税记录</td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-sm text-slate-200 font-medium">{c.containerNo}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{c.destinationCountry || "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">{c.overseasCompanyName || "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 text-right">
                      {c.declaredValue ? `${c.declaredCurrency || ""} ${parseFloat(c.declaredValue).toLocaleString()}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-200 text-right font-medium">
                      {c.dutyAmount ? `${c.dutyCurrency || ""} ${parseFloat(c.dutyAmount).toLocaleString()}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {c.dutyPayer ? (
                        <span className={`px-2 py-0.5 rounded text-xs ${c.dutyPayer === "国内" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                          {c.dutyPayer}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-400 text-right">
                      {c.dutyPaidAmount ? `${c.dutyCurrency || ""} ${parseFloat(c.dutyPaidAmount).toLocaleString()}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-amber-400 text-right">
                      {c.returnAmount ? `${c.returnCurrency || ""} ${parseFloat(c.returnAmount).toLocaleString()}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {c.returnDate ? new Date(c.returnDate).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
