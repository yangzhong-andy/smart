import type { Prisma } from "@prisma/client";

type Target = { id: string; costsClosedAt: Date | null; costsReopened?: boolean };
type Batch = Target & { containerId: string | null };
type Fee = {
  containerId: string | null;
  outboundBatchId: string | null;
  paymentStatus: string;
  paidDate: Date | null;
  updatedAt: Date;
  outboundBatch: { containerId: string | null } | null;
};

/** Direct links take precedence; old batch-only links count once toward the parent. */
export function resolveCostClosure<C extends Target, B extends Batch>(containers: C[], batches: B[], fees: Fee[]) {
  const containerFees = new Map<string, Fee[]>();
  const batchFees = new Map<string, Fee[]>();
  for (const fee of fees) {
    const parentId = fee.containerId ?? fee.outboundBatch?.containerId;
    if (parentId) containerFees.set(parentId, [...(containerFees.get(parentId) ?? []), fee]);
    if (fee.outboundBatchId) batchFees.set(fee.outboundBatchId, [...(batchFees.get(fee.outboundBatchId) ?? []), fee]);
  }
  function effective<T extends Target>(target: T, related: Fee[], parentReopened = false) {
    const allPaid = related.length > 0 && related.every((fee) => fee.paymentStatus === "已付");
    const automatic = !target.costsClosedAt && !target.costsReopened && !parentReopened && allPaid;
    return {
      ...target,
      costsClosedAt: target.costsClosedAt ?? (automatic
        ? new Date(Math.max(...related.map((fee) => (fee.paidDate ?? fee.updatedAt).getTime()))) : null),
      costClosureSource: target.costsClosedAt ? "manual" as const : automatic ? "paid" as const : null,
    };
  }
  return {
    containers: containers.map((target) => effective(target, containerFees.get(target.id) ?? [])),
    batches: batches.map((target) => effective(target, batchFees.get(target.id) ?? [],
      Boolean(containers.find((parent) => parent.id === target.containerId)?.costsReopened))),
  };
}

export async function readCostClosureFees(tx: Prisma.TransactionClient, containerIds: string[], batchIds: string[]) {
  if (!containerIds.length && !batchIds.length) return [];
  return tx.logisticsCost.findMany({
    where: { OR: [
      { containerId: { in: containerIds } },
      { containerId: null, outboundBatch: { containerId: { in: containerIds } } },
      { outboundBatchId: { in: batchIds } },
    ] },
    select: {
      containerId: true, outboundBatchId: true, paymentStatus: true, paidDate: true, updatedAt: true,
      outboundBatch: { select: { containerId: true } },
    },
  });
}

/** Consume the supplementary-entry override only after the new fee rows were created. */
export async function consumeCostReopening(tx: Prisma.TransactionClient, batchIds: string[], containerIds: string[]) {
  if (batchIds.length) await tx.outboundBatch.updateMany({ where: { id: { in: batchIds }, costsReopened: true }, data: { costsReopened: false } });
  if (containerIds.length) await tx.container.updateMany({ where: { id: { in: containerIds }, costsReopened: true }, data: { costsReopened: false } });
}
