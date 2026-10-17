"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart3, CheckCircle2, Download, FileBarChart2, Info, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { COMPANY_REPORTS, reportCsvCell as csvCell, type CompanyReportId, type CompanyReportResponse, type ReportTable, type ReportCell } from "@/lib/company-reports";

function initialPeriod() {
  const now = new Date(new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) + "T12:00:00Z");
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end: `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}` };
}
function display(value: ReportCell, format?: string) {
  if (value === null || value === undefined) return "— 待核实";
  if (typeof value !== "number") return value;
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: format === "money" ? 2 : 0, maximumFractionDigits: format === "money" ? 2 : 0 }).format(value) + (format === "percent" ? "%" : "");
}
function ReportGrid({ table }: { table: ReportTable }) {
  const [page, setPage] = useState(0);
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(table.rows.length / pageSize));
  const current = Math.min(page, totalPages - 1);
  return <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4"><h3 className="font-medium text-slate-100">{table.title}</h3>{table.href && <Link prefetch={false} href={table.href} className="inline-flex shrink-0 items-center gap-1 text-xs text-cyan-300">查看来源 <ArrowUpRight size={14} /></Link>}</div>
    {table.note && <p className="px-5 pt-3 text-xs leading-6 text-amber-200/80">{table.note}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-950/40 text-xs text-slate-400"><tr>{table.columns.map((column) => <th key={column.key} className={`whitespace-nowrap px-5 py-3 font-medium ${column.format ? "text-right" : ""}`}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/70">{table.rows.slice(current * pageSize, (current + 1) * pageSize).map((row, index) => <tr key={index} className="hover:bg-slate-800/40">{table.columns.map((column) => <td key={column.key} className={`px-5 py-3 ${column.format ? "whitespace-nowrap text-right font-mono tabular-nums" : "min-w-28"} ${row[column.key] == null ? "text-amber-300" : typeof row[column.key] === "number" && Number(row[column.key]) < 0 ? "text-rose-300" : "text-slate-300"}`}>{display(row[column.key], column.format)}</td>)}</tr>)}</tbody></table></div>
    {!table.rows.length && <div className="px-5 py-8 text-center text-sm text-slate-500">没有符合本报表口径的系统记录；不代表官方没有业务。</div>}
    {table.rows.length > pageSize && <div className="flex items-center justify-end gap-4 border-t border-slate-800 px-5 py-3 text-xs text-slate-400"><span>共 {table.rows.length} 行 · {current + 1} / {totalPages}</span><button disabled={current === 0} onClick={() => setPage(current - 1)} className="disabled:opacity-30">上一页</button><button disabled={current + 1 >= totalPages} onClick={() => setPage(current + 1)} className="disabled:opacity-30">下一页</button></div>}
  </section>;
}

