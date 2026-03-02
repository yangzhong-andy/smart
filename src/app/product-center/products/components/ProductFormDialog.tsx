"use client";

import type { Product, ProductStatus } from "@/lib/products-store";
import ImageUploader from "@/components/ImageUploader";
import { formatCurrency } from "@/lib/currency-utils";
import { useWeightCalculation } from "@/hooks/use-weight-calculation";
import type { ProductFormState, VariantRow } from "./types";
import { newVariantRow } from "./types";
import {
  VARIANT_COLOR_OPTIONS,
  VARIANT_SIZE_OPTIONS,
  OTHER_LABEL,
  formatNumber,
} from "./constants";
import { Palette, Plus, Trash, TrendingUp } from "lucide-react";

export type ProductFormDialogProps = {
  open: boolean;
  onClose: () => void;
  editingProduct: Product | null;
  form: ProductFormState;
  setForm: React.Dispatch<React.SetStateAction<ProductFormState>>;
  formVariants: VariantRow[];
  setFormVariants: React.Dispatch<React.SetStateAction<VariantRow[]>>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  suppliers: { id: string; name: string }[];
};

export function ProductFormDialog({
  open,
  onClose,
  editingProduct,
  form,
  setForm,
  formVariants,
  setFormVariants,
  onSubmit,
  isSubmitting,
  suppliers,
}: ProductFormDialogProps) {
  const weightCalculation = useWeightCalculation(
    form.length,
    form.width,
    form.height,
    form.volumetric_divisor,
    form.weight_kg
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {editingProduct ? "编辑产品" : "录入产品"}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              填写产品的全维度信息，支持上传主图
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 text-sm">
          {/* 基础信息 */}
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-slate-300">SPU 码</span>
              <input
                value={form.spu_code}
                onChange={(e) => setForm((f) => ({ ...f, spu_code: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="产品层级编码，如 SPU-001"
              />
            </label>
            {editingProduct ? (
              <label className="space-y-1">
                <span className="text-slate-300">SKU 编码 <span className="text-rose-400">*</span></span>
                <input
                  value={form.sku_id}
                  onChange={(e) => setForm((f) => ({ ...f, sku_id: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  required
                  disabled
                />
              </label>
            ) : null}
            <label className="space-y-1">
              <span className="text-slate-300">产品名称 <span className="text-rose-400">*</span></span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">分类</span>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="如：电子产品、服装等"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">品牌</span>
              <input
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="产品品牌"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">材质</span>
              <input
                value={form.material}
                onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                placeholder="如：棉、聚酯纤维等"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">状态</span>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProductStatus }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              >
                <option value="ACTIVE">在售</option>
                <option value="INACTIVE">下架</option>
              </select>
            </label>
          </div>

          {/* 产品描述 */}
          <label className="space-y-1">
            <span className="text-slate-300">产品描述</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              placeholder="产品详细描述..."
              rows={3}
            />
          </label>

          {/* 报关信息 */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-slate-300 font-medium mb-3">报关信息</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-slate-300">报关名（中文）</span>
                <input
                  value={form.customs_name_cn}
                  onChange={(e) => setForm((f) => ({ ...f, customs_name_cn: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="中文报关名称"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-300">报关名（英文）</span>
                <input
                  value={form.customs_name_en}
                  onChange={(e) => setForm((f) => ({ ...f, customs_name_en: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="English Customs Name"
                />
              </label>
            </div>
          </div>

          {/* 默认供应商 */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-slate-300 font-medium mb-3">默认供应商</h3>
            <label className="space-y-1">
              <span className="text-slate-300">默认供应商</span>
              <select
                value={form.default_supplier_id}
                onChange={(e) => setForm((f) => ({ ...f, default_supplier_id: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              >
                <option value="">请选择默认供应商</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                选择该产品的默认供应商（也可通过供应商列表设置主供应商）
              </p>
            </label>
          </div>

          {/* SKU 变体信息：新建时支持多变体，编辑时为单变体 */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-slate-300 font-medium mb-3 flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {editingProduct ? "SKU 变体信息" : "变体列表（可添加多个颜色/规格）"}
            </h3>
            {editingProduct ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  当前变体的规格与库存信息，用于采购与入库区分颜色/尺寸。
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <label className="space-y-1">
                    <span className="text-slate-300">SKU 编码</span>
                    <input
                      value={form.sku_id}
                      readOnly
                      className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-slate-400 cursor-not-allowed"
                      title="变体 SKU 不可修改"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">颜色</span>
                    <select
                      value={VARIANT_COLOR_OPTIONS.includes(form.color) ? form.color : (form.color ? OTHER_LABEL : "")}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value === OTHER_LABEL ? "" : e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    >
                      <option value="">请选择</option>
                      {VARIANT_COLOR_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                    </select>
                    {(!form.color || form.color === OTHER_LABEL || !VARIANT_COLOR_OPTIONS.includes(form.color)) && (
                      <input
                        value={VARIANT_COLOR_OPTIONS.includes(form.color) ? "" : form.color}
                        onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-primary-400"
                        placeholder="自定义颜色"
                      />
                    )}
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">尺寸</span>
                    <select
                      value={VARIANT_SIZE_OPTIONS.includes(form.size) ? form.size : (form.size ? OTHER_LABEL : "")}
                      onChange={(e) => setForm((f) => ({ ...f, size: e.target.value === OTHER_LABEL ? "" : e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    >
                      <option value="">请选择</option>
                      {VARIANT_SIZE_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                    </select>
                    {(!form.size || form.size === OTHER_LABEL || !VARIANT_SIZE_OPTIONS.includes(form.size)) && (
                      <input
                        value={VARIANT_SIZE_OPTIONS.includes(form.size) ? "" : form.size}
                        onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-primary-400"
                        placeholder="自定义尺寸"
                      />
                    )}
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">条形码</span>
                    <input
                      value={form.barcode}
                      onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      placeholder="产品条形码（选填）"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">成本价（元）<span className="text-rose-400">*</span></span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.cost_price}
                      onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-300">总库存数量</span>
                    <input
                      type="number"
                      min={0}
                      value={form.stock_quantity}
                      onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                      placeholder="0"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">每个变体一行，填写颜色、SKU 编码、单价</p>
                  <button
                    type="button"
                    onClick={() => setFormVariants((prev) => [...prev, newVariantRow()])}
                    className="flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                  >
                    <Plus className="h-3 w-3" />
                    添加变体
                  </button>
                </div>
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-800/80">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-400 w-10">#</th>
                        <th className="px-3 py-2 text-left text-slate-400">颜色</th>
                        <th className="px-3 py-2 text-left text-slate-400">SKU 编码 <span className="text-rose-400">*</span></th>
                        <th className="px-3 py-2 text-left text-slate-400">单价(元) <span className="text-rose-400">*</span></th>
                        <th className="px-3 py-2 text-left text-slate-400">尺寸</th>
                        <th className="px-3 py-2 text-left text-slate-400">条形码</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {formVariants.map((row, idx) => (
                        <tr key={row.tempId} className="bg-slate-900/40">
                          <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <select
                              value={VARIANT_COLOR_OPTIONS.includes(row.color) ? row.color : (row.color ? OTHER_LABEL : "")}
                              onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
                              className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs"
                            >
                              <option value="">选择</option>
                              {VARIANT_COLOR_OPTIONS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                              <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                            </select>
                            {row.color && !VARIANT_COLOR_OPTIONS.includes(row.color) && (
                              <input
                                value={row.color}
                                onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value } : r)))}
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                                placeholder="自定义"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.sku_id}
                              onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, sku_id: e.target.value } : r)))}
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                              placeholder="如：mazha-red"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={row.cost_price}
                              onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, cost_price: e.target.value } : r)))}
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-slate-200"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={VARIANT_SIZE_OPTIONS.includes(row.size) ? row.size : (row.size ? OTHER_LABEL : "")}
                              onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
                              className="w-full min-w-0 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 text-xs"
                            >
                              <option value="">选择</option>
                              {VARIANT_SIZE_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                              <option value={OTHER_LABEL}>{OTHER_LABEL}</option>
                            </select>
                            {row.size && !VARIANT_SIZE_OPTIONS.includes(row.size) && (
                              <input
                                value={row.size}
                                onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value } : r)))}
                                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                                placeholder="自定义"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.barcode}
                              onChange={(e) => setFormVariants((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, barcode: e.target.value } : r)))}
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                              placeholder="可选"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {formVariants.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setFormVariants((prev) => prev.filter((r) => r.tempId !== row.tempId))}
                                className="text-slate-400 hover:text-rose-400"
                                title="删除"
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 主图上传（单张约 150KB 内，减小提交体积） */}
          <div>
            <ImageUploader
              value={form.main_image}
              onChange={(value) => setForm((f) => ({ ...f, main_image: value as string }))}
              label="产品主图"
              placeholder="点击上传或直接 Ctrl + V 粘贴图片"
              maxSizeKB={150}
            />
          </div>
          {/* 产品多图（单张约 100KB 内、最多 5 张，避免请求体过大导致提交失败） */}
          <div>
            <ImageUploader
              value={form.gallery_images}
              onChange={(value) => setForm((f) => ({ ...f, gallery_images: Array.isArray(value) ? value : value ? [value] : [] }))}
              label="产品多图"
              multiple
              maxImages={5}
              maxSizeKB={100}
              placeholder="点击上传或 Ctrl+V 粘贴，建议不超过 5 张（用于详情/轮播）"
            />
          </div>

          {/* 财务信息 */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-slate-300 font-medium mb-3">财务信息</h3>
            <div className="grid grid-cols-3 gap-4">
              <label className="space-y-1">
                <span className="text-slate-300">参考拿货价 {editingProduct ? <span className="text-rose-400">*</span> : null}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  required={!!editingProduct}
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-300">目标 ROI (%)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.target_roi}
                  onChange={(e) => setForm((f) => ({ ...f, target_roi: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-300">币种</span>
                <select
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as Product["currency"] }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="CNY">CNY (人民币)</option>
                  <option value="USD">USD (美元)</option>
                  <option value="HKD">HKD (港币)</option>
                  <option value="JPY">JPY (日元)</option>
                  <option value="GBP">GBP (英镑)</option>
                  <option value="EUR">EUR (欧元)</option>
                </select>
              </label>
            </div>
          </div>

          {/* 物理信息 */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="text-slate-300 font-medium mb-3">物理信息（用于计算运费）</h3>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <label className="space-y-1">
                <span className="text-slate-300">实际重量 (kg)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.weight_kg}
                  onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-300">长度 (cm)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.length}
                  onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-300">宽度 (cm)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.width}
                  onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-300">高度 (cm)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.height}
                  onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <label className="space-y-1">
                <span className="text-slate-300">体积重换算系数</span>
                <select
                  value={form.volumetric_divisor}
                  onChange={(e) => setForm((f) => ({ ...f, volumetric_divisor: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                >
                  <option value="5000">5000 (常见)</option>
                  <option value="6000">6000 (部分物流)</option>
                </select>
              </label>
            </div>
            {/* 实时显示计算结果 - 使用 Hook 自动计算 */}
            {weightCalculation.hasValidDimensions && (
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 space-y-2">
                <div className="text-xs text-slate-400 mb-2">重量计算结果：</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">实际重量：</span>
                  <span className="text-slate-200">
                    {weightCalculation.actualWeight > 0
                      ? `${formatNumber(weightCalculation.actualWeight)}kg`
                      : "未填写"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">体积重：</span>
                  <span className="text-slate-200">
                    {formatNumber(weightCalculation.volumetricWeight)}kg
                  </span>
                </div>
                {weightCalculation.formula && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">计算公式：</span>
                    <span className="text-slate-400">
                      {weightCalculation.formula}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-700">
                  <span className="text-slate-300 font-medium">计费重量：</span>
                  <span className="text-primary-300 font-semibold">
                    {formatNumber(weightCalculation.chargeableWeight)}kg
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 供应信息 - 多供应商支持 */}
          <div className="border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-300 font-medium">供应商信息</h3>
              <button
                type="button"
                onClick={() => {
                  const costPrice = form.cost_price ? Number(form.cost_price) : undefined;
                  const newSupplier = {
                    id: "",
                    name: "",
                    price: costPrice && !isNaN(costPrice) ? costPrice : undefined,
                    moq: undefined,
                    lead_time: undefined,
                    isPrimary: form.suppliers.length === 0
                  };
                  setForm((f) => ({
                    ...f,
                    suppliers: [...f.suppliers, newSupplier]
                  }));
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-500/20 text-primary-300 text-xs hover:bg-primary-500/30 transition-colors"
              >
                <Plus className="h-3 w-3" />
                添加供应商
              </button>
            </div>

            {form.suppliers.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-4 border border-slate-800 rounded-lg">
                暂无供应商，点击"添加供应商"开始添加
              </div>
            ) : (
              <>
                {/* 价格对比表格 */}
                {(() => {
                  const validSuppliers = form.suppliers.filter((s) => s.id);
                  return validSuppliers.length > 1;
                })() && (
                  <div className="mb-4 p-4 rounded-lg border border-slate-800 bg-slate-900/50">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-primary-300" />
                      <h4 className="text-sm font-medium text-slate-300">供应商价格对比</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-2 px-3 text-slate-400">供应商</th>
                            <th className="text-right py-2 px-3 text-slate-400">价格</th>
                            <th className="text-right py-2 px-3 text-slate-400">MOQ</th>
                            <th className="text-right py-2 px-3 text-slate-400">交期</th>
                            <th className="text-center py-2 px-3 text-slate-400">主</th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.suppliers
                            .filter((s) => s.id)
                            .sort((a, b) => {
                              if (a.isPrimary && !b.isPrimary) return -1;
                              if (!a.isPrimary && b.isPrimary) return 1;
                              const priceA = a.price || Infinity;
                              const priceB = b.price || Infinity;
                              return priceA - priceB;
                            })
                            .map((supplier, idx) => {
                              const isLowestPrice = form.suppliers
                                .filter((s) => s.id && s.price)
                                .every((s) => !s.price || !supplier.price || s.price >= supplier.price);
                              return (
                                <tr key={idx} className="border-b border-slate-800">
                                  <td className="py-2 px-3">
                                    <span className="text-white">{supplier.name || "未命名"}</span>
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    {supplier.price ? (
                                      <span className={`font-medium ${isLowestPrice ? "text-emerald-300" : "text-slate-300"}`}>
                                        {formatCurrency(supplier.price, form.currency, "balance")}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <span className="text-slate-300">{supplier.moq || "-"}</span>
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <span className="text-slate-300">{supplier.lead_time ? `${supplier.lead_time}天` : "-"}</span>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {supplier.isPrimary && (
                                      <span className="px-1.5 py-0.5 rounded text-xs bg-primary-500/20 text-primary-300">
                                        主
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {form.suppliers.map((supplier, index) => (
                      <div key={index} className="p-4 rounded-lg border border-slate-800 bg-slate-900/50">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {supplier.isPrimary && (
                              <span className="px-2 py-0.5 rounded text-xs bg-primary-500/20 text-primary-300">
                                主供应商
                              </span>
                            )}
                            <span className="text-sm text-slate-400">供应商 #{index + 1}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setForm((f) => ({
                                  ...f,
                                  suppliers: f.suppliers.map((s, i) =>
                                    i === index ? { ...s, isPrimary: !s.isPrimary } : { ...s, isPrimary: false }
                                  )
                                }));
                              }}
                              className={`px-2 py-1 rounded text-xs transition-colors ${
                                supplier.isPrimary
                                  ? "bg-primary-500/20 text-primary-300"
                                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                              }`}
                            >
                              设为主供应商
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setForm((f) => ({
                                  ...f,
                                  suppliers: f.suppliers.filter((_, i) => i !== index)
                                }));
                              }}
                              className="p-1.5 rounded text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                              <Trash className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="space-y-1">
                            <span className="text-xs text-slate-400">供应商</span>
                            <select
                              value={supplier.id}
                              onChange={(e) => {
                                const selected = suppliers.find((s) => s.id === e.target.value);
                                setForm((f) => ({
                                  ...f,
                                  suppliers: f.suppliers.map((s, i) =>
                                    i === index
                                      ? { ...s, id: e.target.value, name: selected?.name || "" }
                                      : s
                                  )
                                }));
                              }}
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                            >
                              <option value="">请选择供应商</option>
                              {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-slate-400">拿货价</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={supplier.price || ""}
                              onChange={(e) => {
                                setForm((f) => ({
                                  ...f,
                                  suppliers: f.suppliers.map((s, i) =>
                                    i === index ? { ...s, price: e.target.value ? Number(e.target.value) : undefined } : s
                                  )
                                }));
                              }}
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                              placeholder="自动使用产品参考价"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-slate-400">最小起订量 (MOQ)</span>
                            <input
                              type="number"
                              min={0}
                              value={supplier.moq || ""}
                              onChange={(e) => {
                                setForm((f) => ({
                                  ...f,
                                  suppliers: f.suppliers.map((s, i) =>
                                    i === index ? { ...s, moq: e.target.value ? Number(e.target.value) : undefined } : s
                                  )
                                }));
                              }}
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-slate-400">生产周期 (天)</span>
                            <input
                              type="number"
                              min={0}
                              value={supplier.lead_time || ""}
                              onChange={(e) => {
                                setForm((f) => ({
                                  ...f,
                                  suppliers: f.suppliers.map((s, i) =>
                                    i === index ? { ...s, lead_time: e.target.value ? Number(e.target.value) : undefined } : s
                                  )
                                }));
                              }}
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                            />
                          </label>
                        </div>
                      </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? (editingProduct ? "更新中..." : "保存中...") : (editingProduct ? "更新" : "保存")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
