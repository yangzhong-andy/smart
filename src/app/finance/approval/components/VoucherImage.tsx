"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";

export function parseVoucher(voucher: unknown): string[] {
  if (!voucher) return [];

  if (Array.isArray(voucher)) {
    return voucher
      .map((item) => normalizeImageSrc(String(item)))
      .filter(Boolean);
  }

  const value = String(voucher).trim();
  if (!value || value === "[]" || value === "null" || value === "undefined") return [];

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: unknown) => normalizeImageSrc(String(item)))
          .filter(Boolean);
      }
      return [normalizeImageSrc(String(parsed))].filter(Boolean);
    } catch {
      // Keep the original value when an older record is not valid JSON.
    }
  }

  return [normalizeImageSrc(value)].filter(Boolean);
}

function normalizeImageSrc(src: string): string {
  const value = src.trim();
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("http") || value.startsWith("/") || value.startsWith("blob:")) {
    return value;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s/g, "").length > 100) {
    const base64 = value.replace(/\s/g, "");
    if (base64.startsWith("iVBOR")) return `data:image/png;base64,${base64}`;
    if (base64.startsWith("/9j/")) return `data:image/jpeg;base64,${base64}`;
    return `data:image/jpeg;base64,${base64}`;
  }
  return value;
}

interface VoucherImageProps {
  voucher: unknown;
  onView?: (src: string, images: string[], index: number) => void;
  thumbClassName?: string;
}

export function VoucherThumbnails({ voucher, onView, thumbClassName }: VoucherImageProps) {
  const images = useMemo(() => parseVoucher(voucher), [voucher]);

  if (images.length === 0) {
    return <div className="text-xs text-slate-500 italic">No voucher</div>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {images.map((src, index) => (
        <VoucherThumb
          key={`${index}-${src.slice(0, 20)}`}
          src={src}
          images={images}
          index={index}
          onView={onView}
          className={thumbClassName}
        />
      ))}
    </div>
  );
}

interface VoucherThumbProps {
  src: string;
  images: string[];
  index: number;
  onView?: (src: string, images: string[], index: number) => void;
  className?: string;
}

