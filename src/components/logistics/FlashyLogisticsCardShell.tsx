"use client";

import type { ReactNode } from "react";
import { Package, Ship } from "lucide-react";
import type { Warehouse as WarehouseType, WarehouseLocation } from "@/logistics/types";

export type FlashyLogisticsTheme = {
  shell: string;
  glowHover: string;
  accent: string;
  etaText: string;
  hudBorder: string;
  topBarFrom: string;
  topBarVia: string;
  orb1: string;
  orb2: string;
  showTransitWaves: boolean;
  showArrivedWaves: boolean;
  pulseAnim: "" | "animate-container-pulse-orange" | "animate-container-pulse-purple";
  showSparks: boolean;
  showParticles: boolean;
  cornerIcon: "none" | "ship" | "package";
  showCustomsDot: boolean;
};

function corrugatedBg(className: string) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 opacity-[0.28] ${className}`}
      style={{
        backgroundImage: `repeating-linear-gradient(
          180deg,
          rgba(255,255,255,0.14) 0px,
          rgba(255,255,255,0.03) 2px,
          rgba(0,0,0,0.12) 4px,
          rgba(255,255,255,0.08) 6px
        )`,
      }}
    />
  );
}

function scanlines() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay"
      style={{
        backgroundImage: `repeating-linear-gradient(
          0deg,
          transparent 0px,
          transparent 2px,
          rgba(0,0,0,0.35) 2px,
          rgba(0,0,0,0.35) 3px
        )`,
      }}
    />
  );
}

function WaveLayer({ className, opacity = "0.35" }: { className?: string; opacity?: string }) {
  return (
    <div
      className={`pointer-events-none absolute bottom-0 left-0 right-0 h-16 overflow-hidden ${className ?? ""}`}
    >
      <svg
        className="absolute bottom-0 w-[200%] min-w-[800px] animate-wave-slide text-current opacity-90"
        style={{ opacity }}
        viewBox="0 0 1200 48"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0,32 Q150,8 300,32 T600,32 T900,32 T1200,32 L1200,48 L0,48 Z"
        />
      </svg>
      <svg
        className="absolute -bottom-1 left-0 w-[200%] min-w-[800px] animate-wave-slide text-current"
        style={{ opacity: "0.28", animationDuration: "14s" }}
        viewBox="0 0 1200 48"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0,36 Q200,14 400,36 T800,36 T1200,36 L1200,48 L0,48 Z"
        />
      </svg>
      <svg
        className="absolute bottom-0 left-0 w-[200%] min-w-[800px] animate-wave-slide text-current"
        style={{ opacity: "0.18", animationDuration: "22s" }}
        viewBox="0 0 1200 40"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0,28 Q100,18 200,28 T400,28 T600,28 T800,28 T1000,28 T1200,28 L1200,40 L0,40 Z"
        />
      </svg>
    </div>
  );
}

function TransitParticles({ seed }: { seed: string }) {
  const n = 10;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {Array.from({ length: n }).map((_, i) => {
        const x = ((h + i * 997) % 85) + 5;
        const delay = ((h >> (i % 4)) % 10) * 0.15 + i * 0.22;
        const size = 2 + ((h + i * 17) % 3);
        return (
          <div
            key={i}
            className="absolute bottom-8 rounded-full bg-cyan-200/70 shadow-[0_0_8px_rgba(165,243,252,0.9)] motion-reduce:animate-none animate-float blur-[0.5px]"
            style={{
              left: `${x}%`,
              width: size,
              height: size,
              animationDelay: `${delay}s`,
              animationDuration: `${4 + (i % 4)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function LoadingSparks() {
  return (
    <div className="pointer-events-none absolute right-6 top-5 flex gap-2" aria-hidden>
      {[0, 0.4, 0.8].map((d, i) => (
        <div
          key={i}
          className="relative h-2 w-2 motion-reduce:opacity-70"
          style={{ animationDelay: `${d}s` }}
        >
          <span className="absolute inset-0 rounded-full bg-orange-400/90 motion-reduce:animate-none animate-ping" />
          <span className="absolute inset-0 rounded-full bg-orange-200 shadow-[0_0_10px_rgba(253,186,116,0.9)]" />
        </div>
      ))}
    </div>
  );
}

function HudCorners({ colorClass }: { colorClass: string }) {
  const corner =
    "pointer-events-none absolute h-5 w-5 border-0 transition-all duration-500 group-hover:opacity-100 opacity-40";
  return (
    <>
      <div className={`${corner} left-2 top-2 border-l-2 border-t-2 ${colorClass}`} />
      <div className={`${corner} right-2 top-2 border-r-2 border-t-2 ${colorClass}`} />
      <div className={`${corner} bottom-2 left-2 border-b-2 border-l-2 ${colorClass}`} />
      <div className={`${corner} bottom-2 right-2 border-b-2 border-r-2 ${colorClass}`} />
    </>
  );
}

function themeFromContainerStatus(status: string): Omit<FlashyLogisticsTheme, "cornerIcon" | "showCustomsDot"> {
  switch (status) {
    case "LOADING":
      return {
        shell:
          "border-orange-500/75 bg-gradient-to-br from-orange-950/95 via-slate-900/95 to-slate-950 text-orange-100",
        glowHover:
          "hover:shadow-[0_0_48px_rgba(251,146,60,0.55),0_24px_48px_rgba(0,0,0,0.45)] hover:border-orange-300/95",
        accent: "text-orange-300",
        etaText: "text-orange-200",
        hudBorder: "border-orange-400/70",
        topBarFrom: "from-orange-600/20",
        topBarVia: "via-orange-200/80",
        orb1: "bg-orange-500/25",
        orb2: "bg-amber-400/20",
        showTransitWaves: false,
        showArrivedWaves: false,
        pulseAnim: "animate-container-pulse-orange",
        showSparks: true,
        showParticles: false,
      };
    case "IN_TRANSIT":
      return {
        shell:
          "border-cyan-400/70 bg-gradient-to-br from-cyan-950/90 via-slate-900/95 to-slate-950 text-cyan-50",
        glowHover:
          "hover:shadow-[0_0_52px_rgba(34,211,238,0.5),0_24px_56px_rgba(0,0,0,0.5)] hover:border-cyan-300/90",
        accent: "text-cyan-300",
        etaText: "text-cyan-100",
        hudBorder: "border-cyan-400/75",
        topBarFrom: "from-cyan-600/30",
        topBarVia: "via-white/70",
        orb1: "bg-cyan-400/30",
        orb2: "bg-teal-400/20",
        showTransitWaves: true,
        showArrivedWaves: false,
        pulseAnim: "",
        showSparks: false,
        showParticles: true,
      };
    case "ARRIVED_PORT":
      return {
        shell:
          "border-blue-500/70 bg-gradient-to-br from-blue-950/90 via-slate-900/95 to-slate-950 text-blue-50",
        glowHover:
          "hover:shadow-[0_0_46px_rgba(59,130,246,0.48),0_20px_48px_rgba(0,0,0,0.45)] hover:border-blue-300/90",
        accent: "text-blue-300",
        etaText: "text-blue-100",
        hudBorder: "border-blue-400/70",
        topBarFrom: "from-blue-600/25",
        topBarVia: "via-sky-200/75",
        orb1: "bg-blue-500/25",
        orb2: "bg-indigo-500/20",
        showTransitWaves: false,
        showArrivedWaves: true,
        pulseAnim: "",
        showSparks: false,
        showParticles: false,
      };
    case "CUSTOMS_CLEAR":
      return {
        shell:
          "border-violet-500/70 bg-gradient-to-br from-violet-950/90 via-slate-900/95 to-slate-950 text-violet-50",
        glowHover:
          "hover:shadow-[0_0_50px_rgba(167,139,250,0.52),0_22px_50px_rgba(0,0,0,0.48)] hover:border-violet-300/90",
        accent: "text-violet-300",
        etaText: "text-violet-100",
        hudBorder: "border-violet-400/75",
        topBarFrom: "from-violet-600/25",
        topBarVia: "via-fuchsia-200/70",
        orb1: "bg-violet-500/28",
        orb2: "bg-fuchsia-500/18",
        showTransitWaves: false,
        showArrivedWaves: false,
        pulseAnim: "animate-container-pulse-purple",
        showSparks: false,
        showParticles: false,
      };
    case "IN_WAREHOUSE":
    case "CLOSED":
      return {
        shell:
          "border-emerald-500/60 bg-gradient-to-br from-emerald-950/80 via-slate-900/95 to-slate-950 text-emerald-50",
        glowHover:
          "hover:shadow-[0_0_40px_rgba(52,211,153,0.42),0_18px_40px_rgba(0,0,0,0.4)] hover:border-emerald-300/85",
        accent: "text-emerald-300",
        etaText: "text-emerald-100",
        hudBorder: "border-emerald-400/65",
        topBarFrom: "from-emerald-600/20",
        topBarVia: "via-emerald-200/65",
        orb1: "bg-emerald-500/22",
        orb2: "bg-teal-500/18",
        showTransitWaves: false,
        showArrivedWaves: false,
        pulseAnim: "",
        showSparks: false,
        showParticles: false,
      };
    case "PLANNED":
    default:
      return {
        shell:
          "border-slate-500/55 bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-slate-950 text-slate-100",
        glowHover:
          "hover:shadow-[0_0_36px_rgba(148,163,184,0.4),0_16px_36px_rgba(0,0,0,0.35)] hover:border-slate-400/65",
        accent: "text-slate-400",
        etaText: "text-slate-300",
        hudBorder: "border-slate-500/60",
        topBarFrom: "from-slate-600/20",
        topBarVia: "via-slate-300/50",
        orb1: "bg-slate-500/15",
        orb2: "bg-slate-400/10",
        showTransitWaves: false,
        showArrivedWaves: false,
        pulseAnim: "",
        showSparks: false,
        showParticles: false,
      };
  }
}

export function getContainerFlashyTheme(status: string): FlashyLogisticsTheme {
  const base = themeFromContainerStatus(status);
  return {
    ...base,
    cornerIcon: status === "IN_TRANSIT" ? "ship" : "none",
    showCustomsDot: status === "CUSTOMS_CLEAR",
  };
}

/** 仓库卡片：与柜子卡片同一套动效语义（停用=灰、工厂=橙、国内=绿、海外=青浪、中转=蓝浪） */
export function getWarehouseFlashyTheme(w: WarehouseType): FlashyLogisticsTheme {
  if (!w.isActive) {
    const t = themeFromContainerStatus("PLANNED");
    return { ...t, cornerIcon: "none", showCustomsDot: false };
  }
  const loc: WarehouseLocation = w.location;
  if (loc === "FACTORY") {
    const t = themeFromContainerStatus("LOADING");
    return { ...t, cornerIcon: "none", showCustomsDot: false };
  }
  if (loc === "DOMESTIC") {
    const t = themeFromContainerStatus("IN_WAREHOUSE");
    return { ...t, cornerIcon: "none", showCustomsDot: false };
  }
  if (loc === "OVERSEAS") {
    const t = themeFromContainerStatus("IN_TRANSIT");
    return { ...t, cornerIcon: "package", showCustomsDot: false };
  }
  if (loc === "TRANSIT") {
    const t = themeFromContainerStatus("ARRIVED_PORT");
    return { ...t, cornerIcon: "none", showCustomsDot: false };
  }
  const t = themeFromContainerStatus("PLANNED");
  return { ...t, cornerIcon: "none", showCustomsDot: false };
}

type FlashyLogisticsCardShellProps = {
  theme: FlashyLogisticsTheme;
  seed: string;
  as?: "button" | "div";
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  contentMinHeightClass?: string;
  children: ReactNode;
};

export function FlashyLogisticsCardShell({
  theme,
  seed,
  as = "div",
  type = "button",
  onClick,
  className = "",
  contentMinHeightClass = "min-h-[240px]",
  children,
}: FlashyLogisticsCardShellProps) {
  const shineDelay = (seed.charCodeAt(0) % 8) * 0.4;

  const innerDecor = (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div
          className={`absolute -right-24 -top-24 h-52 w-52 rounded-full blur-3xl motion-reduce:animate-none animate-gradient-drift ${theme.orb1}`}
        />
        <div
          className={`absolute -bottom-20 -left-20 h-44 w-44 rounded-full blur-3xl motion-reduce:animate-none animate-gradient-drift ${theme.orb2}`}
          style={{ animationDelay: "1.2s" }}
        />
        <div
          className={`absolute left-0 right-0 top-0 z-20 h-[3px] bg-gradient-to-r ${theme.topBarFrom} ${theme.topBarVia} to-transparent bg-[length:220%_100%] motion-reduce:animate-none animate-border-flow opacity-90`}
        />
        <div className="absolute inset-0 motion-reduce:hidden" aria-hidden>
          <div
            className="absolute -left-1/2 top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:animate-none animate-shine-sweep"
            style={{ animationDelay: `${shineDelay}s` }}
          />
        </div>
        {scanlines()}
        {corrugatedBg("mix-blend-soft-light")}
        {theme.showTransitWaves && (
          <div className="absolute bottom-0 left-0 right-0 text-cyan-400/85">
            <WaveLayer />
          </div>
        )}
        {theme.showArrivedWaves && (
          <div className="absolute bottom-0 left-0 right-0 text-blue-400/75 motion-reduce:animate-none animate-wave-y">
            <WaveLayer opacity="0.55" />
          </div>
        )}
        {theme.showParticles && <TransitParticles seed={seed} />}
      </div>
      <HudCorners colorClass={theme.hudBorder} />
      {theme.showSparks && <LoadingSparks />}
      {theme.cornerIcon === "ship" && (
        <div
          className="pointer-events-none absolute bottom-7 right-7 z-[5] motion-reduce:animate-none animate-float drop-shadow-[0_0_20px_rgba(34,211,238,0.65)]"
          aria-hidden
        >
          <Ship className="h-9 w-9 text-cyan-100" strokeWidth={1.35} />
        </div>
      )}
      {theme.cornerIcon === "package" && (
        <div
          className="pointer-events-none absolute bottom-7 right-7 z-[5] motion-reduce:animate-none animate-float drop-shadow-[0_0_20px_rgba(34,211,238,0.55)]"
          aria-hidden
        >
          <Package className="h-9 w-9 text-cyan-100" strokeWidth={1.35} />
        </div>
      )}
      {theme.showCustomsDot && (
        <div
          className="pointer-events-none absolute right-6 top-20 z-[5] h-2 w-2 rounded-full bg-violet-300 motion-reduce:opacity-80 motion-reduce:animate-none animate-hud-blink shadow-[0_0_12px_rgba(196,181,253,0.9)]"
          aria-hidden
        />
      )}
    </>
  );

  const shellClasses = [
    "group relative w-full rounded-2xl border-2 text-left shadow-xl transition-all duration-500 ease-out motion-reduce:transition-colors",
    "transform-gpu motion-reduce:transform-none",
    "hover:[transform:translateY(-14px)_scale(1.035)_rotateX(4deg)] motion-reduce:hover:transform-none",
    theme.shell,
    theme.glowHover,
    theme.pulseAnim,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      {innerDecor}
      <div className={`relative z-10 flex flex-col p-4 sm:p-5 ${contentMinHeightClass}`}>{children}</div>
    </>
  );

  if (as === "button") {
    return (
      <button
        type={type}
        onClick={onClick}
        className={`${shellClasses} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950`}
        style={{ transformStyle: "preserve-3d" }}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={shellClasses} style={{ transformStyle: "preserve-3d" }}>
      {body}
    </div>
  );
}
