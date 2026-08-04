/**
 * 产品中心路由切换时的加载态
 */
export default function ProductCenterLoading() {
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
