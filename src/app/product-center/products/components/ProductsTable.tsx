"use client";

import { Package, Pencil, Trash2, Palette, ZoomIn } from "lucide-react";
import type { Product, ProductStatus, SpuListItem } from "@/lib/products-store";
import { PRODUCT_STATUS_LABEL } from "@/lib/enum-mapping";
import { formatCurrency, formatCurrencyString } from "@/lib/currency-utils";
import { getColorDotStyle } from "./constants";

type ProductsTableProps = {
  filteredSpuList: SpuListItem[];
  variantCache: Record<string, Product[]>;
  expandedSpuId: string | null;
  setExpandedSpuId: (id: string | null) => void;
  loadingSpuId: string | null;
  loadVariantsForSpu: (productId: string) => Promise<Product[]>;
  onEditProduct: (product: Product) => void;
  onDeleteSku: (skuId: string) => void;
  onDeleteSpu: (productId: string) => void;
  onOpenAddVariant: (spu: SpuListItem) => void;
  onPreviewImages: (images: string[], index: number) => void;
};

export function ProductsTable({
  filteredSpuList,
  variantCache,
  expandedSpuId,
  setExpandedSpuId,
  loadingSpuId,
  loadVariantsForSpu,
  onEditProduct,
  onDeleteSku,
  onDeleteSpu,
  onOpenAddVariant,
  onPreviewImages
}: ProductsTableProps) {
  return (
    <section>
      {filteredSpuList.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <p className="text-slate-500">暂无产品，请点击右上角"录入产品"</p>
        </div>
      ) : (
        <div
          className="grid gap-6"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "24px",
            alignItems: "start"
          }}
        >
          {filteredSpuList.map((spu) => {
            const variants = variantCache[spu.productId] ?? [];
            const isExpanded = expandedSpuId === spu.productId;
            const isLoading = loadingSpuId === spu.productId;
            const prices = variants.map((v) => Number((v as Product).cost_price ?? 0)).filter((n) => n > 0);
            const priceRange: string | null =
              prices.length === 0
                ? null
                : prices.length === 1
                  ? formatCurrencyString(prices[0], "CNY")
                  : `${formatCurrencyString(Math.min(...prices), "CNY")} ~ ${formatCurrencyString(Math.max(...prices), "CNY")}`;

            const productId = spu.productId;
            return (
              <div
                key={productId}
                className="group relative overflow-hidden rounded-2xl border p-5 transition-all"
                style={{
                  background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.1)"
                }}
                data-product-id={productId}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="mb-4 cursor-pointer rounded-lg outline-none focus:ring-2 focus:ring-primary-500/50"
                  data-product-id={productId}
                  onClick={(e) => {
                    const id = (e.currentTarget as HTMLElement).getAttribute("data-product-id");
                    if (!id) return;
                    setExpandedSpuId(id);
                    loadVariantsForSpu(id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const id = (e.currentTarget as HTMLElement).getAttribute("data-product-id");
                    if (!id) return;
                    setExpandedSpuId(id);
                    loadVariantsForSpu(id);
                  }}
                >
                  <div className="relative h-48 bg-slate-800 rounded-lg overflow-hidden">
                    {spu.mainImage ? (
                      <a href={spu.mainImage} target="_blank" rel="noreferrer" className="block w-full h-full" onClick={(e) => e.stopPropagation()}>
                        <img src={spu.mainImage} alt={spu.name} className="w-full h-full object-cover" />
                      </a>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Package className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                      {spu.mainImage && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const loaded = variants.length ? variants : await loadVariantsForSpu(spu.productId);
                            const first = loaded[0] as (Product & { gallery_images?: string[] }) | undefined;
                            const gallery = Array.isArray(first?.gallery_images) ? first.gallery_images : [];
                            const list = [spu.mainImage!, ...gallery.filter((url) => url && url !== spu.mainImage)];
                            onPreviewImages(list, 0);
                          }}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-black/40 text-white hover:bg-black/60 border border-white/20"
                          title="查看图片"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                          查看图片
                        </button>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          spu.status === "ACTIVE" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700/50 text-slate-400"
                        }`}
                      >
                        {PRODUCT_STATUS_LABEL[(spu.status as ProductStatus) ?? "ACTIVE"]}
                      </span>
                    </div>
                  </div>

                  <div className="absolute top-3 right-3 flex flex-wrap gap-2 z-30">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAddVariant(spu);
                      }}
                      className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20"
                      title="添加变体"
                    >
                      <Palette className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const loaded = variants.length ? variants : await loadVariantsForSpu(spu.productId);
                        if (loaded.length > 0) {
                          onEditProduct(loaded[0] as Product);
                        } else {
                          onOpenAddVariant(spu);
                        }
                      }}
                      className="flex items-center gap-1 rounded-md border border-primary-500/40 bg-primary-500/10 px-2 py-1 text-xs font-medium text-primary-100 hover:bg-primary-500/20"
                      title="编辑"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSpu(spu.productId);
                      }}
                      className="flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-100 hover:bg-rose-500/20"
                      title="删除产品及全部变体"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="mb-3 mt-1">
                    <h3 className="font-semibold text-white text-base mb-1">{spu.name}</h3>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-400">价格范围</span>
                      <span className="text-emerald-300 font-medium text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {priceRange ?? (isLoading ? "加载中…" : "点击卡片加载规格")}
                      </span>
                    </div>
                    {spu.category && (
                      <p className="text-xs text-slate-400">分类：{spu.category}</p>
                    )}
                  </div>
                </div>

                {expandedSpuId === productId && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-slate-400 mb-2">规格选择</p>
                    {!variants.length && !isLoading && (
                      <button
                        type="button"
                        data-product-id={productId}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const id = (e.currentTarget as HTMLElement).getAttribute("data-product-id");
                          if (!id) return;
                          setExpandedSpuId(id);
                          loadVariantsForSpu(id);
                        }}
                        className="text-xs text-primary-400 hover:text-primary-300"
                      >
                        展开加载规格
                      </button>
                    )}
                    {isLoading && <span className="text-xs text-slate-500">加载中…</span>}
                    {variants.length > 0 && (
                      <>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {variants.slice(0, 5).map((v) => (
                            <span
                              key={v.sku_id}
                              className="w-5 h-5 rounded-full border flex-shrink-0"
                              style={getColorDotStyle((v as Product).color)}
                              title={(v as Product).color || v.sku_id}
                            />
                          ))}
                          <button
                            type="button"
                            data-product-id={productId}
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = (e.currentTarget as HTMLElement).getAttribute("data-product-id");
                              setExpandedSpuId(isExpanded ? null : (id ?? productId));
                            }}
                            className="text-xs text-primary-400 hover:text-primary-300"
                          >
                            {isExpanded ? "收起" : "展开"}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border border-slate-700 rounded">
                              <thead>
                                <tr className="bg-slate-800/80">
                                  <th className="px-2 py-1.5 text-left text-slate-400">颜色</th>
                                  <th className="px-2 py-1.5 text-left text-slate-400">SKU</th>
                                  <th className="px-2 py-1.5 text-right text-slate-400">单价</th>
                                  <th className="px-2 py-1.5 text-right text-slate-400">库存</th>
                                  <th className="px-2 py-1.5 w-20"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {variants.map((v) => (
                                  <tr key={v.sku_id} className="border-t border-slate-700">
                                    <td className="px-2 py-1.5 text-slate-200">{(v as Product).color || "—"}</td>
                                    <td className="px-2 py-1.5 text-slate-400 font-mono">{v.sku_id}</td>
                                    <td className="px-2 py-1.5 text-right text-slate-200">
                                      {formatCurrency(Number((v as Product).cost_price ?? 0), (v as Product).currency ?? "CNY", "balance")}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-slate-200">{(v as Product).stock_quantity ?? 0}</td>
                                    <td className="px-2 py-1.5 flex gap-1">
                                      <button type="button" onClick={() => onEditProduct(v as Product)} className="text-primary-400 hover:underline">编辑</button>
                                      <button type="button" onClick={() => onDeleteSku(v.sku_id)} className="text-rose-400 hover:underline">删除</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