export default function CompanyReportsPage() {
  const [period, setPeriod] = useState(initialPeriod);
  const [active, setActive] = useState<CompanyReportId>("overview");
  const [data, setData] = useState<CompanyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cache, setCache] = useState(false);
  const selected = COMPANY_REPORTS.find((report) => report.id === active)!;
  const panel = data?.panels[active];
  const changed = data && (data.period.startDate !== period.start || data.period.endDate !== period.end);
  async function load() {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/finance/company-reports?${new URLSearchParams({ startDate: period.start, endDate: period.end })}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "报表读取失败");
      setData(body); setCache(response.headers.get("X-Report-Cache") === "HIT");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "报表读取失败"); }
    finally { setLoading(false); }
  }
  function download() {
    if (!data || !panel) return;
    const lines: string[] = [[selected.title, data.scope, `期间 ${data.period.startDate} ~ ${data.period.endDate}`, `生成 ${data.generatedAt}`].map(csvCell).join(",")];
    for (const metric of panel.metrics) lines.push([metric.label, metric.value, metric.unit || "", metric.note].map(csvCell).join(","));
    for (const note of [...panel.notes, ...data.warnings]) lines.push([note].map(csvCell).join(","));
    for (const table of panel.tables) {
      lines.push("", csvCell(table.title), ...(table.note ? [csvCell(table.note)] : []), table.columns.map((column) => csvCell(column.label)).join(","));
      for (const row of table.rows) lines.push(table.columns.map((column) => csvCell(row[column.key])).join(","));
    }
    const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `${selected.title}_${data.period.startDate}_${data.period.endDate}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="mx-auto max-w-[1800px] space-y-6 p-6 lg:p-8" aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-5"><div><div className="mb-2 flex items-center gap-2 text-xs tracking-widest text-cyan-300"><BarChart3 size={15} /> COMPANY FINANCE & OPERATIONS</div><h1 className="text-2xl font-semibold text-slate-100">经营与财务分析中心</h1><p className="mt-2 text-sm text-slate-400">从经营结果到资金与资产 · 只读分析现有系统数据 · 管理报表试行版</p></div><span className="inline-flex items-center gap-2 rounded-full border border-emerald-800/60 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-300"><ShieldCheck size={14} /> 不改账 · 不触发平台同步</span></div>
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5"><label className="space-y-2 text-xs text-slate-400"><span className="block">经营期间开始</span><input type="date" value={period.start} onChange={(event) => setPeriod({ ...period, start: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 [color-scheme:dark]" /></label><label className="space-y-2 text-xs text-slate-400"><span className="block">经营期间结束</span><input type="date" value={period.end} onChange={(event) => setPeriod({ ...period, end: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 [color-scheme:dark]" /></label><button onClick={load} disabled={loading || !period.start || !period.end} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">{loading ? <Loader2 size={16} className="animate-spin" /> : <FileBarChart2 size={16} />}{loading ? "正在核算…" : "生成六张报表"}</button><button onClick={download} disabled={!data || loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 disabled:opacity-30"><Download size={16} />导出当前报表</button><p className="min-w-48 flex-1 text-xs leading-5 text-slate-500">单次最多 93 天。手动查询，无后台轮询；2 分钟内复用同期间快照。资产、待付及预测以当前快照为准。</p></div>
    {error && <div role="alert" className="rounded-lg border border-rose-900 bg-rose-950/30 px-5 py-4 text-sm text-rose-200">{error}{data && "；下方保留上次成功快照，不是本次查询结果。"}</div>}
    {changed && <p className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">日期已修改，请重新生成。下方仍显示 {data.period.startDate} ～ {data.period.endDate} 的快照。</p>}
    <nav aria-label="核心财务报表" className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">{COMPANY_REPORTS.map((report, index) => <button key={report.id} onClick={() => setActive(report.id)} className={`rounded-xl border p-4 text-left transition ${active === report.id ? "border-cyan-600 bg-cyan-950/40 text-cyan-200" : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-600"}`}><span className="mb-2 block font-mono text-xs opacity-60">0{index + 1}</span><span className="text-sm font-medium">{report.title}</span></button>)}</nav>
    <div><h2 className="text-lg font-semibold text-slate-100">{selected.title}</h2><p className="mt-1 text-sm text-slate-400">{selected.description}</p>{data && <p className="mt-2 text-xs text-slate-500">经营期间 {data.period.startDate} ～ {data.period.endDate} · 快照生成 {new Date(data.generatedAt).toLocaleString()}（浏览器时区）{cache ? " · 2 分钟内缓存" : ""}</p>}</div>
    {!data && <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center"><FileBarChart2 className="mx-auto mb-4 text-cyan-400" size={36} /><h3 className="text-slate-200">选择期间，生成六张核心管理报表</h3><p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">沿用已有订单、成本、账户、库存、工资与审批数据。没有可靠成本和会计归属的项目标记为待核实，不把空白当成零，不强行配平资产负债。</p></div>}
    {panel && <>
      {!!panel.metrics.length && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{panel.metrics.map((metric) => <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"><p className="text-sm text-slate-400">{metric.label}</p><p className={`my-3 text-2xl font-semibold tabular-nums ${metric.value == null ? "text-amber-300" : "text-slate-100"}`}>{metric.value == null ? "待核实" : display(metric.value, metric.unit === "CNY" ? "money" : "number")}<span className="ml-2 text-xs font-normal text-slate-500">{metric.unit}</span></p><p className="text-xs leading-6 text-slate-500">{metric.note}</p></div>)}</div>}
      <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-5"><div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-200"><Info size={16} />统计口径</div><ul className="space-y-2 text-xs leading-6 text-slate-400">{panel.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>
      {panel.tables.map((table) => <ReportGrid key={`${data.generatedAt}:${active}:${table.title}`} table={table} />)}
    </>}
    {data && <details className="rounded-xl border border-amber-900/50 bg-slate-900/40 p-5" open><summary className="cursor-pointer text-sm font-medium text-amber-200"><TriangleAlert size={16} className="mr-2 inline" />数据质量与未覆盖项目（{data.warnings.length}）</summary><div className="mt-4 max-h-72 space-y-2 overflow-auto text-xs leading-6 text-slate-400">{data.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></details>}
    {data && <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-5"><summary className="cursor-pointer text-sm text-slate-300"><CheckCircle2 size={16} className="mr-2 inline text-cyan-300" />数据来源与参考汇率</summary><div className="mt-4 space-y-5"><ReportGrid table={{ title: "数据来源（更新时间不等于同步成功证明）", columns: [{ key: "name", label: "来源" }, { key: "status", label: "状态" }, { key: "latestRecordAt", label: "最新记录更新（UTC）" }, { key: "note", label: "说明" }], rows: data.sources }} /><ReportGrid table={{ title: "系统已保存的估值参考汇率", columns: [{ key: "currency", label: "币种" }, { key: "rate", label: "1 原币 = CNY" }, { key: "basis", label: "适用限制" }], rows: data.rates }} /></div></details>}
    <div className="border-t border-slate-800 pt-5 text-xs leading-6 text-slate-500">长期建设路径：统一财务口径与来源 → 多主体/币种及成本中心 → 月结快照与凭证映射 → 完整资产负债及合并抵销 → 预算、现金预测与异常预警。当前不新增独立业务账本，不改变现有审批与入账流程。</div>
  </div>;
}
