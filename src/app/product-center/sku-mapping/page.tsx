"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import {
  type Product,
  type PlatformSKUMapping,
  addPlatformSKUMapping,
  removePlatformSKUMapping
} from "@/lib/products-store";
import { Search, X, Package, Link2, Download } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

export default function SKUMappingPage() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMappingSubmitting, setIsMappingSubmitting] = useState(false);
  const [mappingForm, setMappingForm] = useState({
    platform: "TikTok" as PlatformSKUMapping["platform"],
    platformSkuId: "",
    platformSkuName: ""
  });
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");

  const { data: productsRaw, mutate: mutateProducts } = useSWR<any>("/api/products?page=1&pageSize=500", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });
  const products = (Array.isArray(productsRaw) ? productsRaw : (productsRaw?.data ?? productsRaw?.list ?? [])) as Product[];

  const productsWithMappings = useMemo(() => {
    let result = products;
    
    // 平台筛选
    if (filterPlatform !== "all") {
      result = result.filter((p) =>
        p.platform_sku_mapping?.some((m) => m.platform === filterPlatform)
      );
    }
    
    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((p) =>
        p.sku_id.toLowerCase().includes(keyword) ||
        p.name.toLowerCase().includes(keyword) ||
        p.platform_sku_mapping?.some((m) =>
          m.platformSkuId.toLowerCase().includes(keyword) ||
          (m.platformSkuName && m.platformSkuName.toLowerCase().includes(keyword))
        )
      );
    }
    
    return result.sort((a, b) => a.sku_id.localeCompare(b.sku_id, "zh-Hans-CN"));
  }, [products, searchKeyword, filterPlatform]);

  // 统计信息
  const mappingStats = useMemo(() => {
    const totalProducts = products.length;
    const mappedProducts = products.filter((p) => p.platform_sku_mapping && p.platform_sku_mapping.length > 0).length;
    const totalMappings = products.reduce((sum, p) => sum + (p.platform_sku_mapping?.length || 0), 0);
    
    // 按平台统计
    const platformCounts: Record<string, number> = {};
    products.forEach((p) => {
      p.platform_sku_mapping?.forEach((m) => {
        platformCounts[m.platform] = (platformCounts[m.platform] || 0) + 1;
      });
    });
    
    return {
      totalProducts,
      mappedProducts,
      unmappedProducts: totalProducts - mappedProducts,
      totalMappings,
      platformCounts
    };
  }, [products]);

  // 获取所有平台列表
  const platforms = useMemo(() => {
    const platformSet = new Set<string>();
    products.forEach((p) => {
      p.platform_sku_mapping?.forEach((m) => {
        platformSet.add(m.platform);
      });
    });
    return Array.from(platformSet).sort();
  }, [products]);

  // 导出映射数据
  const handleExportData = () => {
    if (productsWithMappings.length === 0) {
      toast.error("没有可导出的数据", { icon: "⚠️", duration: 2000 });
      return;
    }

    const headers = [
      "系统SKU",
      "产品名称",
      "平台",
      "平台SKU ID",
      "平台SKU名称"
    ];

    const rows: string[][] = [];
    productsWithMappings.forEach((product) => {
      if (product.platform_sku_mapping && product.platform_sku_mapping.length > 0) {
        product.platform_sku_mapping.forEach((mapping) => {
          rows.push([
            product.sku_id || "",
            product.name || "",
            mapping.platform || "",
            mapping.platformSkuId || "",
            mapping.platformSkuName || ""
          ]);
        });
      } else {
        rows.push([
          product.sku_id || "",
          product.name || "",
          "",
          "",
          ""
        ]);
      }
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `SKU映射_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`已导出 ${rows.length} 条映射数据`);
  };

  const handleOpenMappingModal = (product: Product) => {
    setSelectedProduct(product);
    setMappingForm({
      platform: "TikTok",
      platformSkuId: "",
      platformSkuName: ""
    });
    setIsModalOpen(true);
  };

  const handleAddMapping = async () => {
    if (!selectedProduct) return;
    if (!mappingForm.platformSkuId.trim()) {
      toast.error("请填写平台 SKU ID");
      return;
    }
    const existingMapping = selectedProduct.platform_sku_mapping?.find(
      (m) => m.platform === mappingForm.platform
    );
    if (existingMapping) {
      if (!confirm(`该产品已存在 ${mappingForm.platform} 平台的映射，是否覆盖？`)) return;
    }
    const mapping: PlatformSKUMapping = {
      platform: mappingForm.platform,
      platformSkuId: mappingForm.platformSkuId.trim(),
      platformSkuName: mappingForm.platformSkuName.trim() || undefined
    };
    if (isMappingSubmitting) return;
    setIsMappingSubmitting(true);
    try {
      if (await addPlatformSKUMapping(selectedProduct.sku_id, mapping)) {
        mutateProducts();
        toast.success("映射已添加");
        setMappingForm({ platform: "TikTok", platformSkuId: "", platformSkuName: "" });
        setIsModalOpen(false);
      } else {
        toast.error("添加映射失败");
      }
    } catch (e) {
      console.error("添加映射失败", e);
      toast.error("操作失败，请重试");
    } finally {
      setIsMappingSubmitting(false);
    }
  };

  const handleRemoveMapping = async (product: Product, platform: string) => {
    if (!confirm(`确定要删除 ${platform} 平台的映射吗？`)) return;

    try {
      if (await removePlatformSKUMapping(product.sku_id, platform)) {
        mutateProducts();
        toast.success("映射已删除");
      } else {
        toast.error("删除映射失败");
      }
    } catch (e) {
      console.error("删除映射失败", e);
      toast.error("操作失败，请重试");
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">SKU 映射</h1>
          <p className="mt-1 text-sm text-slate-400">管理产品SKU与各平台SKU的映射关系。</p>
        </div>
        <button
          onClick={handleExportData}
          className="flex items-center gap-2 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 shadow hover:bg-slate-700 active:translate-y-px transition-colors"
        >
          <Download className="h-4 w-4" />
          导出数据
        </button>
      </header>

      {/* 统计面板 */}
      <section className="grid gap-6 md:grid-cols-4">
        {/* 总产品数 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">总产品数</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {mappingStats.totalProducts}
            </div>
          </div>
        </div>

        {/* 已映射产品 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Link2 className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">已映射产品</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {mappingStats.mappedProducts}
            </div>
          </div>
        </div>

        {/* 未映射产品 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #6b7280 0%, #374151 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">未映射产品</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {mappingStats.unmappedProducts}
            </div>
          </div>
        </div>

        {/* 总映射数 */}
        <div
          className="group relative overflow-hidden rounded-2xl border p-6 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <Link2 className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="text-xs font-medium text-white/80 mb-1">总映射数</div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {mappingStats.totalMappings}
            </div>
          </div>
        </div>
      </section>

      {/* 搜索和筛选 */}
      <section className="space-y-3">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索 SKU、产品名称或平台 SKU ID..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 pl-10 pr-10 py-2 text-sm text-slate-300 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
          {searchKeyword && (
            <button
              onClick={() => setSearchKeyword("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 平台筛选 */}
        {platforms.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">平台筛选：</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterPlatform("all")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterPlatform === "all"
                    ? "bg-primary-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                全部
              </button>
              {platforms.map((platform) => (
                <button
                  key={platform}
                  onClick={() => setFilterPlatform(platform)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    filterPlatform === platform
                      ? "bg-primary-500 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {platform} ({mappingStats.platformCounts[platform] || 0})
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 映射列表 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">系统 SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">产品名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">平台映射</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {productsWithMappings.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                    {searchKeyword || filterPlatform !== "all"
                      ? "未找到匹配的产品"
                      : "暂无产品，请先前往产品档案创建产品"}
                  </td>
                </tr>
              ) : (
                productsWithMappings.map((product) => (
                  <tr key={product.sku_id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-100">{product.sku_id}</td>
                    <td className="px-4 py-3 text-slate-200">{product.name}</td>
                    <td className="px-4 py-3">
                      {product.platform_sku_mapping && product.platform_sku_mapping.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {product.platform_sku_mapping.map((mapping, idx) => (
                            <div
                              key={idx}
                              className="group/item flex items-center gap-1.5 rounded-lg bg-primary-500/20 px-3 py-1.5 text-xs border border-primary-500/30 hover:bg-primary-500/30 transition-colors"
                            >
                              <span className="font-medium text-primary-300">{mapping.platform}</span>
                              <span className="text-slate-400">:</span>
                              <span className="text-slate-200 font-mono">{mapping.platformSkuId}</span>
                              {mapping.platformSkuName && (
                                <>
                                  <span className="text-slate-400">-</span>
                                  <span className="text-slate-300 text-xs truncate max-w-[100px]" title={mapping.platformSkuName}>
                                    {mapping.platformSkuName}
                                  </span>
                                </>
                              )}
                              <button
                                onClick={() => handleRemoveMapping(product, mapping.platform)}
                                className="ml-1 text-rose-400 hover:text-rose-300 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                title="删除映射"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs">暂无映射</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenMappingModal(product)}
                        className="rounded-md border border-primary-500/40 px-3 py-1.5 text-xs text-primary-300 hover:bg-primary-500/10 transition-colors"
                      >
                        添加映射
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 添加映射模态框 */}
      {isModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">添加平台 SKU 映射</h2>
                <p className="text-xs text-slate-400 mt-1">
                  产品: {selectedProduct.sku_id} - {selectedProduct.name}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <label className="space-y-1 block">
                <span className="text-slate-300">平台</span>
                <select
                  value={mappingForm.platform}
                  onChange={(e) =>
                    setMappingForm((f) => ({
                      ...f,
                      platform: e.target.value as PlatformSKUMapping["platform"]
                    }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="TikTok">TikTok</option>
                  <option value="Amazon">Amazon</option>
                  <option value="其他">其他</option>
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-slate-300">
                  平台 SKU ID <span className="text-rose-400">*</span>
                </span>
                <input
                  value={mappingForm.platformSkuId}
                  onChange={(e) =>
                    setMappingForm((f) => ({ ...f, platformSkuId: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="输入平台上的 SKU ID"
                  required
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-slate-300">平台 SKU 名称（可选）</span>
                <input
                  value={mappingForm.platformSkuName}
                  onChange={(e) =>
                    setMappingForm((f) => ({ ...f, platformSkuName: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="输入平台上的 SKU 名称"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAddMapping}
                  disabled={isMappingSubmitting}
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isMappingSubmitting ? "处理中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
