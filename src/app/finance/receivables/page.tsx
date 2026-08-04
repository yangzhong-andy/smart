"use client";

import { useState, useMemo } from "react";
import useSWR, { mutate as swrMutate } from "swr";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, ArrowDownLeft, Eye, X, Wallet, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency-utils";
import ImageUploader from "@/components/ImageUploader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Pagination, usePaginationState, paginate } from "@/components/Pagination";

type Receivable = {
  id: string;
  receivableNo?: string;
  type: string;
  counterparty: string;
  description: string;
  originalAmount: number;
  currentBalance: number;
  currency: string;
  dueDate?: string;
  issuedDate: string;
  status: string;
  receiptRecords: any[];
  outFlowId?: string;
  outAccountId?: string;
  outAccountName?: string;
  rejectionReason?: string;
  notes?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  submittedAt?: string;
  createdAt: string;
};

type BankAccount = {
  id: string;
  name: string;
  currency: string;
  originalBalance: number;
  accountCategory?: string;
};

const STATUS_LABELS: Record<string, string> = {
  Draft: "草稿",
  Pending_Approval: "待审批",
  Approved: "已批准",
  Rejected: "已退回",
  Disbursed: "已出款",
  PartiallyReceived: "部分回收",
  Settled: "已结清",
};

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  Pending_Approval: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  Approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Rejected: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  Disbursed: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  PartiallyReceived: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Settled: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

const TYPE_LABELS: Record<string, string> = {
  "借款": "借款",
  "投资": "投资",
  "个人预支": "个人预支",
  "广告返点": "广告返点",
  "其他应收": "其他应收",
};

const TYPE_COLORS: Record<string, string> = {
  "借款": "bg-rose-500/20 text-rose-300 border-rose-500/40",
  "投资": "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "个人预支": "bg-amber-500/20 text-amber-300 border-amber-500/40",
  "广告返点": "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  "其他应收": "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

const arrayFetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  // 防御性：API 可能返回 { data, pagination } 或 { error } 或 null
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.data)) return j.data;
  return [];
};

// 按币种分组渲染账户下拉 option（带 optgroup）
const CURRENCY_LABELS: Record<string, string> = {
  CNY: '人民币', RMB: '人民币', USD: '美元', JPY: '日元',
  EUR: '欧元', GBP: '英镑', HKD: '港币', SGD: '新加坡元', AUD: '澳元',
};
const CURRENCY_ORDER = ['CNY', 'RMB', 'USD', 'JPY', 'EUR', 'GBP', 'HKD', 'SGD', 'AUD'];

const formatAccountBalance = (acc: any): string => {
  const displayBalance = acc.originalBalance || 0;
  const cur = acc.currency || 'CNY';
  try {
    if (cur === 'CNY' || cur === 'RMB') {
      return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(displayBalance);
    }
    if (['USD', 'JPY', 'EUR', 'GBP', 'HKD', 'SGD', 'AUD'].includes(cur)) {
      return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: cur }).format(displayBalance);
    }
  } catch {}
  return `${cur} ${displayBalance.toLocaleString('zh-CN')}`;
};

