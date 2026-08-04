"use client";

import { useState, useMemo, useEffect } from "react";

/**
 * 将各种格式的凭证数据规范化为可渲染的图片 src 字符串数组。
 * 支持：
 *  - JSON 字符串数组: '["data:image/png;base64,xxx"]'
 *  - 单个 data URL: "data:image/png;base64,xxx"
 *  - 裸 base64 字符串（自动补 data URL 前缀）
 *  - 普通 URL
 */
export function parseVoucher(voucher: unknown): string[] {
  if (!voucher) return [];

  let raw = voucher;

  // 如果是数组，直接取元素
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeImageSrc(String(item)));
  }

  const str = String(raw).trim();

  // 空字符串或无效值
  if (!str || str === "[]" || str === "null" || str === "undefined") return [];

  // 尝试 JSON 解析
  if (str.startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map((item: unknown) => normalizeImageSrc(String(item)));
      }
      return [normalizeImageSrc(String(parsed))];
    } catch {
      // JSON 解析失败，当作普通字符串处理
    }
  }

  return [normalizeImageSrc(str)];
}

/**
 * 规范化单个图片 src：裸 base64 → data URL
 */
function normalizeImageSrc(src: string): string {
  const trimmed = src.trim();

  // 已经是 data URL
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  // 普通 URL（http/https/相对路径）
  if (trimmed.startsWith("http") || trimmed.startsWith("/") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // 裸 base64（仅含合法字符且足够长）
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.replace(/\s/g, "").length > 100) {
    const clean = trimmed.replace(/\s/g, "");
    // PNG 签名
    if (clean.startsWith("iVBOR")) return `data:image/png;base64,${clean}`;
    // JPEG 签名
    if (clean.startsWith("/9j/")) return `data:image/jpeg;base64,${clean}`;
    // 默认 jpeg
    return `data:image/jpeg;base64,${clean}`;
  }

  return trimmed;
}

interface VoucherImageProps {
  /** 凭证数据（字符串、JSON字符串数组、或数组） */
  voucher: unknown;
  /** 点击图片时回调（用于打开大图） */
  onView?: (src: string) => void;
  /** 缩略图尺寸 class */
  thumbClassName?: string;
}

/**
 * 凭证缩略图网格组件。
 * 显示加载状态、错误兜底、空状态。
 */
export function VoucherThumbnails({ voucher, onView, thumbClassName }: VoucherImageProps) {
  const imgs = useMemo(() => parseVoucher(voucher), [voucher]);

  if (imgs.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic">暂无凭证</div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {imgs.map((img, i) => (
        <VoucherThumb
          key={i}
          src={img}
          index={i}
          onView={onView}
          className={thumbClassName}
        />
      ))}
    </div>
  );
}

interface VoucherThumbProps {
  src: string;
  index: number;
  onView?: (src: string) => void;
  className?: string;
}

/**
 * 缩略图：使用 Blob URL 渲染（比 data URL 更可靠，避免超长字符串解析问题）
 */
