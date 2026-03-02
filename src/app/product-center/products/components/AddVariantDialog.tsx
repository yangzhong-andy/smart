"use client";

import { Plus, Trash } from "lucide-react";
import type { SpuListItem } from "@/lib/products-store";
import { VARIANT_COLOR_OPTIONS, VARIANT_SIZE_OPTIONS, OTHER_LABEL } from "./constants";
import type { VariantRow } from "./types";
import { newVariantRow } from "./types";

type AddVariantDialogProps = {
  spu: SpuListItem | null;
  variants: VariantRow[];
  onVariantsChange: (v: VariantRow[] | ((prev: VariantRow[]) => VariantRow[])) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
};

export function AddVariantDialog({
  spu,
  variants,
  onVariantsChange,
  onClose,
  onSubmit,
  isSubmitting
}: AddVariantDialogProps) {
  if (!spu) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">为「{spu.name}」添加变体</h2>
            <p className="text-xs text-slate-400 mt-1">为已有产品添加新的颜色/规格变体</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">填写新变体信息，可一次添加多个</span>
            <button
              type="button"
              onClick={() => onVariantsChange((prev) => [...prev, newVariantRow()])}
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
                {variants.map((row, idx) => (
                  <tr key={row.tempId} className="bg-slate-900/40">
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <select
                        value={VARIANT_COLOR_OPTIONS.includes(row.color) ? row.color : (row.color ? OTHER_LABEL : "")}
                        onChange={(e) => onVariantsChange((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
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
                          onChange={(e) => onVariantsChange((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, color: e.target.value } : r)))}
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                          placeholder="自定义"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.sku_id}
                        onChange={(e) => onVariantsChange((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, sku_id: e.target.value } : r)))}
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
                        onChange={(e) => onVariantsChange((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, cost_price: e.target.value } : r)))}
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-slate-200"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={VARIANT_SIZE_OPTIONS.includes(row.size) ? row.size : (row.size ? OTHER_LABEL : "")}
                        onChange={(e) => onVariantsChange((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value === OTHER_LABEL ? "" : e.target.value } : r)))}
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
                          onChange={(e) => onVariantsChange((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, size: e.target.value } : r)))}
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-slate-200 text-xs"
                          placeholder="自定义"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.barcode}
                        onChange={(e) => onVariantsChange((prev) => prev.map((r) => (r.tempId === row.tempId ? { ...r, barcode: e.target.value } : r)))}
                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200"
                        placeholder="可选"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onVariantsChange((prev) => prev.filter((r) => r.tempId !== row.tempId))}
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
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50"
            >
              {isSubmitting ? "添加中..." : "确定添加"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
