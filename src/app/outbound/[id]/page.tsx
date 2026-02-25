"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { PageHeader, ActionButton } from "@/components/ui";
import DateInput from "@/components/DateInput";

type BatchDetail = {
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
  vesselVoyage?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  eta?: string;
  status: string;
  notes?: string;
  outboundOrder?: {
    id: string;
    outboundNumber: string;
    sku: string;
    qty: number;
    shippedQty: number;
    status: string;
  };
  warehouse?: { id: string; name: string };
};

const SHIPPING_OPTIONS = [
  { value: "", label: "请选择" },
  { value: "SEA", label: "海运" },
  { value: "AIR", label: "空运" },
  { value: "EXPRESS", label: "快递" },
];

const STATUS_OPTIONS = [
  { value: "待发货", label: "待发货" },
  { value: "已发货", label: "已发货" },
  { value: "运输中", label: "运输中" },
  { value: "已清关", label: "已清关" },
  { value: "已到达", label: "已到达" },
];

function isoToDateStr(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

export default function OutboundBatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 表单：运输信息
  const [shippingMethod, setShippingMethod] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [portOfLoading, setPortOfLoading] = useState("");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  const [eta, setEta] = useState("");
  const [status, setStatus] = useState("待发货");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/outbound-batch/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("获取失败");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setBatch(data);
        setShippingMethod(data.shippingMethod ?? "");
        setVesselName(data.vesselName ?? data.vesselVoyage ?? "");
        setPortOfLoading(data.portOfLoading ?? "");
        setPortOfDischarge(data.portOfDischarge ?? "");
        setEta(isoToDateStr(data.eta));
        setStatus(data.status ?? "待发货");
      })
      .catch(() => {
        if (!cancelled) {
          setBatch(null);
          toast.error("加载批次失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        shippingMethod: shippingMethod || undefined,
        vesselName: vesselName || undefined,
        vesselVoyage: vesselName || undefined,
        portOfLoading: portOfLoading || undefined,
        portOfDischarge: portOfDischarge || undefined,
        eta: eta ? `${eta}T00:00:00.000Z` : undefined,
        status: status || "待发货",
      };
      const res = await fetch(`/api/outbound-batch/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "更新失败");
      }
      const updated = await res.json();
      setBatch(updated);
      setEta(isoToDateStr(updated.eta));
      toast.success("保存成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-10 w-48 rounded-lg bg-slate-800 animate-pulse mb-6" />
        <div className="space-y-4 max-w-xl">
          <div className="h-12 rounded-lg bg-slate-800 animate-pulse" />
          <div className="h-12 rounded-lg bg-slate-800 animate-pulse" />
          <div className="h-12 rounded-lg bg-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="p-6 space-y-4">
        <Link href="/outbound" className="text-slate-400 hover:text-white inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </Link>
        <p className="text-slate-400">出库批次不存在</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/outbound"
          className="text-slate-400 hover:text-white inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </Link>
      </div>

      <PageHeader
        title={`出库批次 ${batch.batchNumber}`}
        description={
          batch.outboundOrder
            ? `出库单 ${batch.outboundOrder.outboundNumber} · ${batch.qty} 件${batch.warehouseName ? ` · ${batch.warehouseName}` : ""}`
            : "编辑运输信息"
        }
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">运输方式</label>
            <select
              value={shippingMethod}
              onChange={(e) => setShippingMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
            >
              {SHIPPING_OPTIONS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">船名 / 航班号</label>
            <input
              type="text"
              value={vesselName}
              onChange={(e) => setVesselName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 placeholder-slate-500"
              placeholder="船名或航班号"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">装货港</label>
            <input
              type="text"
              value={portOfLoading}
              onChange={(e) => setPortOfLoading(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 placeholder-slate-500"
              placeholder="装货港"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">卸货港</label>
            <input
              type="text"
              value={portOfDischarge}
              onChange={(e) => setPortOfDischarge(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 placeholder-slate-500"
              placeholder="卸货港"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">ETA（预计到达）</label>
            <DateInput
              value={eta}
              onChange={setEta}
              placeholder="选择日期"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <ActionButton type="submit" icon={Save} isLoading={saving}>
              保存
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => router.push("/outbound")}
            >
              取消
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
