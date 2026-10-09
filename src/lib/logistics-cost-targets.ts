export type CostContainerTarget = {
  id: string;
  containerNo: string;
  containerType: string;
  costsClosedAt: string | null;
};

export type CostBatchTarget = {
  id: string;
  batchNumber: string;
  containerId: string | null;
  costsClosedAt: string | null;
  outboundOrder: { outboundNumber: string };
  container: CostContainerTarget | null;
};

export type LogisticsCostTargets = {
  containers: CostContainerTarget[];
  batches: CostBatchTarget[];
};

export function isBatchCostClosed(batch: {
  costsClosedAt?: unknown;
  container?: { costsClosedAt?: unknown } | null;
}) {
  return Boolean(batch.costsClosedAt || batch.container?.costsClosedAt);
}

export class LogisticsCostTargetError extends Error {
  constructor(message: string, public readonly status: number = 409) {
    super(message);
  }
}

type ContainerState = { id: string; costsClosedAt: Date | null };
type BatchState = ContainerState & { containerId: string | null };

/** Validate the complete selection; never silently drop a closed/missing batch. */
export function validateCostTargets(
  batchIds: string[],
  containerId: string | null,
  batches: BatchState[],
  containers: ContainerState[],
) {
  if (batchIds.some((id) => !batches.some((batch) => batch.id === id))) {
    throw new LogisticsCostTargetError("所选出库批次不存在，请刷新后重新选择", 404);
  }
  const containerIds = new Set([
    ...(containerId ? [containerId] : []),
    ...batches.flatMap((batch) => batch.containerId ? [batch.containerId] : []),
  ]);
  if ([...containerIds].some((id) => !containers.some((container) => container.id === id))) {
    throw new LogisticsCostTargetError("所选柜子不存在，请刷新后重新选择", 404);
  }
  if (containerId && batches.some((batch) => batch.containerId !== containerId)) {
    throw new LogisticsCostTargetError("所选出库批次不属于该柜子，请重新选择", 400);
  }
  if (batches.some((batch) => batch.costsClosedAt) || containers.some((container) => container.costsClosedAt)) {
    throw new LogisticsCostTargetError("所选柜子或出库批次的费用已完结，请先在费用完结管理中重新打开");
  }
}
