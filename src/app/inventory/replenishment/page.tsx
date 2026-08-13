"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { AlertTriangle, Boxes, CalendarClock, ClipboardCheck, PackageSearch, RefreshCw, Search, Ship, TrendingUp, X } from "lucide-react"
import { toast } from "sonner"

type Policy = { salesWindowDays: number; targetCoverageDays: number; safetyStockDays: number; leadTimeDays: number }
type Shop = { shopId: string; shopName: string; region: string }
type Row = {
  variantId: string; sku: string; productName: string; overseasAvailable: number; domesticReady: number; factoryReady: number; inTransit: number
  sales7: number; sales14: number; sales30: number; forecastDailySales: number; availableDays: number | null; stockoutDate: string | null
  suggestedOrderDate: string | null; suggestedQty: number; rawSuggestedQty: number; reorderPoint: number; urgency: string
  supplier: { id: string; name: string } | null; unitCost: number; shopSales: Array<{ shopId: string; shopName: string; units: number }>
}
type Payload = {
  generatedAt: string; policy: Policy; summary: { skuCount: number; urgentCount: number; suggestedUnits: number; unresolvedSkuCount: number }
  shops: Shop[]; rows: Row[]; unresolved: Array<{ sellerSku: string; shopId: string; count: number }>
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || "读取备货数据失败")
  return data
}

