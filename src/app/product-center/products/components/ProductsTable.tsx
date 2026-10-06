"use client";
import React, { useState } from "react";
import { Package, Plus, ChevronDown, ChevronRight, Copy, Pencil, LayoutGrid, List, Image as ImageIcon } from "lucide-react";
import type { Product, SpuListItem } from "@/lib/products-store";
import { productMatchesGroup, skuMatchesKeyword, incompleteSku } from "@/lib/product-workspace";
type ProductsTableProps = {
  filteredSpuList: SpuListItem[];
  variantCache: Record<string, Product[]>;
  expandedSpuId: string | null;
  setExpandedSpuId: (id: string | null) => void;
  loadingSpuId: string | null;
  loadVariantsForSpu: (productId: string, force?: boolean) => Promise<Product[]>;
  onEditProduct: (product: Product) => void;
  onDeleteSku: (skuId: string) => void;
  onDeleteSpu: (productId: string) => void;
  onOpenAddVariant: (spu: SpuListItem) => void;
  onPreviewImages: (images: string[], index: number) => void;
  onCopySku?: (spu: SpuListItem, product: Product) => void;
  searchKeyword?: string;
  variantErrors?: Record<string, string>;
};
const money = (value: number, currency: string) => {
  try { return new Intl.NumberFormat("zh-CN", { style: "currency", currency, minimumFractionDigits: 2 }).format(value); }
  catch { return value.toFixed(2) + " " + currency; }
};
const number = (value: number | null | undefined, suffix = "") => value == null ? "—" : value.toLocaleString("zh-CN") + suffix;
export function ProductsTable(props: ProductsTableProps) {
  const [view, setView] = useState<"list" | "cards">("cards");
  const { filteredSpuList, variantCache, expandedSpuId, setExpandedSpuId, loadingSpuId, loadVariantsForSpu, onOpenAddVariant, onEditProduct, onDeleteSpu, onDeleteSku, onPreviewImages, onCopySku, searchKeyword = "", variantErrors = {} } = props;
  const open = (spu: SpuListItem) => {
    const next = expandedSpuId === spu.productId ? null : spu.productId;
    setExpandedSpuId(next);
    if (next) void loadVariantsForSpu(next);
  };
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold text-slate-200">SKU 工作台 <span className="ml-2 font-normal text-slate-500">{filteredSpuList.length} 个产品</span></h2><p className="mt-1 text-xs text-slate-500">公共资料归产品，规格与成本归 SKU；物流参数可稍后补充。</p></div>
      <div className="flex rounded-lg border border-slate-700 p-1">
        <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={"flex items-center gap-1.5 rounded px-3 py-1.5 text-xs " + (view === "list" ? "bg-slate-700 text-white" : "text-slate-400")}><List className="h-4 w-4" />明细视图</button>
        <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")} className={"flex items-center gap-1.5 rounded px-3 py-1.5 text-xs " + (view === "cards" ? "bg-slate-700 text-white" : "text-slate-400")}><LayoutGrid className="h-4 w-4" />卡片视图</button>
      </div>
    </div>
    {!filteredSpuList.length && <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-sm text-slate-400">没有匹配的产品。可调整筛选，或点击右上角“新建产品”。</div>}
    <div className={view === "cards" ? "grid items-start gap-6" : "space-y-4"} style={view === "cards" ? { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" } : undefined}>
      {filteredSpuList.map(spu => {
        const variants = variantCache[spu.productId] ?? [];
        const isExpanded = spu.productId === expandedSpuId;
        const isLoading = spu.productId === loadingSpuId;
        const error = variantErrors[spu.productId];
        const visible = productMatchesGroup(spu, searchKeyword) ? variants : variants.filter(row => skuMatchesKeyword(row, searchKeyword));
        const mainImage = spu.mainImage && spu.mainImage !== "[base64]" ? spu.mainImage : variants.find(row => row.main_image && row.main_image !== "[base64]")?.main_image;
        const missing = (spu.skuIndex ?? []).filter(incompleteSku).length;
        const costs = new Map<string, number[]>();
        for (const sku of spu.skuIndex ?? variants) {
          if (sku.cost_price == null || !Number.isFinite(sku.cost_price)) continue;
          const values = costs.get(sku.currency) ?? [];
          values.push(sku.cost_price);
          costs.set(sku.currency, values);
        }
        const costSummary = Array.from(costs, ([currency, values]) => {
          const low = Math.min(...values), high = Math.max(...values);
          return low === high ? money(low, currency) : `${money(low, currency)} ~ ${money(high, currency)}`;
        });
        const preview = async () => {
          const loaded = variants.length ? variants : await loadVariantsForSpu(spu.productId);
          const first = loaded.find(row => row.main_image) ?? loaded[0];
          const image = mainImage || first?.main_image;
          const rawGallery = (first as (Product & { gallery_images?: string[] }) | undefined)?.gallery_images;
          const gallery = Array.isArray(rawGallery) ? rawGallery : [];
          const images = Array.from(new Set([image, ...gallery].filter((url): url is string => Boolean(url) && url !== "[base64]")));
          if (images.length) onPreviewImages(images, 0);
        };
        return <article key={spu.productId} data-product-id={spu.productId} className={view === "cards" ? "min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-blue-900 to-slate-900 shadow-lg transition-colors hover:border-cyan-400/40" : "min-w-0 rounded-xl border border-slate-700/80 bg-slate-900/60"}>
          {view === "cards" ? <div className="p-5" data-card-layout="image-first">
            <div className="relative mb-4 overflow-hidden rounded-xl bg-slate-800">
              <button type="button" aria-label={"查看 " + spu.name + " 图片"} disabled={!mainImage && !spu.mainImage} onClick={() => void preview()} className="flex h-48 w-full items-center justify-center bg-white/95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                {mainImage ? <img src={mainImage} alt={spu.name} className="h-full w-full object-contain p-2" /> : <Package className="h-12 w-12 text-slate-400" />}
              </button>
              <span className={"pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium " + (spu.status === "ACTIVE" ? "bg-emerald-950/90 text-emerald-300" : "bg-slate-900/90 text-slate-300")}>{spu.status === "ACTIVE" ? "在售" : "下架"}</span>
            </div>
            <button type="button" onClick={() => open(spu)} aria-expanded={isExpanded} className="w-full text-left">
              <div className="flex items-start justify-between gap-3"><h3 className="text-base font-semibold text-white">{spu.name}</h3><span className="shrink-0 rounded-full bg-cyan-500/15 px-2 py-1 text-[11px] text-cyan-200">{spu.variantCount} 个 SKU</span></div>
              <p className="mt-1.5 truncate text-xs text-slate-400" title={spu.spuCode}>{spu.spuCode || "未设置产品编码"} · {spu.category || "未分类"}</p>
            </button>
            <div className="mt-4 flex items-start justify-between gap-3 border-t border-white/10 pt-3"><span className="shrink-0 text-xs text-slate-400">参考成本</span><div className="text-right text-sm font-medium tabular-nums text-emerald-300">{costSummary.length ? costSummary.map(value => <div key={value}>{value}</div>) : <span className="text-xs text-slate-400">待填写</span>}</div></div>
            <p className="mt-3 truncate text-xs text-slate-400" title={spu.suppliers?.map(s => s.name).join(" / ")}>{spu.suppliers?.length ? spu.suppliers.map(s => s.name).join(" / ") : "未关联供应商"}</p>
            {missing > 0 && <p className="mt-2 text-xs text-amber-300/90">{missing} 个 SKU 资料待完善</p>}
            <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
              <button type="button" onClick={() => onOpenAddVariant(spu)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"><Plus className="h-3.5 w-3.5" />新增 SKU</button>
              <button type="button" onClick={() => open(spu)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/5">{isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{isExpanded ? "收起明细" : "查看 SKU"}</button>
              <details className="relative text-xs"><summary className="cursor-pointer list-none rounded-lg px-2 py-2 text-slate-400" aria-label={"更多操作 " + spu.name}>•••</summary><div className="absolute bottom-full right-0 z-20 mb-2 w-40 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl"><button type="button" onClick={() => onDeleteSpu(spu.productId)} className="w-full rounded px-2 py-2 text-left text-rose-300 hover:bg-rose-500/10">删除产品及全部 SKU</button></div></details>
            </div>
          </div> : <>
          <div className="flex flex-wrap items-center gap-4 p-4">
            <button type="button" aria-label={"查看 " + spu.name + " 图片"} disabled={!mainImage} onClick={() => mainImage && onPreviewImages([mainImage], 0)} className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-white/5">
              {mainImage ? <img src={mainImage} alt={spu.name} className="h-full w-full object-contain" /> : <Package className="h-6 w-6 text-slate-500" />}
            </button>
            <button type="button" onClick={() => open(spu)} aria-expanded={isExpanded} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-100">{spu.name}</h3><span className={"rounded px-2 py-0.5 text-[11px] " + (spu.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700 text-slate-400")}>{spu.status === "ACTIVE" ? "在售" : "下架"}</span><span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">{spu.variantCount} 个 SKU</span></div>
              <p className="mt-1 text-xs text-slate-400">{spu.spuCode || "未设置产品编码"} · {spu.category || "未分类"}</p>
              <p className="mt-1 text-xs text-slate-500">{spu.suppliers?.length ? spu.suppliers.map(s => s.name).join(" / ") : "未关联供应商"}{missing > 0 && <span className="ml-3 text-amber-300/80">{missing} 个 SKU 资料待完善</span>}</p>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onOpenAddVariant(spu)} className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"><Plus className="h-3.5 w-3.5" />新增 SKU</button>
              <button type="button" onClick={() => open(spu)} className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">{isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{isExpanded ? "收起明细" : "查看 SKU"}</button>
              <details className="relative text-xs"><summary className="cursor-pointer list-none rounded-lg px-2 py-2 text-slate-500" aria-label={"更多操作 " + spu.name}>•••</summary><div className="absolute right-0 z-20 w-40 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl"><button type="button" onClick={() => onDeleteSpu(spu.productId)} className="w-full rounded px-2 py-2 text-left text-rose-300 hover:bg-rose-500/10">删除产品及全部 SKU</button></div></details>
            </div>
          </div>
          </>}
          {isExpanded && <div className="border-t border-slate-800">
            {isLoading && <p role="status" className="px-5 py-4 text-sm text-slate-400">正在加载 SKU 明细…</p>}
            {error && <div role="alert" className="flex items-center justify-between gap-2 bg-rose-500/5 px-5 py-4 text-sm text-rose-200"><span>{error}；已有行可能不是最新资料。</span><button type="button" disabled={isLoading} onClick={() => void loadVariantsForSpu(spu.productId, true)} className="underline">重新加载</button></div>}
            {!isLoading && !error && !variants.length && <div className="px-5 py-6 text-sm text-slate-400">此产品还没有 SKU，点击“新增 SKU”开始录入。</div>}
            {variants.length > 0 && view === "cards" && <div className="divide-y divide-white/10 px-5" data-card-sku-details="compact">
              {visible.map(v => {
                const indexed = spu.skuIndex?.find(row => row.sku_id === v.sku_id);
                return <div key={v.variant_id ?? v.sku_id} className="py-3">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="break-words font-mono text-xs font-medium text-slate-100">{v.sku_id}</div><p className="mt-1 text-xs text-slate-400">{[v.size, v.color].filter(Boolean).join(" · ") || "规格说明待补充"}</p></div><span className="shrink-0 text-xs tabular-nums text-emerald-300">{indexed && indexed.cost_price == null ? "待填写" : money(v.cost_price, v.currency)}</span></div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-slate-400" title="产品档案库存仅供查看；仓库明细请在库存中心查看">档案库存：{number(v.stock_quantity)}</span><div className="flex items-center gap-3"><button type="button" onClick={() => onEditProduct(v)} className="text-cyan-300">编辑</button>{onCopySku && <button type="button" onClick={() => onCopySku(spu, v)} className="text-slate-200">复制 SKU</button>}<button type="button" onClick={() => onDeleteSku(v.sku_id)} className="text-slate-500 hover:text-rose-300">删除</button></div></div>
                </div>;
              })}
              {!visible.length && <p className="py-4 text-xs text-slate-400">本产品中没有匹配的 SKU。</p>}
            </div>}
            {variants.length > 0 && view === "list" && <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-xs">
                <thead className="bg-slate-950/50 text-slate-400"><tr>{["图片", "SKU 编码 / 规格", "颜色", "参考成本", "重量 / 长×宽×高", "档案库存", "资料状态", "操作"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {visible.map(v => {
                    const indexed = spu.skuIndex?.find(row => row.sku_id === v.sku_id);
                    const missingFields = [
                      ...(indexed && indexed.cost_price == null ? ["成本"] : []),
                      ...(!v.weight_kg ? ["重量"] : []),
                      ...(!v.length || !v.width || !v.height ? ["长宽高"] : []),
                    ];
                    return <tr key={v.variant_id ?? v.sku_id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3"><div title="图片沿用产品主图" className="flex h-10 w-10 items-center justify-center overflow-hidden rounded border border-slate-700 bg-white/5">{mainImage ? <img src={mainImage} alt={v.sku_id + "（产品主图）"} className="h-full w-full object-contain" /> : <ImageIcon className="h-4 w-4 text-slate-500" />}</div></td>
                      <td className="px-4 py-3"><div className="font-mono font-medium text-slate-100">{v.sku_id}</div><div className="mt-1 text-slate-500">{v.size || "规格说明待补充"}</div></td>
                      <td className="px-4 py-3 text-slate-300">{v.color || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-200">{indexed && indexed.cost_price == null ? "待填写" : money(v.cost_price, v.currency)}<div className="mt-1 text-[11px] text-slate-500">{v.currency}</div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300"><div>{number(v.weight_kg, " kg")}</div><div className="mt-1 text-slate-500">{number(v.length)} × {number(v.width)} × {number(v.height)} cm</div></td>
                      <td className="px-4 py-3 tabular-nums text-slate-300" title="沿用现有产品档案库存字段，只读；仓库明细请在库存中心查看">{number(v.stock_quantity)}</td>
                      <td className="px-4 py-3"><span title={missingFields.join("、")} className={missingFields.length ? "text-amber-300/90" : "text-emerald-300/90"}>{missingFields.length ? "待补：" + missingFields.join("、") : "基础资料齐全"}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-3 whitespace-nowrap"><button type="button" onClick={() => onEditProduct(v)} className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200"><Pencil className="h-3 w-3" />编辑</button>{onCopySku && <button type="button" onClick={() => onCopySku(spu, v)} className="flex items-center gap-1 text-slate-300 hover:text-white"><Copy className="h-3 w-3" />复制 SKU</button>}<button type="button" onClick={() => onDeleteSku(v.sku_id)} className="text-slate-500 hover:text-rose-300">删除</button></div></td>
                    </tr>;
                  })}
                  {!visible.length && <tr><td colSpan={8} className="p-5 text-center text-slate-500">本产品中没有匹配的 SKU。</td></tr>}
                </tbody>
              </table>
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/30 px-4 py-3 text-xs text-slate-500"><span>图片沿用产品主图 · 档案库存仅供查看 · 箱规在“编辑”内维护</span><button type="button" onClick={() => onOpenAddVariant(spu)} className="flex items-center gap-1 text-cyan-300"><Plus className="h-3.5 w-3.5" />继续添加 SKU</button></div>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
