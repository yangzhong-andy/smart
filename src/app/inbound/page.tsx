"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Package, Truck, X } from "lucide-react";
import { PageHeader, EmptyState, ActionButton } from "@/components/ui";

type InboundBatchItem = {
  id: string;
  inboundId: string;
  batchNumber: string;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  receivedDate: string;
  inboundNumber?: string;
  sku?: string;
  contractNumber?: string;
  deliveryNumber?: string;
  status?: string;
  productName?: string;
};

type WarehouseItem = {
  id: string;
  name: string;
  code?: string;
  type?: string;
};

function formatDate(iso: string) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return iso;
  }
}

function getStatusStyle(status?: string) {
  if (status === "待入库" || status === "部分入库") return "bg-blue-500/20 text-blue-300";
  if (status === "已入库") return "bg-emerald-500/20 text-emerald-300";
  return "bg-slate-500/20 text-slate-400";
}

export default function InboundBatchListPage() {
  const [batches, setBatches] = useState<InboundBatchItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalBatch, setModalBatch] = useState<InboundBatchItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ warehouseId: "", destination: "", qty: "" });

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/inbound-batches?pageSize=200&noCache=true");
      const data = await res.json().catch(() => ({}));
      setBatches(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setBatches([]);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await fetch("/api/warehouses?page=1&pageSize=500");
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.data) ? data.data : [];
      setWarehouses(list);
      if (list.length > 0 && !form.warehouseId) {
        const domestic = list.find((w: WarehouseItem) => w.type === "DOMESTIC");
        setForm((f) => ({ ...f, warehouseId: domestic?.id ?? list[0].id }));
      }
    } catch {
      setWarehouses([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBatches(), fetchWarehouses()]).finally(() => setLoading(false));
  }, [fetchBatches, fetchWarehouses]);

  const openModal = (batch: InboundBatchItem) => {
    setModalBatch(batch);
    const domestic = warehouses.find((w) => w.type === "DOMESTIC");
    setForm({
      warehouseId: domestic?.id ?? warehouses[0]?.id ?? "",
      destination: "",
      qty: String(batch.qty),
    });
  };

  const closeModal = () => {
    setModalBatch(null);
    setForm({ warehouseId: "", destination: "", qty: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalBatch) return;
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("请输入有效的出库数量");
      return;
    }
    if (qty > modalBatch.qty) {
      toast.error(`出库数量不能超过入库数量（${modalBatch.qty}）`);
      return;
    }
    if (!form.warehouseId) {
      toast.error("请选择出库仓库");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/outbound-batch/from-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inboundBatchId: modalBatch.id,
          warehouseId: form.warehouseId,
          destination: form.destination.trim() || undefined,
          qty,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "生成失败");
      }
      toast.success(
        data?.outboundOrder?.outboundNumber
          ? `出库单已生成：${data.outboundOrder.outboundNumber}`
          : "出库单与出库批次已生成，库存已扣减"
      );
      closeModal();
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="入库批次列表"
        description="按批次查看入库记录，可从批次生成出库单并自动扣减库存"
      />
      <p className="text-sm text-slate-400 -mt-2">
        发起拿货后，请先到「国内入库」对相应待入库单执行入库；执行入库后，这里会自动出现对应入库批次。
      </p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无入库批次"
          description="暂无入库批次数据"
        />
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50 text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">入库单号</th>
                  <th className="px-4 py-3 font-medium">入库日期</th>
                  <th className="px-4 py-3 font-medium">合同号</th>
                  <th className="px-4 py-3 font-medium">拿货单号</th>
                  <th className="px-4 py-3 font-medium">产品名称</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">入库数量</th>
                  <th className="px-4 py-3 font-medium">仓库</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-800/80 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-300">{b.batchNumber}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(b.receivedDate)}</td>
                    <td className="px-4 py-3 text-slate-300">{b.contractNumber || "-"}</td>
                    <td className="px-4 py-3 text-slate-300">{b.deliveryNumber || "-"}</td>
                    <td className="px-4 py-3 text-slate-300">{b.productName || "-"}</td>
                    <td className="px-4 py-3 text-slate-300">{b.sku || "-"}</td>
                    <td className="px-4 py-3 text-slate-200">{b.qty}</td>
                    <td className="px-4 py-3 text-slate-300">{b.warehouseName || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getStatusStyle(b.status)}`}>
                        {b.status ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActionButton
                        variant="ghost"
                        size="sm"
                        icon={Truck}
                        onClick={() => openModal(b)}
                      >
                        生成出库单
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 生成出库单弹窗 */}
      {modalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">从入库批次生成出库单</h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 text-sm text-slate-400 border-b border-slate-700">
              批次：{modalBatch.batchNumber} · 入库数量：{modalBatch.qty}
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">出库仓库</label>
                <select
                  value={form.warehouseId}
                  onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                >
                  <option value="">请选择</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.type === "DOMESTIC" ? " (国内仓)" : w.type === "OVERSEAS" ? " (海外仓)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">目的地</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="如：巴西圣保罗 / 某仓库"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  出库数量（不超过 {modalBatch.qty}）
                </label>
                <input
                  type="number"
                  min={1}
                  max={modalBatch.qty}
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <ActionButton type="submit" isLoading={submitting}>
                  提交（创建出库单+扣减库存）
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
