import { prisma } from "@/lib/prisma";
import { getMercadoLivreShipment } from "@/lib/mercado-livre-api";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";
import { reconcileMercadoLivreStockForOrder } from "@/lib/mercado-livre-stock-deduct";

const dryRun = !process.argv.includes("--apply");

async function shipmentStatus(accountId: string, shippingId: string | null, rawData: unknown) {
  const id = shippingId || (rawData as any)?.shipping?.id?.toString() || null;
  if (!id) return null;
  try {
    const shipment = await withFreshMercadoLivreToken(accountId, (token) => getMercadoLivreShipment(token, id));
    return String(shipment?.status || "").trim().toUpperCase().replace(/-/g, "_") || null;
  } catch (error) {
    console.warn(`物流 ${id} 读取失败，跳过`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function main() {
  const orders = await prisma.mercadoLivreOrder.findMany({
    where: { dateCreated: { not: null }, account: { status: "active" } },
    select: { id: true, externalOrderId: true, accountId: true, status: true, shippingId: true, rawData: true },
    orderBy: { dateCreated: "asc" },
  });
  const counts = new Map<string, number>();
  let changed = 0;
  const results: Array<Record<string, unknown>> = [];
  for (const order of orders) {
    const shipment = await shipmentStatus(order.accountId, order.shippingId, order.rawData);
    const key = `${String(order.status || "UNKNOWN").toLowerCase()} / ${shipment || "UNKNOWN"}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!dryRun) {
      const result = await reconcileMercadoLivreStockForOrder(order.id);
      const rows = Array.isArray((result as any)?.results) ? (result as any).results : [];
      if (rows.some((row: any) => row.status === "deducted" || row.status === "reverted")) changed += 1;
      results.push({ orderId: order.externalOrderId, shipmentStatus: shipment, ...result });
    }
  }
  console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "apply", orders: orders.length, statusCounts: Object.fromEntries([...counts.entries()].sort()), changedOrders: changed, ...(dryRun ? {} : { results }) }, null, 2));
}

main().finally(() => prisma.$disconnect());

