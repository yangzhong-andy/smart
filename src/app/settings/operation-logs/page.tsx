"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Log = {
  id: string;
  actorName: string;
  actorEmail: string;
  departmentName: string | null;
  module: string;
  action: string;
  path: string;
  targetId: string | null;
  status: string;
  httpStatus: number;
  occurredAt: string;
};
type Payload = { rows: Log[]; total: number; page: number; pageSize: number; modules: Record<string, string> };
const PAGE_SIZE = 30;

function today(offsetDays: number) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
}

export default function OperationLogsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [from, setFrom] = useState(() => today(-6));
  const [to, setTo] = useState(() => today(0));
  const [actor, setActor] = useState("");
  const [module, setModule] = useState("");
  const [result, setResult] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionStatus === "unauthenticated" || (sessionStatus === "authenticated" && session?.user?.role !== "SUPER_ADMIN")) {
      router.replace("/");
    }
  }, [router, session, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || session?.user?.role !== "SUPER_ADMIN") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (actor.trim()) params.set("actor", actor.trim());
    if (module) params.set("module", module);
    if (result) params.set("status", result);
    setLoading(true);
    setError("");
    fetch(`/api/employee-operation-logs?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "查询失败");
        return body as Payload;
      })
      .then(setData)
      .catch((issue) => { if (issue.name !== "AbortError") setError(issue.message || "查询失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session, sessionStatus, from, to, actor, module, result, page, reload]);

  if (sessionStatus !== "authenticated" || session?.user?.role !== "SUPER_ADMIN") return null;
  const field = "rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">员工操作日志</h1><p className="mt-1 text-sm text-slate-400">记录已接入模块的新增、修改、删除、付款等写操作；不记录密码或请求内容。</p></div>
      <button type="button" onClick={() => setReload((value) => value + 1)} className={field}>刷新</button>
    </div>
    <div className="mb-5 rounded-md border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200">
      首批覆盖员工档案、工资、财务账户、收支流水、支出/收入申请、商品资料和系统账号。其他模块、页面浏览和系统自动同步暂未纳入，不能据此判断员工完全没有其他操作。
    </div>
    <div className="mb-5 flex flex-wrap gap-3">
      <label className="flex flex-col gap-1 text-xs text-slate-400">开始日期<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className={field} /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">结束日期<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className={field} /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">员工姓名/邮箱<input value={actor} onChange={(event) => { setActor(event.target.value); setPage(1); }} placeholder="搜索员工" className={field} /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">模块<select value={module} onChange={(event) => { setModule(event.target.value); setPage(1); }} className={field}><option value="">全部模块</option>{Object.entries(data?.modules || {}).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">结果<select value={result} onChange={(event) => { setResult(event.target.value); setPage(1); }} className={field}><option value="">全部结果</option><option value="SUCCESS">成功</option><option value="REJECTED">未通过</option><option value="ERROR">异常</option></select></label>
    </div>
    {error && <div className="mb-4 rounded border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-300">{error}</div>}
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-900 text-xs text-slate-400"><tr><th className="px-3 py-3">时间（北京时间）</th><th className="px-3 py-3">员工</th><th className="px-3 py-3">部门</th><th className="px-3 py-3">模块</th><th className="px-3 py-3">动作</th><th className="px-3 py-3">对象编号 / 接口</th><th className="px-3 py-3">结果</th></tr></thead>
        <tbody>{data?.rows.map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="whitespace-nowrap px-3 py-3">{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" }).format(new Date(row.occurredAt))}</td><td className="px-3 py-3"><div>{row.actorName}</div><div className="text-xs text-slate-500">{row.actorEmail}</div></td><td className="px-3 py-3">{row.departmentName || "—"}</td><td className="px-3 py-3">{data.modules[row.module] || row.module}</td><td className="px-3 py-3">{row.action}</td><td className="px-3 py-3"><div className="break-all font-mono text-xs">{row.targetId || "—"}</div><div className="break-all text-xs text-slate-500">{row.path}</div></td><td className="px-3 py-3">{row.status === "SUCCESS" ? "成功" : row.status === "REJECTED" ? "未通过" : "异常"} <span className="text-xs text-slate-500">({row.httpStatus})</span></td></tr>)}</tbody>
      </table>
      {!loading && !data?.rows.length && <div className="p-8 text-center text-sm text-slate-500">该筛选条件下暂无记录</div>}
      {loading && <div className="p-4 text-center text-sm text-slate-400">正在加载…</div>}
    </div>
    <div className="mt-4 flex items-center justify-between text-sm text-slate-400"><span>共 {data?.total ?? 0} 条</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className={`${field} disabled:opacity-40`}>上一页</button><span className="px-2 py-2">第 {page} 页</span><button type="button" disabled={loading || page * PAGE_SIZE >= (data?.total || 0)} onClick={() => setPage((value) => value + 1)} className={`${field} disabled:opacity-40`}>下一页</button></div></div>
  </main>;
}
