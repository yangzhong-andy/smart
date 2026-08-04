"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { X, ExternalLink, Package, ArrowRight } from "lucide-react";
import {
  PageHeader, StatCard, ActionButton,
  SearchBar, EmptyState
} from "@/components/ui";
import {
  useLogisticsTracking,
  useLogisticsChannels,
  useTrackingActions,
  formatDate,
  getStatusColor,
  getStatusLabel
} from "@/logistics/hooks";
import type { LogisticsTracking as TrackingType, LogisticsChannel } from "@/logistics/types";

// 扩展物流跟踪类型
interface TrackingItem extends TrackingType {
  internalOrderNumber?: string;
}

// 表单数据类型
interface CreateFormData {
  internalOrderNumber: string;
  trackingNumber: string;
  channelId: string;
  shippedDate: string;
}

// 初始表单数据
const initialFormData: CreateFormData = {
  internalOrderNumber: "",
  trackingNumber: "",
  channelId: "",
  shippedDate: ""
};

export default function LogisticsTrackingPage() {
  // 使用统一 Hooks
  const { tracking, isLoading, mutate } = useLogisticsTracking();
  const { channels, isLoading: channelsLoading } = useLogisticsChannels();
  const { createTracking } = useTrackingActions();

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Drawer 和 Modal 状态
  const [selectedTracking, setSelectedTracking] = useState<TrackingItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 统计信息
  const stats = useMemo(() => ({
    total: tracking.length,
    pending: tracking.filter((t: TrackingType) => t.currentStatus === "Pending").length,
    inTransit: tracking.filter((t: TrackingType) => t.currentStatus === "In Transit").length,
    delivered: tracking.filter((t: TrackingType) => t.currentStatus === "Delivered").length,
    exception: tracking.filter((t: TrackingType) => t.currentStatus === "Exception").length
  }), [tracking]);

  // 筛选跟踪记录
  const filteredTracking = useMemo(() => {
    let result = [...tracking];

    // 状态筛选
    if (filterStatus !== "all") {
      result = result.filter((t: TrackingType) => t.currentStatus === filterStatus);
    }

    // 关键词搜索
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((t: TrackingType) =>
        t.trackingNumber?.toLowerCase().includes(keyword) ||
        t.internalOrderNumber?.toLowerCase().includes(keyword) ||
        t.channelName?.toLowerCase().includes(keyword)
      );
    }

    return result.sort((a: TrackingType, b: TrackingType) => 
      new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
    );
  }, [tracking, filterStatus, searchKeyword]);

  // 查看详情
  const handleViewDetail = (item: TrackingType) => {
    setSelectedTracking(item as TrackingItem);
    setIsDrawerOpen(true);
  };

  // 创建跟踪
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!createForm.trackingNumber.trim() || !createForm.channelId) {
      toast.error("请填写必填项");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const channel = channels.find(c => c.id === createForm.channelId);
      
      await createTracking({
        trackingNumber: createForm.trackingNumber.trim(),
        channelId: createForm.channelId,
        channelName: channel?.name || "",
        channelCode: channel?.channelCode,
        currentStatus: "Pending",
        shippedDate: createForm.shippedDate,
        lastUpdatedAt: new Date().toISOString(),
        events: []
      });

      toast.success("创建成功");
      setIsCreateModalOpen(false);
      setCreateForm(initialFormData);
    } catch (error) {
      toast.error("创建失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 打开创建模态框
  const handleOpenCreate = () => {
    setCreateForm(initialFormData);
    setIsCreateModalOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="物流跟踪"
        description="管理物流单号，追踪运输状态"
        actions={
          <div className="flex gap-2">
            <ActionButton onClick={handleOpenCreate} variant="primary" icon={Package}>
              新增跟踪
            </ActionButton>
          </div>
        }
      />

      {/* 统计面板 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="总单数" value={stats.total} icon={Package} />
        <StatCard title="待发货" value={stats.pending} icon={ArrowRight} />
        <StatCard title="运输中" value={stats.inTransit} icon={Package} />
        <StatCard title="已送达" value={stats.delivered} icon={Package} />
        <StatCard title="异常" value={stats.exception} icon={Package} />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索物流单号、订单号、物流商..."
        />

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
        >
          <option value="all">全部状态</option>
          <option value="Pending">待发货</option>
          <option value="In Transit">运输中</option>
          <option value="Delivered">已送达</option>
          <option value="Exception">异常</option>
        </select>
      </div>

      {/* 跟踪列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filteredTracking.length === 0 ? (
        <EmptyState
          icon={Package}
          title="暂无物流跟踪"
          description="暂无符合条件的物流跟踪记录"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTracking.map((item) => (
            <TrackingCard
              key={item.id}
              tracking={item as TrackingItem}
              channels={channels}
              onView={() => handleViewDetail(item)}
            />
          ))}
        </div>
      )}

      {/* 详情 Drawer */}
      {isDrawerOpen && selectedTracking && (
        <TrackingDrawer
          tracking={selectedTracking}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedTracking(null);
          }}
        />
      )}

      {/* 新增模态框 */}
      {isCreateModalOpen && (
        <CreateTrackingModal
          form={createForm}
          setForm={setCreateForm}
          channels={channels}
          isSubmitting={isSubmitting}
          onSave={handleCreate}
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}
    </div>
  );
}

// ==================== 跟踪卡片组件 ====================

interface TrackingCardProps {
  tracking: TrackingItem;
  channels: LogisticsChannel[];
  onView: () => void;
}

