"use client";

import type { Container } from "@/logistics/types";
import { formatPortDisplay } from "@/lib/port-name-hints";
import {
  FlashyLogisticsCardShell,
  getContainerFlashyTheme,
} from "@/components/logistics/FlashyLogisticsCardShell";

interface ContainerCardsViewProps {
  isLoading: boolean;
  containers: Container[];
  statusLabels: Record<string, string>;
  methodLabels: Record<string, string>;
  getProgress: (status: string) => number;
  getProgressBarColor: (status: string) => string;
  getVoyageInfo: (container: Container) => {
    daysPassed: number;
    totalDays: number;
    daysLeft: number;
    overdueDays: number;
    progress: number;
    eta?: string;
    isOverdue: boolean;
  } | null;
  formatDate: (value?: string | null) => string;
  onOpenDetail: (container: Container) => void;
}

export function ContainerCardsView({
  isLoading,
  containers,
  statusLabels,
  methodLabels,
  getProgress,
  getProgressBarColor,
  getVoyageInfo,
  formatDate,
  onOpenDetail,
}: ContainerCardsViewProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6">
      {isLoading && (
        <div className="py-16 text-center text-slate-500">正在加载柜子数据…</div>
      )}
      {!isLoading && containers.length === 0 && (
        <div className="py-16 text-center text-slate-500">暂无柜子记录，请点击右上角「新增柜子」</div>
      )}
      {!isLoading && containers.length > 0 && (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {containers.map((c) => {
            const theme = getContainerFlashyTheme(c.status);
            const voyageInfo = getVoyageInfo(c);
            const progress = voyageInfo?.progress ?? getProgress(c.status);
            const barColor = getProgressBarColor(c.status);
            const origin = formatPortDisplay(c.originPort);
            const dest = formatPortDisplay(c.destinationPort);
            const method = methodLabels[c.shippingMethod] ?? c.shippingMethod;
            const vessel = c.vesselName?.trim() || "—";
            const loadingStr = formatDate(c.loadingDate);
            const etdStr = formatDate(c.etd);
            const etaStr = formatDate(c.eta);

            return (
              <div
                key={c.id}
                className="motion-reduce:perspective-none [perspective:1100px]"
              >
                <FlashyLogisticsCardShell
                  as="button"
                  type="button"
                  theme={theme}
                  seed={c.id}
                  onClick={() => onOpenDetail(c)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="bg-gradient-to-r from-white via-white to-white/80 bg-clip-text font-mono text-lg font-bold tracking-tight text-transparent drop-shadow-[0_0_24px_rgba(255,255,255,0.15)]">
                        {c.containerNo}
                      </div>
                      <div className={`mt-0.5 text-xs ${theme.accent} drop-shadow-sm`}>
                        {c.containerType} · {method}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-lg backdrop-blur-md ${theme.accent} border-current/50 bg-black/35 ring-1 ring-white/10`}
                    >
                      {statusLabels[c.status] ?? c.status}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
                      航线
                      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
                    </div>
                    <div className="leading-relaxed text-white/95">
                      <span className="font-semibold drop-shadow-sm">{origin}</span>
                      <span className="mx-2 inline-block text-lg text-white/30 motion-reduce:animate-none animate-hud-blink">
                        →
                      </span>
                      <span className="font-semibold drop-shadow-sm">{dest}</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[10px] text-white/50">
                      <span>物流进度</span>
                      <span className="tabular-nums text-white/70">{progress}%</span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-black/45 ring-1 ring-inset ring-white/10">
                      <div
                        className={`relative h-full overflow-hidden rounded-full shadow-[0_0_12px_rgba(255,255,255,0.25)] ${barColor}`}
                        style={{ width: `${progress}%` }}
                      >
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent motion-reduce:animate-none animate-shimmer bg-[length:200%_100%]" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto border-t border-white/5 pt-4 text-xs text-white/80">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-white/40">船名</span>
                      <span className="font-medium text-white drop-shadow-sm">{vessel}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-white/40">装柜</span>
                      <span
                        className={`font-mono tabular-nums font-semibold drop-shadow-[0_0_12px_rgba(255,255,255,0.12)] ${theme.etaText}`}
                      >
                        {loadingStr}
                      </span>
                      <span className="text-white/30">·</span>
                      <span className="text-white/40">ETD</span>
                      <span
                        className={`font-mono tabular-nums font-semibold drop-shadow-[0_0_12px_rgba(255,255,255,0.12)] ${theme.etaText}`}
                      >
                        {etdStr}
                      </span>
                      <span className="text-white/30">·</span>
                      <span className="text-white/40">ETA</span>
                      <span
                        className={`font-mono tabular-nums font-semibold drop-shadow-[0_0_12px_rgba(255,255,255,0.12)] ${theme.etaText}`}
                      >
                        {etaStr}
                      </span>
                    </div>
                    {voyageInfo && voyageInfo.totalDays > 0 && (
                      <div className="mt-0.5 text-[10px] text-white/45">
                        海运 · <span className="font-mono tabular-nums text-white/80">{voyageInfo.totalDays}</span> 天
                      </div>
                    )}
                  </div>
                </FlashyLogisticsCardShell>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
