'use client';
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-500 mb-4">出了点问题</h2>
          <p className="text-slate-400 mb-4">{error.message || '未知错误'}</p>
          {error.digest && (
            <p className="text-xs text-slate-500 mb-4">错误ID: {error.digest}</p>
          )}
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
