"use client";

/**
 * 路由切换时在内容区显示加载状态，减少“点击无反应”的体感
 * 线上环境（如 Vercel）首请求可能冷启动较慢，至少让用户看到正在加载
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8">
      <div className="h-10 w-10 rounded-full border-2 border-primary-500/30 border-t-primary-400 animate-spin" />
      <p className="text-sm text-slate-400">加载中...</p>
      <div className="w-64 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full w-1/3 bg-primary-500/60 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
