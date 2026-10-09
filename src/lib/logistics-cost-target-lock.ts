import { Prisma } from "@prisma/client";
import { validateCostTargets } from "./logistics-cost-targets";
import { readCostClosureFees, resolveCostClosure } from "./logistics-cost-closure";

/** Lock batches first, then containers, in stable order. Closure uses the same row locks. */
export async function lockOpenCostTargets(
  tx: Prisma.TransactionClient,
  batchIds: string[],
  containerId: string | null,
) {
  const batches = batchIds.length ? await tx.$queryRaw<Array<{
    id: string; containerId: string | null; costsClosedAt: Date | null; costsReopened: boolean;
  }>>(Prisma.sql`
    SELECT "id", "containerId", "costsClosedAt", "costsReopened" FROM "OutboundBatch"
    WHERE "id" IN (${Prisma.join(batchIds)}) ORDER BY "id" FOR UPDATE
  `) : [];
  const containerIds = [...new Set([
    ...(containerId ? [containerId] : []),
    ...batches.flatMap((batch) => batch.containerId ? [batch.containerId] : []),
  ])];
  const containers = containerIds.length ? await tx.$queryRaw<Array<{
    id: string; costsClosedAt: Date | null; costsReopened: boolean;
  }>>(Prisma.sql`
    SELECT "id", "costsClosedAt", "costsReopened" FROM "Container"
    WHERE "id" IN (${Prisma.join(containerIds)}) ORDER BY "id" FOR UPDATE
  `) : [];
  validateCostTargets(batchIds, containerId, batches, containers);
  const effective = resolveCostClosure(containers, batches, await readCostClosureFees(tx, containerIds, batchIds));
  validateCostTargets(batchIds, containerId, effective.batches, effective.containers);
  return new Map(batches.map((batch) => [batch.id, batch.containerId]));
}
