"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: '#020617',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#f87171', marginBottom: '1rem' }}>
          出现错误
        </h2>
        <p style={{ color: '#94a3b8', marginBottom: '1rem', wordBreak: 'break-word' }}>
          {error?.message || "未知错误"}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            onClick={() => {
              try {
                reset();
              } catch (e) {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }
            }}
            style={{
              borderRadius: '0.375rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            重试
          </button>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/";
              }
            }}
            style={{
              borderRadius: '0.375rem',
              backgroundColor: '#475569',
              color: 'white',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
