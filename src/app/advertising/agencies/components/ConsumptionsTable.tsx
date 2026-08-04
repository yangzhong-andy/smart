"use client";

import { useState, useRef, useMemo } from "react";
import type { AdConsumption } from "@/lib/ad-agency-store";
import { formatCurrency } from "@/lib/currency-utils";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { renderGroupedAccountOptions } from "@/lib/account-grouped-options";
import { Pagination, usePaginationState, paginate } from "@/components/Pagination";

type StoreInfo = { id: string; name: string };

	export type ConsumptionsTableProps = {
	  consumptions: AdConsumption[];
	  onAdd: () => void;
	  onDelete: (id: string) => void;
	  onViewVoucher: (voucher: string | null) => void;
	  onImportSuccess?: () => void | Promise<void>;
	};

export function ConsumptionsTable({
  consumptions,
  onAdd,
  onDelete,
  onImportSuccess,
}: ConsumptionsTableProps) {
  const [showImport, setShowImport] = useState(false);
  const [importStoreId, setImportStoreId] = useState("");
  const [importAccountId, setImportAccountId] = useState("");
  const [importRecords, setImportRecords] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMeta = async () => {
    try {
      const [accRes, storeRes] = await Promise.all([
        fetch("/api/ad-accounts?pageSize=200"),
        fetch("/api/stores?page=1&pageSize=200"),
      ]);
      const accData = await accRes.json();
      const storeData = await storeRes.json();
      setAccounts(Array.isArray(accData?.data) ? accData.data : []);
      setStores(Array.isArray(storeData?.data) ? storeData.data : []);
    } catch {}
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        const records = rows.slice(1).map((r: any[]) => {
          const cleanStr = (v: any) => String(v || "").replace(/\x00/g, "").replace(/[\u0000-\u001F]/g, "").trim();
          const cleanNum = (v: any) => Math.abs(Number(String(v || "0").replace(/\x00/g, "").replace(/[\u0000-\u001F]/g, "").trim()) || 0);
          return {
            date: cleanStr(r[0]),
            campaignName: cleanStr(r[1]),
            campaignId: cleanStr(r[2]),
            cashConsumption: cleanNum(r[3]),
            creditConsumption: cleanNum(r[4]),
            giftConsumption: cleanNum(r[5]),
            amount: cleanNum(r[6]),
            currency: cleanStr(r[7]) || "USD",
            consumptionType: cleanStr(r[8]),
          };
        }).filter((r: any) => r.date && r.amount > 0 && !/^(total|总计|合计|sum)/i.test(r.date));
        setImportRecords(records);
        toast.success(`已解析 ${records.length} 条记录`);
      } catch (err: any) {
        toast.error("解析失败：" + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!importAccountId) { toast.error("请选择广告账户"); return; }
    if (!importStoreId) { toast.error("请选择关联店铺"); return; }
    if (importRecords.length === 0) { toast.error("请先上传文件"); return; }
    const acc = accounts.find(a => a.id === importAccountId);
    if (!acc) { toast.error("账户不存在"); return; }
    setImporting(true);
    try {
      const store = stores.find(s => s.id === importStoreId);
      // 彻底清理所有数据：JSON序列化再反序列化，去掉一切非法字符
      const cleanRecords = JSON.parse(JSON.stringify(importRecords).replace(/\\u0000/g, ""));
      const res = await fetch("/api/ad-consumptions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: cleanRecords,
          adAccountId: importAccountId,
          accountName: (acc.accountName || "").replace(/\x00/g, ""),
          agencyId: (acc.agencyId || "").replace(/\x00/g, ""),
          agencyName: (acc.agencyName || "").replace(/\x00/g, ""),
          storeId: importStoreId,
          storeName: store?.name || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.created > 0 && data.skipped > 0) {
        toast.success(`导入完成！新增 ${data.created} 条，跳过 ${data.skipped} 条重复数据`, { duration: 5000 });
      } else if (data.created > 0) {
        toast.success(`导入成功！新增 ${data.created} 条`, { duration: 5000 });
      } else if (data.skipped > 0 && data.created === 0) {
        toast.warning(`数据已导入过，跳过 ${data.skipped} 条重复记录`, { duration: 5000 });
      } else {
        toast.error("没有有效数据可导入", { duration: 5000 });
      }
      setShowImport(false);
      setImportRecords([]);
      setImportStoreId("");
      setImportAccountId("");
      onImportSuccess?.();
    } catch (err: any) {
      toast.error(err.message || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterAccount, setFilterAccount] = useState<string>("");
  const { page: pgPage, pageSize: pgPageSize, setPage: setPgPage, setPageSize: setPgPageSize } = usePaginationState(20);

  // 月份筛选
  const monthFiltered = useMemo(() => {
    return consumptions.filter((c) => {
      const cMonth = (c.month || (c.date ? c.date.slice(0, 7) : ""));
      const monthOk = !filterMonth || cMonth === filterMonth;
      const accountOk = !filterAccount || c.accountName === filterAccount;
      return monthOk && accountOk;
    });
  }, [consumptions, filterMonth, filterAccount]);

  // 可选账户列表
  const availableAccounts = useMemo(() => {
    const set = new Set(consumptions.map((c) => c.accountName).filter(Boolean));
    return Array.from(set).sort();
  }, [consumptions]);

  // 可选月份列表
  const availableMonths = useMemo(() => {
    const set = new Set(consumptions.map((c) => c.month || (c.date ? c.date.slice(0, 7) : "")).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [consumptions]);

  // 统计
  const stats = useMemo(() => {
    const total = monthFiltered.reduce((s, c) => s + (c.amount || 0), 0);
    const cash = monthFiltered.reduce((s, c) => s + (c.cashConsumption || 0), 0);
    const credit = monthFiltered.reduce((s, c) => s + (c.creditConsumption || 0), 0);
    const gift = monthFiltered.reduce((s, c) => s + (c.giftConsumption || 0), 0);
    const count = monthFiltered.length;
    const currency = monthFiltered[0]?.currency || "USD";
    return { total, cash, credit, gift, count, currency };
  }, [monthFiltered]);

  const sorted = [...monthFiltered].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-6">
      {/* 月份筛选 + 统计卡片 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-semibold text-slate-100">消耗记录</h2>
          <select
            value={filterMonth}
            onChange={(e) => { setFilterMonth(e.target.value); setPgPage(1); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
          >
            <option value="">全部月份</option>
            {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={filterAccount}
            onChange={(e) => { setFilterAccount(e.target.value); setPgPage(1); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
          >
            <option value="">全部账户</option>
            {availableAccounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {(filterMonth || filterAccount) && (
            <button onClick={() => { setFilterMonth(""); setFilterAccount(""); setPgPage(1); }} className="text-xs text-slate-400 hover:text-primary-400 underline">清除筛选</button>
          )}
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "总消耗", value: stats.total, grad: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)", color: "text-white" },
            { label: "现金消耗", value: stats.cash, grad: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)", color: "text-emerald-300" },
            { label: "信用消耗", value: stats.credit, grad: "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)", color: "text-purple-300" },
            { label: "赠款消耗", value: stats.gift, grad: "linear-gradient(135deg, #b45309 0%, #0f172a 100%)", color: "text-amber-300" },
            { label: "记录数", value: stats.count, grad: "linear-gradient(135deg, #0e7490 0%, #0f172a 100%)", color: "text-white", isCount: true },
          ].map((card) => (
            <div key={card.label} className="group relative overflow-hidden rounded-2xl border p-4 transition-all hover:scale-[1.02]" style={{ background: card.grad, border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="absolute top-0 right-0 -mt-4 -mr-4 h-12 w-12 rounded-full bg-white/5 blur-2xl" />
              <div className="relative z-10">
                <div className="text-xs text-white/50 mb-1">{card.label}</div>
                <div className={"text-lg font-bold " + (card.color || "text-white")} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {card.isCount ? card.value : formatCurrency(card.value, stats.currency, "expense")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowImport(true); loadMeta(); }}
            className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          >
            📥 导入Excel
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
          >
            + 新增消耗记录
          </button>
        </div>
      </div>

      {consumptions.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">
            暂无消耗记录，请点击右上角「新增消耗记录」或「导入Excel」开始添加
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-3 py-3 text-left font-medium text-slate-300">日期</th>
                <th className="px-3 py-3 text-left font-medium text-slate-300">账户名称</th>
                <th className="px-3 py-3 text-left font-medium text-slate-300">关联店铺</th>
                <th className="px-3 py-3 text-left font-medium text-slate-300">推广系列</th>
                <th className="px-3 py-3 text-left font-medium text-slate-300">系列ID</th>
                <th className="px-3 py-3 text-right font-medium text-slate-300">现金消耗</th>
                <th className="px-3 py-3 text-right font-medium text-slate-300">信用消耗</th>
                <th className="px-3 py-3 text-right font-medium text-slate-300">赠款消耗</th>
                <th className="px-3 py-3 text-right font-medium text-slate-300">消耗金额</th>
                <th className="px-3 py-3 text-left font-medium text-slate-300">币种</th>
                <th className="px-3 py-3 text-left font-medium text-slate-300">类型</th>
                <th className="px-3 py-3 text-right font-medium text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {paginate(sorted, pgPage, pgPageSize).map((consumption: any) => (
                <tr key={consumption.id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-3 text-slate-300 text-xs">{consumption.date || consumption.consumptionDate || "-"}</td>
                  <td className="px-3 py-3 text-slate-100 text-xs">{consumption.accountName}</td>
                  <td className="px-3 py-3 text-slate-300 text-xs">{consumption.storeName || "-"}</td>
                  <td className="px-3 py-3 text-slate-300 text-xs max-w-[100px] truncate" title={consumption.campaignName}>{consumption.campaignName || "-"}</td>
                  <td className="px-3 py-3 text-slate-400 text-[10px] font-mono max-w-[90px] truncate" title={consumption.campaignId}>{consumption.campaignId || "-"}</td>
                  <td className="px-3 py-3 text-right text-slate-300 text-xs">{consumption.cashConsumption > 0 ? "$" + consumption.cashConsumption.toFixed(2) : "-"}</td>
                  <td className="px-3 py-3 text-right text-slate-300 text-xs">{consumption.creditConsumption > 0 ? "$" + consumption.creditConsumption.toFixed(2) : "-"}</td>
                  <td className="px-3 py-3 text-right text-slate-300 text-xs">{consumption.giftConsumption > 0 ? "$" + consumption.giftConsumption.toFixed(2) : "-"}</td>
                  <td className="px-3 py-3 text-right font-medium text-rose-300 text-xs">{formatCurrency(consumption.amount, consumption.currency || "USD", "expense")}</td>
                  <td className="px-3 py-3 text-slate-300 text-xs">{consumption.currency}</td>
                  <td className="px-3 py-3 text-slate-300 text-xs">{consumption.consumptionType || "-"}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => onDelete(consumption.id)} className="px-2 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={sorted.length} page={pgPage} pageSize={pgPageSize} onPageChange={setPgPage} onPageSizeChange={setPgPageSize} />
        </div>
      )}

      {/* 导入Excel弹窗 */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !importing && setShowImport(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">导入消耗数据</h3>
              <button onClick={() => !importing && setShowImport(false)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">广告账户 <span className="text-rose-400">*</span></label>
                <select value={importAccountId} onChange={e => setImportAccountId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                  <option value="">请选择账户</option>
                  {renderGroupedAccountOptions(accounts, { renderLabel: (a) => a.accountName || a.id })}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">选择Excel文件</label>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="w-full text-sm text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-500 file:text-white file:hover:bg-primary-600" />
                {importRecords.length > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">已解析 {importRecords.length} 条记录，总消耗 ${importRecords.reduce((s: number, r: any) => s + r.amount, 0).toLocaleString()}</p>
                )}
              </div>
              {stores.length > 0 && (
                <div>
                  <label className="block text-sm text-slate-300 mb-2">关联店铺 <span className="text-rose-400">*</span></label>
                  <select value={importStoreId} onChange={e => setImportStoreId(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                    <option value="">请选择店铺</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {importRecords.length > 0 && (
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800/60">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-slate-400">日期</th>
                        <th className="px-2 py-1.5 text-left text-slate-400">系列名称</th>
                        <th className="px-2 py-1.5 text-right text-slate-400">金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {importRecords.slice(0, 5).map((r: any, i: number) => (
                        <tr key={i} className="text-slate-300">
                          <td className="px-2 py-1">{r.date}</td>
                          <td className="px-2 py-1 truncate max-w-[200px]">{r.campaignName}</td>
                          <td className="px-2 py-1 text-right">{r.currency} {r.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                      {importRecords.length > 5 && (
                        <tr><td colSpan={3} className="px-2 py-1 text-center text-slate-500">...还有 {importRecords.length - 5} 条</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowImport(false); setImportRecords([]); }} disabled={importing} className="flex-1 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">取消</button>
                <button onClick={handleImport} disabled={importRecords.length === 0 || importing} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                  {importing ? "导入中..." : `导入 ${importRecords.length} 条记录`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
