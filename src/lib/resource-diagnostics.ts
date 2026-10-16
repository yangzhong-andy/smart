import { AsyncLocalStorage } from "node:async_hooks";

const TASKS = [
  "tiktok.sync", "tiktok.webhook.receive", "tiktok.webhook.process",
  "profit.report", "shopee.profit", "shopee.webhook.process",
  "mercado.products.sync", "warehouse.tiktok.reconcile",
] as const;
const PHASES = [
  "started", "orders_loaded", "orders_saved", "warehouse_done", "shop_done",
  "reference_data_loaded", "financials_loaded", "report_ready", "cache_hit",
  "recovery_done", "events_loaded", "report_requested", "report_loaded", "finished",
] as const;
const METRICS = ["orders", "shops", "rows", "dates", "pages", "selected", "processed", "failed"] as const;
export type ResourceTask = typeof TASKS[number];
export type ResourcePhase = typeof PHASES[number];
type ResourceMetrics = Partial<Record<typeof METRICS[number], number>>;
export type ResourceScope = { checkpoint: (phase: ResourcePhase, metrics?: ResourceMetrics) => void };

type Memory = Pick<NodeJS.MemoryUsage, "rss" | "heapUsed" | "heapTotal" | "external" | "arrayBuffers">;
type Active = { id: string; parentId?: string; task: ResourceTask; phase: ResourcePhase; started: number; peakRss: number };
type DiagnosticOptions = {
  enabled: boolean;
  intervalMs?: number;
  maxEventsPerMinute?: number;
  now?: () => number;
  memory?: () => Memory;
  write?: (event: Record<string, unknown>) => void;
  schedule?: (sample: () => void, intervalMs: number) => { unref?: () => void };
  cancel?: (timer: unknown) => void;
};
const NOOP_SCOPE: ResourceScope = { checkpoint() {} };
const TASK_SET = new Set<string>(TASKS);
const PHASE_SET = new Set<string>(PHASES);
const MAX_TRACKED_SCOPES = 128;
const mib = (bytes: number) => Math.round(bytes / 1024 / 1024 * 100) / 100;