function TrackingCard({ tracking, channels, onView }: TrackingCardProps) {
  const colors = getStatusColor(tracking.currentStatus);
  const channel = channels.find(c => c.id === tracking.channelId);

  return (
    <div 
      onClick={onView}
      className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:bg-slate-800/40 hover:border-primary-500/50 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${colors.bg.replace('/10', '')}`}></span>
            <span className={`text-sm font-medium ${colors.text}`}>
              {getStatusLabel(tracking.currentStatus)}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            物流单号：{tracking.trackingNumber}
          </p>
        </div>
        {channel?.queryUrl && (
          <a
            href={channel.queryUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded text-slate-400 hover:text-primary-300 hover:bg-primary-500/10 transition-colors"
            title="查询官网"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">订单号</span>
          <span className="text-slate-300">{tracking.internalOrderNumber || "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">物流商</span>
          <span className="text-slate-300">{tracking.channelName || "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">发货日期</span>
          <span className="text-slate-300">{formatDate(tracking.shippedDate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">运输时长</span>
          <span className="text-slate-300">
            {tracking.transportDays !== undefined ? `${tracking.transportDays} 天` : "-"}
          </span>
        </div>
      </div>

      {/* 最后更新时间 */}
      <div className="mt-3 pt-3 border-t border-slate-800">
        <p className="text-xs text-slate-500">
          最后更新：{formatDate(tracking.lastUpdatedAt)}
        </p>
      </div>
    </div>
  );
}

// ==================== 详情 Drawer ====================

interface TrackingDrawerProps {
  tracking: TrackingItem;
  onClose: () => void;
}

function TrackingDrawer({ tracking, onClose }: TrackingDrawerProps) {
  const colors = getStatusColor(tracking.currentStatus);

  return (
    <>
      {/* 遮罩层 */}
      <div 
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl z-50 overflow-y-auto">
        <div className="p-6">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">物流详情</h2>
              <p className="text-sm text-slate-400 mt-1">
                {tracking.internalOrderNumber || tracking.trackingNumber}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 基本信息 */}
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">物流单号：</span>
                <span className="text-slate-200 ml-2">{tracking.trackingNumber}</span>
              </div>
              <div>
                <span className="text-slate-400">物流商：</span>
                <span className="text-slate-200 ml-2">{tracking.channelName}</span>
              </div>
              <div>
                <span className="text-slate-400">发货日期：</span>
                <span className="text-slate-200 ml-2">{formatDate(tracking.shippedDate)}</span>
              </div>
              <div>
                <span className="text-slate-400">运输时长：</span>
                <span className="text-slate-200 ml-2">
                  {tracking.transportDays !== undefined ? `${tracking.transportDays} 天` : "-"}
                </span>
              </div>
            </div>
            
            {/* 当前状态 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">当前状态：</span>
              <span className={`inline-flex items-center gap-1.5 ${colors.text}`}>
                <span className={`w-2 h-2 rounded-full ${colors.bg.replace('/10', '')}`}></span>
                {getStatusLabel(tracking.currentStatus)}
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
                {tracking.events
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((event) => {
                    const eventColors = getStatusColor(event.status);
                    return (
                      <div key={event.id} className="relative flex items-start gap-4">
                        {/* 时间轴圆点 */}
                        <div className={`relative z-10 w-6 h-6 rounded-full ${eventColors.bg.replace('/10', '')} border-2 border-slate-900 flex items-center justify-center`}>
                          <div className={`w-2 h-2 rounded-full ${eventColors.bg.replace('/10', '')}`}></div>
                        </div>
                        
                        {/* 内容 */}
                        <div className="flex-1 pb-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-sm font-medium ${eventColors.text}`}>
                              {getStatusLabel(event.status)}
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
  );
}

// ==================== 新增模态框 ====================

interface CreateModalProps {
  form: CreateFormData;
  setForm: React.Dispatch<React.SetStateAction<CreateFormData>>;
  channels: LogisticsChannel[];
  isSubmitting: boolean;
  onSave: (e: React.FormEvent) => void;
  onClose: () => void;
}

function CreateTrackingModal({ form, setForm, channels, isSubmitting, onSave, onClose }: CreateModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">新增物流跟踪</h2>
            <p className="text-xs text-slate-400 mt-1">创建新的物流跟踪记录</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4 text-sm">
          <label className="block space-y-1">
            <span className="text-slate-300">
              内部订单号 <span className="text-rose-400">*</span>
            </span>
            <input
              type="text"
              value={form.internalOrderNumber}
              onChange={(e) => setForm(f => ({ ...f, internalOrderNumber: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              placeholder="可选"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-slate-300">
              物流单号 <span className="text-rose-400">*</span>
            </span>
            <input
              type="text"
              value={form.trackingNumber}
              onChange={(e) => setForm(f => ({ ...f, trackingNumber: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              required
            />
          </label>

          <label className="block space-y-1">
            <span className="text-slate-300">
              物流商 <span className="text-rose-400">*</span>
            </span>
            <select
              value={form.channelId}
              onChange={(e) => setForm(f => ({ ...f, channelId: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
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

          <label className="block space-y-1">
            <span className="text-slate-300">
              发货日期 <span className="text-rose-400">*</span>
            </span>
            <input
              type="date"
              value={form.shippedDate}
              onChange={(e) => setForm(f => ({ ...f, shippedDate: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
              required
            />
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <ActionButton type="button" onClick={onClose} variant="secondary">
              取消
            </ActionButton>
            <ActionButton 
              type="submit" 
              variant="primary" 
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting ? "保存中..." : "保存"}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