function VoucherThumb({ src, index, onView, className }: VoucherThumbProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [renderSrc, setRenderSrc] = useState<string>(src);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // 如果是 data URL，转换为 Blob URL 以获得更好的渲染可靠性
  useEffect(() => {
    let revoked = false;
    let blobUrl: string | null = null;

    if (src.startsWith("data:")) {
      try {
        // 解析 data URL: data:image/png;base64,xxxx
        const match = src.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          // 转换 base64 → binary
          const byteChars = atob(base64Data);
          const byteNumbers = new Array(byteChars.length);
          for (let j = 0; j < byteChars.length; j++) {
            byteNumbers[j] = byteChars.charCodeAt(j);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          blobUrl = URL.createObjectURL(blob);
          if (!revoked) {
            setRenderSrc(blobUrl);
          }
        } else {
          // 非 base64 的 data URL，直接用
          setRenderSrc(src);
        }
      } catch (e) {
        // 转换失败，回退到原始 data URL
        setErrorMsg(`Blob转换失败: ${e instanceof Error ? e.message : String(e)}`);
        setRenderSrc(src);
      }
    } else {
      setRenderSrc(src);
    }

    return () => {
      revoked = true;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [src]);

  return (
    <div
      className={`relative group cursor-pointer overflow-hidden rounded-lg border border-slate-600 group-hover:border-primary-400 transition ${
        className || "h-32 w-32"
      }`}
      onClick={() => onView?.(src)}
    >
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-slate-500 text-xs z-10">
          加载中...
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-900/30 p-2 text-center z-10">
          <span className="text-rose-400 text-lg">⚠</span>
          <span className="text-rose-300 text-[10px] mt-1">加载失败</span>
          {errorMsg && (
            <span className="text-slate-500 text-[8px] mt-1 break-all">{errorMsg.slice(0, 40)}</span>
          )}
        </div>
      )}
      <img
        src={renderSrc}
        alt={`凭证${index + 1}`}
        className={`h-full w-full object-cover transition-opacity ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setStatus("loaded")}
        onError={(e) => {
          setStatus("error");
          setErrorMsg(`图片onError, src长度=${renderSrc.length}`);
        }}
      />
      {status === "loaded" && (
        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
          凭证{index + 1}
        </div>
      )}
    </div>
  );
}

interface VoucherViewerModalProps {
  src: string | null;
  onClose: () => void;
}

/**
 * 凭证大图查看弹窗。
 * 直接渲染规范化的图片 src，带加载/错误状态和下载后备。
 */
export function VoucherViewerModal({ src, onClose }: VoucherViewerModalProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [renderSrc, setRenderSrc] = useState<string>("");
  const [rotation, setRotation] = useState(0);

  const imageSrc = src ? normalizeImageSrc(src) : "";

  // 转换为 Blob URL
  useEffect(() => {
    setRotation(0);
    if (!imageSrc) {
      setRenderSrc("");
      return;
    }

    setStatus("loading");
    let revoked = false;
    let blobUrl: string | null = null;

    if (imageSrc.startsWith("data:")) {
      try {
        const match = imageSrc.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          const byteChars = atob(base64Data);
          const byteNumbers = new Array(byteChars.length);
          for (let j = 0; j < byteChars.length; j++) {
            byteNumbers[j] = byteChars.charCodeAt(j);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          blobUrl = URL.createObjectURL(blob);
          if (!revoked) setRenderSrc(blobUrl);
        } else {
          setRenderSrc(imageSrc);
        }
      } catch {
        setRenderSrc(imageSrc);
      }
    } else {
      setRenderSrc(imageSrc);
    }

    return () => {
      revoked = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [imageSrc]);

  if (!src) return null;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = renderSrc || imageSrc;
    a.download = `凭证-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl max-h-[95vh] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={() => setRotation((r) => (r - 90) % 360)}
            className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
            title="向左旋转"
          >↺</button>
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="text-white text-xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
            title="向右旋转"
          >↻</button>
          <button
            onClick={onClose}
            className="text-white text-2xl bg-black/70 rounded-full w-10 h-10 flex items-center justify-center transition hover:bg-black/90"
          >✕</button>
        </div>

        {status === "loading" && (
          <div className="flex items-center justify-center w-96 h-64">
            <div className="text-slate-400 text-sm animate-pulse">图片加载中...</div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 bg-rose-500/10 rounded-lg border border-rose-500/30 min-w-96">
            <div className="text-rose-300 text-lg">❌ 图片加载失败</div>
            <div className="text-slate-400 text-xs">
              数据长度: {imageSrc.length} 字符 | 类型:{" "}
              {imageSrc.startsWith("data:image/png") ? "PNG" : imageSrc.startsWith("data:image/jpeg") ? "JPEG" : imageSrc.startsWith("data:") ? "其他" : "URL"}
            </div>
            <div className="text-slate-500 text-[10px] break-all max-w-md max-h-20 overflow-auto bg-slate-900/50 p-2 rounded">
              {imageSrc.slice(0, 200)}...
            </div>
            <button
              onClick={handleDownload}
              className="mt-2 px-4 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs rounded transition"
            >
              📥 尝试下载查看
            </button>
          </div>
        )}

        {renderSrc && (
          <img
            src={renderSrc}
            alt="凭证大图"
            className={`max-w-full max-h-[95vh] rounded-lg shadow-2xl object-contain bg-white/5 transition-opacity transition-transform duration-300 ${
              status === "loaded" ? "opacity-100" : "opacity-0 absolute"
            }`}
            style={{ transform: `rotate(${rotation}deg)` }}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
          />
        )}

        {status === "loaded" && (
          <button
            onClick={handleDownload}
            className="absolute top-4 left-4 px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white text-xs rounded-full transition z-10"
          >
            📥 下载
          </button>
        )}
      </div>
    </div>
  );
}
