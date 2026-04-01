"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Package, Ship } from "lucide-react";
import { PageHeader } from "@/components/ui";

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e?.error ?? "加载失败");
  }
  return r.json();
};

const METHOD_LABELS: Record<string, string> = {
  SEA: "海运",
  AIR: "空运",
  EXPRESS: "快递",
};

const CONTAINER_STATUS_LABELS: Record<string, string> = {
  PLANNED: "已计划",
  LOADING: "装柜中",
  IN_TRANSIT: "在途",
  ARRIVED_PORT: "已到港",
  CUSTOMS_CLEAR: "清关完成",
  IN_WAREHOUSE: "已入仓",
  CLOSED: "已完结",
};

type ContainerBatchRow = {
  id: string;
  batchNumber: string;
  qty: number;
  shippedDate: string;
  status: string;
  shippingMethod?: string;
  trackingNumber?: string;
  vesselName?: string;
  vesselVoyage?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  eta?: string;
  actualDepartureDate?: string;
  actualArrivalDate?: string;
  destinationCountry?: string;
  destinationPlatform?: string;
  destinationStoreName?: string;
  ownerName?: string;
  currentLocation?: string;
  lastEvent?: string;
  lastEventTime?: string;
  warehouse?: { id: string; name: string };
  outboundOrder?: {
    id: string;
    outboundNumber: string;
    sku: string;
  };
  skuLines?: Array<{
    id: string;
    variantId?: string;
    sku: string;
    skuName?: string;
    spec?: string;
    qty: number;
  }>;
};

type ContainerDetail = {
  id: string;
  containerNo: string;
  containerType: string;
  sealNo?: string;
  shippingMethod: string;
  shipCompany?: string;
  vesselName?: string;
  voyageNo?: string;
  originPort?: string;
  destinationPort?: string;
  destinationCountry?: string;
  loadingDate?: string;
  etd?: string;
  eta?: string;
  actualDeparture?: string;
  actualArrival?: string;
  status: string;
  outboundBatches: ContainerBatchRow[];
};

function fmtDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateOnly(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}

function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

