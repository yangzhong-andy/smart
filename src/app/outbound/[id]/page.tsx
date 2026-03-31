"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { toast } from "sonner";
import { Anchor, ArrowLeft, CircleCheck, ClipboardList, Package, Save, Ship, Warehouse } from "lucide-react";
import { PageHeader, ActionButton } from "@/components/ui";
import DateInput from "@/components/DateInput";
import { getCountriesByRegion, getCountryByCode } from "@/lib/country-config";

type BatchDetail = {
  id: string;
  outboundOrderId: string;
  batchNumber: string;
  warehouseName?: string;
  qty: number;
  shippedDate: string;
  destination?: string;
  destinationCountry?: string;
  destinationPlatform?: string;
  destinationStoreId?: string;
  destinationStoreName?: string;
  ownerType?: string;
  ownerId?: string;
  ownerName?: string;
  sourceBatchNumber?: string;
  trackingNumber?: string;
  shippingMethod?: string;
  vesselName?: string;
  vesselVoyage?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  eta?: string;
  /** 实际开船/起飞（ETD） */
  actualDepartureDate?: string;
  containerId?: string;
  container?: { id: string; containerNo: string };
  /** 海外仓确认到货时间（与 confirm-arrival 一致） */
  arrivalConfirmedAt?: string;
  /** 创建出库单时勾选的海外入库预报（按出库单关联，非批次级） */
  overseasForecastInbound?: {
    id: string;
    inboundNumber: string;
    status: string;
    qty: number;
    receivedQty: number;
  };
  status: string;
  notes?: string;
  outboundOrder?: {
    id: string;
    outboundNumber: string;
    sku?: string;
    qty?: number;
    shippedQty: number;
    status: string;
    items: Array<{
      id: string;
      sku: string;
      skuName?: string;
      spec?: string;
      qty: number;
      shippedQty: number;
      unitWeightKg?: number;
      totalWeightKg?: number;
      pieceVolumeM3?: number;
      totalVolumeM3?: number;
      productName?: string;
      variantSkuId?: string;
      isLegacySingle?: boolean;
    }>;
    skuLineTotals?: {
      lineCount: number;
      totalQty: number;
      totalWeightKg?: number;
      totalVolumeM3?: number;
    };
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
  { value: "已装柜", label: "已装柜" },
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

const batchFetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error("加载失败");
  return r.json();
};

export default function OutboundBatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { data: batch, isLoading, mutate } = useSWR<BatchDetail | null>(
    id ? `/api/outbound-batch/${id}` : null,
    batchFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }
  );
  const [saving, setSaving] = useState(false);

  // 表单：运输信息
  const [shippingMethod, setShippingMethod] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [portOfLoading, setPortOfLoading] = useState("");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  const [actualDepartureDate, setActualDepartureDate] = useState("");
  const [eta, setEta] = useState("");
  const [status, setStatus] = useState("待发货");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [destinationPlatform, setDestinationPlatform] = useState("");
  const [destinationStoreId, setDestinationStoreId] = useState("");
  const [destinationStoreName, setDestinationStoreName] = useState("");
  const [ownerType, setOwnerType] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const { data: countryData } = useSWR<{ data: Array<{ value: string; label: string }> }>(
    "/api/countries",
    batchFetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  );
  const destinationCountries = Array.isArray(countryData?.data) ? countryData!.data : [];
  const countryOptionsByRegion = useMemo(() => {
    const grouped = getCountriesByRegion();
    const knownCodes = new Set<string>();
    Object.values(grouped).forEach((arr) => {
      arr.forEach((c) => knownCodes.add(String(c.code).toUpperCase()));
    });
    const extras = destinationCountries
      .filter((c) => c.value && !knownCodes.has(String(c.value).toUpperCase()))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
    return { grouped, extras };
  }, [destinationCountries]);

  useEffect(() => {
    if (!batch) return;
    setShippingMethod(batch.shippingMethod ?? "");
    setVesselName(batch.vesselName ?? batch.vesselVoyage ?? "");
    setPortOfLoading(batch.portOfLoading ?? "");
    setPortOfDischarge(batch.portOfDischarge ?? "");
    setActualDepartureDate(isoToDateStr(batch.actualDepartureDate));
    setEta(isoToDateStr(batch.eta));
    setStatus(batch.status ?? "待发货");
    setDestinationCountry(batch.destinationCountry ?? "");
    setDestinationPlatform(batch.destinationPlatform ?? "");
    setDestinationStoreId(batch.destinationStoreId ?? "");
    setDestinationStoreName(batch.destinationStoreName ?? "");
    setOwnerType(batch.ownerType ?? "");
    setOwnerId(batch.ownerId ?? "");
    setOwnerName(batch.ownerName ?? "");
  }, [batch]);

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
        actualDepartureDate: actualDepartureDate
          ? `${actualDepartureDate}T00:00:00.000Z`
          : null,
        eta: eta ? `${eta}T00:00:00.000Z` : undefined,
        status: status || "待发货",
        destinationCountry: destinationCountry || undefined,
        destinationPlatform: destinationPlatform || undefined,
        destinationStoreId: destinationStoreId || undefined,
        destinationStoreName: destinationStoreName || undefined,
        ownerType: ownerType || undefined,
        ownerId: ownerId || undefined,
        ownerName: ownerName || undefined,
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
      mutate(updated, false);
      setActualDepartureDate(isoToDateStr(updated.actualDepartureDate));
      setEta(isoToDateStr(updated.eta));
      toast.success("保存成功");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !batch) {
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
            ? `出库单 ${batch.outboundOrder.outboundNumber} · 本批次 ${batch.qty} 件${batch.warehouseName ? ` · ${batch.warehouseName}` : ""}`
            : "编辑运输信息"
        }
      />

      {/* 全链路：国内出库 → 柜子 → 在途 → 海外预报 → 海外仓 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 max-w-4xl">
        <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
          <Ship className="w-4 h-4 text-cyan-500/90" />
          跨境全链路进度
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          对应关系：出库批次绑定<strong className="text-slate-400">柜子</strong>；创建出库单时可生成<strong className="text-slate-400">海外入库预报</strong>（挂在出库单上）。
          详细说明见项目内{" "}
          <code className="text-[11px] bg-slate-800 px-1 rounded">docs/跨境物流链路说明.md</code>
        </p>
        <ol className="space-y-3 border-l border-slate-700 ml-2 pl-4">
          <li className="text-sm text-slate-300">
            <span className="text-emerald-400/90 inline-flex items-center gap-1">
              <CircleCheck className="w-3.5 h-3.5" /> ① 国内仓出库
            </span>
            <span className="text-slate-500 text-xs ml-2">
              {batch.warehouseName ?? "—"} · 发货 {new Date(batch.shippedDate).toLocaleString("zh-CN")}
            </span>
          </li>
          <li className="text-sm">
            {batch.container?.id ? (
              <>
                <span className="text-emerald-400/90 inline-flex items-center gap-1">
                  <CircleCheck className="w-3.5 h-3.5" /> ② 绑定柜子
                </span>
                <Link
                  href={`/logistics/containers/${batch.container.id}`}
                  className="text-cyan-400 hover:underline ml-2"
                >
                  {batch.container.containerNo}
                </Link>
                <span className="text-slate-500 text-xs ml-1">（查看本柜在途货物）</span>
              </>
            ) : (
              <>
                <span className="text-amber-400/90 inline-flex items-center gap-1">
                  <Anchor className="w-3.5 h-3.5" /> ② 绑定柜子
                </span>
                <span className="text-slate-500 text-xs ml-2">未绑定 — 请在「出库」列表为该批次选择柜号</span>
              </>
            )}
          </li>
          <li className="text-sm text-slate-300">
            <span className="inline-flex items-center gap-1 text-slate-200">
              <Ship className="w-3.5 h-3.5 text-slate-500" /> ③ 国际运输（在途）
            </span>
            <span className="text-slate-500 text-xs ml-2">
              状态：{batch.status}
              {batch.vesselName ? ` · ${batch.vesselName}` : ""}
            </span>
          </li>
          <li className="text-sm">
            {batch.overseasForecastInbound ? (
              <>
                <span className="text-emerald-400/90 inline-flex items-center gap-1">
                  <ClipboardList className="w-3.5 h-3.5" /> ④ 海外入库预报
                </span>
                <span className="text-slate-300 ml-2 font-mono text-xs">
                  {batch.overseasForecastInbound.inboundNumber}
                </span>
                <span className="text-slate-500 text-xs ml-2">
                  {batch.overseasForecastInbound.status} · 待入 {batch.overseasForecastInbound.qty} / 已收{" "}
                  {batch.overseasForecastInbound.receivedQty}
                </span>
                <Link
                  href="/logistics/inbound"
                  className="text-cyan-400 hover:underline text-xs ml-2"
                >
                  去入库页处理 →
                </Link>
              </>
            ) : (
              <>
                <span className="text-slate-500 inline-flex items-center gap-1">
                  <ClipboardList className="w-3.5 h-3.5" /> ④ 海外入库预报
                </span>
                <span className="text-slate-500 text-xs ml-2">
                  无（创建出库单时未勾选「同时创建海外入库预报」）
                </span>
              </>
            )}
          </li>
          <li className="text-sm">
            {batch.arrivalConfirmedAt ? (
              <>
                <span className="text-emerald-400/90 inline-flex items-center gap-1">
                  <CircleCheck className="w-3.5 h-3.5" /> ⑤ 海外仓已入库
                </span>
                <span className="text-slate-500 text-xs ml-2">
                  {new Date(batch.arrivalConfirmedAt).toLocaleString("zh-CN")}
                </span>
              </>
            ) : (
              <>
                <span className="text-amber-400/80 inline-flex items-center gap-1">
                  <Warehouse className="w-3.5 h-3.5" /> ⑤ 海外仓上架
                </span>
                <span className="text-slate-500 text-xs ml-2">
                  未到仓或未确认 — 可在「出库」列表对批次点「确认到货」增加海外仓库存
                </span>
              </>
            )}
          </li>
        </ol>
      </div>

      {/* 关联出库单 SKU 明细（多行明细 + 单品重量/体积估算） */}
      {batch.outboundOrder && (batch.outboundOrder.items?.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 max-w-4xl">
          <h2 className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-500/90" />
            出库单 SKU 明细
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            数据来自出库单行「OutboundOrderItem」。多 SKU 时按行展示；无明细的旧单则按本批次数量与主 SKU 显示一行。
            重量/体积由产品 SKU 档案（长宽高、重量）估算，可与实际装箱略有偏差。
          </p>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm text-left min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-xs">
                  <th className="py-2 pr-3 font-medium">SKU / 编码</th>
                  <th className="py-2 pr-3 font-medium">品名 / 规格</th>
                  <th className="py-2 pr-3 font-medium">数量</th>
                  <th className="py-2 pr-3 font-medium">单件 kg</th>
                  <th className="py-2 pr-3 font-medium">行小计 kg</th>
                  <th className="py-2 pr-3 font-medium">行体积 m³</th>
                </tr>
              </thead>
              <tbody>
                {batch.outboundOrder.items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/80">
                    <td className="py-2.5 pr-3 align-top">
                      <div className="text-slate-200 font-mono text-xs">{row.sku}</div>
                      {row.variantSkuId && row.variantSkuId !== row.sku ? (
                        <div className="text-[11px] text-slate-500 mt-0.5">变体: {row.variantSkuId}</div>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 align-top text-slate-300 text-xs">
                      {[row.productName || row.skuName, row.spec].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2.5 pr-3 align-top text-slate-200">{row.qty}</td>
                    <td className="py-2.5 pr-3 align-top text-slate-400">
                      {row.unitWeightKg != null ? row.unitWeightKg.toFixed(3) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 align-top text-slate-400">
                      {row.totalWeightKg != null ? row.totalWeightKg.toFixed(3) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 align-top text-slate-400">
                      {row.totalVolumeM3 != null ? row.totalVolumeM3.toFixed(3) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {batch.outboundOrder.skuLineTotals ? (
                <tfoot>
                  <tr className="border-t border-slate-700 text-slate-400 text-xs">
                    <td colSpan={2} className="py-2 pr-3 font-medium text-slate-300">
                      合计（按上表行汇总）
                    </td>
                    <td className="py-2 pr-3">{batch.outboundOrder.skuLineTotals.totalQty}</td>
                    <td className="py-2 pr-3">—</td>
                    <td className="py-2 pr-3">
                      {batch.outboundOrder.skuLineTotals.totalWeightKg != null
                        ? batch.outboundOrder.skuLineTotals.totalWeightKg.toFixed(3)
                        : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {batch.outboundOrder.skuLineTotals.totalVolumeM3 != null
                        ? batch.outboundOrder.skuLineTotals.totalVolumeM3.toFixed(3)
                        : "—"}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <p className="text-[11px] text-slate-600 mt-3">
            本批次发货件数：<span className="text-slate-400">{batch.qty}</span>
            {batch.outboundOrder.skuLineTotals != null &&
              batch.qty !== batch.outboundOrder.skuLineTotals.totalQty && (
                <span className="text-amber-400/90 ml-2">
                  · 与表中数量合计不一致时，多为部分发货或一单多批次出库
                </span>
              )}
          </p>
        </div>
      ) : null}

      {batch.container?.id ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 max-w-2xl text-sm">
          <span className="text-slate-400">所属柜子：</span>
          <Link
            href={`/logistics/containers/${batch.container.id}`}
            className="text-cyan-400 hover:underline font-medium"
          >
            {batch.container.containerNo}
          </Link>
          <span className="text-slate-500 ml-2">查看本柜全部在途货物与航线</span>
        </div>
      ) : null}

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                ETD（实际开船时间）
              </label>
              <DateInput
                value={actualDepartureDate}
                onChange={setActualDepartureDate}
                placeholder="选择日期"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
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

          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">货权与销售去向</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">目的国家</label>
                <select
                  value={destinationCountry}
                  onChange={(e) => setDestinationCountry(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="">请选择目的国</option>
                  {Object.entries(countryOptionsByRegion.grouped).map(([region, countries]) => (
                    <optgroup key={region} label={region}>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.code})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {countryOptionsByRegion.extras.length > 0 && (
                    <optgroup label="系统维护">
                      {countryOptionsByRegion.extras.map((country) => (
                        <option key={country.value} value={country.value}>
                          {getCountryByCode(country.value)?.name
                            ? `${getCountryByCode(country.value)!.name} (${country.value})`
                            : country.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">目的平台</label>
                <input
                  type="text"
                  value={destinationPlatform}
                  onChange={(e) => setDestinationPlatform(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
                  placeholder="如 TikTok / Amazon"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">目的店铺ID</label>
                <input
                  type="text"
                  value={destinationStoreId}
                  onChange={(e) => setDestinationStoreId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">目的店铺名称</label>
                <input
                  type="text"
                  value={destinationStoreName}
                  onChange={(e) => setDestinationStoreName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">货权主体类型</label>
                <input
                  type="text"
                  value={ownerType}
                  onChange={(e) => setOwnerType(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
                  placeholder="STORE / TEAM / COMPANY / AGENT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">货权主体ID</label>
                <input
                  type="text"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-400 mb-1.5">货权主体名称</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200"
                />
              </div>
            </div>
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
