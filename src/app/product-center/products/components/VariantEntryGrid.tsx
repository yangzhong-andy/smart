"use client";

import React, { useId, useMemo, useState } from "react";
import { Copy, Plus, Trash } from "lucide-react";
import {
  copyVariantRow,
  isVariantRowEmpty,
  parseVariantRowsFromTsv,
  validateVariantRows,
  VARIANT_CURRENCIES,
  VARIANT_SPEC_SUGGESTIONS,
} from "@/lib/product-variant-entry";
import { VARIANT_COLOR_OPTIONS } from "./constants";
import { newVariantRow, type VariantRow } from "./types";

type VariantEntryGridProps = {
  rows: VariantRow[];
  onChange: (rows: VariantRow[] | ((previous: VariantRow[]) => VariantRow[])) => void;
  disabled?: boolean;
  existingSkuIds?: string[];
  validationRequested?: boolean;
  defaultCurrency?: string;
  inheritPhysicalDefaults?: boolean;
};

const physicalColumns = [
  ["weight_kg", "重量 kg"], ["length", "长 cm"], ["width", "宽 cm"], ["height", "高 cm"],
  ["volumetric_divisor", "体积重系数"], ["target_roi", "目标 ROI %"],
] as const;
const controlClass = "w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:opacity-60";
const buttonClass = "rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

