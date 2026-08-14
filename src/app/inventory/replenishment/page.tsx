"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { AlertTriangle, Boxes, ClipboardCheck, History, PackageSearch, RefreshCw, Search, Settings2, TrendingUp, X } from "lucide-react"
import { toast } from "sonner"

type Policy = { salesWindowDays: number; targetCoverageDays: number; safetyStockDays: number; leadTimeDays: number; supplierLeadTimeDays?: number; domesticCollectionDays?: number; oceanTransitDays?: number; customsClearanceDays?: number; demandMultiplier?: number }
type Shop = { shopId: string; shopName: string; region: string }
type Warehouse = { id: string; name: string; code: string }
type Row = {
  variantId: string; sku: string; productName: string; warehouse: Warehouse; overseasAvailable: number; sharedDomesticReady: number; sharedFactoryReady: number; inTransit: number
  sales7: number; sales14: number; sales30: number; forecastDailySales: number; availableDays: number | null; stockoutDate: string | null
  suggestedOrderDate: string | null; suggestedQty: number; rawSuggestedQty: number; reorderPoint: number; urgency: string
  supplier: { id: string; name: string } | null; unitCost: number; shopSales: Array<{ shopId: string; shopName: string; units: number }>; suggestionShopId: string | null
  moq: number | null; cartonQty: number | null; policy: Policy; policySource: { id: string; scope: string } | null; missingParameters: string[]
}
type Payload = {
  generatedAt: string; defaultPolicy: Policy; summary: { skuCount: number; warehouseCount: number; urgentCount: number; suggestedUnits: number; unresolvedSkuCount: number; unresolvedWarehouseOrderCount: number }
  shops: Shop[]; warehouses: Warehouse[]; rows: Row[]; unresolved: Array<{ sellerSku: string; shopId: string; count: number }>; unresolvedWarehouses: Array<{ orderId: string; shopId: string; count: number; status: string }>
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
  const [shopId, setShopId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [keyword, setKeyword] = useState("")
  const [riskOnly, setRiskOnly] = useState(false)
  const [draft, setDraft] = useState<Row | null>(null)
  const [draftQty, setDraftQty] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [settingsRow, setSettingsRow] = useState<Row | "GLOBAL" | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const params = new URLSearchParams()
  if (shopId) params.set("shopId", shopId)
  if (warehouseId) params.set("warehouseId", warehouseId)
  const { data, error, isLoading, isValidating, mutate } = useSWR<Payload>(`/api/replenishment?${params}`, fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 })
  const shops = Array.isArray(data?.shops) ? data.shops : []
  const warehouses = Array.isArray(data?.warehouses) ? data.warehouses : []
  const unresolvedSkus = Array.isArray(data?.unresolved) ? data.unresolved : []
  const unresolvedWarehouses = Array.isArray(data?.unresolvedWarehouses) ? data.unresolvedWarehouses : []
  const rows = useMemo(() => (Array.isArray(data?.rows) ? data.rows : [])
    .filter((row) => Boolean(row?.warehouse?.id))
    .filter((row) => !riskOnly || ["OUT_OF_STOCK", "URGENT", "WATCH"].includes(row.urgency))
    .filter((row) => !keyword.trim() || `${row.sku} ${row.productName} ${row.supplier?.name || ""}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    .sort((left, right) => (urgencyMeta[left.urgency]?.rank ?? 9) - (urgencyMeta[right.urgency]?.rank ?? 9) || right.suggestedQty - left.suggestedQty),
  [data, keyword, riskOnly])

  const openDraft = (row: Row) => {
    if (!row.suggestionShopId) return toast.error("该仓库仅保留历史销量追溯，不能生成建议单")
    setDraft(row); setDraftQty(row.suggestedQty)
  }
  const createSuggestion = async () => {
    if (!draft || draftQty < 1) return
    const targetShop = draft.suggestionShopId
    if (!targetShop) return toast.error("没有可关联的店铺")
    setSubmitting(true)
    try {
      const response = await fetch("/api/replenishment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, variantId: draft.variantId, quantity: draftQty, shopId: targetShop, warehouseId: draft.warehouse.id, country: "BR", urgency: draft.urgency === "HEALTHY" ? "普通" : "紧急" }),
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
        <button type="button" onClick={() => setSettingsRow("GLOBAL")} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 hover:border-cyan-500"><Settings2 className="h-4 w-4" />全局参数</button>
        <button type="button" onClick={() => setShowHistory(true)} aria-label="参数历史" title="参数历史" className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500"><History className="h-4 w-4" /></button>
        <button type="button" onClick={() => mutate()} aria-label="刷新数据" title="刷新数据" className="grid h-9 w-9 place-items-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500"><RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} /></button>
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi icon={PackageSearch} label="基础 SKU" value={data?.summary.skuCount ?? "-"} tone="cyan" />
      <Kpi icon={Boxes} label="已配置海外仓" value={data?.summary.warehouseCount ?? "-"} tone="emerald" />
      <Kpi icon={AlertTriangle} label="需立即处理" value={data?.summary.urgentCount ?? "-"} tone="rose" />
      <Kpi icon={Boxes} label="建议补货件数" value={(data?.summary.suggestedUnits ?? 0).toLocaleString()} tone="amber" />
      <Kpi icon={TrendingUp} label="待处理映射" value={((data?.summary.unresolvedSkuCount || 0) + (data?.summary.unresolvedWarehouseOrderCount || 0)).toLocaleString()} tone={((data?.summary.unresolvedSkuCount || 0) + (data?.summary.unresolvedWarehouseOrderCount || 0)) > 0 ? "rose" : "emerald"} />
    </section>

    <section className="border-y border-slate-800 bg-slate-950/30 py-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs text-slate-400">店铺范围<select value={shopId} onChange={(event) => { setShopId(event.target.value); setWarehouseId("") }} className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"><option value="">全部巴西店铺</option>{shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName}</option>)}</select></label>
        <label className="text-xs text-slate-400">目标海外仓<select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"><option value="">全部已配置仓库</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}（{warehouse.code}）</option>)}</select></label>
        <div className="relative self-end"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索 SKU / 商品 / 供应商" className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm outline-none focus:border-cyan-500" /></div>
        <div className="self-end text-xs text-slate-500">国内、工厂库存是共享待分配库存，不会重复计入两个海外仓。</div>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} className="h-4 w-4 accent-cyan-500" />只看需要跟进的 SKU</label>
    </section>

    {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error.message}</div>}
    {(unresolvedSkus.length || unresolvedWarehouses.length) ? <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" /><div><h2 className="text-sm font-medium text-amber-200">有 {unresolvedSkus.length + unresolvedWarehouses.length} 项订单映射待处理</h2><p className="mt-1 text-xs text-slate-400">未映射 SKU：{unresolvedSkus.slice(0, 3).map((item) => item.sellerSku).join("、") || "无"}；未识别发货仓订单：{unresolvedWarehouses.slice(0, 3).map((item) => item.orderId).join("、") || "无"}。这些订单不会分摊到任一仓库。</p></div></div></section> : null}

    <section className="overflow-hidden border-y border-slate-800">
      <div className="flex items-center justify-between py-3"><div><h2 className="text-sm font-medium">SKU 补货建议</h2><p className="mt-1 text-xs text-slate-500">库存口径：目标海外仓可用 + 目标仓在途；国内和工厂库存只作共享待分配展示。</p></div><span className="text-xs text-slate-500">{data ? `更新于 ${new Date(data.generatedAt).toLocaleString("zh-CN")}` : ""}</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1700px] table-fixed text-left text-xs">
        <thead className="bg-slate-900/80 text-slate-400"><tr><Th width="210">SKU / 商品</Th><Th width="150">目标海外仓</Th><Th width="120">风险</Th><Th width="150">7 / 14 / 30天销量</Th><Th width="105">预测日销</Th><Th width="155">目标仓 / 国内共享 / 工厂共享</Th><Th width="105">目标仓在途</Th><Th width="115">可售天数</Th><Th width="120">预计断货</Th><Th width="120">建议下单</Th><Th width="130">建议补货</Th><Th width="190">补货参数</Th><Th width="150">供应商</Th><Th width="120">操作</Th></tr></thead>
        <tbody className="divide-y divide-slate-800">
          {isLoading ? <tr><td colSpan={14} className="h-48 text-center text-slate-500">正在计算真实销量和库存...</td></tr> : rows.length === 0 ? <tr><td colSpan={14} className="h-48 text-center text-slate-500">没有符合条件的 SKU</td></tr> : rows.map((row) => { const meta = urgencyMeta[row.urgency] || urgencyMeta.NO_SALES; return <tr key={`${row.warehouse.id}-${row.variantId}`} className="bg-slate-950/20 align-top hover:bg-slate-900/50">
            <Td><div className="font-medium text-slate-100">{row.sku}</div><div className="mt-1 line-clamp-2 text-slate-500">{row.productName}</div></Td>
            <Td><div className="font-medium text-slate-200">{row.warehouse.name}</div><div className="mt-1 text-[11px] text-slate-500">{row.warehouse.code}</div>{row.suggestionShopId ? <div className="mt-1 text-[11px] text-emerald-300">当前可补货</div> : <div className="mt-1 text-[11px] text-slate-500">历史仓销量</div>}</Td>
            <Td><span className={`inline-flex rounded border px-2 py-1 ${meta.className}`}>{meta.label}</span></Td>
            <Td><span className="text-cyan-300">{row.sales7}</span><span className="text-slate-600"> / </span>{row.sales14}<span className="text-slate-600"> / </span>{row.sales30}</Td>
            <Td><strong className="font-medium text-slate-200">{row.forecastDailySales.toFixed(2)}</strong> 件</Td>
            <Td><span className="text-emerald-300">{row.overseasAvailable.toLocaleString()}</span><span className="text-slate-600"> / </span>{row.sharedDomesticReady}<span className="text-slate-600"> / </span>{row.sharedFactoryReady}</Td>
            <Td>{row.inTransit.toLocaleString()}</Td><Td>{row.availableDays == null ? "-" : `${row.availableDays.toFixed(1)} 天`}</Td><Td>{row.stockoutDate || "-"}</Td><Td>{row.suggestedOrderDate || "-"}</Td>
            <Td><strong className={row.suggestedQty > 0 ? "text-amber-300" : "text-slate-500"}>{row.suggestedQty.toLocaleString()}</strong>{row.suggestedQty > 0 && <div className="mt-1 text-[11px] text-slate-500">触发点 {row.reorderPoint}</div>}</Td>
            <Td><div className="text-slate-300">交期 {row.policy.leadTimeDays}天 · 系数 {(row.policy.demandMultiplier || 1).toFixed(2)}</div><div className="mt-1 text-[11px] text-slate-500">MOQ {row.moq ?? "未维护"} · {row.cartonQty ? `${row.cartonQty}件/箱` : "装箱数未维护"}</div>{row.missingParameters.length > 0 && <div className="mt-1 text-[11px] text-amber-300">缺少：{row.missingParameters.join("、")}</div>}</Td>
            <Td><div className="text-slate-300">{row.supplier?.name || "未维护"}</div><div className="mt-1 text-[11px] text-slate-500">CNY {row.unitCost.toFixed(2)} / 件</div></Td>
            <Td><div className="flex gap-1"><button type="button" onClick={() => setSettingsRow(row)} title="维护补货参数" className="grid h-8 w-8 place-items-center rounded-md border border-slate-700 text-slate-300 hover:border-cyan-500"><Settings2 className="h-4 w-4" /></button><button type="button" disabled={row.suggestedQty <= 0 || row.unitCost <= 0 || !row.suggestionShopId} onClick={() => openDraft(row)} title={!row.suggestionShopId ? "仅历史仓销量，不能生成建议单" : row.unitCost <= 0 ? "请先维护采购成本" : "生成采购建议单"} className="h-8 rounded-md bg-cyan-600 px-2 text-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600">生成</button></div></Td>
          </tr>})}
        </tbody>
      </table></div>
    </section>

    {draft && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-md border border-slate-700 bg-slate-950 shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-800 p-4"><div><h2 className="font-medium">确认生成采购建议单</h2><p className="mt-1 text-xs text-slate-500">生成后进入现有风控、审批和采购流程，不会自动采购。</p></div><button type="button" onClick={() => setDraft(null)} aria-label="关闭" className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button></div>
      <div className="space-y-4 p-4"><div className="grid grid-cols-2 gap-3 text-sm"><Info label="SKU" value={draft.sku} /><Info label="目标海外仓" value={draft.warehouse.name} /><Info label="供应商" value={draft.supplier?.name || "未维护"} /><Info label="预测日销" value={`${draft.forecastDailySales.toFixed(2)} 件`} /><Info label="预计断货" value={draft.stockoutDate || "-"} /></div>
        <label className="block text-sm text-slate-300">建议采购数量<input type="number" min={1} value={draftQty} onChange={(event) => setDraftQty(Math.max(1, Math.floor(Number(event.target.value) || 1)))} className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-base outline-none focus:border-cyan-500" /></label>
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">预计采购货值 CNY {(draftQty * draft.unitCost).toFixed(2)}。本次参数会随建议单保存，后续可追溯。</div>
      </div><div className="flex justify-end gap-2 border-t border-slate-800 p-4"><button type="button" onClick={() => setDraft(null)} className="h-9 rounded-md border border-slate-700 px-4 text-sm">取消</button><button type="button" disabled={submitting} onClick={createSuggestion} className="h-9 rounded-md bg-cyan-600 px-4 text-sm text-white disabled:opacity-50">{submitting ? "正在生成..." : "确认生成"}</button></div>
    </div></div>}
    {settingsRow && data && <PolicyDialog row={settingsRow} shopId={shopId} shops={shops} defaults={data.defaultPolicy} saving={savingPolicy} onClose={() => setSettingsRow(null)} onSave={async (values) => {
      setSavingPolicy(true)
      try {
        const response = await fetch("/api/replenishment/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || "保存失败")
        toast.success("补货参数已保存并生效")
        setSettingsRow(null)
        await mutate()
      } catch (cause) { toast.error(cause instanceof Error ? cause.message : "保存补货参数失败") }
      finally { setSavingPolicy(false) }
    }} />}
    {showHistory && <PolicyHistoryDialog onClose={() => setShowHistory(false)} />}
  </div>
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: string }) { const colors: Record<string, string> = { cyan: "text-cyan-300", rose: "text-rose-300", amber: "text-amber-300", emerald: "text-emerald-300" }; return <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{label}</span><Icon className={`h-4 w-4 ${colors[tone]}`} /></div><div className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</div></div> }
function NumberField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) { return <label className="text-xs text-slate-400">{label}<div className="relative mt-1"><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Math.floor(Number(event.target.value) || min))))} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 pr-8 text-sm text-slate-200 outline-none focus:border-cyan-500" /><span className="absolute right-2 top-2.5 text-xs text-slate-500">{suffix}</span></div></label> }
function Th({ children, width }: { children: React.ReactNode; width: string }) { return <th style={{ width }} className="px-3 py-3 font-medium">{children}</th> }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-3 py-3 text-slate-400">{children}</td> }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-slate-200">{value}</div></div> }

type PolicyForm = {
  country: string; shopId: string; variantId: string; salesWindowDays: number; targetCoverageDays: number; safetyStockDays: number
  supplierLeadTimeDays: string; domesticCollectionDays: number; oceanTransitDays: string; customsClearanceDays: number
  demandMultiplier: number; moqOverride: string; cartonQtyOverride: string; reason: string
}

function PolicyDialog({ row, shopId, shops, defaults, saving, onClose, onSave }: {
  row: Row | "GLOBAL"; shopId: string; shops: Shop[]; defaults: Policy; saving: boolean; onClose: () => void; onSave: (values: PolicyForm) => Promise<void>
}) {
  const rowPolicy = row === "GLOBAL" ? defaults : row.policy
  const [form, setForm] = useState<PolicyForm>({
    country: "BR", shopId, variantId: row === "GLOBAL" ? "" : row.variantId,
    salesWindowDays: rowPolicy.salesWindowDays, targetCoverageDays: rowPolicy.targetCoverageDays,
    safetyStockDays: rowPolicy.safetyStockDays,
    supplierLeadTimeDays: row === "GLOBAL" ? "" : String(rowPolicy.supplierLeadTimeDays || ""),
    domesticCollectionDays: rowPolicy.domesticCollectionDays ?? 0,
    oceanTransitDays: rowPolicy.oceanTransitDays ? String(rowPolicy.oceanTransitDays) : "",
    customsClearanceDays: rowPolicy.customsClearanceDays ?? 0,
    demandMultiplier: rowPolicy.demandMultiplier ?? 1,
    moqOverride: row === "GLOBAL" ? "" : String(row.moq || ""),
    cartonQtyOverride: row === "GLOBAL" ? "" : String(row.cartonQty || ""),
    reason: "",
  })
  const transportDays = form.domesticCollectionDays + Number(form.oceanTransitDays || 0) + form.customsClearanceDays
  const totalLeadTime = form.supplierLeadTimeDays ? Number(form.supplierLeadTimeDays) + transportDays : null
  useEffect(() => { if (!shopId) setForm((current) => ({ ...current, shopId: "" })) }, [shopId])
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-md border border-slate-700 bg-slate-950 shadow-2xl">
    <div className="flex items-start justify-between border-b border-slate-800 p-4"><div><h2 className="font-medium">{row === "GLOBAL" ? "全局补货参数" : `SKU 参数 · ${row.sku}`}</h2><p className="mt-1 text-xs text-slate-500">保存后生成新版本，旧版本保留用于追溯。</p></div><button type="button" onClick={onClose} aria-label="关闭"><X className="h-5 w-5 text-slate-400" /></button></div>
    <div className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">作用店铺<select value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm"><option value="">全部巴西店铺</option>{shops.map((shop) => <option key={shop.shopId} value={shop.shopId}>{shop.shopName}</option>)}</select></label>
        <div className="rounded-md border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">生效范围：{form.shopId ? "指定店铺" : "全部店铺"} / {form.variantId ? "指定 SKU" : "全部 SKU"}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3"><NumberField label="销量窗口" value={form.salesWindowDays} min={7} max={30} suffix="天" onChange={(value) => setForm({ ...form, salesWindowDays: value })} /><NumberField label="目标覆盖" value={form.targetCoverageDays} min={7} max={180} suffix="天" onChange={(value) => setForm({ ...form, targetCoverageDays: value })} /><NumberField label="安全库存" value={form.safetyStockDays} min={0} max={90} suffix="天" onChange={(value) => setForm({ ...form, safetyStockDays: value })} /></div>
      <div><div className="mb-2 flex items-center justify-between"><span className="text-sm text-slate-300">交期拆分</span><span className="text-xs text-cyan-300">{totalLeadTime == null ? `产品档案生产周期 + ${transportDays} 天` : `合计 ${totalLeadTime} 天`}</span></div><div className="grid gap-3 sm:grid-cols-4">
        <OptionalNumber label="生产周期" value={form.supplierLeadTimeDays} suffix="天" placeholder="产品档案" onChange={(value) => setForm({ ...form, supplierLeadTimeDays: value })} />
        <NumberField label="国内集货" value={form.domesticCollectionDays} min={0} max={60} suffix="天" onChange={(value) => setForm({ ...form, domesticCollectionDays: value })} />
        <OptionalNumber label="海运时效" value={form.oceanTransitDays} suffix="天" placeholder="必须填写" onChange={(value) => setForm({ ...form, oceanTransitDays: value })} />
        <NumberField label="清关入仓" value={form.customsClearanceDays} min={0} max={60} suffix="天" onChange={(value) => setForm({ ...form, customsClearanceDays: value })} />
      </div></div>
      <div className="grid gap-3 sm:grid-cols-3"><DecimalField label="活动放量系数" value={form.demandMultiplier} min={0.1} max={10} step={0.05} suffix="倍" onChange={(value) => setForm({ ...form, demandMultiplier: value })} /><OptionalNumber label="MOQ 覆盖" value={form.moqOverride} suffix="件" placeholder="产品档案" onChange={(value) => setForm({ ...form, moqOverride: value })} /><OptionalNumber label="装箱数覆盖" value={form.cartonQtyOverride} suffix="件/箱" placeholder="默认箱规" onChange={(value) => setForm({ ...form, cartonQtyOverride: value })} /></div>
      <label className="block text-xs text-slate-400">调整原因<textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="例如：巴西旺季备货，海运时效调整" className="mt-1 min-h-20 w-full rounded-md border border-slate-700 bg-slate-900 p-3 text-sm outline-none focus:border-cyan-500" /></label>
    </div>
    <div className="flex justify-end gap-2 border-t border-slate-800 p-4"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-700 px-4 text-sm">取消</button><button type="button" disabled={saving || !form.reason.trim() || !form.oceanTransitDays} onClick={() => onSave(form)} className="h-9 rounded-md bg-cyan-600 px-4 text-sm text-white disabled:opacity-40">{saving ? "保存中..." : "保存并生效"}</button></div>
  </div></div>
}

function OptionalNumber({ label, value, suffix, placeholder, onChange }: { label: string; value: string; suffix: string; placeholder: string; onChange: (value: string) => void }) { return <label className="text-xs text-slate-400">{label}<div className="relative mt-1"><input type="number" min={1} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 pr-12 text-sm outline-none focus:border-cyan-500" /><span className="absolute right-2 top-2.5 text-xs text-slate-500">{suffix}</span></div></label> }
function DecimalField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) { return <label className="text-xs text-slate-400">{label}<div className="relative mt-1"><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))} className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 pr-10 text-sm outline-none focus:border-cyan-500" /><span className="absolute right-2 top-2.5 text-xs text-slate-500">{suffix}</span></div></label> }

function PolicyHistoryDialog({ onClose }: { onClose: () => void }) {
  const { data, error, isLoading } = useSWR<{ policies: any[] }>("/api/replenishment/policies?country=BR&history=1", fetcher, { revalidateOnFocus: false })
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-md border border-slate-700 bg-slate-950 shadow-2xl">
    <div className="flex items-start justify-between border-b border-slate-800 p-4"><div><h2 className="font-medium">补货参数历史</h2><p className="mt-1 text-xs text-slate-500">所有版本只读保留，采购建议单另存生成时快照。</p></div><button type="button" onClick={onClose} aria-label="关闭"><X className="h-5 w-5 text-slate-400" /></button></div>
    <div className="max-h-[72vh] overflow-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="px-3 py-3">生效范围</th><th className="px-3 py-3">库存策略</th><th className="px-3 py-3">交期拆分</th><th className="px-3 py-3">覆盖参数</th><th className="px-3 py-3">调整信息</th></tr></thead><tbody className="divide-y divide-slate-800">
      {isLoading ? <tr><td colSpan={5} className="h-32 text-center text-slate-500">正在读取历史...</td></tr> : error ? <tr><td colSpan={5} className="h-32 text-center text-rose-300">{error.message}</td></tr> : !data?.policies.length ? <tr><td colSpan={5} className="h-32 text-center text-slate-500">尚未保存过补货参数</td></tr> : data.policies.map((item) => <tr key={item.id} className="align-top"><td className="px-3 py-3"><div>{item.shopId || "全部店铺"}</div><div className="mt-1 text-slate-500">{item.variant?.skuId || "全部 SKU"}</div></td><td className="px-3 py-3">窗口 {item.salesWindowDays}天 · 覆盖 {item.targetCoverageDays}天<br /><span className="text-slate-500">安全 {item.safetyStockDays}天 · 系数 {Number(item.demandMultiplier).toFixed(2)}</span></td><td className="px-3 py-3">{item.supplierLeadTimeDays ?? "产品档案"} / {item.domesticCollectionDays} / {item.oceanTransitDays} / {item.customsClearanceDays} 天</td><td className="px-3 py-3">MOQ {item.moqOverride ?? "产品档案"}<br /><span className="text-slate-500">装箱 {item.cartonQtyOverride ?? "默认箱规"}</span></td><td className="px-3 py-3"><div>{item.reason || "-"}</div><div className="mt-1 text-slate-500">{item.createdBy} · {new Date(item.effectiveFrom).toLocaleString("zh-CN")}</div>{item.effectiveTo && <div className="mt-1 text-amber-300">已于 {new Date(item.effectiveTo).toLocaleString("zh-CN")} 停用</div>}</td></tr>)}
    </tbody></table></div>
  </div></div>
}
