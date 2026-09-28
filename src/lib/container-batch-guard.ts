import type { Prisma } from "@prisma/client";

export class ContainerBatchAlreadyLoadedError extends Error {
  constructor() {
    super("所选批次已生成柜子或正在装柜，请刷新后查看，不能重复生成");
    this.name = "ContainerBatchAlreadyLoadedError";
  }
}

/**
 * Claim batches inside the same transaction that creates the container.
 * Conditional UPDATE locks the rows and prevents two different requests from
 * attaching the same batch to two cabinets after both passed a stale precheck.
 */
export async function claimOutboundBatchesForContainer(
  tx: Prisma.TransactionClient,
  batchIds: string[],
  containerId: string,
) {
  if (batchIds.length === 0 || new Set(batchIds).size !== batchIds.length) {
    throw new Error("无效的出库批次");
  }

  const now = new Date();
  const result = await tx.outboundBatch.updateMany({
    where: {
      id: { in: batchIds },
      containerId: null,
      status: { not: "已装柜" },
    },
    data: {
      containerId,
      status: "已装柜",
      lastEvent: "已装柜",
      lastEventTime: now,
    },
  });

  if (result.count !== batchIds.length) {
    throw new ContainerBatchAlreadyLoadedError();
  }
}
