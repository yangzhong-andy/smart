"use client";

import { useState, useMemo } from "react";
import type { BankAccount } from "./types";
import type { CashFlowLike } from "./types";

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

type AccountFlowDialogProps = {
  open: boolean;
  account: BankAccount | null;
  flows: { normal: CashFlowLike[]; transfers: CashFlowLike[] };
  allFlows?: CashFlowLike[];
  bankAccounts?: BankAccount[]; // 全部银行账户（查最新账户名）
  onClose: () => void;
};

const PAGE_SIZE_OPTIONS = [20, 30, 50];

// 通过 relatedId 从全量流水里查找对方账户
function findCounterAccount(flow: CashFlowLike, allFlows?: CashFlowLike[], bankAccounts?: BankAccount[]): { name: string; accountId?: string } {
  // 优先用 relatedId 查找对方流水
  if (flow.relatedId && allFlows && allFlows.length > 0) {
    const otherEnd = allFlows.find((f) => 
      f.relatedId === flow.relatedId && 
      f.id !== flow.id && 
      f.accountId !== flow.accountId
    );
    if (otherEnd && otherEnd.accountId) {
      // 优先用 accountId 查最新的账户名（账户可能改过名）
      const latestAccount = bankAccounts?.find((a) => a.id === otherEnd.accountId);
      return { 
        name: latestAccount?.name || otherEnd.accountName || "-", 
        accountId: otherEnd.accountId 
      };
    }
  }

  // 回退：从备注/摘要提取
  const remark = flow.remark || "";
  const summary = flow.summary || "";
  const text = remark + " " + summary;
  const fromMatch = text.match(/从\s+(.+?)\s+(?:转入|划[入拨]|换汇)/);
  if (fromMatch) return { name: fromMatch[1].trim() };
  const toMatch = text.match(/(?:划拨至|换汇至|转出至)\s+(.+?)(?:\s*[，,。]|$)/);
  if (toMatch) return { name: toMatch[1].trim() };
  if (summary.includes("回款")) return { name: "外部回款" };
  return { name: "-" };
}

