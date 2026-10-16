import assert from "node:assert/strict";
import test from "node:test";
import { createResourceDiagnostics } from "./resource-diagnostics";

const MB = 1024 * 1024;
function fixture(overrides: Partial<Parameters<typeof createResourceDiagnostics>[0]> = {}) {
  let time = 1_800_000_000_000;
  let rss = 100 * MB;
  let sample = () => {};
  let scheduled = 0;
  let cancelled = 0;
  const events: Array<Record<string, any>> = [];
  const diagnostics = createResourceDiagnostics({
    enabled: true, now: () => time,
    memory: () => ({ rss, heapUsed: 30 * MB, heapTotal: 50 * MB, external: 10 * MB, arrayBuffers: 5 * MB }),
    write: (event) => events.push(event),
    schedule: (callback) => { scheduled++; sample = callback; return { unref() {} }; },
    cancel: () => { cancelled++; }, ...overrides,
  });
  return { diagnostics, events, sample: () => sample(), advance: (ms: number) => { time += ms; },
    rss: (value: number) => { rss = value * MB; }, scheduled: () => scheduled, cancelled: () => cancelled };
}

test("disabled diagnostics do not log, sample memory, or schedule a timer", async () => {
  const f = fixture({ enabled: false, memory: () => { throw new Error("must not read"); } });
  const expected = { unchanged: true };
  assert.equal(await f.diagnostics.run("tiktok.sync", async (scope) => {
    scope.checkpoint("orders_saved", { orders: 12 }); return expected;
  }), expected);
  assert.equal(f.events.length, 0);
  assert.equal(f.scheduled(), 0);
});

test("records stages, shared process memory, observed peak and duration without altering a response", async () => {
  const f = fixture();
  const response = new Response("unchanged", { status: 202 });
  assert.equal(await f.diagnostics.run("tiktok.sync", async (scope) => {
    f.rss(220); f.advance(300);
    scope.checkpoint("orders_saved", { orders: 821 });
    f.rss(120); f.advance(200); return response;
  }), response);
  assert.equal(await response.text(), "unchanged");
  assert.equal(f.scheduled(), 1);
  assert.deepEqual(f.events.map((event) => event.event), ["start", "checkpoint", "end"]);
  const end = f.events.at(-1)!;
  assert.equal(end.elapsedMs, 500);
  assert.equal(end.observedPeakRssMiB, 220);
  assert.equal(end.memoryMiB.heapUsed, 30);
  assert.equal(end.status, 202);
  assert.equal(end.outcome, "ok");
  assert.equal(end.activeCount, 0);
  f.diagnostics.close();
});

test("HTTP errors and thrown errors retain their original response or exception and release counters", async () => {
  const f = fixture();
  const response = new Response("original", { status: 502 });
  assert.equal(await f.diagnostics.run("shopee.webhook.process", async () => response), response);
  assert.equal(f.events.at(-1)!.outcome, "http_error");
  const error = new Error("private token and customer data must not be logged");
  await assert.rejects(f.diagnostics.run("profit.report", async () => { throw error; }), (actual) => actual === error);
  assert.equal(f.events.at(-1)!.outcome, "error");
  assert.equal(f.events.at(-1)!.activeCount, 0);
  assert.doesNotMatch(JSON.stringify(f.events), /private token|customer data/);
  f.diagnostics.close();
});

test("background work stays visible after its parent HTTP response has completed", async () => {
  const f = fixture();
  let finish = () => {};
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  let background: Promise<void> | undefined;
  await f.diagnostics.run("tiktok.webhook.receive", async () => {
    background = f.diagnostics.run("tiktok.webhook.process", async () => { await gate; });
    return new Response("ok");
  });
  const [parent, child] = f.events.filter((event) => event.event === "start");
  assert.equal(child.parentId, parent.id);
  assert.equal(f.events.at(-1)!.activeCount, 1);
  f.advance(20_000); f.rss(400); f.sample();
  const sample = f.events.at(-1)!;
  assert.equal(sample.lagMs, 5_000);
  assert.equal(sample.oldest[0].task, "tiktok.webhook.process");
  assert.equal(sample.activeTasks["tiktok.webhook.process"], 1);
  finish(); await background;
  assert.equal(f.events.at(-1)!.observedPeakRssMiB, 400);
  assert.equal(f.events.at(-1)!.activeCount, 0);
  f.diagnostics.close();
});

test("concurrent scopes retain separate parent relationships across await boundaries", async () => {
  const f = fixture();
  await Promise.all(["tiktok.sync", "profit.report"].map((name) => f.diagnostics.run(name as "tiktok.sync" | "profit.report", async () => {
    await Promise.resolve();
    await f.diagnostics.run("warehouse.tiktok.reconcile", async () => {});
  })));
  const parents = f.events.filter((event) => event.event === "start" && !event.parentId);
  const children = f.events.filter((event) => event.event === "start" && event.parentId);
  assert.equal(new Set(children.map((child) => child.parentId)).size, 2);
  for (const child of children) assert.ok(parents.some((parent) => parent.id === child.parentId));
  assert.equal(f.scheduled(), 1);
  f.diagnostics.close();
});

test("tracking and log volume stay bounded under a burst, but heartbeat preserves concurrency counts", async () => {
  const f = fixture({ maxEventsPerMinute: 10 });
  let finish = () => {};
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const jobs = Array.from({ length: 200 }, () => f.diagnostics.run("profit.report", async () => { await gate; }));
  assert.equal(f.events.length, 10);
  f.sample();
  const sample = f.events.at(-1)!;
  assert.equal(sample.activeCount, 200);
  assert.equal(sample.trackedScopes, 128);
  assert.equal(sample.oldest.length, 6);
  assert.equal(sample.droppedEvents, 190);
  finish(); await Promise.all(jobs);
  f.advance(60_000); f.sample();
  assert.equal(f.events.at(-1)!.activeCount, 0);
  assert.equal(f.events.at(-1)!.trackedScopes, 0);
  assert.equal(f.events.at(-1)!.droppedEvents, 200);
  f.diagnostics.close();
});

test("whitelists log fields and rejects arbitrary task names, phases and metrics", async () => {
  const f = fixture();
  await f.diagnostics.run("tiktok.sync", async (scope) => {
    scope.checkpoint("orders_loaded", { orders: 5, rows: Infinity, failed: -1, token: "secret", email: "customer@example.test" } as any);
    scope.checkpoint("customer private data" as any);
  });
  await f.diagnostics.run("private request URL" as any, async () => "ok");
  assert.deepEqual(f.events.find((event) => event.event === "checkpoint")!.metrics, { orders: 5 });
  assert.doesNotMatch(JSON.stringify(f.events), /secret|customer|example\.test|private request/);
  f.diagnostics.close();
});

test("failing memory collection, logging or scheduling cannot fail business work", async () => {
  for (const overrides of [
    { memory: () => { throw new Error("read failure"); } },
    { write: () => { throw new Error("log failure"); } },
    { schedule: () => { throw new Error("timer failure"); } },
  ]) {
    const f = fixture(overrides);
    assert.equal(await f.diagnostics.run("profit.report", async (scope) => { scope.checkpoint("report_ready"); return 42; }), 42);
    f.diagnostics.close();
  }
});

test("close cancels the sampler, and later work is passed through without diagnostics", async () => {
  const f = fixture();
  await f.diagnostics.run("profit.report", async () => {});
  f.diagnostics.close();
  const count = f.events.length;
  await f.diagnostics.run("profit.report", async () => {});
  f.sample();
  assert.equal(f.events.length, count);
  assert.equal(f.cancelled(), 1);
});
