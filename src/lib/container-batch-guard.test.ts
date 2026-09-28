import assert from "node:assert/strict";
import test from "node:test";
import { claimOutboundBatchesForContainer, ContainerBatchAlreadyLoadedError } from "./container-batch-guard";

test("claims only unassigned outbound batches", async () => {
  let input: any;
  const tx = {
    outboundBatch: {
      updateMany: async (args: any) => {
        input = args;
        return { count: 1 };
      },
    },
  };
  await claimOutboundBatchesForContainer(tx as any, ["batch-1"], "container-1");
  assert.deepEqual(input.where, {
    id: { in: ["batch-1"] },
    containerId: null,
    status: { not: "已装柜" },
  });
  assert.equal(input.data.containerId, "container-1");
  assert.equal(input.data.status, "已装柜");
});

test("rejects a stale or partially loaded batch selection", async () => {
  const tx = { outboundBatch: { updateMany: async () => ({ count: 1 }) } };
  await assert.rejects(
    claimOutboundBatchesForContainer(tx as any, ["batch-1", "batch-2"], "container-1"),
    ContainerBatchAlreadyLoadedError,
  );
});

test("rejects duplicate batch ids before updating", async () => {
  const tx = { outboundBatch: { updateMany: async () => { throw new Error("must not run"); } } };
  await assert.rejects(
    claimOutboundBatchesForContainer(tx as any, ["batch-1", "batch-1"], "container-1"),
    /无效的出库批次/,
  );
});