export function AccountFlowDialog({ open, account, flows, allFlows, bankAccounts, onClose }: AccountFlowDialogProps) {
  const [normalFilter, setNormalFilter] = useState<string>("all");
  const [normalCategoryFilter, setNormalCategoryFilter] = useState<string>("all");
  const [transferFilter, setTransferFilter] = useState<string>("all");
  const [normalPageSize, setNormalPageSize] = useState<number>(20);
  const [normalPage, setNormalPage] = useState<number>(1);
  const [transferPageSize, setTransferPageSize] = useState<number>(20);
  const [transferPage, setTransferPage] = useState<number>(1);
  const [voucherView, setVoucherView] = useState<string | null>(null);
  const [voucherRotation, setVoucherRotation] = useState(0);

  // 筛选后的正常收支
  const normalCategories = useMemo(() => {
    const set = new Set(flows.normal.map((f) => f.category).filter(Boolean));
    return Array.from(set).sort();
  }, [flows.normal]);

  const filteredNormal = useMemo(() => {
    return flows.normal.filter((f) => {
      const typeOk = !normalFilter || normalFilter === "all" || String(f.type || "").toLowerCase() === normalFilter;
      const catOk = !normalCategoryFilter || normalCategoryFilter === "all" || f.category === normalCategoryFilter;
      return typeOk && catOk;
    });
  }, [flows.normal, normalFilter, normalCategoryFilter]);

  const filteredTransfers = useMemo(() => {
    if (!transferFilter || transferFilter === "all") return flows.transfers;
    return flows.transfers.filter((f) => String(f.type || "").toLowerCase() === transferFilter);
  }, [flows.transfers, transferFilter]);

  // 分页
  const normalTotal = filteredNormal.length;
  const normalTotalPages = Math.max(1, Math.ceil(normalTotal / normalPageSize));
  const safeNormalPage = Math.min(normalPage, normalTotalPages);
  const pagedNormal = filteredNormal.slice((safeNormalPage - 1) * normalPageSize, safeNormalPage * normalPageSize);

  const transferTotal = filteredTransfers.length;
  const transferTotalPages = Math.max(1, Math.ceil(transferTotal / transferPageSize));
  const safeTransferPage = Math.min(transferPage, transferTotalPages);
  const pagedTransfers = filteredTransfers.slice((safeTransferPage - 1) * transferPageSize, safeTransferPage * transferPageSize);

  if (!open || !account) return null;

  const totalIncome = filteredNormal
    .filter((f) => String(f.type || "").toLowerCase() === "income" && f.status === "confirmed" && !f.isReversal)
    .reduce((sum, f) => sum + Math.abs(f.amount), 0);
  const totalExpense = filteredNormal
    .filter((f) => String(f.type || "").toLowerCase() === "expense" && f.status === "confirmed" && !f.isReversal)
    .reduce((sum, f) => sum + Math.abs(f.amount), 0);

  const fmtAmt = (amount: number, curr?: string) => {
    const c = curr || account.currency;
    if (c === "RMB") return currency(Math.abs(amount), "CNY");
    if (c === "USD") return currency(Math.abs(amount), "USD");
    if (c === "BRL") return currency(Math.abs(amount), "BRL");
    return `${formatNumber(Math.abs(amount))} ${c}`;
  };

  const handleNormalFilterChange = (v: string) => { setNormalFilter(v); setNormalPage(1); };
  const handleNormalCategoryChange = (v: string) => { setNormalCategoryFilter(v); setNormalPage(1); };
  const handleNormalPageSizeChange = (v: number) => { setNormalPageSize(v); setNormalPage(1); };
  const handleTransferFilterChange = (v: string) => { setTransferFilter(v); setTransferPage(1); };
  const handleTransferPageSizeChange = (v: number) => { setTransferPageSize(v); setTransferPage(1); };

  const openVoucher = (v: string) => { setVoucherView(v); setVoucherRotation(0); };

  // 解析凭证数据
  const parseVoucher = (v: any): string[] => {
    const result: string[] = [];
    if (!v) return result;
    if (Array.isArray(v)) v.forEach((x) => { if (typeof x === "string" && x.trim()) result.push(x); });
    else if (typeof v === "string" && v.trim()) {
      try { const p = JSON.parse(v); if (Array.isArray(p)) p.forEach((x) => { if (typeof x === "string" && x.trim()) result.push(x); }); else result.push(v); } catch { result.push(v); }
    }
    return result;
  };

  const renderVoucherCell = (voucherData: any) => {
    const imgs = parseVoucher(voucherData);
    if (imgs.length === 0) return <span className="text-slate-600 text-xs">-</span>;
    return (
      <div className="flex items-center justify-center gap-1">
        {imgs.slice(0, 2).map((v, i) => (
          <img key={i} src={v} alt="凭证" className="h-10 w-10 rounded object-cover cursor-pointer border border-slate-600 hover:border-primary-400" onClick={() => openVoucher(v)} />
        ))}
        {imgs.length > 2 && <span className="text-xs text-slate-400">+{imgs.length - 2}</span>}
      </div>
    );
  };

  const thClass = "px-3 py-2 font-medium text-slate-400 whitespace-nowrap";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">账户流水明细 - {account.name}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {account.accountNumber && `账号：${account.accountNumber} | `}
              币种：{account.currency} |
              当前余额：{fmtAmt(account.originalBalance || 0)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <div className="space-y-6">
          {/* 正常收入支出 */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/60 px-4 py-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-slate-200">正常收入支出</h3>
              <div className="flex items-center gap-2">
                <select value={normalFilter} onChange={(e) => handleNormalFilterChange(e.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-primary-400">
                  <option value="all">全部类型</option>
                  <option value="income">仅收入</option>
                  <option value="expense">仅支出</option>
                </select>
                <select value={normalCategoryFilter} onChange={(e) => handleNormalCategoryChange(e.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-primary-400">
                  <option value="all">全部分类</option>
                  {normalCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={normalPageSize} onChange={(e) => handleNormalPageSizeChange(Number(e.target.value))} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-primary-400">
                  {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}条/页</option>)}
                  <option value={999999}>全部</option>
                </select>
              </div>
            </div>
            {pagedNormal.length === 0 ? (
              <div className="p-8 text-center text-slate-400">暂无收入支出记录</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800/40">
                      <tr>
                        <th className={`${thClass} text-left`}>日期</th>
                        <th className={`${thClass} text-left`}>类型</th>
                        <th className={`${thClass} text-left`}>摘要</th>
                        <th className={`${thClass} text-left`}>分类</th>
                        <th className={`${thClass} text-right`}>金额</th>
                        <th className={`${thClass} text-left`}>备注</th>
                        <th className={`${thClass} text-left`}>状态</th>
                        <th className={`${thClass} text-left`}>业务单号</th>
                        <th className={`${thClass} text-center`}>发起付款凭证</th>
                        <th className={`${thClass} text-center`}>转账凭证</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {pagedNormal.map((flow) => (
                        <tr key={flow.id} className="hover:bg-slate-800/40">
                          <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                            <div>{flow.date ? new Date(flow.date).toLocaleDateString("zh-CN") : "-"}</div>
                            <div className="text-[10px] text-slate-500">{flow.createdAt ? new Date(flow.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${String(flow.type || "").toLowerCase() === "income" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                              {String(flow.type || "").toLowerCase() === "income" ? "收入" : "支出"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-300">{flow.summary}</td>
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{flow.category || "-"}</td>
                          <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${String(flow.type || "").toLowerCase() === "income" ? "text-emerald-300" : "text-rose-300"}`}>
                            {fmtAmt(flow.amount, flow.currency)}
                          </td>
                          <td className="max-w-xs truncate px-3 py-2 text-slate-400" title={flow.remark}>{flow.remark || "-"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`rounded px-2 py-0.5 text-xs ${flow.status === "confirmed" ? "bg-blue-500/20 text-blue-300" : "bg-amber-500/20 text-amber-300"}`}>
                              {flow.status === "confirmed" ? "已确认" : "待核对"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{flow.businessNumber || "-"}</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">{renderVoucherCell(flow.paymentVoucher)}</td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">{renderVoucherCell(flow.transferVoucher)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-800/40">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right font-medium text-slate-300">合计（全部 {normalTotal} 条）：</td>
                        <td className="px-3 py-2 text-right">
                          <div className="space-y-1">
                            <div className="font-medium text-emerald-300">收入：{fmtAmt(totalIncome)}</div>
                            <div className="font-medium text-rose-300">支出：{fmtAmt(totalExpense)}</div>
                          </div>
                        </td>
                        <td colSpan={5}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-700 px-4 py-2 text-xs text-slate-400">
                  <span>共 {normalTotal} 条，第 {safeNormalPage}/{normalTotalPages} 页</span>
                  <div className="flex items-center gap-1">
                    <button disabled={safeNormalPage <= 1} onClick={() => setNormalPage(1)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">首页</button>
                    <button disabled={safeNormalPage <= 1} onClick={() => setNormalPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">上一页</button>
                    <button disabled={safeNormalPage >= normalTotalPages} onClick={() => setNormalPage((p) => Math.min(normalTotalPages, p + 1))} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">下一页</button>
                    <button disabled={safeNormalPage >= normalTotalPages} onClick={() => setNormalPage(normalTotalPages)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">末页</button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 内部划拨记录 */}
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/60 px-4 py-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-slate-200">内部划拨记录</h3>
              <div className="flex items-center gap-2">
                <select value={transferFilter} onChange={(e) => handleTransferFilterChange(e.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-primary-400">
                  <option value="all">全部类型</option>
                  <option value="income">仅划入</option>
                  <option value="expense">仅划出</option>
                </select>
                <select value={transferPageSize} onChange={(e) => handleTransferPageSizeChange(Number(e.target.value))} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none focus:border-primary-400">
                  {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}条/页</option>)}
                  <option value={999999}>全部</option>
                </select>
              </div>
            </div>
            {pagedTransfers.length === 0 ? (
              <div className="p-8 text-center text-slate-400">暂无划拨记录</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800/40">
                      <tr>
                        <th className={`${thClass} text-left`}>日期</th>
                        <th className={`${thClass} text-left`}>类型</th>
                        <th className={`${thClass} text-left`}>对方账户</th>
                        <th className={`${thClass} text-left`}>摘要</th>
                        <th className={`${thClass} text-right`}>金额</th>
                        <th className={`${thClass} text-left`}>备注</th>
                        <th className={`${thClass} text-left`}>状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {pagedTransfers.map((flow) => {
                        const counter = findCounterAccount(flow, allFlows, bankAccounts);
                        return (
                          <tr key={flow.id} className="hover:bg-slate-800/40">
                            <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                              <div>{flow.date ? new Date(flow.date).toLocaleDateString("zh-CN") : "-"}</div>
                              <div className="text-[10px] text-slate-500">{flow.createdAt ? new Date(flow.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`rounded px-2 py-0.5 text-xs font-medium ${String(flow.type || "").toLowerCase() === "income" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
                                {String(flow.type || "").toLowerCase() === "income" ? "划入" : "划出"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                              {counter.accountId ? (
                                <a href={`/finance/accounts?accountId=${counter.accountId}`} className="text-primary-400 hover:text-primary-300 hover:underline cursor-pointer" onClick={(e) => { e.preventDefault(); window.open(`/finance/accounts?accountId=${counter.accountId}`, "_blank"); }}>
                                  {counter.name}
                                </a>
                              ) : (
                                <span>{counter.name}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{flow.summary}</td>
                            <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${String(flow.type || "").toLowerCase() === "income" ? "text-blue-300" : "text-purple-300"}`}>
                              {fmtAmt(flow.amount, flow.currency)}
                            </td>
                            <td className="max-w-xs truncate px-3 py-2 text-slate-400" title={flow.remark}>{flow.remark || "-"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`rounded px-2 py-0.5 text-xs ${flow.status === "confirmed" ? "bg-blue-500/20 text-blue-300" : "bg-amber-500/20 text-amber-300"}`}>
                                {flow.status === "confirmed" ? "已确认" : "待核对"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-800/40">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right font-medium text-slate-300">合计（全部 {transferTotal} 条）：</td>
                        <td className="px-3 py-2 text-right">
                          <div className="space-y-1">
                            <div className="font-medium text-blue-300">
                              划入：{fmtAmt(filteredTransfers.filter((f) => String(f.type || "").toLowerCase() === "income" && f.status === "confirmed" && !f.isReversal).reduce((sum, f) => sum + Math.abs(f.amount), 0))}
                            </div>
                            <div className="font-medium text-purple-300">
                              划出：{fmtAmt(filteredTransfers.filter((f) => String(f.type || "").toLowerCase() === "expense" && f.status === "confirmed" && !f.isReversal).reduce((sum, f) => sum + Math.abs(f.amount), 0))}
                            </div>
                          </div>
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-700 px-4 py-2 text-xs text-slate-400">
                  <span>共 {transferTotal} 条，第 {safeTransferPage}/{transferTotalPages} 页</span>
                  <div className="flex items-center gap-1">
                    <button disabled={safeTransferPage <= 1} onClick={() => setTransferPage(1)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">首页</button>
                    <button disabled={safeTransferPage <= 1} onClick={() => setTransferPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">上一页</button>
                    <button disabled={safeTransferPage >= transferTotalPages} onClick={() => setTransferPage((p) => Math.min(transferTotalPages, p + 1))} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">下一页</button>
                    <button disabled={safeTransferPage >= transferTotalPages} onClick={() => setTransferPage(transferTotalPages)} className="rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30">末页</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-600">关闭</button>
        </div>

        {/* 凭证查看弹窗（与流水明细统一旋转样式） */}
        {voucherView && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => { setVoucherView(null); setVoucherRotation(0); }}>
            <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button
                  onClick={() => setVoucherRotation((r) => (r - 90) % 360)}
                  className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                  title="向左旋转"
                >↺</button>
                <button
                  onClick={() => setVoucherRotation((r) => (r + 90) % 360)}
                  className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                  title="向右旋转"
                >↻</button>
                <button
                  onClick={() => { setVoucherView(null); setVoucherRotation(0); }}
                  className="text-white text-2xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
                >✕</button>
              </div>
              <img src={voucherView} alt="凭证" className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain transition-transform duration-200" style={{ transform: `rotate(${voucherRotation}deg)` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
