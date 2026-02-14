"use client";

import { useState, useEffect } from "react";
import { Video, Upload, Play, CheckCircle2, Clock, AlertCircle, FileVideo, Plus } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ContentProductionDashboard() {
  const { data: videoTasksRaw, isLoading, mutate } = useSWR('/api/video-tasks?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const videoTasks = Array.isArray(videoTasksRaw) ? videoTasksRaw : (videoTasksRaw?.data ?? []);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 统计信息
  const stats = {
    total: videoTasks.length,
    todo: videoTasks.filter((t: any) => t.status === '待办').length,
    inProgress: videoTasks.filter((t: any) => t.status === '进行中').length,
    review: videoTasks.filter((t: any) => t.status === '待审核').length,
    done: videoTasks.filter((t: any) => t.status === '已完成').length,
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error("请选择要上传的视频文件");
      return;
    }

    setUploading(true);
    try {
      // 这里应该调用实际上传API
      // 暂时模拟上传
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast.success("视频上传成功！");
      setIsUploadModalOpen(false);
      setUploadFile(null);
      mutate();
    } catch (error) {
      toast.error("上传失败，请重试");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* 页面标题 */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
        <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                内容生产工厂
              </h1>
              <p className="text-white/70">视频任务管理与内容上传</p>
            </div>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white font-semibold hover:scale-105 transition-all duration-300 shadow-lg shadow-purple-500/30 flex items-center gap-2"
            >
              <Upload className="h-5 w-5" />
              上传视频
            </button>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <StatCard
          title="总任务数"
          value={stats.total}
          icon={Video}
          gradient="from-blue-500/20 to-blue-600/10"
          borderColor="border-blue-500/30"
        />
        <StatCard
          title="待办"
          value={stats.todo}
          icon={Clock}
          gradient="from-slate-500/20 to-slate-600/10"
          borderColor="border-slate-500/30"
        />
        <StatCard
          title="进行中"
          value={stats.inProgress}
          icon={Play}
          gradient="from-purple-500/20 to-purple-600/10"
          borderColor="border-purple-500/30"
        />
        <StatCard
          title="待审核"
          value={stats.review}
          icon={AlertCircle}
          gradient="from-amber-500/20 to-amber-600/10"
          borderColor="border-amber-500/30"
        />
        <StatCard
          title="已完成"
          value={stats.done}
          icon={CheckCircle2}
          gradient="from-emerald-500/20 to-emerald-600/10"
          borderColor="border-emerald-500/30"
        />
      </div>

      {/* 视频任务列表 */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
        <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <FileVideo className="h-5 w-5" />
            视频任务列表
          </h2>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-purple-400"></div>
            </div>
          ) : videoTasks.length === 0 ? (
            <div className="text-center py-12 text-white/50">
              <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>暂无视频任务</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videoTasks.slice(0, 6).map((task: any) => (
                <VideoTaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 上传模态框 */}
      {isUploadModalOpen && (
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleUpload}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploading={uploading}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, gradient, borderColor }: any) {
  return (
    <div className={`rounded-xl border ${borderColor} bg-gradient-to-br ${gradient} p-5 backdrop-blur-sm hover:scale-105 transition-all duration-300 shadow-lg`}>
      <div className="flex items-center justify-between mb-3">
        <Icon className="h-5 w-5 text-white/80" />
        <div className="text-xs text-white/50">{title}</div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function VideoTaskCard({ task }: any) {
  const statusColors: Record<string, string> = {
    '待办': 'bg-slate-500/20 text-slate-300',
    '进行中': 'bg-purple-500/20 text-purple-300',
    '待审核': 'bg-amber-500/20 text-amber-300',
    '已完成': 'bg-emerald-500/20 text-emerald-300',
    '已取消': 'bg-rose-500/20 text-rose-300',
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:bg-white/10 transition-all duration-300">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-white font-semibold flex-1">{task.title}</h3>
        <span className={`px-2 py-1 rounded text-xs ${statusColors[task.status] || 'bg-slate-500/20 text-slate-300'}`}>
          {task.status}
        </span>
      </div>
      {task.brief && (
        <p className="text-white/60 text-sm mb-3 line-clamp-2">{task.brief}</p>
      )}
      {task.dueDate && (
        <p className="text-white/40 text-xs">截止日期: {new Date(task.dueDate).toLocaleDateString('zh-CN')}</p>
      )}
    </div>
  );
}

function UploadModal({ isOpen, onClose, onUpload, uploadFile, setUploadFile, uploading }: any) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white mb-4">上传视频</h2>
        
        <div className="space-y-4">
          <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-purple-400/50 transition-colors">
            <Upload className="h-12 w-12 mx-auto mb-4 text-white/40" />
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="hidden"
              id="video-upload"
            />
            <label
              htmlFor="video-upload"
              className="cursor-pointer text-white/70 hover:text-white transition-colors"
            >
              点击选择视频文件
            </label>
            {uploadFile && (
              <p className="mt-2 text-sm text-white/60">{uploadFile.name}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 px-4 rounded-xl border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={onUpload}
              disabled={!uploadFile || uploading}
              className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all"
            >
              {uploading ? "上传中..." : "上传"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