/** Process-wide observations, not memory attributed exclusively to an individual request. */
export function createResourceDiagnostics(options: DiagnosticOptions) {
  const now = options.now || Date.now;
  const memory = options.memory || (() => process.memoryUsage());
  const write = options.write || ((event) => console.info(`[ERP Resource] ${JSON.stringify(event)}`));
  const interval = Math.min(300_000, Math.max(5_000, Number(options.intervalMs) || 15_000));
  const eventLimit = Math.min(300, Math.max(1, Number(options.maxEventsPerMinute) || 120));
  const context = new AsyncLocalStorage<Active>();
  const active = new Map<string, Active>();
  const counts: Partial<Record<ResourceTask, number>> = {};
  let sequence = 0;
  let timer: ReturnType<NonNullable<DiagnosticOptions["schedule"]>> | undefined;
  let windowStart = 0;
  let written = 0;
  let dropped = 0;
  let lastSample = 0;
  let closed = false;

  function readMemory(): Memory | null {
    try {
      const snapshot = memory();
      for (const scope of active.values()) scope.peakRss = Math.max(scope.peakRss, snapshot.rss);
      return snapshot;
    } catch { return null; }
  }

  function emit(event: Record<string, unknown>, heartbeat = false) {
    // Diagnostics must never fail a business operation or retain request/response objects.
    if (closed) return;
    try {
      const time = now();
      if (time - windowStart >= 60_000) { windowStart = time; written = 0; }
      if (!heartbeat && written >= eventLimit) { dropped += 1; return; }
      if (!heartbeat) written += 1;
      const snapshot = readMemory();
      write({
        ...event, time: new Date(time).toISOString(), pid: process.pid,
        activeCount: Object.values(counts).reduce((sum, count) => sum + (count || 0), 0),
        activeTasks: { ...counts }, trackedScopes: active.size,
        ...(snapshot ? { memoryMiB: {
          rss: mib(snapshot.rss), heapUsed: mib(snapshot.heapUsed), heapTotal: mib(snapshot.heapTotal),
          external: mib(snapshot.external), arrayBuffers: mib(snapshot.arrayBuffers),
        } } : { memoryUnavailable: true }),
      });
    } catch { /* Logging is best-effort and must not change business results. */ }
  }

  function ensureSampler() {
    if (timer || closed) return;
    try {
      lastSample = now();
      const sample = () => {
        if (closed) return;
        const time = now();
        const lagMs = Math.max(0, time - lastSample - interval);
        lastSample = time;
        const oldest = [...active.values()].sort((a, b) => a.started - b.started).slice(0, 6)
          .map((scope) => ({ id: scope.id, task: scope.task, phase: scope.phase, elapsedMs: Math.max(0, time - scope.started) }));
        emit({ event: "sample", lagMs, droppedEvents: dropped, oldest }, true);
        dropped = 0;
      };
      timer = options.schedule ? options.schedule(sample, interval) : setInterval(sample, interval);
      timer.unref?.();
    } catch { /* No sampler is preferable to breaking a request. */ }
  }

  async function run<T>(task: ResourceTask, work: (scope: ResourceScope) => Promise<T>): Promise<T> {
    if (!options.enabled || closed || !TASK_SET.has(task)) return work(NOOP_SCOPE);
    const scope: Active = {
      id: `${process.pid}-${++sequence}`, parentId: context.getStore()?.id,
      task, phase: "started", started: now(), peakRss: 0,
    };
    counts[task] = (counts[task] || 0) + 1;
    if (active.size < MAX_TRACKED_SCOPES) active.set(scope.id, scope);
    ensureSampler();
    emit({ event: "start", id: scope.id, parentId: scope.parentId, task });
    let outcome = "error";
    let status: number | undefined;
    try {
      const result = await context.run(scope, () => work({
        checkpoint(phase, metrics = {}) {
          if (!PHASE_SET.has(phase) || scope.phase === "finished") return;
          scope.phase = phase;
          const safeMetrics: ResourceMetrics = {};
          for (const key of METRICS) {
            const value = metrics[key];
            if (typeof value === "number" && Number.isFinite(value) && value >= 0) safeMetrics[key] = value;
          }
          emit({ event: "checkpoint", id: scope.id, parentId: scope.parentId, task, phase, metrics: safeMetrics });
        },
      }));
      status = result instanceof Response ? result.status : undefined;
      outcome = status && status >= 400 ? "http_error" : "ok";
      return result;
    } finally {
      // A scope which outlives its HTTP response (webhook background work) stays
      // registered until its own promise settles, not until the parent returns.
      const snapshot = active.has(scope.id) ? readMemory() : null;
      if (snapshot) scope.peakRss = Math.max(scope.peakRss, snapshot.rss);
      scope.phase = "finished";
      active.delete(scope.id);
      counts[task] = Math.max(0, (counts[task] || 1) - 1);
      if (!counts[task]) delete counts[task];
      emit({ event: "end", id: scope.id, parentId: scope.parentId, task, outcome, status,
        elapsedMs: Math.max(0, now() - scope.started), observedPeakRssMiB: scope.peakRss > 0 ? mib(scope.peakRss) : null });
    }
  }

  return { run, close() {
    closed = true;
    if (timer) {
      if (options.cancel) options.cancel(timer);
      else clearInterval(timer as NodeJS.Timeout);
    }
    active.clear();
  } };
}

type Diagnostics = ReturnType<typeof createResourceDiagnostics>;
const processGlobal = globalThis as typeof globalThis & { __smartErpResourceDiagnostics?: Diagnostics };

/** Disabled by default. One bounded sampler per Node runtime, shared across route bundles. */
export function withResourceDiagnostics<T>(task: ResourceTask, work: (scope: ResourceScope) => Promise<T>): Promise<T> {
  if (process.env.ERP_RESOURCE_DIAGNOSTICS !== "1") return work(NOOP_SCOPE);
  processGlobal.__smartErpResourceDiagnostics ||= createResourceDiagnostics({
    enabled: true,
    intervalMs: Number(process.env.ERP_RESOURCE_DIAGNOSTICS_INTERVAL_MS) || 15_000,
  });
  return processGlobal.__smartErpResourceDiagnostics.run(task, work);
}
