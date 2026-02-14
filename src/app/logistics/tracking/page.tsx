"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, ExternalLink, Package, ArrowRight } from "lucide-react";
import useSWR from "swr";
import InventoryDistribution from "@/components/InventoryDistribution";

// 物流跟踪类型
type TrackingStatus = "Pending" | "In Transit" | "Delivered" | "Exception";

type TrackingEvent = {
  id: string;
  timestamp: string;
  location?: string;
  description: string;
  status: TrackingStatus;
};

type LogisticsTracking = {
  id: string;
  internalOrderNumber: string;
  trackingNumber: string;
  channelId: string;
  channelName: string;
  channelCode?: string;
  currentStatus: TrackingStatus;
  shippedDate: string;
  lastUpdatedAt: string;
  transportDays?: number;
  orderId?: string;
  events: TrackingEvent[];
  createdAt: string;
  updatedAt: string;
};

type LogisticsChannel = {
  id: string;
  name: string;
  channelCode: string;
  queryUrl: string;
};

type PurchaseContract = {
  id: string;
  contractNumber: string;
  [key: string]: any;
};

// SWR fetcher
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

const STATUS_COLORS: Record<TrackingStatus, { dot: string; text: string; bg: string }> = {
  Pending: {
    dot: "bg-slate-400",
    text: "text-slate-300",
    bg: "bg-slate-500/10"
  },
  "In Transit": {
    dot: "bg-primary-400",
    text: "text-primary-300",
    bg: "bg-primary-500/10"
  },
  Delivered: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10"
  },
  Exception: {
    dot: "bg-rose-400",
    text: "text-rose-300",
    bg: "bg-rose-500/10"
  }
};

const STATUS_LABELS: Record<TrackingStatus, string> = {
  Pending: "待发货",
  "In Transit": "运输中",
  Delivered: "已送达",
  Exception: "异常"
};

