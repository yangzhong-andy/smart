"use client";

import { Package, FileImage, Palette, X, Search } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import DateInput from "@/components/DateInput";
import { currency } from "./types";
import type { FormItemRow, Supplier } from "./types";

export type CreateFormState = {
  supplierId: string;
  deliveryDate: string;
  contractNumber: string;
  contractVoucher: string | string[];
};

export type SpuOption = {
  productId: string;
  name: string;
  variants: Array<{ sku_id?: string; color?: string; cost_price?: number }>;
};

type PurchaseOrderLike = {
  orderNumber: string;
  createdBy?: string;
  platform?: string;
  quantity?: number;
};

interface PurchaseOrderCreateDialogProps {
  open: boolean;
  onClose: () => void;
  sourceOrder: PurchaseOrderLike | null;
  form: CreateFormState;
  setForm: React.Dispatch<React.SetStateAction<CreateFormState>>;
  formItems: FormItemRow[];
  setFormItems: React.Dispatch<React.SetStateAction<FormItemRow[]>>;
  contractNumberFormat: string;
  setContractNumberFormatAndSave: (v: string) => void;
  generateContractNumber: () => string;
  suppliers: Supplier[];
  totalAmount: number;
  depositPreview: number;
  selectedSupplier: Supplier | null;
  onOpenVariantModal: () => void;
  variantModalOpen: boolean;
  onCloseVariantModal: () => void;
  variantModalSupplierId: string | null;
  variantModalProductIds: string[] | null;
  variantModalSpuOptions: SpuOption[];
  selectedSpuContract: SpuOption | null;
  onSelectSpuInModal: (spu: SpuOption) => void;
  variantSearchContract: string;
  setVariantSearchContract: (v: string) => void;
  variantQuantities: Record<string, string>;
  setVariantQuantities: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  loadingSpuId: string | null;
  onConfirmVariantSelection: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isCreateSaving: boolean;
}

