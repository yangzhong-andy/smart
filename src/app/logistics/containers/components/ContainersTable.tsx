"use client";

import type { Container } from "@/logistics/types";

interface ContainersTableProps {
  isLoading: boolean;
  containers: Container[];
  statusLabels: Record<string, string>;
  methodLabels: Record<string, string>;
  getProgress: (status: string) => number;
  getProgressBarColor: (status: string) => string;
  getVoyageInfo: (container: Container) => {
    daysPassed: number;
    totalDays: number;
    daysLeft: number;
    overdueDays: number;
    /** 航行进度百分比（0-100） */
    progress: number;
    /** 预计到港日期（展示用） */
    eta?: string;
    isOverdue: boolean;
  } | null;
  formatDate: (value?: string | null) => string;
  formatNumber: (value?: string | null, digits?: number) => string;
  onOpenDetail: (container: Container) => void;
  onChangeStatus: (container: Container, status: string) => void;
  statusOptions: Array<{ value: string; label: string }>;
}

export function ContainersTable({
  isLoading,
  containers,
  statusLabels,
  methodLabels,
  getProgress,
  getProgressBarColor,
  getVoyageInfo,
  formatDate,
  formatNumber,
  onOpenDetail,
  onChangeStatus,
  statusOptions,
}: ContainersTableProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">柜号/类型</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">运输信息</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">航线与时间</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">业务主体</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">体积/重量</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">批次/进度</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-400">状态</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {!isLoading && containers.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                  暂无柜子记录，请点击右上角“新增柜子”
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={8}>
                  正在加载柜子数据...
                </td>
              </tr>
            )}
            {containers.map((c) => {
              const voyageInfo = getVoyageInfo(c);
              const pct = voyageInfo?.progress ?? getProgress(c.status);
              return (
                <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{c.containerNo}</div>
                    <div className="text-[11px] text-slate-500">{c.containerType}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200">{methodLabels[c.shippingMethod] ?? c.shippingMethod}</div>
                    <div className="text-[11px] text-slate-500">
                      {c.shipCompany || "-"} · {c.vesselName || "-"} {c.voyageNo ? `· ${c.voyageNo}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200">{c.originPort || "-"} → {c.destinationPort || "-"}</div>
                    <div className="text-[11px] text-slate-500">
                      装柜 {formatDate(c.loadingDate)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      ETD {formatDate(c.etd)} · ETA {formatDate(c.eta)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      实际开船 {formatDate(c.etd ?? c.actualDeparture)} · 实际到港 {formatDate(c.eta ?? c.actualArrival)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200">{c.exporterName || "-"}</div>
                    <div className="text-[11px] text-slate-500">海外公司 {c.overseasCompanyName || "-"}</div>
                    <div className="text-[11px] text-slate-500">仓库 {c.warehouseName || "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200">CBM {formatNumber(c.totalVolumeCBM)}</div>
                    <div className="text-[11px] text-slate-500">KG {formatNumber(c.totalWeightKG)}</div>
                  </td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <div className="text-slate-200">批次 {c.outboundBatchCount ?? 0}</div>
                    <div className="mt-1">
                      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                        <span>运输进度</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${getProgressBarColor(c.status)} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    {voyageInfo && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        已航行 {voyageInfo.daysPassed}/{voyageInfo.totalDays} 天 ·
                        {voyageInfo.isOverdue
                          ? ` 延误 ${voyageInfo.overdueDays} 天`
                          : ` 预计 ${voyageInfo.daysLeft} 天到港`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-100">{statusLabels[c.status] ?? c.status}</div>
                    <div className="text-[11px] text-slate-500">创建于 {formatDate(c.createdAt)}</div>
                    <div className="mt-1">
                      <select
                        value={c.status}
                        onChange={(e) => onChangeStatus(c, e.target.value)}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300"
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(c)}
                      className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

