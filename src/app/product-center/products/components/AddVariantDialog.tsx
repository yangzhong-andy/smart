"use client";

import React, { useEffect, useState } from "react";
import type { SpuListItem } from "@/lib/products-store";
import { validateVariantRows } from "@/lib/product-variant-entry";
import type { VariantRow } from "./types";
import { VariantEntryGrid } from "./VariantEntryGrid";

type AddVariantDialogProps = {
  spu: SpuListItem | null;
  variants: VariantRow[];
  onVariantsChange: (v: VariantRow[] | ((prev: VariantRow[]) => VariantRow[])) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  existingSkuIds?: string[];
  validationRequested?: boolean;
};

export function AddVariantDialog({ spu, variants, onVariantsChange, onClose, onSubmit, isSubmitting, existingSkuIds = [], validationRequested = false }: AddVariantDialogProps) {
  const [validatedSpuId, setValidatedSpuId] = useState<string | null>(null);
  useEffect(() => { if (!spu) setValidatedSpuId(null); }, [spu]);
  if (!spu) return null;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
    <div role="dialog" aria-modal="true" aria-labelledby="add-variant-dialog-title" className="max-h-[90vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><h2 id="add-variant-dialog-title" className="text-lg font-semibold text-slate-100">为「{spu.name}」批量添加 SKU</h2><p className="mt-1 text-xs text-slate-400">新增默认人民币，空白物流资料待补；复制 SKU 会带入来源成本、币种和物流参数，请核对后保存。不复制库存、业务记录或平台映射。</p></div>
        <button type="button" aria-label="关闭添加 SKU" onClick={onClose} disabled={isSubmitting} className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-50">✕</button>
      </div>
      <VariantEntryGrid rows={variants} onChange={onVariantsChange} disabled={isSubmitting} existingSkuIds={existingSkuIds} validationRequested={validationRequested || validatedSpuId === spu.productId} defaultCurrency="CNY" inheritPhysicalDefaults={false} />
      <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">取消</button>
        <button type="button" onClick={() => { setValidatedSpuId(spu.productId); if (validateVariantRows(variants, existingSkuIds).valid) onSubmit(); }} disabled={isSubmitting} className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50">{isSubmitting ? "添加中..." : `确定添加 ${variants.length} 个 SKU`}</button>
      </div>
    </div>
  </div>;
}