export default function ContainerDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const { data, isLoading, error } = useSWR<ContainerDetail>(
    id ? `/api/containers/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const batches = data?.outboundBatches ?? [];
  const totalQty = batches.reduce((s, b) => s + b.qty, 0);
  const inTransitCount = batches.filter((b) => b.status !== "已到达").length;
  const skuSummary = batches
    .flatMap((b) => b.skuLines ?? [])
    .reduce<
      Array<{ key: string; sku: string; skuName?: string; spec?: string; qty: number }>
    >((acc, line) => {
      const key = `${line.sku}__${line.spec ?? ""}`;
      const hit = acc.find((x) => x.key === key);
      if (hit) {
        hit.qty += Number(line.qty || 0);
      } else {
        acc.push({
          key,
          sku: line.sku,
          skuName: line.skuName,
          spec: line.spec,
          qty: Number(line.qty || 0),
        });
      }
      return acc;
    }, [])
    .sort((a, b) => b.qty - a.qty);

  if (isLoading && !data) {
    return (
      <div className="p-6 space-y-4 max-w-5xl">
        <div className="h-8 w-48 rounded-lg bg-slate-800 animate-pulse" />
        <div className="h-40 rounded-xl bg-slate-800/50 animate-pulse" />
        <div className="h-64 rounded-xl bg-slate-800/50 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 space-y-4">
        <Link
          href="/logistics/containers"
          className="text-slate-400 hover:text-white inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回柜子列表
        </Link>
        <p className="text-red-400">{error instanceof Error ? error.message : "柜子不存在或加载失败"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/logistics/containers"
          className="text-slate-400 hover:text-white inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回柜子列表
        </Link>
      </div>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Ship className="w-6 h-6 text-cyan-400" />
            柜子 {data.containerNo}
          </span>
        }
        description={`${CONTAINER_STATUS_LABELS[data.status] ?? data.status} · ${data.containerType} · ${METHOD_LABELS[data.shippingMethod] ?? data.shippingMethod}`}
      />

      {/* 柜级航线：整柜在途节奏 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Ship className="w-4 h-4 text-slate-500" />
          整柜运输概况
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-slate-500 text-xs mb-0.5">航线</div>
            <div className="text-slate-200">
              {data.originPort || "—"} → {data.destinationPort || "—"}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs mb-0.5">船名 / 航次</div>
            <div className="text-slate-200">
              {[data.vesselName, data.voyageNo].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs mb-0.5">ETD / ETA</div>
            <div className="text-slate-200">
              {fmtDateTime(data.etd)} / {fmtDateTime(data.eta)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs mb-0.5">装柜日期</div>
            <div className="text-slate-200">
              {data.loadingDate ? fmtDateTime(data.loadingDate) : "—"}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-xs mb-0.5">实际开船 / 到港</div>
            <div className="text-slate-200">
              {fmtDateTime(data.actualDeparture)} / {fmtDateTime(data.actualArrival)}
            </div>
          </div>
          {data.sealNo ? (
            <div>
              <div className="text-slate-500 text-xs mb-0.5">封号</div>
              <div className="text-slate-200">{data.sealNo}</div>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-slate-500 pt-2 border-t border-slate-800">
          说明：出库批次绑定本柜后，货物即归入此柜；下方按批次列出 SKU、数量与在途状态。批次上的 ETD/ETA、最新动态可在「编辑批次」中维护。
        </p>
      </div>

      {/* 柜内货物（按出库批次） */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-500" />
            本柜货物（出库批次）
          </h2>
          <div className="text-xs text-slate-500">
            共 <span className="text-slate-300 font-medium">{batches.length}</span> 个批次 ·{" "}
            <span className="text-slate-300 font-medium">{totalQty}</span> 件 · 未完结批次{" "}
            <span className="text-amber-400/90">{inTransitCount}</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div className="text-xs text-slate-500 mb-2">
            SKU 汇总（跨批次合并）
          </div>
          {skuSummary.length === 0 ? (
            <div className="text-sm text-slate-500">暂无 SKU 明细</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="py-2 pr-3 text-left font-medium">SKU</th>
                    <th className="py-2 pr-3 text-left font-medium">产品名称</th>
                    <th className="py-2 pr-3 text-left font-medium">规格</th>
                    <th className="py-2 text-right font-medium">总件数</th>
                  </tr>
                </thead>
                <tbody>
                  {skuSummary.map((line) => (
                    <tr key={line.key} className="border-b border-slate-800/70 text-slate-300">
                      <td className="py-2 pr-3 font-mono">{line.sku}</td>
                      <td className="py-2 pr-3">{line.skuName || "未命名"}</td>
                      <td className="py-2 pr-3 text-slate-400">{line.spec || "-"}</td>
                      <td className="py-2 text-right text-cyan-300">{line.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">
            暂无绑定批次。请在「出库」列表中为批次选择本柜，或从出库流程绑定柜子。
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-xs">
                  <th className="py-2 pr-3 font-medium">批次 / SKU</th>
                  <th className="py-2 pr-3 font-medium">数量</th>
                  <th className="py-2 pr-3 font-medium">状态</th>
                  <th className="py-2 pr-3 font-medium">目的（国/平台/店）</th>
                  <th className="py-2 pr-3 font-medium">批次 ETA</th>
                  <th className="py-2 pr-3 font-medium">最新动态</th>
                  <th className="py-2 pl-2 font-medium w-[100px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-800/80 hover:bg-slate-800/30">
                    <td className="py-3 pr-3 align-top">
                      <div className="text-slate-200 font-medium">{b.batchNumber}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {b.outboundOrder?.outboundNumber ?? "—"} · {b.outboundOrder?.sku ?? "—"}
                      </div>
                      {Array.isArray(b.skuLines) && b.skuLines.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {b.skuLines.map((line) => (
                            <div key={line.id} className="text-[11px] text-slate-400">
                              <span className="font-mono text-slate-300">{line.sku}</span>
                              {" · "}
                              <span>{line.skuName || "未命名"}</span>
                              {line.spec ? <span className="text-slate-500"> · {line.spec}</span> : null}
                              <span className="text-cyan-300"> × {line.qty}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 align-top text-slate-300">{b.qty}</td>
                    <td className="py-3 pr-3 align-top">
                      <span
                        className={
                          b.status === "已到达"
                            ? "text-emerald-400"
                            : b.status === "运输中" || b.status === "已清关"
                              ? "text-amber-400"
                              : "text-slate-300"
                        }
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3 align-top text-slate-400 text-xs">
                      {[b.destinationCountry, b.destinationPlatform, b.destinationStoreName]
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </td>
                    <td className="py-3 pr-3 align-top text-xs text-slate-400">
                      <div>ETA {fmtDateOnly(b.eta)}</div>
                      {b.actualDepartureDate ? (
                        <div className="text-slate-500 mt-0.5">
                          ETD {fmtDateOnly(b.actualDepartureDate)}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 align-top text-xs">
                      <div className="text-slate-300">{b.lastEvent || b.currentLocation || "—"}</div>
                      {b.lastEventTime ? (
                        <div className="text-slate-500 mt-0.5">{fmtDate(b.lastEventTime)}</div>
                      ) : null}
                    </td>
                    <td className="py-3 pl-2 align-top">
                      <Link
                        href={`/outbound/${b.id}`}
                        className="inline-flex rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        编辑批次
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
