import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { consumeCostReopening, readCostClosureFees, resolveCostClosure } from "./logistics-cost-closure";
import { lockOpenCostTargets } from "./logistics-cost-target-lock";

const date = new Date("2026-10-09T03:00:00Z");
const container = { id: "c1", costsClosedAt: null, costsReopened: false };
const batch = { id: "b1", containerId: "c1", costsClosedAt: null, costsReopened: false };
const paid = { containerId: "c1", outboundBatchId: "b1", paymentStatus: "已付", paidDate: date, updatedAt: date, outboundBatch: { containerId: "c1" } };

test("all paid closes historical targets; no fees or any outstanding fee stays open", () => {
  const result = resolveCostClosure([container], [batch], [paid]);
  assert.deepEqual(result.containers[0].costsClosedAt, date);
  assert.equal(result.containers[0].costClosureSource, "paid");
  assert.deepEqual(result.batches[0].costsClosedAt, date);
  for (const fees of [[], [paid, { ...paid, paymentStatus: "未付" }], [{ ...paid, paymentStatus: "审批中" }]]) {
    const open = resolveCostClosure([container], [batch], fees);
    assert.equal(open.containers[0].costsClosedAt, null);
    assert.equal(open.batches[0].costsClosedAt, null);
  }
});

test("container includes legacy batch-only fees and direct-only fees without double attribution", () => {
  const legacy = { ...paid, containerId: null };
  assert.deepEqual(resolveCostClosure([container], [batch], [legacy]).containers[0].costsClosedAt, date);
  const directUnpaid = { ...paid, outboundBatchId: null, outboundBatch: null, paymentStatus: "未付" };
  assert.equal(resolveCostClosure([container], [batch], [legacy, directUnpaid]).containers[0].costsClosedAt, null);
  const other = { ...container, id: "c2" };
  const explicitOther = resolveCostClosure([container, other], [batch], [{ ...paid, containerId: "c2" }]);
  assert.equal(explicitOther.containers[0].costsClosedAt, null);
  assert.deepEqual(explicitOther.containers[1].costsClosedAt, date);
});

test("uses last paid date with update fallback; manual closure remains independent", () => {
  const later = new Date("2026-10-10T03:00:00Z");
  assert.deepEqual(resolveCostClosure([container], [], [paid, { ...paid, paidDate: null, updatedAt: later }]).containers[0].costsClosedAt, later);
  const manual = resolveCostClosure([{ ...container, costsClosedAt: date }], [], [{ ...paid, paymentStatus: "未付" }]);
  assert.equal(manual.containers[0].costClosureSource, "manual");
});

test("parent reopen enables auto-paid batches but preserves manually closed batches", () => {
  const reopened = { ...container, costsReopened: true };
  const result = resolveCostClosure([reopened], [batch, { ...batch, id: "manual", costsClosedAt: date }], [paid]);
  assert.equal(result.containers[0].costsClosedAt, null);
  assert.equal(result.batches[0].costsClosedAt, null);
  assert.deepEqual(result.batches[1].costsClosedAt, date);
  assert.equal(resolveCostClosure([], [{ ...batch, containerId: null, costsReopened: true }], [paid]).batches[0].costsClosedAt, null);
});

test("supplement lifecycle resets override, stays open until new fee paid, then closes", async () => {
  const parent = { ...container, costsReopened: true };
  const child = { ...batch, costsReopened: true };
  const updates: string[] = [];
  const tx = {
    outboundBatch: { updateMany: async () => { child.costsReopened = false; updates.push("batch"); } },
    container: { updateMany: async () => { parent.costsReopened = false; updates.push("container"); } },
  } as unknown as Prisma.TransactionClient;
  assert.equal(resolveCostClosure([parent], [child], [paid]).containers[0].costsClosedAt, null);
  const supplement = { ...paid, paymentStatus: "未付" };
  await consumeCostReopening(tx, [child.id], [parent.id]);
  assert.deepEqual(updates, ["batch", "container"]);
  assert.equal(resolveCostClosure([parent], [child], [paid, supplement]).containers[0].costsClosedAt, null);
  supplement.paymentStatus = "已付";
  assert.deepEqual(resolveCostClosure([parent], [child], [paid, supplement]).containers[0].costsClosedAt, date);
});

test("server guard blocks automatically paid targets even if client omits container", async () => {
  let reads = 0;
  const tx = {
    $queryRaw: async () => ++reads === 1 ? [batch] : [container],
    logisticsCost: { findMany: async () => [paid] },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(lockOpenCostTargets(tx, [batch.id], null), /费用已完结/);
  reads = 0;
  const reopenedTx = { ...tx, $queryRaw: async () => ++reads === 1 ? [batch] : [{ ...container, costsReopened: true }] } as unknown as Prisma.TransactionClient;
  assert.equal((await lockOpenCostTargets(reopenedTx, [batch.id], null)).get(batch.id), container.id);
});

test("fee loader limits query to selected targets including old batch links", async () => {
  let query: unknown;
  const tx = { logisticsCost: { findMany: async (args: unknown) => { query = args; return [paid]; } } } as unknown as Prisma.TransactionClient;
  assert.deepEqual(await readCostClosureFees(tx, [], []), []);
  assert.equal(query, undefined);
  assert.deepEqual(await readCostClosureFees(tx, [container.id], [batch.id]), [paid]);
  assert.deepEqual((query as unknown as { where: unknown }).where, { OR: [
    { containerId: { in: ["c1"] } }, { containerId: null, outboundBatch: { containerId: { in: ["c1"] } } },
    { outboundBatchId: { in: ["b1"] } },
  ] });
});
