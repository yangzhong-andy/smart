import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { isBatchCostClosed, LogisticsCostTargetError, validateCostTargets } from "./logistics-cost-targets";
import { lockOpenCostTargets } from "./logistics-cost-target-lock";

const closedAt = new Date("2026-10-09T02:00:00Z");
const container = { id: "container-1", costsClosedAt: null };
const batch = { id: "batch-1", containerId: container.id, costsClosedAt: null };

test("container completion hides linked batches; reopening preserves independent batch completion", () => {
  assert.equal(isBatchCostClosed({ costsClosedAt: null, container: { costsClosedAt: closedAt } }), true);
  assert.equal(isBatchCostClosed({ costsClosedAt: closedAt, container: { costsClosedAt: null } }), true);
  assert.equal(isBatchCostClosed({ costsClosedAt: null, container: { costsClosedAt: null } }), false);
  assert.equal(isBatchCostClosed({ costsClosedAt: null, container: null }), false);
});

test("transport completion and existing paid bills alone do not close cost entry", () => {
  const target = { costsClosedAt: null, status: "CLOSED", paymentStatus: "已付", container: null };
  assert.equal(isBatchCostClosed(target), false);
  assert.doesNotThrow(() => validateCostTargets([batch.id], null, [batch], [container]));
  assert.doesNotThrow(() => validateCostTargets([], container.id, [], [container]));
  assert.doesNotThrow(() => validateCostTargets([], null, [], []));
});

test("stale batch submission cannot bypass completed parent by omitting containerId", () => {
  assert.throws(() => validateCostTargets([batch.id], null, [batch], [{ ...container, costsClosedAt: closedAt }]),
    (err: unknown) => err instanceof LogisticsCostTargetError && err.status === 409);
  assert.throws(() => validateCostTargets([batch.id], container.id, [{ ...batch, costsClosedAt: closedAt }], [container]), /费用已完结/);
  assert.throws(() => validateCostTargets([], container.id, [], [{ ...container, costsClosedAt: closedAt }]), /费用已完结/);
});

test("missing targets or container/batch mismatches fail the whole selection", () => {
  assert.throws(() => validateCostTargets([batch.id, "missing"], null, [batch], [container]),
    (err: unknown) => err instanceof LogisticsCostTargetError && err.status === 404);
  assert.throws(() => validateCostTargets([], "missing", [], []), /柜子不存在/);
  assert.throws(() => validateCostTargets([batch.id], "other", [batch], [container, { ...container, id: "other" }]), /不属于该柜子/);
});

test("unfiltered multi-container selection retains each batch's actual container", async () => {
  const sql: Prisma.Sql[] = [];
  const batches = [batch, { ...batch, id: "batch-2", containerId: "container-2" }, { ...batch, id: "batch-3", containerId: null }];
  const tx = { $queryRaw: async (query: Prisma.Sql) => {
    sql.push(query);
    return sql.length === 1 ? batches : [container, { ...container, id: "container-2" }];
  } } as unknown as Prisma.TransactionClient;
  const links = await lockOpenCostTargets(tx, batches.map((b) => b.id), null);
  assert.deepEqual([...links], [["batch-1", "container-1"], ["batch-2", "container-2"], ["batch-3", null]]);
  assert.match(sql[0].text, /OutboundBatch/);
  assert.match(sql[1].text, /Container/);
  for (const query of sql) assert.match(query.text, /ORDER BY "id" FOR UPDATE/);
  assert.deepEqual(sql[1].values, ["container-1", "container-2"]);
});

test("database guard rejects a closed parent before creating any cost", async () => {
  let reads = 0;
  const tx = { $queryRaw: async () => ++reads === 1 ? [batch] : [{ ...container, costsClosedAt: closedAt }] } as unknown as Prisma.TransactionClient;
  await assert.rejects(lockOpenCostTargets(tx, [batch.id], null), /费用已完结/);
  assert.equal(reads, 2);
});
