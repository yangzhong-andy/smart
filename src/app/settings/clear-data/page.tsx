"use client";

import { useState, useEffect } from "react";
import { clearAllData, getDataStats } from "@/lib/clear-all-data";
import { toast } from "sonner";
import { Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

export default function ClearDataPage() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    stats: Record<string, number>;
    totalSize: number;
    totalKeys: number;
    allKeys?: string[];
  } | null>(null);

  // 页面加载时自动加载统计
  useEffect(() => {
    handleLoadStats();
  }, []);

  const handleLoadStats = () => {
    try {
      const data = getDataStats();
      setStats(data);
    } catch (error: any) {
      console.error("加载统计失败:", error);
      toast.error("加载统计失败");
    }
  };

  const handleClearAll = () => {
    if (!confirm("⚠️ 确定要清空系统所有数据吗？此操作不可恢复！")) {
      return;
    }

    if (!confirm("⚠️ 再次确认：这将删除所有业务数据，包括：\n- 所有订单、合同、账单\n- 所有产品、供应商信息\n- 所有财务记录\n- 所有通知和待办事项\n\n确定继续吗？")) {
      return;
    }

    setLoading(true);
    try {
      const clearedCount = clearAllData({
        keepAuth: false, // 也清空登录状态
        keepSidebarState: true, // 保留侧边栏折叠状态
      });

      toast.success(`✅ 已清空 ${clearedCount} 条数据`);
      
      // 刷新统计
      setTimeout(() => {
        handleLoadStats();
        // 延迟跳转到首页
        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
      }, 500);
    } catch (error: any) {
      toast.error(`清空数据失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6">
      <PageHeader
        title="清空系统数据"
        description="重置系统到初始状态，删除所有业务数据"
      />

      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        {/* 警告提示 */}
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-300 mb-2">
                危险操作
              </h3>
              <p className="text-red-200/80 text-sm leading-relaxed">
                此操作将永久删除系统中的所有业务数据，包括但不限于：
              </p>
              <ul className="mt-3 space-y-1 text-red-200/70 text-sm list-disc list-inside">
                <li>所有订单、采购合同、拿货单</li>
                <li>所有月账单、付款记录、财务数据</li>
                <li>所有产品、供应商、店铺信息</li>
                <li>所有广告账户、消耗记录</li>
                <li>所有通知、待办事项</li>
                <li>所有物流、库存数据</li>
              </ul>
              <p className="mt-4 text-red-300 font-medium">
                ⚠️ 此操作不可恢复，请谨慎操作！
              </p>
            </div>
          </div>
        </div>

        {/* 数据统计 */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-200">
              当前数据统计
            </h3>
            <button
              onClick={handleLoadStats}
              className="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-200 text-sm transition-colors"
            >
              刷新统计
            </button>
          </div>

          {stats ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50">
                <span className="text-slate-400">数据项数量</span>
                <span className="text-white font-semibold">{stats.totalKeys} 项</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50">
                <span className="text-slate-400">总存储大小</span>
                <span className="text-white font-semibold">{formatSize(stats.totalSize)}</span>
              </div>
              {stats.totalKeys === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <span className="text-green-300 text-sm">系统数据已清空</span>
                </div>
              ) : (
                <div className="pt-3 border-t border-slate-700">
                  <p className="text-xs text-slate-400 mb-2">遗留的数据 key：</p>
                  <div className="flex flex-wrap gap-2">
                    {stats.allKeys && stats.allKeys.length > 0 ? (
                      stats.allKeys.map((key) => (
                        <span
                          key={key}
                          className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-300 font-mono"
                          title={`大小: ${formatSize(stats.stats[key] || 0)}`}
                        >
                          {key}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500">无</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">点击"刷新统计"查看当前数据情况</p>
          )}
        </div>

        {/* 清空按钮 */}
        <div className="flex justify-end">
          <button
            onClick={handleClearAll}
            disabled={loading}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold transition-all duration-200 shadow-lg shadow-red-500/20 hover:shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>清空中...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                <span>清空所有数据</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