const urgencyMeta: Record<string, { label: string; className: string; rank: number }> = {
  OUT_OF_STOCK: { label: "已断货", className: "border-rose-500/30 bg-rose-500/10 text-rose-300", rank: 0 },
  URGENT: { label: "立即下单", className: "border-orange-500/30 bg-orange-500/10 text-orange-300", rank: 1 },
  WATCH: { label: "重点关注", className: "border-amber-500/30 bg-amber-500/10 text-amber-300", rank: 2 },
  HEALTHY: { label: "库存健康", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", rank: 3 },
  NO_SALES: { label: "暂无销量", className: "border-slate-600 bg-slate-800 text-slate-400", rank: 4 },
}

export default function ReplenishmentPage() {
  const [policy, setPolicy] = useState<Policy>({ salesWindowDays: 30, targetCoverageDays: 45, safetyStockDays: 15, leadTimeDays: 30 })
  const [shopId, setShopId] = useState("")
  const [keyword, setKeyword] = useState("")
  const [riskOnly, setRiskOnly] = useState(false)
  const [draft, setDraft] = useState<Row | null>(null)
  const [draftQty, setDraftQty] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const params = new URLSearchParams({
    salesWindowDays: String(policy.salesWindowDays), targetCoverageDays: String(policy.targetCoverageDays),
    safetyStockDays: String(policy.safetyStockDays), leadTimeDays: String(policy.leadTimeDays),
  })
  if (shopId) params.set("shopId", shopId)
  const { data, error, isLoading, isValidating, mutate } = useSWR<Payload>(`/api/replenishment?${params}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 })
  const rows = useMemo(() => (data?.rows || [])
    .filter((row) => !riskOnly || ["OUT_OF_STOCK", "URGENT", "WATCH"].includes(row.urgency))
    .filter((row) => !keyword.trim() || `${row.sku} ${row.productName} ${row.supplier?.name || ""}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    .sort((left, right) => (urgencyMeta[left.urgency]?.rank ?? 9) - (urgencyMeta[right.urgency]?.rank ?? 9) || right.suggestedQty - left.suggestedQty),
  [data, keyword, riskOnly])

  const openDraft = (row: Row) => { setDraft(row); setDraftQty(row.suggestedQty) }
  const createSuggestion = async () => {
    if (!draft || draftQty < 1) return
    const targetShop = shopId || [...draft.shopSales].sort((a, b) => b.units - a.units)[0]?.shopId || data?.shops[0]?.shopId
    if (!targetShop) return toast.error("没有可关联的店铺")
    setSubmitting(true)
    try {
      const response = await fetch("/api/replenishment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, variantId: draft.variantId, quantity: draftQty, shopId: targetShop, unitPrice: draft.unitCost, policy: data?.policy, urgency: draft.urgency === "HEALTHY" ? "普通" : "紧急" }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || "生成失败")
      toast.success(`已生成采购建议单 ${result.order.orderNumber}`)
      setDraft(null)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "生成采购建议单失败")
    } finally { setSubmitting(false) }
  }

  return <div className="space-y-5 p-6 text-slate-100">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">备货补货</h1><p className="mt-1 text-sm text-slate-400">按基础 SKU 汇总真实销量、库存和在途；组合装已拆分，建议单仍需经过风控与审批。</p></div>
      <div className="flex items-center gap-2">
        <Link href="/procurement/procurement-orders" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 hover:border-cyan-500"><ClipboardCheck className="h-4 w-4" />采购建议单</Link>
        <button type="button" onClick={() => mutate()} aria-label="刷新数据" title="刷新数据" className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500"><RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} /></button>
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi icon={PackageSearch} label="基础 SKU" value={data?.summary.skuCount ?? "-"} tone="cyan" />
      <Kpi icon={AlertTriangle} label="需立即处理" value={data?.summary.urgentCount ?? "-"} tone="rose" />
      <Kpi icon={Boxes} label="建议补货件数" value={(data?.summary.suggestedUnits ?? 0).toLocaleString()} tone="amber" />
      <Kpi icon={TrendingUp} label="未映射销售 SKU" value={data?.summary.unresolvedSkuCount ?? "-"} tone={(data?.summary.unresolvedSkuCount || 0) > 0 ? "rose" : "emerald"} />
    </section>

    <section className="border-y border-slate-800 bg-slate-950/30 py-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="text-xs text-slate-400">店铺范围<select value={shopId} onChange={(event) => setShopId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"><option value="">全部巴西店铺</option>{data?.shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName}</option>)}</select></label>
        <NumberField label="销量窗口" value={policy.salesWindowDays} min={7} max={30} suffix="天" onChange={(value) => setPolicy({ ...policy, salesWindowDays: value })} />
        <NumberField label="目标覆盖" value={policy.targetCoverageDays} min={7} max={180} suffix="天" onChange={(value) => setPolicy({ ...policy, targetCoverageDays: value })} />
        <NumberField label="安全库存" value={policy.safetyStockDays} min={0} max={90} suffix="天" onChange={(value) => setPolicy({ ...policy, safetyStockDays: value })} />
        <NumberField label="总交期" value={policy.leadTimeDays} min={1} max={180} suffix="天" onChange={(value) => setPolicy({ ...policy, leadTimeDays: value })} />
        <div className="relative self-end"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索 SKU / 商品 / 供应商" className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm outline-none focus:border-cyan-500" /></div>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} className="h-4 w-4 accent-cyan-500" />只看需要跟进的 SKU</label>
    </section>

    {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error.message}</div>}
    {data?.unresolved.length ? <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" /><div><h2 className="text-sm font-medium text-amber-200">有 {data.unresolved.length} 个销售 SKU 未映射</h2><p className="mt-1 text-xs text-slate-400">这些销量没有参与补货建议，请先到 SKU 映射补齐：{data.unresolved.slice(0, 5).map((item) => item.sellerSku).join("、")}</p></div></div></section> : null}

    <section className="overflow-hidden border-y border-slate-800">
      <div className="flex items-center justify-between py-3"><div><h2 className="text-sm font-medium">SKU 补货建议</h2><p className="mt-1 text-xs text-slate-500">库存口径：海外仓可用 + 国内待发 + 工厂完工 + 未到仓在途</p></div><span className="text-xs text-slate-500">{data ? `更新于 ${new Date(data.generatedAt).toLocaleString("zh-CN")}` : ""}</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1380px] table-fixed text-left text-xs">
        <thead className="bg-slate-900/80 text-slate-400"><tr><Th width="210">SKU / 商品</Th><Th width="120">风险</Th><Th width="150">7 / 14 / 30天销量</Th><Th width="105">预测日销</Th><Th width="145">海外 / 国内 / 工厂</Th><Th width="105">海运在途</Th><Th width="115">可售天数</Th><Th width="120">预计断货</Th><Th width="120">建议下单</Th><Th width="130">建议补货</Th><Th width="150">供应商</Th><Th width="105">操作</Th></tr></thead>
        <tbody className="divide-y divide-slate-800">
          {isLoading ? <tr><td colSpan={12} className="h-48 text-center text-slate-500">正在计算真实销量和库存...</td></tr> : rows.length === 0 ? <tr><td colSpan={12} className="h-48 text-center text-slate-500">没有符合条件的 SKU</td></tr> : rows.map((row) => { const meta = urgencyMeta[row.urgency] || urgencyMeta.NO_SALES; return <tr key={row.variantId} className="bg-slate-950/20 align-top hover:bg-slate-900/50">
            <Td><div className="font-medium text-slate-100">{row.sku}</div><div className="mt-1 line-clamp-2 text-slate-500">{row.productName}</div></Td>
            <Td><span className={`inline-flex rounded border px-2 py-1 ${meta.className}`}>{meta.label}</span></Td>
            <Td><span className="text-cyan-300">{row.sales7}</span><span className="text-slate-600"> / </span>{row.sales14}<span className="text-slate-600"> / </span>{row.sales30}</Td>
            <Td><strong className="font-medium text-slate-200">{row.forecastDailySales.toFixed(2)}</strong> 件</Td>
            <Td><span className="text-emerald-300">{row.overseasAvailable.toLocaleString()}</span><span className="text-slate-600"> / </span>{row.domesticReady}<span className="text-slate-600"> / </span>{row.factoryReady}</Td>
            <Td>{row.inTransit.toLocaleString()}</Td><Td>{row.availableDays == null ? "-" : `${row.availableDays.toFixed(1)} 天`}</Td><Td>{row.stockoutDate || "-"}</Td><Td>{row.suggestedOrderDate || "-"}</Td>
            <Td><strong className={row.suggestedQty > 0 ? "text-amber-300" : "text-slate-500"}>{row.suggestedQty.toLocaleString()}</strong>{row.suggestedQty > 0 && <div className="mt-1 text-[11px] text-slate-500">触发点 {row.reorderPoint}</div>}</Td>
            <Td><div className="text-slate-300">{row.supplier?.name || "未维护"}</div><div className="mt-1 text-[11px] text-slate-500">CNY {row.unitCost.toFixed(2)} / 件</div></Td>
            <Td><button type="button" disabled={row.suggestedQty <= 0} onClick={() => openDraft(row)} className="h-8 rounded-md bg-cyan-600 px-3 text-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600">生成建议单</button></Td>
          </tr>})}
        </tbody>
      </table></div>
    </section>

    {draft && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-md border border-slate-700 bg-slate-950 shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-800 p-4"><div><h2 className="font-medium">确认生成采购建议单</h2><p className="mt-1 text-xs text-slate-500">生成后进入现有风控、审批和采购流程，不会自动采购。</p></div><button type="button" onClick={() => setDraft(null)} aria-label="关闭" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button></div>
      <div className="space-y-4 p-4"><div className="grid grid-cols-2 gap-3 text-sm"><Info label="SKU" value={draft.sku} /><Info label="供应商" value={draft.supplier?.name || "未维护"} /><Info label="预测日销" value={`${draft.forecastDailySales.toFixed(2)} 件`} /><Info label="预计断货" value={draft.stockoutDate || "-"} /></div>
        <label className="block text-sm text-slate-300">建议采购数量<input type="number" min={1} value={draftQty} onChange={(event) => setDraftQty(Math.max(1, Math.floor(Number(event.target.value) || 1)))} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-base outline-none focus:border-cyan-500" /></label>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">预计采购货值 CNY {(draftQty * draft.unitCost).toFixed(2)}。本次参数会随建议单保存，后续可追溯。</div>
      </div><div className="flex justify-end gap-2 border-t border-slate-800 p-4"><button type="button" onClick={() => setDraft(null)} className="h-9 rounded-md border border-slate-700 px-4 text-sm">取消</button><button type="button" disabled={submitting} onClick={createSuggestion} className="h-9 rounded-md bg-cyan-600 px-4 text-sm text-white disabled:opacity-50">{submitting ? "正在生成..." : "确认生成"}</button></div>
    </div></div>}
  </div>
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: string }) { const colors: Record<string, string> = { cyan: "text-cyan-300", rose: "text-rose-300", amber: "text-amber-300", emerald: "text-emerald-300" }; return <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{label}</span><Icon className={`h-4 w-4 ${colors[tone]}`} /></div><div className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</div></div> }
function NumberField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) { return <label className="text-xs text-slate-400">{label}<div className="relative mt-1"><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Math.floor(Number(event.target.value) || min))))} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 pr-8 text-sm text-slate-200 outline-none focus:border-cyan-500" /><span className="absolute right-2 top-2.5 text-xs text-slate-500">{suffix}</span></div></label> }
function Th({ children, width }: { children: React.ReactNode; width: string }) { return <th style={{ width }} className="px-3 py-3 font-medium">{children}</th> }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-3 py-3 text-slate-400">{children}</td> }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-slate-200">{value}</div></div> }

