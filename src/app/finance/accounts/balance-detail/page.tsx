"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";

type AccountBalanceDetail = {
  account: {
    id: string;
    name: string;
    currency: string;
    initialCapital: number;
    originalBalance: number;
    rmbBalance: number;
    accountCategory: string;
    parentId?: string;
  };
  calculation: {
    startBalance: number;
    calculatedBalance: number;
    databaseBalance: number;
    totalBalance: number;
    isMatch: boolean;
  };
  flows: {
    total: number;
    details: Array<{
      id: string;
      date: string;
      type: string;
      category: string;
      summary: string;
      amount: number;
      beforeBalance: number;
      afterBalance: number;
      remark: string;
      relatedId?: string;
    }>;
  };
  transfers: {
    count: number;
    groups: Array<{
      relatedId: string;
      flows: Array<{
        id: string;
        date: string;
        type: string;
        amount: number;
        summary: string;
      }>;
    }>;
  };
};

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

export default function AccountBalanceDetailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const accountId = searchParams.get("accountId");
  const accountName = searchParams.get("name") || "账户";
  
  const [detail, setDetail] = useState<AccountBalanceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) {
      toast.error("缺少账户ID");
      router.back();
      return;
    }

    const fetchDetail = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/accounts/${accountId}/balance`);
        if (!response.ok) {
          throw new Error("查询失败");
        }
        const data = await response.json();
        setDetail(data);
      } catch (error: any) {
        console.error("Failed to fetch balance detail:", error);
        toast.error(error.message || "查询失败");
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [accountId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950">
        <div className="text-slate-400">未找到账户信息</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg border border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{detail.account.name} - 余额计算详情</h1>
          <p className="mt-1 text-sm text-slate-400">查看账户余额的详细计算过程</p>
        </div>
      </header>

      {/* 账户基本信息 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">账户信息</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-400 mb-1">币种</div>
            <div className="text-slate-200 font-medium">{detail.account.currency}</div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">初始资金</div>
            <div className="text-slate-200 font-medium">
              {detail.account.currency === "RMB" 
                ? currency(detail.account.initialCapital, "CNY")
                : detail.account.currency === "USD"
                  ? currency(detail.account.initialCapital, "USD")
                  : `${detail.account.currency} ${detail.account.initialCapital.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">当前余额</div>
            <div className="text-slate-200 font-medium">
              {detail.account.currency === "RMB" 
                ? currency(detail.account.originalBalance, "CNY")
                : detail.account.currency === "USD"
                  ? currency(detail.account.originalBalance, "USD")
                  : `${detail.account.currency} ${detail.account.originalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>
          <div>
            <div className="text-slate-400 mb-1">总余额</div>
            <div className="text-slate-200 font-medium">
              {detail.account.currency === "RMB" 
                ? currency(detail.calculation.totalBalance, "CNY")
                : detail.account.currency === "USD"
                  ? currency(detail.calculation.totalBalance, "USD")
                  : `${detail.account.currency} ${detail.calculation.totalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>
        </div>
      </section>

      {/* 计算验证 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">计算验证</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">起始余额（初始资金）：</span>
            <span className="text-slate-200 font-medium">
              {detail.account.currency === "RMB" 
                ? currency(detail.calculation.startBalance, "CNY")
                : detail.account.currency === "USD"
                  ? currency(detail.calculation.startBalance, "USD")
                  : `${detail.account.currency} ${detail.calculation.startBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">流水记录总数：</span>
            <span className="text-slate-200 font-medium">{detail.flows.total} 条</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">计算后余额：</span>
            <span className="text-slate-200 font-medium">
              {detail.account.currency === "RMB" 
                ? currency(detail.calculation.calculatedBalance, "CNY")
                : detail.account.currency === "USD"
                  ? currency(detail.calculation.calculatedBalance, "USD")
                  : `${detail.account.currency} ${detail.calculation.calculatedBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">数据库余额：</span>
            <span className="text-slate-200 font-medium">
              {detail.account.currency === "RMB" 
                ? currency(detail.calculation.databaseBalance, "CNY")
                : detail.account.currency === "USD"
                  ? currency(detail.calculation.databaseBalance, "USD")
                  : `${detail.account.currency} ${detail.calculation.databaseBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-700">
            <span className="text-slate-400">计算结果：</span>
            <div className="flex items-center gap-2">
              {detail.calculation.isMatch ? (
                <>
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">计算正确</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-rose-400" />
                  <span className="text-rose-400 font-medium">
                    计算不一致（差异：{detail.calculation.calculatedBalance - detail.calculation.databaseBalance}）
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 流水明细 */}
      {detail.flows.details.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">流水明细（按时间顺序）</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-xs">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-400 w-24">日期</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-400 w-20">类型</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[120px]">分类</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-400 min-w-[200px]">摘要</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-400 w-28">金额</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-400 w-28">变动前余额</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-400 w-28">变动后余额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                {detail.flows.details.map((flow) => (
                  <tr key={flow.id} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-300">{flow.date}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          flow.type === "INCOME"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {flow.type === "INCOME" ? "收入" : "支出"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{flow.category}</td>
                    <td className="px-3 py-2 text-slate-300">{flow.summary}</td>
                    <td className={`px-3 py-2 text-right font-medium ${flow.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {detail.account.currency === "RMB" 
                        ? currency(flow.amount, "CNY")
                        : detail.account.currency === "USD"
                          ? currency(flow.amount, "USD")
                          : `${detail.account.currency} ${flow.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      {detail.account.currency === "RMB" 
                        ? currency(flow.beforeBalance, "CNY")
                        : detail.account.currency === "USD"
                          ? currency(flow.beforeBalance, "USD")
                          : `${detail.account.currency} ${flow.beforeBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-200 font-medium">
                      {detail.account.currency === "RMB" 
                        ? currency(flow.afterBalance, "CNY")
                        : detail.account.currency === "USD"
                          ? currency(flow.afterBalance, "USD")
                          : `${detail.account.currency} ${flow.afterBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 内部划拨记录 */}
      {detail.transfers.groups.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">内部划拨记录</h2>
          <div className="space-y-4">
            {detail.transfers.groups.map((group) => (
              <div key={group.relatedId} className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                <div className="text-xs text-slate-400 mb-2">划拨ID: {group.relatedId}</div>
                <div className="space-y-2">
                  {group.flows.map((flow) => (
                    <div key={flow.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          flow.type === "INCOME"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                        }`}>
                          {flow.type === "INCOME" ? "转入" : "转出"}
                        </span>
                        <span className="text-slate-300">{flow.date}</span>
                        <span className="text-slate-400">{flow.summary}</span>
                      </div>
                      <span className={`font-medium ${flow.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {detail.account.currency === "RMB" 
                          ? currency(flow.amount, "CNY")
                          : detail.account.currency === "USD"
                            ? currency(flow.amount, "USD")
                            : `${detail.account.currency} ${flow.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
