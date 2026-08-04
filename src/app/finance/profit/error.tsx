"use client";

export default function ProfitError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6 p-8 bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100">
      <h2 className="text-xl font-semibold text-rose-400">利润看板加载异常</h2>
      <p className="text-sm text-slate-400 max-w-md text-center break-words">
        {error?.message || "未知错误"}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            try {
              reset();
            } catch {
              if (typeof window !== "undefined") window.location.reload();
            }
          }}
          className="px-4 py-2 rounded-lg bg-primary-500/20 border border-primary-500/40 text-primary-200 hover:bg-primary-500/30"
        >
          重试
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/finance";
          }}
          className="px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-slate-200 hover:bg-slate-700"
        >
          返回财务中心
        </button>
      </div>
    </div>
  );
}