export default function LogisticsTrackingPage() {
  // 使用 SWR 获取数据（兼容分页结构 { data, pagination }）
  const { data: trackingRaw, mutate: mutateTracking } = useSWR<any>('/api/logistics-tracking?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const { data: channelsRaw } = useSWR<any>('/api/logistics-channels?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const { data: contractsRaw } = useSWR<any>('/api/purchase-contracts?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const tracking = (Array.isArray(trackingRaw) ? trackingRaw : (trackingRaw?.data ?? [])) as LogisticsTracking[];
  const channels = (Array.isArray(channelsRaw) ? channelsRaw : (channelsRaw?.data ?? [])) as LogisticsChannel[];
  const contracts = (Array.isArray(contractsRaw) ? contractsRaw : (contractsRaw?.data ?? [])) as PurchaseContract[];

  const [filterStatus, setFilterStatus] = useState<TrackingStatus | "all">("all");
  const [selectedTracking, setSelectedTracking] = useState<LogisticsTracking | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [createForm, setCreateForm] = useState({
    internalOrderNumber: "",
    trackingNumber: "",
    channelId: "",
    shippedDate: new Date().toISOString().slice(0, 10)
  });

  const filteredTracking = useMemo(() => {
    let result = tracking;
    if (filterStatus !== "all") {
      result = result.filter((t) => t.currentStatus === filterStatus);
    }
    return result.sort((a, b) => 
      new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
    );
  }, [tracking, filterStatus]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const handleViewDetail = (trackingRecord: LogisticsTracking) => {
    setSelectedTracking(trackingRecord);
    setIsDrawerOpen(true);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    
    if (!createForm.internalOrderNumber.trim() || !createForm.trackingNumber.trim() || !createForm.channelId) {
      toast.error("请填写内部订单号、物流单号和选择物流商");
      return;
    }
    
    const channel = channels.find((c) => c.id === createForm.channelId);
    if (!channel) {
      toast.error("请选择有效的物流商");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const body = {
        internalOrderNumber: createForm.internalOrderNumber.trim(),
        trackingNumber: createForm.trackingNumber.trim(),
        channelId: createForm.channelId,
        currentStatus: "Pending",
        shippedDate: createForm.shippedDate,
        lastUpdatedAt: new Date().toISOString(),
        events: [
          {
            timestamp: new Date().toISOString(),
            description: "物流单已创建",
            status: "Pending"
          }
        ]
      };

      const response = await fetch('/api/logistics-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '创建失败');
      }

      toast.success("物流跟踪记录已创建");
      mutateTracking(); // 刷新数据
      setCreateForm({
        internalOrderNumber: "",
        trackingNumber: "",
        channelId: "",
        shippedDate: new Date().toISOString().slice(0, 10)
      });
      setIsCreateModalOpen(false);
    } catch (error: any) {
      console.error("创建物流跟踪失败:", error);
      toast.error(error.message || "创建失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("⚠️ 确定要删除这条物流跟踪记录吗？\n此操作不可恢复！")) return;
    
    try {
      const response = await fetch(`/api/logistics-tracking/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }

      toast.success("物流跟踪记录已删除");
      mutateTracking(); // 刷新数据
      if (selectedTracking?.id === id) {
        setIsDrawerOpen(false);
        setSelectedTracking(null);
      }
    } catch (error: any) {
      console.error("删除物流跟踪失败:", error);
      toast.error(error.message || "删除失败，请重试");
    }
  };

  const getChannelQueryUrl = (trackingRecord: LogisticsTracking): string | null => {
    const channel = channels.find((c) => c.id === trackingRecord.channelId);
    if (!channel?.queryUrl) return null;
    return channel.queryUrl.replace(/\{tracking\}/g, trackingRecord.trackingNumber);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">物流跟踪</h1>
          <p className="mt-1 text-sm text-slate-400">跟踪和管理物流信息，支持多物流商、多订单维度。</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
        >
          新增跟踪
        </button>
      </header>

      {/* 状态筛选器 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">状态筛选：</span>
        <button
          onClick={() => setFilterStatus("all")}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            filterStatus === "all"
              ? "bg-primary-500/20 text-primary-300 border border-primary-500/40"
              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
          }`}
        >
          全部
        </button>
        {Object.entries(STATUS_LABELS).map(([status, label]) => {
          const statusKey = status as TrackingStatus;
          const colors = STATUS_COLORS[statusKey];
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(statusKey)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                filterStatus === statusKey
                  ? `${colors.bg} ${colors.text} border border-current/40`
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>
              {label}
            </button>
          );
        })}
      </div>

      {/* 物流跟踪列表 */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">内部订单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">物流单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">物流商</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">当前状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">发货日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">最后更新</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">运输时长</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
              {filteredTracking.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                    {filterStatus === "all" 
                      ? "暂无物流跟踪记录，请点击右上角「新增跟踪」"
                      : `暂无${STATUS_LABELS[filterStatus]}状态的记录`}
                  </td>
                </tr>
              ) : (
                filteredTracking.map((trackingRecord) => {
                  const colors = STATUS_COLORS[trackingRecord.currentStatus];
                  const queryUrl = getChannelQueryUrl(trackingRecord);
                  
                  return (
                    <tr key={trackingRecord.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewDetail(trackingRecord)}
                          className="text-primary-400 hover:text-primary-300 font-medium"
                        >
                          {trackingRecord.internalOrderNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200">{trackingRecord.trackingNumber}</span>
                          {queryUrl && (
                            <a
                              href={queryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-400 hover:text-primary-300"
                              title="官方查询"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{trackingRecord.channelName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
                          <span className={colors.text}>{STATUS_LABELS[trackingRecord.currentStatus]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(trackingRecord.shippedDate).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {formatDate(trackingRecord.lastUpdatedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {trackingRecord.transportDays !== undefined 
                          ? `${trackingRecord.transportDays} 天`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewDetail(trackingRecord)}
                            className="text-xs text-primary-300 hover:text-primary-200 rounded border border-primary-500/40 px-2 py-1 bg-primary-500/5"
                          >
                            详情
                          </button>
                          <button
                            onClick={() => handleDelete(trackingRecord.id)}
                            className="text-xs text-rose-300 hover:text-rose-200 rounded border border-rose-500/40 px-2 py-1 bg-rose-500/5"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 详情侧边栏 Drawer */}
      {isDrawerOpen && selectedTracking && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => {
              setIsDrawerOpen(false);
              setSelectedTracking(null);
            }}
          />
          <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl z-50 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">物流详情</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    {selectedTracking.internalOrderNumber}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setSelectedTracking(null);
                  }}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 基本信息 */}
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">物流单号：</span>
                    <span className="text-slate-200 ml-2">{selectedTracking.trackingNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">物流商：</span>
                    <span className="text-slate-200 ml-2">{selectedTracking.channelName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">发货日期：</span>
                    <span className="text-slate-200 ml-2">
                      {new Date(selectedTracking.shippedDate).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">运输时长：</span>
                    <span className="text-slate-200 ml-2">
                      {selectedTracking.transportDays !== undefined 
                        ? `${selectedTracking.transportDays} 天`
                        : "-"}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">当前状态：</span>
                  <span className={`ml-2 inline-flex items-center gap-1.5 ${STATUS_COLORS[selectedTracking.currentStatus].text}`}>
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[selectedTracking.currentStatus].dot}`}></span>
                    {STATUS_LABELS[selectedTracking.currentStatus]}
                  </span>
                </div>
              </div>

              {/* 物流轨迹时间轴 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-200 mb-4">物流轨迹</h3>
                <div className="relative">
                  {/* 时间轴竖线 */}
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-700"></div>
                  
                  <div className="space-y-4">
                    {selectedTracking.events
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((event) => {
                        const colors = STATUS_COLORS[event.status];
                        return (
                          <div key={event.id} className="relative flex items-start gap-4">
                            {/* 时间轴圆点 */}
                            <div className={`relative z-10 w-6 h-6 rounded-full ${colors.dot} border-2 border-slate-900 flex items-center justify-center`}>
                              <div className={`w-2 h-2 rounded-full ${colors.dot}`}></div>
                            </div>
                            
                            {/* 内容 */}
                            <div className="flex-1 pb-4">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-sm font-medium ${colors.text}`}>
                                  {STATUS_LABELS[event.status]}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {formatDate(event.timestamp)}
                                </span>
                              </div>
                              {event.location && (
                                <p className="text-xs text-slate-400 mb-1">{event.location}</p>
                              )}
                              <p className="text-sm text-slate-300">{event.description}</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 新增跟踪模态框 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">新增物流跟踪</h2>
                <p className="text-xs text-slate-400 mt-1">创建新的物流跟踪记录</p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-sm">
              <label className="space-y-1 block">
                <span className="text-slate-300">
                  内部订单号 <span className="text-rose-400">*</span>
                </span>
                <input
                  value={createForm.internalOrderNumber}
                  onChange={(e) => setCreateForm((f) => ({ ...f, internalOrderNumber: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                  required
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-slate-300">
                  物流单号 <span className="text-rose-400">*</span>
                </span>
                <input
                  value={createForm.trackingNumber}
                  onChange={(e) => setCreateForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                  required
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-slate-300">
                  物流商 <span className="text-rose-400">*</span>
                </span>
                <select
                  value={createForm.channelId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, channelId: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                  required
                >
                  <option value="">请选择</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name} ({channel.channelCode})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 block">
                <span className="text-slate-300">
                  发货日期 <span className="text-rose-400">*</span>
                </span>
                <input
                  type="date"
                  value={createForm.shippedDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, shippedDate: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                  required
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:shadow-primary-500/25 hover:from-primary-600 hover:to-primary-700 transition-all duration-200 active:translate-y-px"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