function VoucherThumb({ src, images, index, onView, className }: VoucherThumbProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [renderSrc, setRenderSrc] = useState(src);

  useEffect(() => {
    setStatus("loading");
    setRenderSrc(src);
    let objectUrl: string | null = null;
    if (src.startsWith("data:")) {
      try {
        const match = src.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const bytes = atob(match[2]);
          const data = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) data[i] = bytes.charCodeAt(i);
          objectUrl = URL.createObjectURL(new Blob([data], { type: match[1] }));
          setRenderSrc(objectUrl);
        }
      } catch {
        setRenderSrc(src);
      }
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return (
    <button
      type="button"
      className={`relative group cursor-pointer overflow-hidden rounded-lg border border-slate-600 hover:border-primary-400 transition focus:outline-none focus:ring-2 focus:ring-primary-400 ${className || "h-32 w-32"}`}
      onClick={() => onView?.(src, images, index)}
      aria-label={`View voucher ${index + 1}`}
    >
      {status === "loading" && <span className="absolute inset-0 flex items-center justify-center bg-slate-800 text-slate-500 text-xs z-10">Loading...</span>}
      {status === "error" && <span className="absolute inset-0 flex items-center justify-center bg-rose-900/30 text-rose-300 text-xs z-10">Load failed</span>}
      <img
        src={renderSrc}
        alt={`Voucher ${index + 1}`}
        className={`h-full w-full object-cover transition-opacity ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
      {status === "loaded" && images.length > 1 && (
        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
          {index + 1}/{images.length}
        </span>
      )}
    </button>
  );
}

export type VoucherViewerState = {
  images: string[];
  index: number;
};

interface VoucherViewerModalProps {
  viewer: VoucherViewerState | null;
  onClose: () => void;
}

export function VoucherViewerModal({ viewer, onClose }: VoucherViewerModalProps) {
  const images = viewer?.images || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [renderSrc, setRenderSrc] = useState("");
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const imageSrc = images.length ? normalizeImageSrc(images[currentIndex] || images[0]) : "";

  useEffect(() => {
    if (!viewer) return;
    setCurrentIndex(Math.min(Math.max(viewer.index, 0), Math.max(viewer.images.length - 1, 0)));
    setRotation(0);
    setScale(1);
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") changeImage(-1);
      if (event.key === "ArrowRight") changeImage(1);
      if (event.key === "+" || event.key === "=") setScale((value) => Math.min(3, value + 0.25));
      if (event.key === "-") setScale((value) => Math.max(0.5, value - 0.25));
      if (event.key.toLowerCase() === "r") {
        setRotation(0);
        setScale(1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    if (!imageSrc) return;
    setStatus("loading");
    setRenderSrc(imageSrc);
    let objectUrl: string | null = null;
    if (imageSrc.startsWith("data:")) {
      try {
        const match = imageSrc.match(/^data:([^;]+);base64,(.*)$/);
        if (match) {
          const bytes = atob(match[2]);
          const data = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) data[i] = bytes.charCodeAt(i);
          objectUrl = URL.createObjectURL(new Blob([data], { type: match[1] }));
          setRenderSrc(objectUrl);
        }
      } catch {
        setRenderSrc(imageSrc);
      }
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageSrc]);

  if (!viewer || images.length === 0) return null;

  function changeImage(delta: number) {
    setCurrentIndex((index) => Math.min(Math.max(index + delta, 0), images.length - 1));
    setRotation(0);
    setScale(1);
  }

  function downloadImage() {
    const anchor = document.createElement("a");
    anchor.href = renderSrc || imageSrc;
    anchor.download = `voucher-${currentIndex + 1}-${Date.now()}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-w-[95vw] max-h-[95vh] items-center justify-center p-14" onClick={(event) => event.stopPropagation()}>
        <div className="absolute top-3 right-3 z-20 flex gap-2">
          <IconButton label="Zoom out" disabled={scale <= 0.5} onClick={() => setScale((value) => Math.max(0.5, value - 0.25))}><ZoomOut size={18} /></IconButton>
          <button type="button" onClick={() => setScale(1)} className="h-10 min-w-10 rounded-full bg-black/70 px-2 text-xs text-white hover:bg-black/90" title="Reset zoom" aria-label="Reset zoom">{Math.round(scale * 100)}%</button>
          <IconButton label="Zoom in" disabled={scale >= 3} onClick={() => setScale((value) => Math.min(3, value + 0.25))}><ZoomIn size={18} /></IconButton>
          <IconButton label="Rotate left" onClick={() => setRotation((value) => value - 90)}><RotateCcw size={18} /></IconButton>
          <IconButton label="Rotate right" onClick={() => setRotation((value) => value + 90)}><RotateCw size={18} /></IconButton>
          <IconButton label="Reset view" onClick={() => { setRotation(0); setScale(1); }}><RotateCcw size={18} /></IconButton>
          <IconButton label="Download image" disabled={!renderSrc} onClick={downloadImage}><Download size={18} /></IconButton>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </div>

        {images.length > 1 && (
          <>
            <IconButton label="Previous image" disabled={currentIndex === 0} onClick={() => changeImage(-1)} className="absolute left-2 z-20 h-11 w-11"><ChevronLeft size={24} /></IconButton>
            <IconButton label="Next image" disabled={currentIndex === images.length - 1} onClick={() => changeImage(1)} className="absolute right-2 z-20 h-11 w-11"><ChevronRight size={24} /></IconButton>
            <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">{currentIndex + 1} / {images.length}</div>
          </>
        )}

        {status === "loading" && <div className="flex h-64 w-96 items-center justify-center text-sm text-slate-400">Loading...</div>}
        {status === "error" && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-8 text-rose-300">Unable to load image</div>}
        {renderSrc && (
          <img
            src={renderSrc}
            alt={`Voucher ${currentIndex + 1}`}
            className={`max-h-[78vh] max-w-[78vw] rounded-lg bg-white/5 object-contain shadow-2xl transition-opacity duration-200 ${status === "loaded" ? "opacity-100" : "absolute opacity-0"}`}
            style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
          />
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, className = "", children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-30 ${className}`}>{children}</button>;
}