export function PurchaseOrderCreateDialog({
  open,
  onClose,
  sourceOrder,
  form,
  setForm,
  formItems,
  setFormItems,
  contractNumberFormat,
  setContractNumberFormatAndSave,
  generateContractNumber,
  suppliers,
  totalAmount,
  depositPreview,
  selectedSupplier,
  onOpenVariantModal,
  variantModalOpen,
  onCloseVariantModal,
  variantModalSupplierId,
  variantModalProductIds,
  variantModalSpuOptions,
  selectedSpuContract,
  onSelectSpuInModal,
  variantSearchContract,
  setVariantSearchContract,
  variantQuantities,
  setVariantQuantities,
  loadingSpuId,
  onConfirmVariantSelection,
  onSubmit,
  isCreateSaving,
}: PurchaseOrderCreateDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {sourceOrder ? "基于采购订单创建合同" : "新建采购合同"}
            </h2>
            <p className="text-xs text-slate-400">
              {sourceOrder
                ? `订单：${sourceOrder.orderNumber} · 已自动填充产品信息`
                : "选定供应商后，系统会根据其定金比例自动计算需要预付的定金。"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {sourceOrder && (
          <div className="mb-4 p-3 rounded-lg border border-primary-500/30 bg-primary-500/10">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-primary-400" />
              <span className="text-sm font-medium text-primary-300">来源订单信息</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div>订单编号：{sourceOrder.orderNumber}</div>
              <div>下单人：{sourceOrder.createdBy ?? ""}</div>
              <div>平台：{sourceOrder.platform ?? ""}</div>
              <div>需求数量：{sourceOrder.quantity ?? ""}</div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-4 text-sm">
          <div className="space-y-1">
            <span className="text-slate-300">编号格式（可选）</span>
            <input
              type="text"
              value={contractNumberFormat}
              onChange={(e) => setContractNumberFormatAndSave(e.target.value)}
              placeholder="如 SDFY-2026-  留空则用 PC-"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
            <p className="text-xs text-slate-500">
              自动生成时使用「格式+时间戳」，例如 SDFY-2026-1738765432123；会记住您的设置。
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-300">合同编号</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.contractNumber}
                onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
                placeholder="留空则按编号格式自动生成"
                className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, contractNumber: generateContractNumber() }))
                }
                className="shrink-0 rounded-md border border-primary-500/50 bg-primary-500/10 px-3 py-2 text-xs font-medium text-primary-200 hover:bg-primary-500/20"
              >
                自动生成
              </button>
            </div>
            <p className="text-xs text-slate-500">
              可手动填写编号，或点击「自动生成」按当前格式生成；不填则保存时自动生成。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-slate-300">供应商</span>
              <select
                value={form.supplierId || selectedSupplier?.id || ""}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                required
              >
                <option value="" disabled>请选择</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（定金 {s.depositRate}%，账期 {s.tailPeriodDays} 天）
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">交货日期</span>
              <DateInput
                value={form.deliveryDate}
                onChange={(v) => setForm((f) => ({ ...f, deliveryDate: v }))}
                placeholder="选择交货日期"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
              <p className="text-xs text-slate-500 mt-1">用于跟进生产进度，建议设置</p>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-slate-300 font-medium">物料明细</span>
              <button
                type="button"
                onClick={onOpenVariantModal}
                className="flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
              >
                <Palette className="h-3 w-3" />
                按产品原型选变体
              </button>
            </div>
            <p className="text-xs text-slate-500">
              先选产品原型（如马扎05），再为各颜色填写数量，可一次生成多行。
            </p>
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              {formItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 bg-slate-900/40 text-slate-400 text-sm">
                  <Palette className="h-8 w-8 text-slate-500" />
                  <p>暂无物料</p>
                  <p className="text-xs">请点击上方「按产品原型选变体」添加</p>
                </div>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-800/80">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-slate-400 w-8">#</th>
                      <th className="px-2 py-1.5 text-left text-slate-400">品名 / 规格</th>
                      <th className="px-2 py-1.5 text-left text-slate-400 w-24">规格备注</th>
                      <th className="px-2 py-1.5 text-right text-slate-400 w-16">数量</th>
                      <th className="px-2 py-1.5 text-right text-slate-400 w-20">单价(元)</th>
                      <th className="px-2 py-1.5 text-right text-slate-400 w-20">小计</th>
                      <th className="px-2 py-1.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {formItems.map((row, idx) => {
                      const lineTotal =
                        (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
                      const displayName =
                        [row.skuName || row.sku, row.spec].filter(Boolean).join(" · ") || "—";
                      return (
                        <tr key={row.tempId} className="bg-slate-900/40">
                          <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-2 py-1.5 text-slate-200">{displayName}</td>
                          <td className="px-2 py-1.5">
                            <input
                              value={row.spec}
                              onChange={(e) =>
                                setFormItems((prev) =>
                                  prev.map((r) =>
                                    r.tempId === row.tempId
                                      ? { ...r, spec: e.target.value }
                                      : r
                                  )
                                )}
                              placeholder="规格备注"
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={row.quantity}
                              onChange={(e) =>
                                setFormItems((prev) =>
                                  prev.map((r) =>
                                    r.tempId === row.tempId
                                      ? { ...r, quantity: e.target.value }
                                      : r
                                  )
                                )}
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-slate-200"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={row.unitPrice}
                              onChange={(e) =>
                                setFormItems((prev) =>
                                  prev.map((r) =>
                                    r.tempId === row.tempId
                                      ? { ...r, unitPrice: e.target.value }
                                      : r
                                  )
                                )}
                              className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-slate-200"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-200 font-mono">
                            {currency(lineTotal)}
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setFormItems((prev) =>
                                  prev.filter((r) => r.tempId !== row.tempId)
                                )
                              }
                              className="text-slate-400 hover:text-rose-400"
                              title="删除行"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-200">
            <div className="flex flex-wrap items-center gap-4">
              <div>预计总额：{currency(totalAmount)}</div>
              <div>定金比例：{selectedSupplier ? selectedSupplier.depositRate : "--"}%</div>
              <div className="text-amber-200">需付定金：{currency(depositPreview)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileImage className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">
                合同凭证 <span className="text-rose-400">*</span>
              </span>
            </div>
            <ImageUploader
              value={form.contractVoucher}
              onChange={(value) => setForm((f) => ({ ...f, contractVoucher: value }))}
              label=""
              multiple={true}
              maxImages={10}
              placeholder="点击上传或直接 Ctrl + V 粘贴合同凭证图片，支持多张"
              required
            />
            <p className="text-xs text-slate-500">请上传合同扫描件或照片，支持多张图片，最多10张</p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={!suppliers.length || isCreateSaving}
            >
              {isCreateSaving ? "保存中…" : "保存合同"}
            </button>
          </div>
        </form>

        {variantModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur">
            <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 className="text-lg font-semibold text-slate-100">按产品原型选择变体</h3>
                <button
                  type="button"
                  onClick={onCloseVariantModal}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4 flex-shrink-0">
                {variantModalSupplierId
                  ? "仅显示当前供应商关联的产品。先选规格/型号，再在下方为各颜色填写数量。"
                  : "先选规格/型号，再在下方为各颜色填写数量；未选规格前不显示颜色列表。"}
              </p>
              {variantModalSupplierId && variantModalProductIds === null && (
                <p className="text-xs text-slate-500 mb-2 flex-shrink-0">
                  正在加载该供应商关联产品…
                </p>
              )}
              {variantModalSupplierId &&
                variantModalProductIds &&
                variantModalProductIds.length === 0 && (
                  <p className="text-xs text-amber-400 mb-2 flex-shrink-0">
                    该供应商暂未关联产品，请在产品中心为产品关联该供应商后再选。
                  </p>
                )}
              <div className="flex-shrink-0 mb-4">
                <label className="block text-sm text-slate-300 mb-2">规格 / 型号</label>
                <select
                  value={selectedSpuContract?.productId ?? ""}
                  onChange={(e) => {
                    const spu = variantModalSpuOptions.find(
                      (s) => s.productId === e.target.value
                    );
                    if (spu) onSelectSpuInModal(spu);
                  }}
                  disabled={!!loadingSpuId}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary-400 disabled:opacity-60"
                >
                  <option value="">
                    {variantModalSupplierId && variantModalProductIds === null
                      ? "加载中…"
                      : "请选择规格/型号（如 mz03）"}
                  </option>
                  {variantModalSpuOptions.map((spu) => (
                    <option key={spu.productId} value={spu.productId}>
                      {spu.name}（
                      {loadingSpuId === spu.productId
                        ? "加载中…"
                        : `${spu.variants.length} 个颜色`}
                      ）
                    </option>
                  ))}
                </select>
              </div>
              {selectedSpuContract && (
                <>
                  <div className="flex-shrink-0 mb-2 flex items-center gap-2">
                    <Search className="h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={variantSearchContract}
                      onChange={(e) => setVariantSearchContract(e.target.value)}
                      placeholder="按颜色或 SKU 搜索…"
                      className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mb-2 flex-shrink-0">
                    数量矩阵：在同规格下为各颜色直接填写采购数量
                  </p>
                </>
              )}
              <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
                {selectedSpuContract ? (
                  (() => {
                    const kw = variantSearchContract.trim().toLowerCase();
                    const list = kw
                      ? selectedSpuContract.variants.filter(
                          (v) =>
                            (v.color || "").toLowerCase().includes(kw) ||
                            (v.sku_id || "").toLowerCase().includes(kw)
                        )
                      : selectedSpuContract.variants;
                    return list.length > 0 ? (
                      list.map((v) => (
                        <div
                          key={v.sku_id ?? ""}
                          className="flex items-center gap-4 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 flex-shrink-0"
                        >
                          <span className="text-slate-200 font-medium w-20 truncate">
                            {v.color || v.sku_id}
                          </span>
                          <span className="text-slate-500 text-sm flex-1 truncate">
                            {v.sku_id}
                          </span>
                          <span className="text-slate-400 text-sm whitespace-nowrap">
                            ¥{Number(v.cost_price ?? 0).toFixed(2)}
                          </span>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={variantQuantities[v.sku_id!] ?? ""}
                            onChange={(e) =>
                              setVariantQuantities((prev) => ({
                                ...prev,
                                [v.sku_id!]: e.target.value,
                              }))
                            }
                            className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-right text-slate-100 outline-none focus:border-primary-400"
                          />
                          <span className="text-slate-500 text-sm w-6">件</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-slate-500 text-sm">
                        {variantSearchContract.trim()
                          ? "未匹配到该颜色或 SKU，请修改搜索词"
                          : "该规格下暂无变体"}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    请先选择规格/型号
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-800 flex-shrink-0">
                <button
                  type="button"
                  onClick={onCloseVariantModal}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={onConfirmVariantSelection}
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
                >
                  确定并加入明细
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
