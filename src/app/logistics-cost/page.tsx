"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { DollarSign, Plus, X } from "lucide-react";
import { PageHeader, EmptyState, ActionButton } from "@/components/ui";
import DateInput from "@/components/DateInput";

type CostItem = {
  id: string;
  outboundBatchId?: string;
  logisticsChannelId?: string;
  costType: string;
  amount: string;
  currency: string;
  paymentType: string;
  creditDays?: number;
  dueDate?: string;
  paymentStatus: string;
  outboundBatch?: {
    id: string;
    batchNumber: string;
    qty: number;
    shippedDate: string;
    status: string;
    outboundOrder?: { id: string; outboundNumber: string; sku: string };
    warehouse?: { id: string; name: string };
  };
  logisticsChannel?: {
    id: string;
    name: string;
    channelCode: string;
  };
};

type BatchOption = {
  id: string;
  batchNumber: string;
  outboundOrder?: { outboundNumber: string };
};

type ChannelOption = {
  id: string;
  name: string;
  channelCode: string;
};

const COST_TYPE_OPTIONS = [
  { value: "海运费", label: "海运费" },
  { value: "空运费", label: "空运费" },
  { value: "港杂费", label: "港杂费" },
  { value: "清关费", label: "清关费" },
  { value: "送货费", label: "送货费" },
];

const CURRENCY_OPTIONS = [
  { value: "CNY", label: "CNY" },
  { value: "USD", label: "USD" },
];

const PAYMENT_TYPE_OPTIONS = [
  { value: "现结", label: "现结" },
  { value: "账期", label: "账期" },
];

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  未付: "未付",
  已付: "已付",
  逾期: "逾期",
};

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  未付: "bg-amber-500/20 text-amber-300",
  已付: "bg-emerald-500/20 text-emerald-300",
  逾期: "bg-rose-500/20 text-rose-300",
};

function formatDate(iso: string | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}

export default function LogisticsCostPage() {
  const [list, setList] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 下拉选项
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);

  // 表单
  const [outboundBatchId, setOutboundBatchId] = useState("");
  const [logisticsChannelId, setLogisticsChannelId] = useState("");
  const [costType, setCostType] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CNY");
  const [paymentType, setPaymentType] = useState("现结");
  const [creditDays, setCreditDays] = useState("");
  const [dueDate, setDueDate] = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pagination.page));
      params.set("pageSize", String(pagination.pageSize));
      const res = await fetch(`/api/logistics-cost?${params.toString()}`);
      if (!res.ok) throw new Error("获取失败");
      const json = await res.json();
      setList(Array.isArray(json.data) ? json.data : []);
      if (json.pagination) setPagination((p) => ({ ...p, ...json.pagination }));
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const fetchOptions = useCallback(async () => {
    try {
      const [batchRes, channelRes] = await Promise.all([
        fetch("/api/outbound-batch?pageSize=200"),
        fetch("/api/logistics-channels?pageSize=200"),
      ]);
      if (batchRes.ok) {
        const j = await batchRes.json();
        setBatches(Array.isArray(j.data) ? j.data : []);
      }
      if (channelRes.ok) {
        const j = await channelRes.json();
        setChannels(Array.isArray(j.data) ? j.data : []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (modalOpen) fetchOptions();
  }, [modalOpen, fetchOptions]);

  const openModal = () => {
    setOutboundBatchId("");
    setLogisticsChannelId("");
    setCostType("");
    setAmount("");
    setCurrency("CNY");
    setPaymentType("现结");
    setCreditDays("");
    setDueDate("");
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!costType || !currency || !paymentType || !Number.isFinite(amt) || amt < 0) {
      toast.error("请填写费用类型、金额、货币、付款方式");
      return;
    }
    if (paymentType === "账期" && (!creditDays.trim() || Number(creditDays) < 0)) {
      toast.error("账期时请填写有效的账期天数");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        outboundBatchId: outboundBatchId || undefined,
        logisticsChannelId: logisticsChannelId || undefined,
        costType,
        amount: amt,
        currency,
        paymentType,
        paymentStatus: "未付",
        creditDays: paymentType === "账期" && creditDays ? Number(creditDays) : undefined,
        dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : undefined,
      };
      const res = await fetch("/api/logistics-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "创建失败");
      }
      toast.success("创建成功");
      closeModal();
      fetchList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const batchLabel = (c: CostItem) => {
    if (!c.outboundBatch) return "-";
    const ob = c.outboundBatch.outboundOrder;
    return `${c.outboundBatch.batchNumber}${ob ? ` / ${ob.outboundNumber}` : ""}`;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="物流费用管理"
          description="物流费用列表，支持按批次、物流商、费用类型查看"
        />
        <ActionButton icon={Plus} onClick={openModal}>
          新建费用
        </ActionButton>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="暂无物流费用"
          description="点击「新建费用」添加一条记录"
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50 text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">出库批次</th>
                  <th className="px-4 py-3 font-medium">物流商</th>
                  <th className="px-4 py-3 font-medium">费用类型</th>
                  <th className="px-4 py-3 font-medium">金额</th>
                  <th className="px-4 py-3 font-medium">付款方式</th>
                  <th className="px-4 py-3 font-medium">付款状态</th>
                  <th className="px-4 py-3 font-medium">到期日</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-slate-800/80 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-300">{batchLabel(c)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {c.logisticsChannel?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.costType}</td>
                    <td className="px-4 py-3 text-slate-200">
                      {c.currency} {c.amount}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.paymentType}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          PAYMENT_STATUS_CLASS[c.paymentStatus] ?? "bg-slate-500/20 text-slate-300"
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[c.paymentStatus] ?? c.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(c.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="py-1.5 text-sm text-slate-400">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}

      {/* 新建费用弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">新建物流费用</h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">关联出库批次</label>
                <select
                  value={outboundBatchId}
                  onChange={(e) => setOutboundBatchId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                >
                  <option value="">请选择（可选）</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber}
                      {b.outboundOrder ? ` / ${b.outboundOrder.outboundNumber}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">物流商</label>
                <select
                  value={logisticsChannelId}
                  onChange={(e) => setLogisticsChannelId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                >
                  <option value="">请选择（可选）</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name} {ch.channelCode ? `(${ch.channelCode})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">费用类型</label>
                <select
                  value={costType}
                  onChange={(e) => setCostType(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                  required
                >
                  <option value="">请选择</option>
                  {COST_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">金额</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">货币</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                  >
                    {CURRENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">付款方式</label>
                <div className="flex gap-4">
                  {PAYMENT_TYPE_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="paymentType"
                        value={o.value}
                        checked={paymentType === o.value}
                        onChange={() => setPaymentType(o.value)}
                        className="rounded border-slate-600 text-primary-500"
                      />
                      <span className="text-slate-300">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {paymentType === "账期" && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">账期天数</label>
                  <input
                    type="number"
                    min="0"
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                    placeholder="例如 30"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">到期日</label>
                <DateInput
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="选择日期"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <ActionButton type="submit" isLoading={submitting}>
                  提交
                </ActionButton>
                <ActionButton type="button" variant="secondary" onClick={closeModal}>
                  取消
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
