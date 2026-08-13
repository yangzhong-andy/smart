import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Only unconfirmed outbound batches are physically in transit. */
export async function GET() {
  try {
    const agg = await prisma.outboundBatchItem.aggregate({
      where: { outboundBatch: { arrivalConfirmedAt: null } },
      _sum: { qty: true },
    });
    return NextResponse.json({
      inTransitTotal: Number(agg._sum.qty ?? 0),
      source: "UNCONFIRMED_OUTBOUND_BATCHES",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
