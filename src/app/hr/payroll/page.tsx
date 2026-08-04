"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Wallet, TrendingUp, Clock, Users, Plus, Sparkles, CheckCircle2, Upload, Banknote } from "lucide-react";
import { renderGroupedAccountOptions } from "@/lib/account-grouped-options";
import { Pagination, usePaginationState, paginate } from "@/components/Pagination";

const STATUS_LABELS: Record<string, string> = {
  Draft: "草稿",
  Pending_Approval: "待审批",
  Approved: "已审批",
  Paid: "已付款",
  Rejected: "已退回",
};
const STATUS_COLORS: Record<string, string> = {
  Draft: "border-slate-500/40 text-slate-300 bg-slate-500/10",
  Pending_Approval: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  Approved: "border-blue-500/40 text-blue-300 bg-blue-500/10",
  Paid: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  Rejected: "border-rose-500/40 text-rose-300 bg-rose-500/10",
};

const fmt = (n: number) => new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const arrayFetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.data)) return j.data;
  return [];
};

export default function PayrollPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 默认当月
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const { page: pgPage, pageSize: pgPageSize, setPage: setPgPage, setPageSize: setPgPageSize } = usePaginationState(20);
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generateLoading, setGenerateLoading] = useState(false);
  const [batchPayModal, setBatchPayModal] = useState(false);
  const [payAccountId, setPayAccountId] = useState("");
  const [payVoucher, setPayVoucher] = useState<string | string[]>("");
  const [paying, setPaying] = useState(false);

  const SWR_OPT = { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 600000 };

  const { data: rawPayrolls } = useSWR(`/api/payroll?month=${selectedMonth}`, arrayFetcher, SWR_OPT);
  const { data: rawAccounts } = useSWR("/api/accounts?page=1&pageSize=500", arrayFetcher, SWR_OPT);

  const payrolls = useMemo(() => (Array.isArray(rawPayrolls) ? rawPayrolls : []), [rawPayrolls]);
  const accounts = useMemo(() => (Array.isArray(rawAccounts) ? rawAccounts : []), [rawAccounts]);

  const filtered = useMemo(() => {
    let result = payrolls;
    if (filterDept !== "all") result = result.filter((r: any) => r.department === filterDept);
    if (filterStatus !== "all") result = result.filter((r: any) => r.status === filterStatus);
    return result;
  }, [payrolls, filterDept, filterStatus]);

  // 统计
  const stats = useMemo(() => {
    const active = payrolls.filter((r: any) => r.status !== "Rejected");
    const totalGross = active.reduce((s: number, r: any) => s + (r.grossSalary || 0), 0);
    const totalNet = active.reduce((s: number, r: any) => s + (r.netSalary || 0), 0);
    const totalDeduction = active.reduce((s: number, r: any) => s + (r.totalDeduction || 0), 0);
    const totalInsurance = active.reduce((s: number, r: any) => s + (r.pension || 0) + (r.unemployment || 0) + (r.medical || 0) + (r.incomeTax || 0), 0);
    const deptSet = new Set(active.map((r: any) => r.department));
    return { totalGross, totalNet, totalDeduction, totalInsurance, count: active.length, deptCount: deptSet.size };
  }, [payrolls]);

  const departments = useMemo(() => {
    const set = new Set(payrolls.map((r: any) => r.department).filter(Boolean));
    return Array.from(set);
  }, [payrolls]);

  // 生成工资单
  const handleGenerate = async () => {
    setGenerateLoading(true);
    try {
      const res = await fetch("/api/payroll/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth, department: filterDept }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`已生成 ${data.created} 条工资单${data.skipped > 0 ? `（跳过 ${data.skipped} 条已存在）` : ""}`);
        swrMutate(`/api/payroll?month=${selectedMonth}`);
      } else {
        toast.error(data.error || "生成失败");
      }
    } catch (e: any) {
      toast.error(e.message || "网络错误");
    }
    setGenerateLoading(false);
  };

  // 更新单条字段（失焦保存）
  const updateField = async (id: string, field: string, value: any) => {
    try {
      await fetch(`/api/payroll/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      swrMutate(`/api/payroll?month=${selectedMonth}`);
    } catch (e) {
      console.error(e);
    }
  };

  // 批量状态变更
  const batchUpdateStatus = async (status: string) => {
    if (selectedIds.size === 0) { toast.error("请先勾选工资单"); return; }
    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        await fetch(`/api/payroll/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            submittedAt: status === "Pending_Approval" ? new Date().toISOString() : undefined,
            approvedBy: status === "Approved" ? (session?.user?.name || "当前用户") : undefined,
            approvedAt: status === "Approved" ? new Date().toISOString() : undefined,
          }),
        });
      }
      toast.success(`已${status === "Pending_Approval" ? "提交" : status === "Approved" ? "审批" : "更新"} ${ids.length} 条`);
      setSelectedIds(new Set());
      swrMutate(`/api/payroll?month=${selectedMonth}`);
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    }
  };

  // 批量付款
  const handleBatchPay = async () => {
    if (!payAccountId) { toast.error("请选择出款账户"); return; }
    const toPay = payrolls.filter((r: any) => selectedIds.has(r.id) && r.status === "Approved");
    if (toPay.length === 0) { toast.error("没有已审批的工资单可付款"); return; }

    setPaying(true);
    try {
      const account = accounts.find((a: any) => a.id === payAccountId);
      if (!account) { toast.error("账户不存在"); setPaying(false); return; }

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomStr = Math.random().toString(36).slice(2, 6).toUpperCase();
      const batchNo = `SAL-BATCH-${dateStr}-${randomStr}`;
      const voucherStr = Array.isArray(payVoucher) ? JSON.stringify(payVoucher) : (payVoucher || undefined);

      let successCount = 0;
      for (const r of toPay) {
        // 创建 EXPENSE 流水
        const flowRes = await fetch("/api/cash-flow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: new Date().toISOString().slice(0, 10),
            summary: `${selectedMonth}工资 - ${r.employeeName}`,
            category: "工资/薪资",
            type: "expense",
            amount: -Math.abs(r.netSalary),
            accountId: payAccountId,
            accountName: account.name,
            currency: "CNY",
            remark: `工资发放 ${r.employeeName} ${r.department} ${selectedMonth} (${batchNo})`,
            relatedId: r.id,
            businessNumber: batchNo,
            status: "confirmed",
            paymentVoucher: voucherStr,
          }),
        });
        const flow = await flowRes.json();

        // 回写工资单
        await fetch(`/api/payroll/${r.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "Paid",
            outFlowId: flow.id,
            outAccountId: payAccountId,
            outAccountName: account.name,
            businessNumber: batchNo,
            paidBy: session?.user?.name || "当前用户",
            paidAt: new Date().toISOString(),
            paymentVoucher: voucherStr,
          }),
        });
        successCount++;
      }

      toast.success(`已付款 ${successCount} 人，合计 ¥${fmt(toPay.reduce((s: number, r: any) => s + r.netSalary, 0))}（单号：${batchNo}）`);
      setBatchPayModal(false);
      setSelectedIds(new Set());
      setPayAccountId("");
      setPayVoucher("");
      swrMutate(`/api/payroll?month=${selectedMonth}`);
      swrMutate("/api/accounts?page=1&pageSize=500");
      swrMutate("/api/cash-flow?page=1&pageSize=5000");
    } catch (e: any) {
      toast.error(e.message || "付款失败");
    }
    setPaying(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r: any) => r.id)));
    }
  };

  if (!mounted) return null;

  const selectedPayrolls = payrolls.filter((r: any) => selectedIds.has(r.id) && r.status === "Approved");
  const totalSelectedNet = selectedPayrolls.reduce((s: number, r: any) => s + (r.netSalary || 0), 0);

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">工资管理</h1>
          <p className="text-sm text-slate-400 mt-1">月度工资单生成 · 审批 · 批量付款</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setSelectedIds(new Set()); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            style={{ colorScheme: "dark" }}
          />
          <button
            onClick={handleGenerate}
            disabled={generateLoading}
            className="flex items-center gap-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {generateLoading ? "生成中..." : "生成工资单"}
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "总应发工资", value: `¥${fmt(stats.totalGross)}`, sub: `${stats.count} 人`, icon: <Wallet className="h-5 w-5" />, grad: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)" },
          { label: "总实发工资", value: `¥${fmt(stats.totalNet)}`, sub: "实际发放金额", icon: <Banknote className="h-5 w-5" />, grad: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)", valueClass: "text-emerald-300" },
          { label: "总扣款", value: `¥${fmt(stats.totalDeduction)}`, sub: "考勤/迟到/请假等", icon: <Clock className="h-5 w-5" />, grad: "linear-gradient(135deg, #b45309 0%, #0f172a 100%)", valueClass: "text-amber-300" },
          { label: "代扣代缴", value: `¥${fmt(stats.totalInsurance)}`, sub: "社保+个税", icon: <TrendingUp className="h-5 w-5" />, grad: "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)", valueClass: "text-purple-300" },
          { label: "部门数", value: `${stats.deptCount}`, sub: "统计部门", icon: <Users className="h-5 w-5" />, grad: "linear-gradient(135deg, #0e7490 0%, #0f172a 100%)" },
        ].map((card) => (
          <div key={card.label} className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: card.grad, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-16 w-16 rounded-full bg-white/5 blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/80">{card.icon}</span>
                <span className="text-xs text-white/50">{card.label}</span>
              </div>
              <div className={`text-xl font-bold ${card.valueClass || "text-white"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{card.value}</div>
              <div className="text-xs text-white/50 mt-1">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 筛选 + 批量操作 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
            <option value="all">全部部门</option>
            {departments.map((d: string) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
            <option value="all">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">已选 {selectedIds.size} 项</span>
            <button onClick={() => batchUpdateStatus("Pending_Approval")} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-500/20">提交审批</button>
            <button onClick={() => batchUpdateStatus("Approved")} className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-500/20">审批通过</button>
            <button onClick={() => setBatchPayModal(true)} className="flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 text-xs text-white">
              <Banknote className="h-3.5 w-3.5" /> 批量付款
            </button>
          </div>
        )}
      </div>

      {/* 工资单列表 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              <th className="px-3 py-3 text-center">
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded" />
              </th>
              <th className="px-3 py-3 text-left font-medium text-slate-300">姓名</th>
              <th className="px-3 py-3 text-left font-medium text-slate-300">部门</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">综合薪资</th>
              <th className="px-3 py-3 text-center font-medium text-slate-300">出勤天</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">应发合计</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">提成</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">绩效</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">扣款</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">应发工资</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">社保</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">个税</th>
              <th className="px-3 py-3 text-right font-medium text-slate-300">实发工资</th>
              <th className="px-3 py-3 text-center font-medium text-slate-300">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr><td colSpan={14} className="px-4 py-12 text-center text-slate-500">
                {payrolls.length === 0 ? `${selectedMonth}月暂无工资单，点击「生成工资单」自动创建` : "没有符合条件的工资单"}
              </td></tr>
            ) : (
              paginate(filtered, pgPage, pgPageSize).map((r: any) => {
                const insurance = (r.pension || 0) + (r.unemployment || 0) + (r.medical || 0);
                const isPaid = r.status === "Paid";
                return (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} className="rounded" />
                    </td>
                    <td className="px-3 py-2 text-slate-100 font-medium">{r.employeeName}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{r.department}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{fmt(r.totalSalary)}</td>
                    <td className="px-3 py-2 text-center">
                      {isPaid ? (
                        <span className="text-slate-300 text-xs">{r.actualAttendDays}/{r.payableDays}</span>
                      ) : (
                        <div className="flex items-center justify-center gap-0.5">
                          <input
                            type="number"
                            value={r.actualAttendDays}
                            onChange={(e) => updateField(r.id, "actualAttendDays", parseInt(e.target.value) || 0)}
                            className="w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs text-slate-100 text-center outline-none focus:border-primary-400"
                          />
                          <span className="text-slate-500 text-xs">/{r.payableDays}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">{fmt(r.payableAmount)}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{fmt(r.commission)}</td>
                    <td className="px-3 py-2 text-right">
                      {isPaid ? <span className="text-slate-300">{fmt(r.performance)}</span> : (
                        <input
                          type="number"
                          step="0.01"
                          value={r.performance}
                          onChange={(e) => updateField(r.id, "performance", parseFloat(e.target.value) || 0)}
                          className="w-20 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs text-slate-100 text-right outline-none focus:border-primary-400"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-300">{fmt(r.totalDeduction)}</td>
                    <td className="px-3 py-2 text-right text-slate-100 font-medium">{fmt(r.grossSalary)}</td>
                    <td className="px-3 py-2 text-right text-slate-400 text-xs">{fmt(insurance)}</td>
                    <td className="px-3 py-2 text-right">
                      {isPaid ? <span className="text-slate-400 text-xs">{fmt(r.incomeTax)}</span> : (
                        <input
                          type="number"
                          step="0.01"
                          value={r.incomeTax}
                          onChange={(e) => updateField(r.id, "incomeTax", parseFloat(e.target.value) || 0)}
                          className="w-16 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-xs text-slate-100 text-right outline-none focus:border-primary-400"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-300 font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(r.netSalary)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs border ${STATUS_COLORS[r.status] || ""}`}>{STATUS_LABELS[r.status] || r.status}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-slate-800/40">
              <tr className="font-medium">
                <td colSpan={3} className="px-3 py-3 text-slate-300">合计 ({filtered.length} 人)</td>
                <td className="px-3 py-3 text-right text-slate-200">{fmt(filtered.reduce((s: number, r: any) => s + (r.totalSalary || 0), 0))}</td>
                <td></td>
                <td className="px-3 py-3 text-right text-slate-200">{fmt(filtered.reduce((s: number, r: any) => s + (r.payableAmount || 0), 0))}</td>
                <td className="px-3 py-3 text-right text-slate-200">{fmt(filtered.reduce((s: number, r: any) => s + (r.commission || 0), 0))}</td>
                <td className="px-3 py-3 text-right text-slate-200">{fmt(filtered.reduce((s: number, r: any) => s + (r.performance || 0), 0))}</td>
                <td className="px-3 py-3 text-right text-rose-300">{fmt(filtered.reduce((s: number, r: any) => s + (r.totalDeduction || 0), 0))}</td>
                <td className="px-3 py-3 text-right text-slate-100">{fmt(filtered.reduce((s: number, r: any) => s + (r.grossSalary || 0), 0))}</td>
                <td className="px-3 py-3 text-right text-slate-400">{fmt(filtered.reduce((s: number, r: any) => s + (r.pension || 0) + (r.unemployment || 0) + (r.medical || 0), 0))}</td>
                <td className="px-3 py-3 text-right text-slate-400">{fmt(filtered.reduce((s: number, r: any) => s + (r.incomeTax || 0), 0))}</td>
                <td className="px-3 py-3 text-right text-emerald-300">{fmt(filtered.reduce((s: number, r: any) => s + (r.netSalary || 0), 0))}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      <Pagination total={filtered.length} page={pgPage} pageSize={pgPageSize} onPageChange={setPgPage} onPageSizeChange={setPgPageSize} />
      </div>

      {/* 批量付款弹窗 */}
      {batchPayModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-md m-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">批量付款</h2>
              <button onClick={() => setBatchPayModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-800/60 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">付款人数</span><span className="text-slate-200">{selectedPayrolls.length} 人</span></div>
                <div className="flex justify-between"><span className="text-slate-400">合计金额</span><span className="text-emerald-300 font-medium">¥{fmt(totalSelectedNet)}</span></div>
                <div className="flex justify-between border-t border-slate-700 pt-1"><span className="text-slate-400">月份</span><span className="text-slate-200">{selectedMonth}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">出款账户 <span className="text-rose-400">*</span></label>
                <select value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                  <option value="">选择出款账户</option>
                  {renderGroupedAccountOptions(accounts)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">付款凭证（可选）</label>
                <input
                  type="text"
                  value={typeof payVoucher === "string" ? payVoucher : ""}
                  onChange={(e) => setPayVoucher(e.target.value)}
                  placeholder="凭证URL"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div className="text-xs text-amber-400 bg-amber-500/5 rounded p-2">
                将为每位员工创建独立的支出流水（类目：工资/薪资），共享同一工资批次单号。
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5 border-t border-slate-800">
              <button onClick={() => setBatchPayModal(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">取消</button>
              <button onClick={handleBatchPay} disabled={paying} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm disabled:opacity-50">
                {paying ? "付款中..." : `确认付款 ¥${fmt(totalSelectedNet)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
