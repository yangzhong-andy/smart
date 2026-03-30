"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ship } from "lucide-react";
import type { Container } from "@/logistics/types";

type StepKey = "LOADED" | "SAILED" | "ARRIVED" | "WAREHOUSED";

type StepDef = {
  key: StepKey;
  label: string;
  pct: number;
  getTime: (c: Container) => string | null;
  getTooltipLabel: (c: Container) => string;
};

function toDateLabel(value?: string | null, withTime = false): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return withTime ? d.toLocaleString("zh-CN") : d.toLocaleDateString("zh-CN");
}

function containerToStep(container: Container): StepKey | null {
  switch (container.status) {
    case "LOADING":
      return "LOADED";
    case "IN_TRANSIT":
      return "SAILED";
    case "ARRIVED_PORT":
    case "CUSTOMS_CLEAR":
      return "ARRIVED";
    case "IN_WAREHOUSE":
    case "CLOSED":
      return "WAREHOUSED";
    default:
      return null;
  }
}

function containerToPct(container: Container): number {
  const step = containerToStep(container);
  if (!step) return 0;
  switch (step) {
    case "LOADED":
      return 25;
    case "SAILED":
      return 50;
    case "ARRIVED":
      return 75;
    case "WAREHOUSED":
      return 100;
  }
}

export function LogisticsProgressAxis({ container }: { container: Container }) {
  const [hovered, setHovered] = useState<StepKey | null>(null);

  const steps: StepDef[] = useMemo(
    () => [
      {
        key: "LOADED",
        label: "已装柜",
        pct: 25,
        getTime: (c) => toDateLabel(c.createdAt, true),
        getTooltipLabel: () => "装柜时间",
      },
      {
        key: "SAILED",
        label: "已开船",
        pct: 50,
        // sailedAt → 实际开船时间（Container.actualDeparture）
        getTime: (c) => toDateLabel(c.actualDeparture, true),
        getTooltipLabel: () => "开船时间",
      },
      {
        key: "ARRIVED",
        label: "已到港",
        pct: 75,
        // actualArrival → 实际到港时间（Container.actualArrival）
        getTime: (c) => toDateLabel(c.actualArrival, true),
        getTooltipLabel: () => "到港时间",
      },
      {
        key: "WAREHOUSED",
        label: "已入库",
        pct: 100,
        // 目前模型无入库时间字段：用 updatedAt 兜底（仅用于展示）
        getTime: (c) => (c.status === "IN_WAREHOUSE" || c.status === "CLOSED" ? toDateLabel(c.updatedAt, true) : null),
        getTooltipLabel: () => "入库时间",
      },
    ],
    []
  );

  const pct = containerToPct(container);
  const etaLabel = toDateLabel(container.eta, false);
  const isOverdue =
    !!container.eta &&
    new Date(container.eta).getTime() < Date.now() &&
    !["ARRIVED_PORT", "CUSTOMS_CLEAR", "IN_WAREHOUSE", "CLOSED"].includes(container.status);

  const barBase =
    "relative h-2 w-full rounded-full overflow-hidden border border-slate-700/70 bg-slate-900/40";

  const fillClass = isOverdue
    ? "bg-gradient-to-r from-amber-400 via-red-500 to-red-500"
    : "bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-400";

  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          物流进度轴
          {etaLabel ? (
            <span className="ml-2 text-[11px] text-slate-500">
              预计到港 {etaLabel}
              {isOverdue ? <span className="ml-1 text-red-400">（已延误）</span> : null}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-slate-500 tabular-nums">{pct}%</div>
      </div>

      <div className="mt-3">
        <div className={barBase}>
          <motion.div
            className={`absolute inset-y-0 left-0 ${fillClass} ${isOverdue ? "animate-pulse" : ""}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.9, ease: "circOut" }}
          />

          {/* 当前位置发光点 */}
          <motion.div
            className={`absolute top-1/2 size-3 -translate-y-1/2 rounded-full ${
              isOverdue ? "bg-red-200 shadow-[0_0_14px_rgba(248,113,113,0.95)]" : "bg-white shadow-[0_0_14px_rgba(255,255,255,0.85)]"
            }`}
            initial={{ left: "0%" }}
            animate={{ left: `${pct}%` }}
            transition={{ duration: 0.9, ease: "circOut" }}
            style={{ marginLeft: "-6px" }}
          />

          {/* 航行中：小船 + 波浪起伏 */}
          {container.status === "IN_TRANSIT" && (
            <motion.div
              className="absolute top-1/2 -translate-y-1/2"
              initial={{ left: "0%" }}
              animate={{ left: `${pct}%` }}
              transition={{ duration: 0.9, ease: "circOut" }}
              style={{ marginLeft: "-10px" }}
            >
              <motion.div
                className="relative"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-2 w-10 overflow-hidden opacity-80">
                  <motion.div
                    className="h-full w-full bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent"
                    animate={{ x: [-24, 24] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                <Ship className="h-4 w-4 text-cyan-100 drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]" />
              </motion.div>
            </motion.div>
          )}
        </div>

        {/* 四节点 */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          {steps.map((s) => {
            const active = pct >= s.pct;
            const t = s.getTime(container);
            return (
              <div
                key={s.key}
                className="relative"
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered((cur) => (cur === s.key ? null : cur))}
              >
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`h-2.5 w-2.5 rounded-full border ${
                      active
                        ? isOverdue && (s.key === "ARRIVED" || s.key === "WAREHOUSED")
                          ? "border-red-400 bg-red-300/90 shadow-[0_0_10px_rgba(248,113,113,0.55)]"
                          : "border-cyan-300 bg-cyan-200/90 shadow-[0_0_10px_rgba(34,211,238,0.55)]"
                        : "border-slate-600 bg-slate-800"
                    }`}
                  />
                  <div className={`text-[11px] ${active ? "text-slate-200" : "text-slate-500"}`}>{s.label}</div>
                </div>

                <AnimatePresence>
                  {hovered === s.key && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                      className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+10px)]"
                    >
                      <div className="rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-200 shadow-2xl">
                        <div className="text-slate-400">{s.getTooltipLabel(container)}：</div>
                        <div className="mt-0.5 font-mono text-slate-100">{t ?? "—"}</div>
                        {s.key === "ARRIVED" && etaLabel ? (
                          <div className="mt-1 text-[10px] text-slate-500">预计到港：{etaLabel}</div>
                        ) : null}
                      </div>
                      <div className="mx-auto mt-1 h-0 w-0 border-x-8 border-x-transparent border-t-8 border-t-slate-700/80" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