const renderGroupedAccountOptions = (accounts: any[]) => {
  if (!Array.isArray(accounts) || accounts.length === 0) return null;
  const grouped = accounts.reduce((acc, account) => {
    const currency = account.currency || 'OTHER';
    if (!acc[currency]) acc[currency] = [];
    acc[currency].push(account);
    return acc;
  }, {} as Record<string, any[]>);
  const sortedCurrencies = Object.keys(grouped).sort((a, b) => {
    const aIndex = CURRENCY_ORDER.indexOf(a);
    const bIndex = CURRENCY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  return sortedCurrencies.flatMap((currency) => {
    const label = CURRENCY_LABELS[currency] || currency;
    return [
      <optgroup key={`group-${currency}`} label={`━━━ ${label} (${currency}) ━━━`}>
        {grouped[currency].map((acc) => (
          <option key={acc.id} value={acc.id}>
            {acc.name} | 余额: {formatAccountBalance(acc)}
          </option>
        ))}
      </optgroup>,
    ];
  });
};

export default function ReceivablesPage() {
  const { data: session } = useSession();
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCounterparty, setFilterCounterparty] = useState<string>("all");
  const { page: pgPage, pageSize: pgPageSize, setPage: setPgPage, setPageSize: setPgPageSize } = usePaginationState(20);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [receiveModal, setReceiveModal] = useState<Receivable | null>(null);
  const [detailModal, setDetailModal] = useState<Receivable | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<any>(null);
  const [createForm, setCreateForm] = useState({
    type: "借款",
    counterparty: "",
    description: "",
    originalAmount: "",
    currency: "CNY",
    dueDate: "",
    disburseDate: new Date().toISOString().slice(0, 16),
    outAccountId: "",
    notes: "",
    consumptionAmount: "",
  });
  const [receiveForm, setReceiveForm] = useState({
    amount: "",
    accountId: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    voucher: "" as string | string[],
    remark: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const SWR_OPT = { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 600000 };

  const { data: receivables = [] } = useSWR<Receivable[]>("/api/receivables?pageSize=500", arrayFetcher, SWR_OPT);
  const { data: accounts = [] } = useSWR<BankAccount[]>("/api/accounts?page=1&pageSize=500", arrayFetcher, SWR_OPT);
  const { data: employeesRaw } = useSWR<any[]>("/api/employees?page=1&pageSize=500", arrayFetcher, SWR_OPT);
  // 防御性: 确保 accounts/receivables/employees 一定是数组
  const safeAccounts: BankAccount[] = Array.isArray(accounts) ? accounts : [];
  const safeEmployees: any[] = Array.isArray(employeesRaw) ? employeesRaw : [];
  const safeReceivables: Receivable[] = Array.isArray(receivables) ? receivables : [];

  const filteredReceivables = useMemo(() => {
    let result = safeReceivables;
    if (filterType !== "all") result = result.filter((r) => r.type === filterType);
    if (filterStatus !== "all") result = result.filter((r) => r.status === filterStatus);
    if (filterCounterparty !== "all") result = result.filter((r) => r.counterparty === filterCounterparty);
    return result;
  }, [safeReceivables, filterType, filterStatus, filterCounterparty]);

  // 出款时间编辑状态: { [receivableId]: 正在编辑的值 }
  const [editingDisburse, setEditingDisburse] = useState<Record<string, string>>({});

  // 统计
  // 对方列表（从全部数据提取，去重）
  const counterparties = useMemo(() => {
    const set = new Set(safeReceivables.map((r) => r.counterparty).filter(Boolean));
    return Array.from(set).sort();
  }, [safeReceivables]);

  // 统计：基于筛选后的数据（与表格、卡片一致）
  const stats = useMemo(() => {
    const active = filteredReceivables.filter((r) => r.status === "Disbursed" || r.status === "PartiallyReceived");
    const totalOriginal = active.reduce((sum, r) => sum + r.originalAmount, 0);
    const totalReceived = active.reduce((sum, r) => sum + (r.originalAmount - r.currentBalance), 0);
    const totalOutstanding = active.reduce((sum, r) => sum + r.currentBalance, 0);
    const settledCount = filteredReceivables.filter((r) => r.status === "Settled").length;
    // 按类型分组统计（只统计进行中：已出款/部分回收）
    const TYPES = ["借款", "投资", "个人预支", "广告返点", "其他应收"] as const;
    const byType = TYPES.map((t) => {
      const items = active.filter((r) => r.type === t);
      const original = items.reduce((sum, r) => sum + r.originalAmount, 0);
      const received = items.reduce((sum, r) => sum + (r.originalAmount - r.currentBalance), 0);
      const outstanding = items.reduce((sum, r) => sum + r.currentBalance, 0);
      return { type: t, count: items.length, original, received, outstanding };
    }).filter((x) => x.count > 0);
    return { totalOriginal, totalReceived, totalOutstanding, settledCount, activeCount: active.length, byType };
  }, [filteredReceivables]);

  const currentUserName = session?.user?.name || session?.user?.email || "当前用户";

  // 提交创建
  const handleSubmit = async (status: string) => {
    const amount = parseFloat(createForm.originalAmount);
    if (!amount || amount <= 0) { toast.error("请输入有效金额"); return; }
    if (!createForm.counterparty.trim()) { toast.error("请填写交易对象"); return; }
    if (status === "Disbursed" && !createForm.outAccountId) { toast.error("请选择出款账户"); return; }

    setSubmitting(true);
    try {
      const account = safeAccounts.find((a) => a.id === createForm.outAccountId);
      const res = await fetch("/api/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: createForm.type,
          counterparty: createForm.counterparty.trim(),
          description: createForm.type === "广告返点" && createForm.consumptionAmount
        ? `广告消耗：${createForm.consumptionAmount} | ${createForm.description.trim()}`
        : createForm.description.trim(),
          originalAmount: amount,
          currency: createForm.currency,
          dueDate: createForm.dueDate || null,
          issuedDate: new Date().toISOString().slice(0, 10),
          status,
          outAccountId: createForm.outAccountId || null,
          outAccountName: account?.name || null,
          notes: createForm.notes.trim(),
          createdBy: currentUserName,
          submittedAt: status !== "Draft" ? new Date().toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败");

      // 如果直接出款，生成支出流水（使用用户填的出款时间）
      if (status === "Disbursed" && createForm.outAccountId && account) {
        const disburseIso = createForm.disburseDate ? new Date(createForm.disburseDate).toISOString() : new Date().toISOString();
        await fetch("/api/cash-flow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: disburseIso.slice(0, 10),
            summary: `${createForm.type} - ${createForm.counterparty}`,
            category: `应收款/${createForm.type}`,
            type: "expense",
            amount: -amount,
            accountId: createForm.outAccountId,
            accountName: account.name,
            currency: createForm.currency,
            remark: `${createForm.type}出款 ${data.receivableNo}`,
            relatedId: data.id,
            businessNumber: data.receivableNo,
            status: "confirmed",
          }),
        });
        // 更新应收款状态（approvedAt = 出款时间）
        await fetch(`/api/receivables/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Disbursed", approvedBy: currentUserName, approvedAt: disburseIso }),
        });
        swrMutate("/api/accounts?page=1&pageSize=500");
      }

      swrMutate("/api/receivables?pageSize=500");
      toast.success(status === "Draft" ? "已保存草稿" : status === "Pending_Approval" ? "已提交审批" : "已出款");
      setCreateModalOpen(false);
      setCreateForm({ type: "借款", counterparty: "", description: "", originalAmount: "", currency: "CNY", dueDate: "", disburseDate: new Date().toISOString().slice(0, 16), outAccountId: "", notes: "", consumptionAmount: "" });
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 审批通过 → 出款
  const handleApprove = (receivable: Receivable) => {
    const account = safeAccounts.find((a) => a.id === receivable.outAccountId);
    setConfirmDialog({
      open: true,
      title: "审批通过并出款",
      message: `确定要通过审批并从「${receivable.outAccountName || "未选择账户"}」出款 ${formatCurrency(receivable.originalAmount, receivable.currency, "expense")} 给「${receivable.counterparty}」吗？`,
      type: "info",
      onConfirm: async () => {
        try {
          if (!receivable.outAccountId || !account) { toast.error("未设置出款账户"); return; }

          // 生成支出流水
          const flowRes = await fetch("/api/cash-flow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              summary: `${receivable.type} - ${receivable.counterparty}`,
              category: `应收款/${receivable.type}`,
              type: "expense",
              amount: -receivable.originalAmount,
              accountId: receivable.outAccountId,
              accountName: account.name,
              currency: receivable.currency,
              remark: `${receivable.type}出款 ${receivable.receivableNo}`,
              relatedId: receivable.id,
              businessNumber: receivable.receivableNo,
              status: "confirmed",
            }),
          });
          const flow = await flowRes.json();

          await fetch(`/api/receivables/${receivable.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "Disbursed",
              approvedBy: currentUserName,
              approvedAt: new Date().toISOString(),
              outFlowId: flow.id,
            }),
          });

          swrMutate("/api/receivables?pageSize=500");
          swrMutate("/api/accounts?page=1&pageSize=500");
          toast.success("已审批通过并出款");
          setConfirmDialog(null);
        } catch (e: any) {
          toast.error(e.message || "操作失败");
        }
      },
    });
  };

  // 退回
  const handleReject = (receivable: Receivable) => {
    setConfirmDialog({
      open: true,
      title: "退回",
      message: `确定要退回「${receivable.counterparty}」的${receivable.type}申请吗？`,
      type: "danger",
      onConfirm: async () => {
        await fetch(`/api/receivables/${receivable.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Rejected", rejectionReason: "审批退回" }),
        });
        swrMutate("/api/receivables?pageSize=500");
        toast.success("已退回");
        setConfirmDialog(null);
      },
    });
  };

  // 回收
  const handleReceive = async () => {
    if (!receiveModal) return;
    const amount = parseFloat(receiveForm.amount);
    if (!amount || amount <= 0) { toast.error("请输入有效金额"); return; }
    if (amount > receiveModal.currentBalance) { toast.error("回收金额超过未回收余额"); return; }
    if (!receiveForm.accountId) { toast.error("请选择收款账户"); return; }

    setSubmitting(true);
    try {
      const account = safeAccounts.find((a) => a.id === receiveForm.accountId);
      const voucherValue = Array.isArray(receiveForm.voucher)
        ? (receiveForm.voucher.length > 0 ? JSON.stringify(receiveForm.voucher) : null)
        : receiveForm.voucher || null;

      const res = await fetch(`/api/receivables/${receiveModal.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          accountId: receiveForm.accountId,
          accountName: account?.name || "",
          receivedDate: receiveForm.receivedDate,
          voucher: voucherValue,
          remark: receiveForm.remark,
          receivedBy: currentUserName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "回收失败");

      swrMutate("/api/receivables?pageSize=500");
      swrMutate("/api/accounts?page=1&pageSize=500");
      toast.success(data.status === "Settled" ? "已结清！" : "回收成功");
      setReceiveModal(null);
      setReceiveForm({ amount: "", accountId: "", receivedDate: new Date().toISOString().slice(0, 10), voucher: "", remark: "" });
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">应收款管理</h1>
          <p className="text-sm text-slate-400 mt-1">管理借款、投资、预支等应收款项的发放与回收</p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition"
        >
          <Plus className="h-4 w-4" />
          发起应收款
        </button>
      </div>

      {/* 总览统计卡片 - 渐变玻璃风 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "总应收", value: formatCurrency(stats.totalOriginal, "CNY", "balance"), sub: `${stats.activeCount} 笔进行中`, icon: <Wallet className="h-5 w-5" />, grad: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)" },
          { label: "已回收", value: formatCurrency(stats.totalReceived, "CNY", "income"), sub: `回收率 ${stats.totalOriginal > 0 ? Math.round(stats.totalReceived / stats.totalOriginal * 100) : 0}%`, icon: <TrendingUp className="h-5 w-5" />, grad: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)", valueClass: "text-emerald-300" },
          { label: "未回收", value: formatCurrency(stats.totalOutstanding, "CNY", "balance"), sub: "待回收金额", icon: <Clock className="h-5 w-5" />, grad: "linear-gradient(135deg, #b45309 0%, #0f172a 100%)", valueClass: "text-amber-300" },
          { label: "已结清", value: `${stats.settledCount} 笔`, sub: "全部回收完成", icon: <CheckCircle2 className="h-5 w-5" />, grad: "linear-gradient(135deg, #0e7490 0%, #0f172a 100%)" },
        ].map((card) => (
          <div key={card.label} className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: card.grad, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="absolute top-0 right-0 -mt-4 -mr-4 h-16 w-16 rounded-full bg-white/5 blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/80">{card.icon}</span>
                <span className="text-xs text-white/50">{card.label}</span>
              </div>
              <div className={`text-2xl font-bold ${card.valueClass || "text-white"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{card.value}</div>
              <div className="text-xs text-white/50 mt-1">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 按类型分组统计 - 渐变玻璃风 */}
      {stats.byType.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-400 mb-3">按类型统计</h3>
          <div className="grid gap-4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
            {stats.byType.map((t, idx) => {
              const typeGradients = {
                "借款": "linear-gradient(135deg, #b45309 0%, #0f172a 100%)",
                "投资": "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                "个人预支": "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)",
                "广告返点": "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
                "其他应收": "linear-gradient(135deg, #475569 0%, #0f172a 100%)",
              };
              const grad = typeGradients[t.type] || typeGradients["其他应收"];
              const pct = t.original > 0 ? Math.round(t.received / t.original * 100) : 0;
              return (
                <div key={t.type} className="group relative overflow-hidden rounded-2xl border p-4 transition-all hover:scale-[1.02] hover:shadow-xl" style={{ background: grad, border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 h-16 w-16 rounded-full bg-white/5 blur-2xl" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-white">{t.type}</div>
                      <span className="text-xs px-2 py-0.5 rounded-full border border-white/20 text-white/70 backdrop-blur-sm">{t.count} 笔</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-white/50">总金额</span>
                        <span className="text-white font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(t.original, "CNY", "balance")}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/50">已回收</span>
                        <span className="text-emerald-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(t.received, "CNY", "income")}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
                        <span className="text-white/50">未回收</span>
                        <span className="text-amber-300 font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(t.outstanding, "CNY", "balance")}</span>
                      </div>
                      {t.original > 0 && (
                        <div className="pt-1">
                          <div className="flex justify-between text-[10px] text-white/40 mb-0.5">
                            <span>回收进度</span><span>{pct}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="flex gap-2">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
          <option value="all">全部类型</option>
          <option value="借款">借款</option>
          <option value="投资">投资</option>
          <option value="个人预支">个人预支</option>
          <option value="其他应收">其他应收</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
          <option value="all">全部状态</option>
          <option value="Draft">草稿</option>
          <option value="Pending_Approval">待审批</option>
          <option value="Disbursed">已出款</option>
          <option value="PartiallyReceived">部分回收</option>
          <option value="Settled">已结清</option>
          <option value="Rejected">已退回</option>
        </select>
        <select value={filterCounterparty} onChange={(e) => setFilterCounterparty(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
          <option value="all">全部交易对象</option>
          {counterparties.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterType !== "all" || filterStatus !== "all" || filterCounterparty !== "all") && (
          <button onClick={() => { setFilterType("all"); setFilterStatus("all"); setFilterCounterparty("all"); }} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">清除筛选</button>
        )}
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        {filteredReceivables.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Wallet className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>暂无应收款记录</p>
            <p className="text-xs mt-1">点击「发起应收款」创建</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">类型</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">交易对象</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">描述</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300">原始金额</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300">已回收</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-300">未回收</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-300">状态</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">出款时间</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-300">到期日</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-300">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {paginate(filteredReceivables, pgPage, pgPageSize).map((r) => {
                  const received = r.originalAmount - r.currentBalance;
                  return (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs border ${TYPE_COLORS[r.type] || TYPE_COLORS["其他应收"]}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-100 font-medium">{r.counterparty}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[240px]"><div className="line-clamp-3 break-words whitespace-normal" title={r.description}>{r.description || "-"}</div></td>
                      <td className="px-4 py-3 text-right text-slate-200 font-medium">{formatCurrency(r.originalAmount, r.currency, "expense")}</td>
                      <td className="px-4 py-3 text-right text-emerald-300">{formatCurrency(received, r.currency, "income")}</td>
                      <td className="px-4 py-3 text-right text-amber-300 font-medium">{formatCurrency(r.currentBalance, r.currency, "balance")}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs border ${STATUS_COLORS[r.status] || ""}`}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                      <input
                        type="datetime-local"
                        value={editingDisburse[r.id] !== undefined
                          ? editingDisburse[r.id]
                          : (r.approvedAt ? new Date(new Date(r.approvedAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "")
                        }
                        onChange={(e) => setEditingDisburse((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        onBlur={async (e) => {
                          const val = editingDisburse[r.id];
                          // 清除编辑状态
                          setEditingDisburse((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
                          if (val === undefined) return;
                          const newVal = val ? new Date(val).toISOString() : null;
                          const oldVal = r.approvedAt ? new Date(r.approvedAt).toISOString() : null;
                          // 值没变化则不提交
                          if (newVal === oldVal) return;
                          try {
                            const res = await fetch(`/api/receivables/${r.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ approvedAt: val ? new Date(val).toISOString() : undefined }),
                            });
                            if (res.ok) {
                              swrMutate("/api/receivables?pageSize=500");
                              toast.success("出款时间已更新");
                            } else {
                              toast.error("保存失败");
                            }
                          } catch (err) {
                            console.error(err);
                            toast.error("网络错误");
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                        style={{ colorScheme: "dark" }}
                      />
                    </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{r.dueDate || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => setDetailModal(r)} className="px-2 py-1 rounded border border-slate-600 text-xs text-slate-300 hover:bg-slate-700" title="查看详情">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {r.status === "Pending_Approval" && (
                            <>
                              <button onClick={() => handleApprove(r)} className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-100 hover:bg-emerald-500/20">审批出款</button>
                              <button onClick={() => handleReject(r)} className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20">退回</button>
                            </>
                          )}
                          {(r.status === "Disbursed" || r.status === "PartiallyReceived") && r.currentBalance > 0 && (
                            <button onClick={() => { setReceiveModal(r); setReceiveForm({ amount: r.currentBalance.toString(), accountId: r.outAccountId || "", receivedDate: new Date().toISOString().slice(0, 10), voucher: "", remark: "" }); }} className="px-2 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20 flex items-center gap-1">
                              <ArrowDownLeft className="h-3.5 w-3.5" /> 回收
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
      <Pagination total={filteredReceivables.length} page={pgPage} pageSize={pgPageSize} onPageChange={setPgPage} onPageSizeChange={setPgPageSize} />
          </div>
        )}
      </div>

      {/* 创建弹窗 */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">发起应收款</h2>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">类型 *</label>
                <select value={createForm.type} onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                  <option value="借款">借款</option>
                  <option value="投资">投资</option>
                  <option value="个人预支">个人预支</option>
                  <option value="广告返点">广告返点</option>
                  <option value="其他应收">其他应收</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">交易对象 *</label>
                {createForm.type === "个人预支" ? (
                  <select value={createForm.counterparty} onChange={(e) => {
                    const emp = safeEmployees.find((em: any) => em.name === e.target.value);
                    setCreateForm({ ...createForm, counterparty: e.target.value, notes: emp ? `员工：${emp.name}（${emp.department}/${emp.position}）` : "" });
                  }} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                    <option value="">选择员工</option>
                    {safeEmployees.map((em: any) => {
                      const isInactive = em.status === "离职" || em.status === "INACTIVE";
                      return (
                        <option key={em.id} value={em.name}>{em.name}（{em.department}/{em.position}）{isInactive ? " [已离职]" : ""}</option>
                      );
                    })}
                  </select>
                ) : (
                  <input type="text" value={createForm.counterparty} onChange={(e) => setCreateForm({ ...createForm, counterparty: e.target.value })} placeholder="借款人/投资对象" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                )}
              </div>
              {createForm.type === "广告返点" && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">广告消耗金额</label>
                  <input type="number" step="0.01" value={createForm.consumptionAmount} onChange={(e) => setCreateForm({ ...createForm, consumptionAmount: e.target.value })} placeholder="如：78849.15" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                </div>
              )}
              {createForm.type === "广告返点" && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">广告消耗金额</label>
                  <input type="number" step="0.01" value={createForm.consumptionAmount} onChange={(e) => setCreateForm({ ...createForm, consumptionAmount: e.target.value })} placeholder="如：78849.15" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">描述</label>
                <input type="text" value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="借款用途/投资项目/预支原因" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">金额 *</label>
                  <input type="number" step="0.01" value={createForm.originalAmount} onChange={(e) => setCreateForm({ ...createForm, originalAmount: e.target.value })} placeholder="0.00" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">币种</label>
                  <select value={createForm.currency} onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                    <option value="CNY">CNY</option>
                    <option value="USD">USD</option>
                    <option value="HKD">HKD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">预计回收日</label>
                <input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" style={{ colorScheme: "dark" }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">出款时间</label>
                <input type="datetime-local" value={createForm.disburseDate} onChange={(e) => setCreateForm({ ...createForm, disburseDate: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" style={{ colorScheme: "dark" }} />
                <div className="text-xs text-slate-500 mt-1">直接出款时使用此时间作为流水时间和出款时间</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">出款账户</label>
                <select value={createForm.outAccountId} onChange={(e) => setCreateForm({ ...createForm, outAccountId: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                  <option value="">选择出款账户</option>
                  {renderGroupedAccountOptions(safeAccounts)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
                <input type="text" value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="选填" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5 border-t border-slate-800">
              <button onClick={() => setCreateModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">取消</button>
              <button onClick={() => handleSubmit("Pending_Approval")} disabled={submitting} className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm disabled:opacity-50">提交审批</button>
              <button onClick={() => handleSubmit("Disbursed")} disabled={submitting} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm disabled:opacity-50">直接出款</button>
            </div>
          </div>
        </div>
      )}

      {/* 回收弹窗 */}
      {receiveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-md m-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">回收 - {receiveModal.counterparty}</h2>
              <button onClick={() => setReceiveModal(null)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-800/60 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">原始金额</span><span className="text-slate-200">{formatCurrency(receiveModal.originalAmount, receiveModal.currency, "expense")}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">已回收</span><span className="text-emerald-300">{formatCurrency(receiveModal.originalAmount - receiveModal.currentBalance, receiveModal.currency, "income")}</span></div>
                <div className="flex justify-between border-t border-slate-700 pt-1"><span className="text-slate-400">未回收</span><span className="text-amber-300 font-medium">{formatCurrency(receiveModal.currentBalance, receiveModal.currency, "balance")}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">回收金额 *</label>
                <input type="number" step="0.01" value={receiveForm.amount} onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">收款账户 *</label>
                <select value={receiveForm.accountId} onChange={(e) => setReceiveForm({ ...receiveForm, accountId: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
                  <option value="">选择收款账户</option>
                  {renderGroupedAccountOptions(safeAccounts)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">回收日期</label>
                <input type="date" value={receiveForm.receivedDate} onChange={(e) => setReceiveForm({ ...receiveForm, receivedDate: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" style={{ colorScheme: "dark" }} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">收款凭证</label>
                <ImageUploader value={receiveForm.voucher} onChange={(v) => setReceiveForm({ ...receiveForm, voucher: v })} multiple={false} label="上传凭证" placeholder="点击上传或粘贴" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">备注</label>
                <input type="text" value={receiveForm.remark} onChange={(e) => setReceiveForm({ ...receiveForm, remark: e.target.value })} placeholder="选填" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
              </div>
            </div>
            <div className="flex gap-3 justify-end p-5 border-t border-slate-800">
              <button onClick={() => setReceiveModal(null)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">取消</button>
              <button onClick={handleReceive} disabled={submitting} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm disabled:opacity-50">确认回收</button>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">详情 - {detailModal.counterparty}</h2>
              <button onClick={() => setDetailModal(null)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><div className="text-xs text-slate-400 mb-1">类型</div><div className="text-slate-100">{detailModal.type}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">单号</div><div className="text-slate-100 font-mono text-sm">{detailModal.receivableNo || "-"}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">交易对象</div><div className="text-slate-100">{detailModal.counterparty}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">状态</div><span className={`px-2 py-1 rounded text-xs border ${STATUS_COLORS[detailModal.status]}`}>{STATUS_LABELS[detailModal.status]}</span></div>
                <div><div className="text-xs text-slate-400 mb-1">原始金额</div><div className="text-slate-100">{formatCurrency(detailModal.originalAmount, detailModal.currency, "expense")}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">未回收</div><div className="text-amber-300 font-medium">{formatCurrency(detailModal.currentBalance, detailModal.currency, "balance")}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">放款日</div><div className="text-slate-100">{detailModal.issuedDate}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">到期日</div><div className="text-slate-100">{detailModal.dueDate || "-"}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">出款账户</div><div className="text-slate-100">{detailModal.outAccountName || "-"}</div></div>
                <div><div className="text-xs text-slate-400 mb-1">创建人</div><div className="text-slate-100">{detailModal.createdBy}</div></div>
              </div>
              {detailModal.description && <div><div className="text-xs text-slate-400 mb-1">描述</div><div className="text-slate-300">{detailModal.description}</div></div>}
              {detailModal.notes && <div><div className="text-xs text-slate-400 mb-1">备注</div><div className="text-slate-300">{detailModal.notes}</div></div>}

              {/* 回收记录 */}
              {Array.isArray(detailModal.receiptRecords) && detailModal.receiptRecords.length > 0 && (
                <div className="border-t border-slate-700 pt-4">
                  <div className="text-sm font-medium text-slate-300 mb-3">回收记录 ({detailModal.receiptRecords.length}笔)</div>
                  <div className="rounded-lg border border-slate-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/60">
                        <tr>
                          <th className="px-3 py-2 text-left text-slate-300">日期</th>
                          <th className="px-3 py-2 text-right text-slate-300">回收金额</th>
                          <th className="px-3 py-2 text-left text-slate-300">收款账户</th>
                          <th className="px-3 py-2 text-left text-slate-300">备注</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {detailModal.receiptRecords.map((rec: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-300">{rec.receivedDate}</td>
                            <td className="px-3 py-2 text-right text-emerald-300">{formatCurrency(rec.receivedAmount, detailModal.currency, "income")}</td>
                            <td className="px-3 py-2 text-slate-400">{rec.accountName || "-"}</td>
                            <td className="px-3 py-2 text-slate-400">{rec.remark || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type || "info"}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
