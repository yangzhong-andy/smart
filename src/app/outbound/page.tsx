"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Package, ArrowRight, CheckCircle, X, Plus } from "lucide-react";
import { PageHeader, SearchBar, EmptyState, ActionButton } from "@/components/ui";

type SkuOption = { variant_id: string; sku_id: string; name?: string };

type BatchItem = {
  id: string;
  outboundOrderId: string;
  batchNumber: string;
  warehouseName?: string;
  qty: number;
  shippedDate: string;
  destination?: string;
  trackingNumber?: string;
  shippingMethod?: string;
  vesselName?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  eta?: string;
  status: string;
  outboundOrder?: {
    id: string;
    outboundNumber: string;
    sku: string;
    qty: number;
    shippedQty: number;
    status: string;
  };
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  待发货: "待发货",
  已发货: "已发货",
  运输中: "运输中",
  已清关: "已清关",
  已到达: "已到达",
};

const SHIPPING_METHOD_LABELS: Record<string, string> = {
  SEA: "海运",
  AIR: "空运",
  EXPRESS: "快递",
};

function formatDate(iso: string) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}

type WarehouseItem = { id: string; name: string; type?: string };

export default function OutboundListPage() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });

  const [confirmBatch, setConfirmBatch] = useState<BatchItem | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [createForm, setCreateForm] = useState({
    variantId: "",
    sku: "",
    qty: "",
    warehouseId: "",
    destination: "",
  });
  const [creating, setCreating] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(pagination.page));
      params.set("pageSize", String(pagination.pageSize));
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/outbound-batch?${params.toString()}`);
      if (!res.ok) throw new Error("获取失败");
      const json = await res.json();
      setBatches(Array.isArray(json.data) ? json.data : []);
      if (json.pagination) setPagination((p) => ({ ...p, ...json.pagination }));
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filterStatus]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await fetch("/api/warehouses?page=1&pageSize=500");
      const data = await res.json().catch(() => ({}));
      setWarehouses(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setWarehouses([]);
    }
  }, []);

  const fetchSkus = useCallback(async () => {
    try {
      const res = await fetch("/api/products?pageSize=500");
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      setSkus(
        list
          .filter((p: any) => p.variant_id && (p.sku_id || p.skuId))
          .map((p: any) => ({
            variant_id: p.variant_id,
            sku_id: p.sku_id ?? p.skuId ?? "",
            name: p.name,
          }))
      );
    } catch {
      setSkus([]);
    }
  }, []);

  const openCreateModal = () => {
    setCreateModalOpen(true);
    setCreateForm({ variantId: "", sku: "", qty: "", warehouseId: "", destination: "" });
    fetchSkus();
    fetchWarehouses();
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setCreateForm({ variantId: "", sku: "", qty: "", warehouseId: "", destination: "" });
  };

  const handleCreateOutbound = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(createForm.qty);
    if (!createForm.variantId || !createForm.sku.trim()) {
      toast.error("请选择 SKU");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("请填写有效的出库数量");
      return;
    }
    if (!createForm.warehouseId) {
      toast.error("请选择仓库");
      return;
    }
    const warehouse = warehouses.find((w) => w.id === createForm.warehouseId);
    if (!warehouse) {
      toast.error("所选仓库无效");
      return;
    }
    setCreating(true);
    try {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const r = Math.random().toString(36).slice(2, 6).toUpperCase();
      const outboundNumber = `OB-${date}-${r}`;
      const res = await fetch("/api/outbound-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundNumber,
          variantId: createForm.variantId,
          sku: createForm.sku.trim(),
          qty,
          warehouseId: createForm.warehouseId,
          warehouseName: warehouse.name,
          destination: createForm.destination.trim() || null,
          status: "待出库",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "创建失败");
      }
      toast.success(`出库单已创建：${data.outboundNumber ?? outboundNumber}`);
      closeCreateModal();
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "创建出库单失败");
    } finally {
      setCreating(false);
    }
  };

  const openConfirmModal = (batch: BatchItem) => {
    setConfirmBatch(batch);
    setToWarehouseId("");
    fetchWarehouses();
  };

  const closeConfirmModal = () => {
    setConfirmBatch(null);
    setToWarehouseId("");
  };

  const handleConfirmArrival = async () => {
    if (!confirmBatch || !toWarehouseId) {
      toast.error("请选择目的地仓库");
      return;
    }
    setConfirming(true);
    try {
      const res = await fetch(`/api/outbound-batch/${confirmBatch.id}/confirm-arrival`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toWarehouseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "确认失败");
      }
      toast.success("已确认到货，海外仓库存已增加");
      closeConfirmModal();
      fetchBatches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "确认到货失败");
    } finally {
      setConfirming(false);
    }
  };

  const filtered = batches.filter((b) => {
    if (!keyword.trim()) return true;
    const k = keyword.toLowerCase();
    return (
      b.batchNumber?.toLowerCase().includes(k) ||
      b.outboundOrder?.outboundNumber?.toLowerCase().includes(k) ||
      b.destination?.toLowerCase().includes(k) ||
      b.warehouseName?.toLowerCase().includes(k)
    );
  });

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      待发货: "bg-slate-500/20 text-slate-300",
      已发货: "bg-blue-500/20 text-blue-300",
      运输中: "bg-amber-500/20 text-amber-300",
      已清关: "bg-purple-500/20 text-purple-300",
      已到达: "bg-emerald-500/20 text-emerald-300",
    };
    return map[s] ?? "bg-slate-500/20 text-slate-300";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="出库管理"
          description="出库单与批次列表，可进入详情编辑运输信息"
        />
        <ActionButton icon={Plus} onClick={openCreateModal}>
          新建出库单
        </ActionButton>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索批次号、出库单号、目的地、仓库..."
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300"
        >
          <option value="all">全部状态</option>
          <option value="待发货">待发货</option>
          <option value="已发货">已发货</option>
          <option value="运输中">运输中</option>
          <option value="已清关">已清关</option>
          <option value="已到达">已到达</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无出库批次"
          description="暂无符合条件的出库批次"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-800/40 transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <span className={`px-2 py-1 rounded text-xs ${statusColor(b.status)}`}>
                    {BATCH_STATUS_LABELS[b.status] ?? b.status}
                  </span>
                  <span className="text-sm text-slate-400">批次</span>
                  <span className="text-sm font-medium text-slate-200">{b.batchNumber}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-sm text-slate-400">出库单</span>
                  <span className="text-sm text-slate-300">{b.outboundOrder?.outboundNumber ?? "-"}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-sm text-slate-400">目的地</span>
                  <span className="text-sm text-slate-300">{b.destination ?? "-"}</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-sm text-slate-400">物流</span>
                  <span className="text-sm text-slate-300">
                    {b.shippingMethod ? SHIPPING_METHOD_LABELS[b.shippingMethod] ?? b.shippingMethod : "-"}
                    {b.vesselName ? ` · ${b.vesselName}` : ""}
                  </span>
                  <span className="text-sm text-slate-500">
                    {formatDate(b.shippedDate)} · {b.qty} 件
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(b.status === "运输中" || b.status === "已清关") && (
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      icon={CheckCircle}
                      onClick={() => openConfirmModal(b)}
                    >
                      确认到货
                    </ActionButton>
                  )}
                  <Link href={`/outbound/${b.id}`}>
                    <ActionButton variant="ghost" size="sm" icon={ArrowRight}>
                      详情 / 编辑
                    </ActionButton>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建出库单弹窗 */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">新建出库单</h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateOutbound} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">SKU</label>
                <select
                  value={createForm.variantId}
                  onChange={(e) => {
                    const opt = skus.find((s) => s.variant_id === e.target.value);
                    setCreateForm((f) => ({
                      ...f,
                      variantId: e.target.value,
                      sku: opt ? opt.sku_id : "",
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                  required
                >
                  <option value="">请选择 SKU</option>
                  {skus.map((s) => (
                    <option key={s.variant_id} value={s.variant_id}>
                      {s.sku_id} {s.name ? ` · ${s.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">出库数量</label>
                <input
                  type="number"
                  min={1}
                  value={createForm.qty}
                  onChange={(e) => setCreateForm((f) => ({ ...f, qty: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                  placeholder="请输入数量"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">仓库</label>
                <select
                  value={createForm.warehouseId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, warehouseId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                  required
                >
                  <option value="">请选择仓库</option>
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
                  value={createForm.destination}
                  onChange={(e) => setCreateForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                  placeholder="如：巴西圣保罗、某仓库（选填）"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <ActionButton type="submit" isLoading={creating}>
                  创建出库单
                </ActionButton>
                <ActionButton type="button" variant="secondary" onClick={closeCreateModal}>
                  取消
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 确认到货弹窗 */}
      {confirmBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200">确认到货</h2>
              <button
                type="button"
                onClick={closeConfirmModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 text-sm text-slate-400 border-b border-slate-700">
              批次：{confirmBatch.batchNumber} · 数量：{confirmBatch.qty} 件
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">目的地仓库（海外仓）</label>
                <select
                  value={toWarehouseId}
                  onChange={(e) => setToWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
                >
                  <option value="">请选择</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.type === "OVERSEAS" ? " (海外仓)" : w.type === "DOMESTIC" ? " (国内仓)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <ActionButton onClick={handleConfirmArrival} isLoading={confirming} disabled={!toWarehouseId}>
                  确认到货
                </ActionButton>
                <ActionButton type="button" variant="secondary" onClick={closeConfirmModal}>
                  取消
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
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
    </div>
  );
}
