"use client";

import { useState, useRef, useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, ChevronRight, Table, Store } from "lucide-react";
import Link from "next/link";

const ORDER_DETAILS_SHEET_NAME = "Order details";
const PREVIEW_ROWS = 50;
const fetcher = (url: string) => fetch(url).then((r) => r.json());

type StoreItem = { id: string; name: string; platform?: string; country?: string };
type SheetResult = {
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};
type UploadResult = {
  fileName: string;
  sheetNames: string[];
  sheets: SheetResult[];
};

function getTypeKey(row: Record<string, unknown>): string {
  const keys = Object.keys(row).filter((k) => /^type$/i.test(k.trim()));
  return keys[0] ?? "Type";
}

function getAmountKey(row: Record<string, unknown>): string {
  const keys = Object.keys(row).filter((k) =>
    /total settlement amount/i.test(String(k).trim())
  );
  return keys[0] ?? "Total settlement amount";
}

export default function FinanceImportPage() {
  const { mutate: globalMutate } = useSWRConfig();
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: storesData } = useSWR<StoreItem[] | unknown>("/api/stores", fetcher);
  const stores = Array.isArray(storesData) ? storesData : [];

  const orderDetailsSheet = useMemo(() => {
    if (!result?.sheets?.length) return null;
    return (
      result.sheets.find(
        (s) => s.sheetName.trim().toLowerCase() === ORDER_DETAILS_SHEET_NAME.toLowerCase()
      ) ?? null
    );
  }, [result]);

  const orderOnlyRows = useMemo(() => {
    if (!orderDetailsSheet?.rows?.length) return [];
    const typeKey = getTypeKey(orderDetailsSheet.rows[0] as Record<string, unknown>);
    return orderDetailsSheet.rows.filter(
      (row) => String((row as Record<string, unknown>)[typeKey] ?? "").trim() === "Order"
    ) as Record<string, unknown>[];
  }, [orderDetailsSheet]);

  const amountKey = orderOnlyRows.length > 0 ? getAmountKey(orderOnlyRows[0]) : "Total settlement amount";
  const totalUsd = useMemo(() => {
    let sum = 0;
    for (const row of orderOnlyRows) {
      const v = (row as Record<string, unknown>)[amountKey];
      if (v != null && v !== "") {
        const n = Number(String(v).replace(/,/g, ""));
        if (!Number.isNaN(n)) sum += n;
      }
    }
    return sum;
  }, [orderOnlyRows, amountKey]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    setSelectedSheetName(null);
    setSelectedStoreId("");
    setShowStoreModal(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/xlsx", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "上传解析失败");
        return;
      }
      setResult(data);
      const orderDetails = (data.sheets ?? []).find(
        (s: SheetResult) =>
          s.sheetName.trim().toLowerCase() === ORDER_DETAILS_SHEET_NAME.toLowerCase()
      );
      if (!orderDetails) {
        toast.error(`未找到子表「${ORDER_DETAILS_SHEET_NAME}」，请确认表格中包含该子表`);
        return;
      }
      setSelectedSheetName(orderDetails.sheetName);
      setShowStoreModal(true);
      toast.success("已解析，请选择该数据所属店铺");
    } catch (err) {
      toast.error("上传失败，请重试");
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const selectedSheet = result?.sheets?.find((s) => s.sheetName === selectedSheetName);
  const headers = selectedSheet?.headers ?? [];
  const previewRows = orderOnlyRows.slice(0, PREVIEW_ROWS);
  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  const handleConfirmStore = () => {
    if (!selectedStoreId) {
      toast.error("请选择该数据所属店铺");
      return;
    }
    setShowStoreModal(false);
  };

  const handleImportToStoreOrderTable = async () => {
    if (!orderOnlyRows.length) {
      toast.error("没有可导入的 Order 数据");
      return;
    }
    if (!selectedStoreId) {
      toast.error("请先选择该数据所属店铺");
      return;
    }
    if (!result?.fileName) {
      toast.error("缺少文件名信息");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/import/store-order-settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: selectedStoreId,
          sourceFileName: result.fileName,
          rows: orderOnlyRows,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "导入失败");
        return;
      }
      toast.success(data.message || `已导入 ${data.imported} 条到店铺订单表`);
      globalMutate((key) => typeof key === "string" && key.startsWith("/api/store-order-settlement"));
    } catch (err) {
      toast.error("操作失败，请重试");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Link href="/settings/stores" className="hover:text-slate-200">营销与店铺</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-200">数据导入</span>
        </div>
        <h1 className="text-xl font-semibold text-white">店铺订单导入</h1>
        <p className="text-slate-500 text-sm">
          上传 .xlsx，将自动读取子表「Order details」；仅保留 Order 类型，过滤 Adjustment；请选择数据所属店铺后预览并导入。
        </p>

        <div
          className="rounded-xl border border-slate-700 bg-slate-900/50 p-6 cursor-pointer"
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            {uploading ? <span className="text-slate-400">解析中…</span> : (
              <>
                <div className="rounded-full bg-cyan-500/20 p-4"><Upload className="h-8 w-8 text-cyan-400" /></div>
                <p className="text-slate-200 font-medium">点击上传 xlsx 文件</p>
                <p className="text-slate-500 text-xs">将读取子表「Order details」</p>
              </>
            )}
          </div>
        </div>

        {/* 店铺勾选弹窗：上传后立即弹出 */}
        {showStoreModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <Store className="h-5 w-5 text-cyan-400" />
                <h2 className="text-lg font-semibold text-slate-100">选择该数据所属店铺</h2>
              </div>
              <p className="text-slate-400 text-sm mb-3">请勾选或选择该导入数据属于哪个店铺：</p>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-slate-200 text-sm"
              >
                <option value="">请选择店铺</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.platform ? `(${s.platform})` : ""}
                  </option>
                ))}
              </select>
              {stores.length === 0 && (
                <p className="text-amber-400 text-xs mt-2">暂无店铺，请先在「设置」中创建店铺</p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setShowStoreModal(false); setResult(null); setSelectedSheetName(null); }}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStore}
                  disabled={!selectedStoreId}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        {result && orderDetailsSheet && !showStoreModal && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-slate-300">
                <FileSpreadsheet className="h-5 w-5" />
                <span className="font-medium">{result.fileName}</span>
              </div>
              <span className="text-slate-500 text-sm">子表「{ORDER_DETAILS_SHEET_NAME}」</span>
              {selectedStore && (
                <span className="rounded-md bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200">
                  所属店铺：{selectedStore.name}
                </span>
              )}
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm">
              <p className="text-slate-300">
                已过滤掉 Adjustment 类型，仅保留 <strong className="text-white">Order</strong> 类型；
                共 <strong className="text-white">{orderOnlyRows.length}</strong> 条数据；
                回款金额(USD) 合计：<strong className="text-emerald-400">{totalUsd.toFixed(2)}</strong> USD
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleImportToStoreOrderTable}
                disabled={importing || !selectedStoreId || orderOnlyRows.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Table className="h-4 w-4" />
                {importing ? "处理中..." : "导入到店铺订单表"}
              </button>
            </div>

            <p className="text-slate-500 text-xs">
              下表仅展示前 {PREVIEW_ROWS} 行；<strong>回款金额(USD)</strong> 列实时显示 Total settlement amount。
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-800/80">
                  <tr>
                    <th className="px-3 py-2 text-left text-cyan-300 font-medium whitespace-nowrap w-28">回款金额(USD)</th>
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{h || `列${i + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {previewRows.map((row, ri) => {
                    const r = row as Record<string, unknown>;
                    const usd = r[amountKey] != null && r[amountKey] !== "" ? String(r[amountKey]) : "";
                    return (
                      <tr key={ri} className="bg-slate-900/40 hover:bg-slate-800/40">
                        <td className="px-3 py-2 text-emerald-300 font-medium whitespace-nowrap">{usd}</td>
                        {headers.map((h, i) => (
                          <td key={i} className="px-3 py-2 text-slate-300 whitespace-nowrap max-w-[200px] truncate" title={String(r[h ?? `列${i + 1}`] ?? "")}>
                            {r[h ?? `列${i + 1}`] != null ? String(r[h ?? `列${i + 1}`]) : ""}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
