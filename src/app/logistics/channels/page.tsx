"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Truck, Pencil, Trash2, Search, X, Download, ExternalLink, Phone, Globe } from "lucide-react";
import useSWR from "swr";

// 物流渠道类型
type LogisticsChannel = {
  id: string;
  name: string; // 物流商名称
  channelCode: string; // 渠道代码
  contact: string; // 联系人
  phone: string; // 联系电话
  queryUrl: string; // 官方查询网址
  createdAt: string;
  updatedAt: string;
};

// SWR fetcher
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateString;
  }
};

export default function LogisticsChannelsPage() {
  // 使用 SWR 获取渠道数据（兼容分页结构 { data, pagination }）
  const { data: channelsRaw, mutate: mutateChannels } = useSWR<any>('/api/logistics-channels?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const channels = (Array.isArray(channelsRaw) ? channelsRaw : (channelsRaw?.data ?? [])) as LogisticsChannel[];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<LogisticsChannel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "code" | "created">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [hoveredChannelId, setHoveredChannelId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    channelCode: "",
    contact: "",
    phone: "",
    queryUrl: ""
  });

  // 统计数据
  const channelStats = useMemo(() => {
    const total = channels.length;
    const withContact = channels.filter(c => c.contact && c.contact.trim()).length;
    const withQueryUrl = channels.filter(c => c.queryUrl && c.queryUrl.trim()).length;
    const withPhone = channels.filter(c => c.phone && c.phone.trim()).length;
    return { total, withContact, withQueryUrl, withPhone };
  }, [channels]);

  // 搜索和排序
  const filteredAndSortedChannels = useMemo(() => {
    let filtered = channels;

    // 搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.channelCode.toLowerCase().includes(query) ||
          (c.contact && c.contact.toLowerCase().includes(query)) ||
          (c.phone && c.phone.toLowerCase().includes(query))
      );
    }

    // 排序
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name, "zh-Hans-CN");
      } else if (sortBy === "code") {
        comparison = a.channelCode.localeCompare(b.channelCode);
      } else if (sortBy === "created") {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [channels, searchQuery, sortBy, sortOrder]);

  const resetForm = () => {
    setForm({
      name: "",
      channelCode: "",
      contact: "",
      phone: "",
      queryUrl: ""
    });
    setEditingChannel(null);
  };

  const handleOpenModal = (channel?: LogisticsChannel) => {
    if (channel) {
      setEditingChannel(channel);
      setForm({
        name: channel.name,
        channelCode: channel.channelCode,
        contact: channel.contact,
        phone: channel.phone,
        queryUrl: channel.queryUrl
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting) {
      toast.error("正在提交，请勿重复点击");
      return;
    }
    
    if (!form.name.trim() || !form.channelCode.trim()) {
      toast.error("请填写物流商名称和渠道代码");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const body = {
        name: form.name.trim(),
        channelCode: form.channelCode.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        queryUrl: form.queryUrl.trim()
      };

      if (editingChannel) {
        // 更新
        const response = await fetch(`/api/logistics-channels/${editingChannel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || '更新失败');
        }

        toast.success("物流渠道已更新");
      } else {
        // 创建
        const response = await fetch('/api/logistics-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || '创建失败');
        }

        toast.success("物流渠道已创建");
      }

      mutateChannels(); // 刷新数据
      resetForm();
      setIsModalOpen(false);
    } catch (error: any) {
      console.error("保存物流渠道失败:", error);
      toast.error(error.message || "操作失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个物流渠道吗？\n此操作不可恢复！")) return;
    
    try {
      const response = await fetch(`/api/logistics-channels/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }

      toast.success("物流渠道已删除");
      mutateChannels(); // 刷新数据
    } catch (error: any) {
      console.error("删除物流渠道失败:", error);
      toast.error(error.message || "删除失败，请重试");
    }
  };

  const handleExportData = () => {
    if (filteredAndSortedChannels.length === 0) {
      toast.error("没有数据可导出");
      return;
    }

    const csvData = filteredAndSortedChannels.map((c) => {
      return {
        物流商名称: c.name,
        渠道代码: c.channelCode,
        联系人: c.contact || "",
        联系电话: c.phone || "",
        官方查询网址: c.queryUrl || "",
        创建时间: new Date(c.createdAt).toLocaleString("zh-CN"),
        更新时间: new Date(c.updatedAt).toLocaleString("zh-CN")
      };
    });

    if (csvData.length === 0) {
      toast.error("没有数据可导出");
      return;
    }

    const headers = Object.keys(csvData[0]);
    const rows = csvData.map((row) => {
      const rowValues = headers.map((h) => {
        const value = row[h as keyof typeof row];
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      return rowValues.join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `物流渠道_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("数据已导出");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">物流渠道</h1>
          <p className="mt-1 text-sm text-slate-400">管理物流商信息，支持多物流商、多渠道代码。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            disabled={filteredAndSortedChannels.length === 0}
            className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-300 shadow hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-4 w-4" />
            导出数据
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
          >
            <Truck className="h-4 w-4" />
            新增渠道
          </button>
        </div>
      </header>

      {/* 统计面板 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">总渠道数</p>
              <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {channelStats.total}
              </p>
            </div>
            <Truck className="h-8 w-8 text-primary-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">有联系人</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {channelStats.withContact}
              </p>
            </div>
            <Phone className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #7c2d12 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">有查询网址</p>
              <p className="text-2xl font-bold text-orange-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {channelStats.withQueryUrl}
              </p>
            </div>
            <Globe className="h-8 w-8 text-orange-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">有联系电话</p>
              <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {channelStats.withPhone}
              </p>
            </div>
            <Phone className="h-8 w-8 text-purple-300 opacity-50" />
          </div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索物流商名称、渠道代码、联系人..."
            className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-slate-400">排序：</span>
          <button
            onClick={() => {
              if (sortBy === "name") {
                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              } else {
                setSortBy("name");
                setSortOrder("asc");
              }
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              sortBy === "name"
                ? "bg-primary-500/20 text-primary-300 border border-primary-500/40"
                : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
            }`}
          >
            名称 {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
          </button>
          <button
            onClick={() => {
              if (sortBy === "code") {
                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              } else {
                setSortBy("code");
                setSortOrder("asc");
              }
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              sortBy === "code"
                ? "bg-primary-500/20 text-primary-300 border border-primary-500/40"
                : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
            }`}
          >
            代码 {sortBy === "code" && (sortOrder === "asc" ? "↑" : "↓")}
          </button>
          <button
            onClick={() => {
              if (sortBy === "created") {
                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              } else {
                setSortBy("created");
                setSortOrder("desc");
              }
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              sortBy === "created"
                ? "bg-primary-500/20 text-primary-300 border border-primary-500/40"
                : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
            }`}
          >
            创建时间 {sortBy === "created" && (sortOrder === "asc" ? "↑" : "↓")}
          </button>
        </div>
      </div>

      {/* 渠道卡片网格 */}
      {filteredAndSortedChannels.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <Truck className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400">
            {searchQuery ? "未找到匹配的物流渠道" : "暂无物流渠道，请点击右上角「新增渠道」"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedChannels.map((channel) => {
            const isHovered = hoveredChannelId === channel.id;
            return (
              <div
                key={channel.id}
                className="group relative overflow-hidden rounded-2xl border p-5 transition-all"
                style={{
                  background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.1)"
                }}
                onMouseEnter={() => setHoveredChannelId(channel.id)}
                onMouseLeave={() => setHoveredChannelId(null)}
              >
                {/* 操作按钮 - 始终显示在右上角 */}
                <div className="absolute top-3 right-3 flex gap-2 z-30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenModal(channel);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors"
                    title="编辑渠道"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(channel.id);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
                    title="删除渠道"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* 主卡片内容 */}
                <div className="relative z-0">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-100 mb-1">{channel.name}</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-500/20 px-2 py-0.5 text-xs text-primary-300">
                        <Truck className="h-3 w-3" />
                        {channel.channelCode}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {channel.contact && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span>{channel.contact}</span>
                      </div>
                    )}
                    {channel.phone && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span>{channel.phone}</span>
                      </div>
                    )}
                    {channel.queryUrl && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-slate-400" />
                        <a
                          href={channel.queryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary-400 hover:text-primary-300 text-xs truncate flex items-center gap-1"
                        >
                          <span className="truncate">{channel.queryUrl}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* 详情预览（悬停时显示） */}
                {isHovered && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-2xl p-5 flex flex-col justify-between z-10 overflow-y-auto">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs text-slate-400 mb-1">基本信息</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">物流商名称：</span>
                            <span className="text-slate-100">{channel.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">渠道代码：</span>
                            <span className="text-primary-300">{channel.channelCode}</span>
                          </div>
                        </div>
                      </div>
                      {(channel.contact || channel.phone) && (
                        <div>
                          <h4 className="text-xs text-slate-400 mb-1">联系方式</h4>
                          <div className="space-y-1 text-sm">
                            {channel.contact && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">联系人：</span>
                                <span className="text-slate-100">{channel.contact}</span>
                              </div>
                            )}
                            {channel.phone && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">联系电话：</span>
                                <span className="text-slate-100">{channel.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {channel.queryUrl && (
                        <div>
                          <h4 className="text-xs text-slate-400 mb-1">查询网址</h4>
                          <a
                            href={channel.queryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary-400 hover:text-primary-300 text-xs break-all flex items-center gap-1"
                          >
                            {channel.queryUrl}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                      <div>
                        <h4 className="text-xs text-slate-400 mb-1">元数据</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">创建时间：</span>
                            <span className="text-slate-100">{formatDate(channel.createdAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">更新时间：</span>
                            <span className="text-slate-100">{formatDate(channel.updatedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 新增/编辑模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {editingChannel ? "编辑物流渠道" : "新增物流渠道"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  录入物流商信息，用于物流跟踪和管理
                </p>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1 block">
                  <span className="text-slate-300">
                    物流商名称 <span className="text-rose-400">*</span>
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                    required
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-300">
                    渠道代码 <span className="text-rose-400">*</span>
                  </span>
                  <input
                    value={form.channelCode}
                    onChange={(e) => setForm((f) => ({ ...f, channelCode: e.target.value }))}
                    placeholder="如：SF、YTO、ZTO"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                    required
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-300">联系人</span>
                  <input
                    value={form.contact}
                    onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-300">联系电话</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                  />
                </label>
                <label className="space-y-1 block col-span-2">
                  <span className="text-slate-300">官方查询网址</span>
                  <input
                    type="url"
                    value={form.queryUrl}
                    onChange={(e) => setForm((f) => ({ ...f, queryUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30 focus:shadow-[0_0_0_3px_rgba(0,229,255,0.1)]"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-gradient-to-r from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:shadow-primary-500/25 hover:from-primary-600 hover:to-primary-700 transition-all duration-200 active:translate-y-px"
                >
                  {editingChannel ? "更新" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
