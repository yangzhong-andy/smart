"use client";

import { useId, useState, type ReactNode } from "react";
import useSWR from "swr";
import { ChevronDown, ImageOff, Loader2, RefreshCw } from "lucide-react";
import type { PlatformProfitSkuCounts, PlatformProfitSkuFinancials, PlatformProfitSkuRow, PlatformProfitSkusResponse } from "@/lib/platform-profit-skus-types";

const formatCount = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
const formatCny = (value: number) => new Intl.NumberFormat("zh-CN", {
  style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);
const CURRENCY_SYMBOLS: Record<string, string> = { BRL: "R$", CNY: "¥", USD: "$", EUR: "€", MXN: "MX$" };

function formatOriginalGmv(financial?: PlatformProfitSkuFinancials) {
  if (!financial) return "--";
  const currencies = Object.entries(financial.originalGmv).filter(([, amount]) => Number.isFinite(amount));
  if (currencies.length !== 1) return formatCny(financial.gmvCny);
  const [currency, amount] = currencies[0];
  const formatted = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return `${CURRENCY_SYMBOLS[currency] || currency} ${formatted}`;
}

const IMAGE_SOURCE_LABELS = {
  order: "订单商品图片",
  platform_sku: "平台 SKU 图片",
  platform_product: "平台商品主图（非具体规格图）",
};

function SkuProductImage({ sku }: { sku: PlatformProfitSkuRow }) {
  const [failed, setFailed] = useState(false);
  const sourceLabel = sku.imageSource ? IMAGE_SOURCE_LABELS[sku.imageSource] : "商品图片";
  if (!sku.imageUrl || failed) return <div
    className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded border border-slate-700 bg-slate-900 text-slate-500"
    role="img" aria-label={`${sku.sellerSku} ${failed ? "图片加载失败" : "暂无图片"}`} title={failed ? "图片加载失败，点击刷新明细可重试" : "该商品暂未同步图片"}>
    <ImageOff aria-hidden="true" className="h-4 w-4" /><span className="text-[9px]">{failed ? "加载失败" : "暂无图片"}</span>
  </div>;
  return <a href={sku.imageUrl} target="_blank" rel="noopener noreferrer"
    aria-label={`查看 ${sku.sellerSku} 产品大图`} title={`${sourceLabel}，点击查看大图`}
    className="block h-12 w-12 shrink-0 overflow-hidden rounded border border-slate-700 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 hover:border-sky-400">
    {/* Platform image hosts vary; keep lazy native loading without a server-side image proxy. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={sku.imageUrl} alt={`${sku.sellerSku} 产品图片`} width={48} height={48}
      loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />
  </a>;
}

async function fetchSkuDetails(url: string): Promise<PlatformProfitSkusResponse> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.error || "SKU 明细加载失败，请重试");
  return body;
}

type Props = {
  platform: string;
  platformLabel: string;
  shopId: string;
  date?: string;
  relativeDay?: "today";
  expected: PlatformProfitSkuCounts;
  panelClassName: string;
  children: ReactNode;
};

/** Mounted for one date/shop scope; callers key this component when filters change. */
export default function PlatformSkuDetails({ platform, platformLabel, shopId, date, relativeDay, expected, panelClassName, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const params = new URLSearchParams({ platform });
  if (shopId !== "all") params.set("shopId", shopId);
  if (relativeDay) params.set("relativeDay", relativeDay);
  else if (date) params.set("date", date);
  const url = `/api/platform-profit-summary/skus?${params.toString()}`;
  const { data, error, isLoading, isValidating, mutate } = useSWR<PlatformProfitSkusResponse>(expanded ? url : null, fetchSkuDetails, {
    keepPreviousData: false,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    shouldRetryOnError: false,
  });
  const totalsDiffer = data && (data.summary.orders !== expected.orders
    || data.summary.units !== expected.units || data.summary.actualUnits !== expected.actualUnits);

  return <div className="mb-2">
    <div className={`overflow-x-auto rounded-md border ${panelClassName}`}>
      <button type="button" aria-expanded={expanded} aria-controls={panelId}
        aria-label={`${expanded ? "收起" : "查看"}${platformLabel}${relativeDay ? "今日" : date || ""}出单 SKU 明细`}
        onClick={() => setExpanded((value) => !value)}
        className="block w-full min-w-[720px] px-3 py-2 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400">
        {children}
        <span className="mt-1.5 flex items-center gap-1 px-2 text-[11px] text-slate-400">
          <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "收起 SKU 明细" : "查看出单 SKU 明细"}
        </span>
      </button>
    </div>
    {expanded && <section id={panelId} aria-label={`${platformLabel}出单 SKU 明细`} aria-busy={isLoading || isValidating}
      className="mt-2 space-y-3 rounded-md border border-slate-700/70 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">出单 SKU 明细</h3>
        <button type="button" onClick={() => void mutate()} disabled={isValidating}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50">
          <RefreshCw aria-hidden="true" className={`h-3 w-3 ${isValidating ? "animate-spin" : ""}`} />刷新明细
        </button>
      </div>
      {isLoading && !data && <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />正在读取 SKU 明细...</div>}
      {error && <div role="alert" className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
        {error.message}{data && "；下方保留上次读取的明细。"}
        <button type="button" onClick={() => void mutate()} disabled={isValidating} className="ml-2 underline underline-offset-2 disabled:opacity-50">重试</button>
      </div>}
      {data && <>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
          <span>去重订单 <strong className="tabular-nums text-slate-100">{formatCount(data.summary.orders)}</strong></span>
          <span>销售件数 <strong className="tabular-nums text-slate-100">{formatCount(data.summary.units)}</strong></span>
          <span>实际件数 <strong className="tabular-nums text-slate-100">{formatCount(data.summary.actualUnits)}</strong></span>
          <span>GMV <strong className="tabular-nums text-slate-100">{formatOriginalGmv(data.summary.financial)}</strong></span>
          <span>贡献利润 <strong className={`tabular-nums ${data.summary.financial && data.summary.financial.profitCny < 0 ? "text-rose-300" : "text-emerald-300"}`}>{data.summary.financial ? formatCny(data.summary.financial.profitCny) : "--"}</strong></span>
        </div>
        {totalsDiffer && <p className="text-xs text-amber-300">本次读取的数量与上方汇总不一致，可能有订单状态或 SKU 映射更新。请刷新页面汇总后核对。</p>}
        {data.warnings.length > 0 && <div className="space-y-1 text-xs text-amber-300">{data.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
        {data.shops.length ? data.shops.map((shop) => <div key={`${shop.shopId}:${shop.date}`} className="overflow-hidden rounded border border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/70 px-3 py-2 text-xs">
            <div><span className="font-medium text-slate-200">{shop.shopName}</span><span className="ml-2 text-slate-500">{shop.region} · {shop.date}</span><div className="mt-0.5 text-[10px] text-slate-500">店铺 ID：{shop.shopId}</div></div>
            <div className="text-right text-slate-400">
              <div>{formatCount(shop.orders)} 单 · {formatCount(shop.units)} 销售件 · {formatCount(shop.actualUnits)} 实际件</div>
              <div className="mt-0.5">GMV <span className="tabular-nums text-slate-200">{formatOriginalGmv(shop.financial)}</span> · 贡献利润 <span className={`tabular-nums ${shop.financial && shop.financial.profitCny < 0 ? "text-rose-300" : "text-emerald-300"}`}>{shop.financial ? formatCny(shop.financial.profitCny) : "--"}</span></div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-xs">
              <thead className="bg-slate-900/40 text-slate-500"><tr>
                <th scope="col" className="px-3 py-2 font-medium">店铺 SKU / 商品</th>
                <th scope="col" className="px-3 py-2 font-medium">对应内部 SKU（每销售件）</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">订单数</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">销售件数</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">实际件数</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">GMV</th>
                <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">贡献利润</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {shop.skus.map((sku) => <tr key={sku.id} className="hover:bg-slate-800/30">
                  <td className="max-w-[300px] break-words px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <SkuProductImage key={`${sku.imageUrl || "missing"}:${data.generatedAt}`} sku={sku} />
                      <div className="min-w-0"><div className="font-medium text-slate-200">{sku.sellerSku}</div>{sku.productName && <div className="mt-1 text-[10px] text-slate-500">{sku.productName}</div>}{sku.platformSkuId && <div className="mt-0.5 text-[10px] text-slate-500">平台 SKU ID：{sku.platformSkuId}</div>}</div>
                    </div>
                  </td>
                  <td className="max-w-[230px] break-words px-3 py-2.5 text-slate-400">{sku.components.length ? sku.components.map((component, index) => <div key={`${component.internalSku}:${index}`}>{component.internalSku} × {formatCount(component.quantityPerUnit)}</div>) : <span className="text-amber-300/80">未映射，按销售件数计</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{formatCount(sku.orders)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{formatCount(sku.units)}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-sky-200">{formatCount(sku.actualUnits)}</td>
                  {sku.financialRowSpan !== 0 && <>
                    <td rowSpan={sku.financialRowSpan || 1} className="border-l border-slate-800/50 px-3 py-2.5 text-right align-middle font-medium tabular-nums text-slate-200">
                      {formatOriginalGmv(sku.financial || undefined)}
                    </td>
                    <td rowSpan={sku.financialRowSpan || 1} className={`px-3 py-2.5 text-right align-middle font-medium tabular-nums ${sku.financial && sku.financial.profitCny < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      <div>{sku.financial ? formatCny(sku.financial.profitCny) : "--"}</div>
                      {sku.financial && <div className="mt-0.5 text-[10px] font-normal text-slate-500">利润率 {formatCount(sku.financial.margin)}%</div>}
                    </td>
                  </>}
                </tr>)}
                {!shop.skus.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500">暂无 SKU 明细</td></tr>}
              </tbody>
            </table>
          </div>
        </div>) : <p className="py-4 text-center text-sm text-slate-500">该日期、店铺范围内暂无有效出单 SKU</p>}
        <p className="text-[11px] leading-relaxed text-slate-500">同一订单包含多个 SKU 时，会分别计入各 SKU 的订单数，不能直接相加。实际件数按组合 SKU 映射展开，不代表已出库数量。GMV 与贡献利润来自精细利润核算；同一店铺 SKU 对应多个平台规格时只展示一次金额。未能分摊到 SKU 的店铺级费用可能使 SKU 利润合计与店铺总利润存在差异。</p>
        <p className="text-[10px] text-slate-500">明细读取时间：{new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })}</p>
      </>}
    </section>}
  </div>;
}
