"use client";

import type { Product } from "@/lib/products-store";
import { formatCurrency } from "@/lib/currency-utils";
import { formatNumber } from "./constants";
import { PRODUCT_STATUS_LABEL } from "@/lib/enum-mapping";

type ProductDetailDialogProps = {
  product: Product | null;
  onClose: () => void;
};

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

export function ProductDetailDialog({ product, onClose }: ProductDetailDialogProps) {
  if (!product) return null;

  const currency = product.currency ?? "CNY";
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-slate-200 text-sm">{value ?? "—"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-label="产品详情">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">产品详情</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="text-slate-400 font-medium mb-2">基础信息</h3>
            <div className="space-y-0">
              {row("SKU 编码", product.sku_id)}
              {row("产品名称", product.name)}
              {row("分类", product.category)}
              {row("品牌", product.brand)}
              {row("状态", PRODUCT_STATUS_LABEL[product.status ?? "ACTIVE"])}
              {row("材质", product.material)}
              {row("描述", product.description)}
            </div>
          </div>
          <div>
            <h3 className="text-slate-400 font-medium mb-2">变体 / 规格</h3>
            <div className="space-y-0">
              {row("颜色", product.color)}
              {row("尺寸", product.size)}
              {row("条形码", product.barcode)}
              {row("库存", product.stock_quantity)}
            </div>
          </div>
          <div>
            <h3 className="text-slate-400 font-medium mb-2">财务信息</h3>
            <div className="space-y-0">
              {row("拿货价", formatCurrency(Number(product.cost_price ?? 0), currency, "balance"))}
              {row("目标 ROI (%)", product.target_roi != null ? formatNumber(product.target_roi) : "—")}
              {row("币种", product.currency)}
            </div>
          </div>
          <div>
            <h3 className="text-slate-400 font-medium mb-2">物理信息</h3>
            <div className="space-y-0">
              {row("重量 (kg)", product.weight_kg != null ? formatNumber(product.weight_kg) : "—")}
              {row("长×宽×高 (cm)", [product.length, product.width, product.height].every((n) => n != null) ? `${product.length} × ${product.width} × ${product.height}` : "—")}
              {row("体积重系数", product.volumetric_divisor ?? "—")}
            </div>
          </div>
          <div>
            <h3 className="text-slate-400 font-medium mb-2">供应信息</h3>
            <div className="space-y-0">
              {row("主供应商", product.factory_name ?? product.default_supplier_name)}
              {row("MOQ", product.moq != null ? String(product.moq) : "—")}
              {row("生产周期 (天)", product.lead_time != null ? String(product.lead_time) : "—")}
            </div>
          </div>
          <div>
            <h3 className="text-slate-400 font-medium mb-2">时间</h3>
            <div className="space-y-0">
              {row("创建时间", formatDate(product.createdAt))}
              {row("更新时间", formatDate(product.updatedAt))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