export function VariantEntryGrid({ rows, onChange, disabled = false, existingSkuIds = [], validationRequested = false, defaultCurrency, inheritPhysicalDefaults = true }: VariantEntryGridProps) {
  const listId = useId();
  const [showPhysical, setShowPhysical] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<ReturnType<typeof parseVariantRowsFromTsv> | null>(null);
  const [commonCost, setCommonCost] = useState("");
  const [notice, setNotice] = useState("");
  const validation = useMemo(() => validateVariantRows(rows, existingSkuIds), [rows, existingSkuIds]);
  const previewValidation = pastePreview ? validateVariantRows(pastePreview.rows, [...existingSkuIds, ...rows.filter((row) => !isVariantRowEmpty(row)).map((row) => row.sku_id)]) : null;
  const canImport = !!pastePreview?.rows.length && !pastePreview.issues.length && !!previewValidation?.valid;
  const canApplyCost = !!commonCost.trim() && Number.isFinite(Number(commonCost)) && Number(commonCost) >= 0;

  function update(tempId: string, field: keyof VariantRow, value: string) {
    onChange((previous) => previous.map((row) => row.tempId === tempId ? { ...row, [field]: value } : row));
  }

  function applyCost(onlyEmpty: boolean) {
    if (!canApplyCost) return;
    if (!onlyEmpty && rows.some((row) => row.cost_price.trim()) && !window.confirm("将覆盖所有行已填写的成本价，确定应用吗？")) return;
    onChange((previous) => previous.map((row) => !onlyEmpty || !row.cost_price.trim() ? { ...row, cost_price: commonCost.trim() } : row));
    setNotice(onlyEmpty ? "已将公共成本价填入空白价格行。" : "已将公共成本价应用到全部行。");
  }

  function input(row: VariantRow, index: number, field: keyof VariantRow, label: string, options: { placeholder?: string; list?: string; numeric?: boolean } = {}) {
    const error = !isVariantRowEmpty(row) || validationRequested ? validation.errors[row.tempId]?.[field] : undefined;
    return <div>
      <input
        aria-label={`第 ${index + 1} 行${label}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${listId}-${row.tempId}-${field}-error` : undefined}
        value={row[field] ?? ""}
        onChange={(event) => update(row.tempId, field, event.target.value)}
        inputMode={options.numeric ? "decimal" : undefined}
        list={options.list}
        placeholder={options.placeholder}
        disabled={disabled}
        className={`${controlClass} ${error ? "border-rose-500" : "border-slate-700"}`}
      />
      {error && <p id={`${listId}-${row.tempId}-${field}-error`} className="mt-1 max-w-[220px] text-xs text-rose-300">{error}</p>}
    </div>;
  }

  return <div className="space-y-3">
    <datalist id={`${listId}-specs`}>{VARIANT_SPEC_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
    <datalist id={`${listId}-colors`}>{VARIANT_COLOR_OPTIONS.map((item) => <option key={item} value={item} />)}</datalist>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs leading-5 text-slate-400">每行一个 SKU，规格和颜色可自由输入。成本价必填，允许明确填 0；库存由业务单据计算。<br />规格示例：Set+3、Set+6、Brush-Head-3Packs。</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => setShowPhysical(!showPhysical)}>{showPhysical ? "收起" : "展开"}物流/ROI 列</button>
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => setShowPaste(!showPaste)}>{showPaste ? "收起粘贴区" : "从表格批量粘贴"}</button>
        <button type="button" disabled={disabled} className={`${buttonClass} flex items-center gap-1 border-cyan-500/50 text-cyan-200`} onClick={() => onChange((previous) => [...previous, newVariantRow()])}><Plus className="h-4 w-4" />添加 SKU</button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <label className="text-xs text-slate-400" htmlFor={`${listId}-common-cost`}>公共成本价（仅点击后生效）</label>
      <input id={`${listId}-common-cost`} value={commonCost} onChange={(event) => setCommonCost(event.target.value)} inputMode="decimal" placeholder="例如 12.50" disabled={disabled} className={`${controlClass} w-32 border-slate-700`} />
      <button type="button" disabled={disabled || !canApplyCost} onClick={() => applyCost(true)} className={buttonClass}>填充空白价格</button>
      <button type="button" disabled={disabled || !canApplyCost} onClick={() => applyCost(false)} className={buttonClass}>应用至全部行</button>
    </div>
    {showPaste && <div className="space-y-3 rounded-lg border border-cyan-900 bg-cyan-950/10 p-4">
      <p className="text-xs leading-6 text-slate-300">从 Excel/表格复制数据，不含表头；每行一个 SKU，列之间使用制表符。固定列顺序：<br /><strong>SKU → 规格 → 颜色 → 成本价 → 币种 → 重量 kg → 长 cm → 宽 cm → 高 cm → 条形码</strong><br />至少保留前 4 列，空颜色也保留该列；后 6 列可省略。预览校验通过后才会追加，不覆盖现有行。</p>
      <textarea aria-label="批量粘贴 SKU 数据" value={pasteText} onChange={(event) => { setPasteText(event.target.value); setPastePreview(null); }} disabled={disabled} rows={4} className={`${controlClass} border-slate-700 font-mono`} placeholder={"Brush-Set3\tSet+3\t\t12.50\tCNY"} />
      <div className="flex gap-2">
        <button type="button" disabled={disabled} className={buttonClass} onClick={() => setPastePreview(parseVariantRowsFromTsv(pasteText))}>预览并校验</button>
        <button type="button" disabled={disabled || !canImport} className={buttonClass} onClick={() => {
          if (!pastePreview || !canImport) return;
          const imported = pastePreview.rows;
          onChange((previous) => previous.length === 1 && isVariantRowEmpty(previous[0]) ? imported : [...previous, ...imported]);
          setNotice(`已追加 ${imported.length} 行 SKU，尚未保存。`);
          setPasteText(""); setPastePreview(null); setShowPaste(false);
        }}>追加 {pastePreview?.rows.length ?? 0} 行</button>
      </div>
      {pastePreview && <div className="max-h-64 overflow-auto rounded border border-slate-700 p-3 text-xs">
        {pastePreview.issues.map((issue, index) => <p key={index} className="mb-1 text-rose-300">第 {issue.line} 行：{issue.message}</p>)}
        <table className="w-full min-w-[600px] text-left"><thead><tr className="text-slate-400"><th className="p-2">行</th><th className="p-2">SKU</th><th className="p-2">规格 / 颜色</th><th className="p-2">成本 / 币种</th><th className="p-2">校验</th></tr></thead><tbody>
          {pastePreview.rows.map((row, index) => <tr key={row.tempId} className="border-t border-slate-800"><td className="p-2">{index + 1}</td><td className="p-2">{row.sku_id || "（空）"}</td><td className="p-2">{row.size || "—"} / {row.color || "—"}</td><td className="p-2">{row.cost_price || "（空）"} {row.currency || "继承默认"}</td><td className="p-2 text-rose-300">{Object.values(previewValidation?.errors[row.tempId] ?? {}).join("；") || <span className="text-emerald-300">通过</span>}</td></tr>)}
        </tbody></table>
      </div>}
    </div>}
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className={`w-full text-left text-xs ${showPhysical ? "min-w-[2100px]" : "min-w-[1120px]"}`}>
        <thead className="bg-slate-800/80 text-slate-300"><tr>
          <th className="w-12 px-3 py-3">#</th><th className="min-w-[220px] px-3 py-3">SKU 编码 *</th><th className="min-w-[210px] px-3 py-3">规格 / 套装</th><th className="min-w-[130px] px-3 py-3">颜色（选填）</th><th className="min-w-[150px] px-3 py-3">成本价 *</th><th className="min-w-[140px] px-3 py-3">币种</th><th className="min-w-[180px] px-3 py-3">条形码</th>
          {showPhysical && physicalColumns.map(([field, label]) => <th key={field} className="min-w-[135px] px-3 py-3">{label}</th>)}
          <th className="sticky right-0 min-w-[90px] bg-slate-800 px-3 py-3">操作</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-800">{rows.map((row, index) => <tr key={row.tempId} className="align-top bg-slate-900/50">
          <td className="px-3 py-3 text-slate-500">{index + 1}</td>
          <td className="px-3 py-3">{input(row, index, "sku_id", "SKU 编码", { placeholder: "唯一 SKU 编码" })}{row.copiedFromSku && <p className="mt-1 text-xs text-cyan-300">复制自 {row.copiedFromSku}，请填写新编码</p>}</td>
          <td className="px-3 py-3">{input(row, index, "size", "规格", { list: `${listId}-specs`, placeholder: "Set+3 / 自定义规格" })}</td>
          <td className="px-3 py-3">{input(row, index, "color", "颜色", { list: `${listId}-colors`, placeholder: "可选，自由输入" })}</td>
          <td className="px-3 py-3">{input(row, index, "cost_price", "成本价", { numeric: true, placeholder: "必填，允许 0" })}</td>
          <td className="px-3 py-3"><select aria-label={`第 ${index + 1} 行币种`} value={row.currency ?? ""} onChange={(event) => update(row.tempId, "currency", event.target.value)} disabled={disabled} className={`${controlClass} ${validation.errors[row.tempId]?.currency ? "border-rose-500" : "border-slate-700"}`}><option value="">{defaultCurrency ? `默认 ${defaultCurrency}` : "继承产品"}</option>{VARIANT_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select>{validation.errors[row.tempId]?.currency && <p className="mt-1 text-xs text-rose-300">{validation.errors[row.tempId].currency}</p>}</td>
          <td className="px-3 py-3">{input(row, index, "barcode", "条形码", { placeholder: "选填" })}</td>
          {showPhysical && physicalColumns.map(([field, label]) => <td key={field} className="px-3 py-3">{input(row, index, field, label, { numeric: true, placeholder: inheritPhysicalDefaults ? "继承默认" : "选填，待补" })}</td>)}
          <td className="sticky right-0 bg-slate-900 px-3 py-3"><div className="flex gap-2"><button type="button" aria-label={`复制第 ${index + 1} 行`} title="复制规格、价格和物流资料；清空 SKU 和条形码" disabled={disabled} className="rounded p-2 text-cyan-300 hover:bg-slate-800 disabled:opacity-50" onClick={() => onChange((previous) => previous.flatMap((entry) => entry.tempId === row.tempId ? [entry, copyVariantRow(entry)] : [entry]))}><Copy className="h-4 w-4" /></button><button type="button" aria-label={`删除第 ${index + 1} 行`} disabled={disabled} className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-rose-300 disabled:opacity-50" onClick={() => onChange((previous) => previous.length === 1 ? [newVariantRow()] : previous.filter((entry) => entry.tempId !== row.tempId))}><Trash className="h-4 w-4" /></button></div></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!showPhysical && rows.some((row) => Object.keys(validation.errors[row.tempId] ?? {}).some((field) => physicalColumns.some(([key]) => key === field))) && <p className="text-xs text-rose-300">物流/ROI 列有错误，请展开后修正。</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>共 {rows.length} 行 · {inheritPhysicalDefaults ? "物流资料留空继承公共默认值，填写后仅覆盖对应 SKU。" : "空白物流资料待补，填写后仅用于对应 SKU。"}</span><span role="status">{notice}</span></div>
  </div>;
}
