import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProfitComponentAmount } from "@/lib/profit-schemes";

export type ProfitLedgerRevisionInput = {
  platform: string;
  externalShopId: string;
  storeId: string;
  orderId: string;
  businessDate: string;
  orderCurrency: string;
  exchangeRateCny: number;
  schemeId: string | null;
  schemeVersion: number;
  components: ProfitComponentAmount[];
  metadata?: Record<string, unknown>;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export function profitLedgerInputHash(input: ProfitLedgerRevisionInput): string {
  return createHash("sha256").update(JSON.stringify(stableValue(input))).digest("hex");
}

export function profitLedgerStatus(components: ProfitComponentAmount[]): "CALCULATED" | "INCOMPLETE" {
  return components.some((component) => component.required && component.sourceStatus === "MISSING")
    ? "INCOMPLETE"
    : "CALCULATED";
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function createProfitLedgerRevision(input: ProfitLedgerRevisionInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) throw new Error("Invalid profit ledger business date");
  if (!input.platform || !input.externalShopId || !input.storeId || !input.orderId) throw new Error("Incomplete profit ledger identity");
  if (!Number.isFinite(input.exchangeRateCny) || input.exchangeRateCny <= 0) throw new Error("Invalid profit ledger exchange rate");
  if (input.components.length === 0) throw new Error("Profit ledger requires components");

  const inputHash = profitLedgerInputHash(input);
  const current = await prisma.profitOrderLedger.findFirst({
    where: {
      platform: input.platform,
      externalShopId: input.externalShopId,
      orderId: input.orderId,
      isCurrent: true,
    },
    select: { id: true, calculationVersion: true, inputHash: true },
    orderBy: { calculationVersion: "desc" },
  });
  if (current?.inputHash === inputHash) {
    return prisma.profitOrderLedger.findUnique({
      where: { id: current.id },
      include: { entries: { orderBy: { componentCode: "asc" } } },
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.profitOrderLedger.updateMany({
      where: {
        platform: input.platform,
        externalShopId: input.externalShopId,
        orderId: input.orderId,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });
    return tx.profitOrderLedger.create({
      data: {
        platform: input.platform,
        externalShopId: input.externalShopId,
        storeId: input.storeId,
        orderId: input.orderId,
        businessDate: new Date(`${input.businessDate}T00:00:00.000Z`),
        orderCurrency: input.orderCurrency.toUpperCase(),
        exchangeRateCny: input.exchangeRateCny,
        schemeId: input.schemeId,
        schemeVersion: input.schemeVersion,
        calculationVersion: (current?.calculationVersion || 0) + 1,
        calculationStatus: profitLedgerStatus(input.components),
        inputHash,
        entries: {
          create: input.components.map((component) => {
            const originalEntries = Object.entries(component.originalAmounts)
              .filter(([, amount]) => Number.isFinite(amount));
            const primaryOriginal = originalEntries.length === 1 ? originalEntries[0] : null;
            return {
              componentCode: component.code,
              label: component.label,
              category: component.category,
              direction: component.direction,
              amountOriginal: primaryOriginal?.[1] ?? null,
              currency: primaryOriginal?.[0] || null,
              originalAmounts: jsonInput(component.originalAmounts),
              amountCny: component.amountCny,
              sourceStatus: component.sourceStatus,
              includeInGmv: component.includeInGmv,
              includeInProfit: component.includeInProfit,
              metadata: jsonInput({
                ...input.metadata,
                sourceKey: component.sourceKey,
                calculationMode: component.calculationMode,
                config: component.config,
              }),
            };
          }),
        },
      },
      include: { entries: { orderBy: { componentCode: "asc" } } },
    });
  });
}
