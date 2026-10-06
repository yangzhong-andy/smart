import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMercadoLivreOrder,
  searchMercadoLivreOrders,
  type MercadoLivreOrder,
} from "@/lib/mercado-livre-api";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";
import { reconcileMercadoLivreStockForOrder } from "@/lib/mercado-livre-stock-deduct";

type SyncRange = { startDate?: string; endDate?: string; days?: number };

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function decimal(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(value) : null;
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const result = new Date(String(value));
  return Number.isNaN(result.getTime()) ? null : result;
}

function json(value: unknown): Prisma.InputJsonValue {
  return (value && typeof value === "object" ? value : {}) as Prisma.InputJsonValue;
}

export function normalizeMercadoLivreOrder(raw: MercadoLivreOrder, accountId: string) {
  const externalOrderId = text(raw.id);
  if (!externalOrderId) throw new Error("Mercado Livre 订单缺少订单号");
  const items = Array.isArray(raw.order_items) ? raw.order_items : [];
  return {
    externalOrderId,
    data: {
      accountId,
      status: text(raw.status),
      substatus: text(raw.substatus),
      currency: text(raw.currency_id),
      totalAmount: decimal(raw.total_amount),
      paidAmount: decimal(raw.paid_amount),
      buyerNickname: text(raw.buyer?.nickname),
      shippingId: text(raw.shipping?.id),
      packId: text(raw.pack_id),
      dateCreated: date(raw.date_created),
      lastUpdated: date(raw.last_updated),
      dateClosed: date(raw.date_closed),
      rawData: json(raw),
      syncedAt: new Date(),
    },
    items: items.map((line, index) => ({
      itemId: text(line.item?.id) || `line-${index + 1}`,
      variationId: text(line.item?.variation_id) || "0",
      sellerSku: text(line.item?.seller_sku),
      title: text(line.item?.title),
      quantity: Math.max(0, Math.trunc(Number(line.quantity) || 0)),
      unitPrice: decimal(line.unit_price),
      fullUnitPrice: decimal(line.gross_price ?? line.full_unit_price),
      saleFee: decimal(line.sale_fee),
      rawData: json(line),
    })),
  };
}

async function saveMercadoLivreOrder(accountId: string, raw: MercadoLivreOrder) {
  const normalized = normalizeMercadoLivreOrder(raw, accountId);
  return prisma.$transaction(async (tx) => {
    const order = await tx.mercadoLivreOrder.upsert({
      where: { accountId_externalOrderId: { accountId, externalOrderId: normalized.externalOrderId } },
      create: { externalOrderId: normalized.externalOrderId, ...normalized.data },
      update: normalized.data,
      select: { id: true },
    });
    await tx.mercadoLivreOrderItem.deleteMany({ where: { orderId: order.id } });
    if (normalized.items.length) {
      await tx.mercadoLivreOrderItem.createMany({ data: normalized.items.map((item) => ({ orderId: order.id, ...item })) });
    }
    return order.id;
  });
}

export async function syncMercadoLivreOrderById(input: { accountId: string; orderId: string }) {
  const orderId = input.orderId.trim();
  if (!orderId) throw new Error("Mercado Livre 订单号不能为空");
  const raw = await withFreshMercadoLivreToken(input.accountId, (token) => getMercadoLivreOrder(token, orderId));
  const savedId = await saveMercadoLivreOrder(input.accountId, raw);
  try {
    await reconcileMercadoLivreStockForOrder(savedId);
  } catch (error) {
    console.warn(`[Mercado Livre stock] 订单 ${orderId} 库存对账失败，不影响订单同步`, error);
  }
  return { orderId };
}

export async function syncMercadoLivreAccountOrders(accountId: string, range: SyncRange = {}) {
  const account = await prisma.mercadoLivreAccount.findUnique({ where: { id: accountId } });
  if (!account || account.status !== "active") throw new Error("Mercado Livre 授权账号不存在或未连接");
  const end = range.endDate ? new Date(range.endDate) : new Date();
  const days = Math.min(730, Math.max(1, Math.trunc(Number(range.days) || 30)));
  const start = range.startDate ? new Date(range.startDate) : new Date(end.getTime() - days * 86_400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error("同步日期范围无效");

  let offset = 0;
  let listed = 0;
  let saved = 0;
  for (let page = 0; page < 1_000; page += 1) {
    const response = await withFreshMercadoLivreToken(accountId, (token) => searchMercadoLivreOrders(token, account.userId, {
      offset,
      limit: 50,
      "order.date_created.from": start.toISOString(),
      "order.date_created.to": end.toISOString(),
    }));
    const results = Array.isArray(response.results) ? response.results : [];
    listed += results.length;
    for (const summary of results) {
      const orderId = text(summary.id);
      if (!orderId) continue;
      const detail = await withFreshMercadoLivreToken(accountId, (token) => getMercadoLivreOrder(token, orderId));
      const savedId = await saveMercadoLivreOrder(accountId, detail);
      try {
        await reconcileMercadoLivreStockForOrder(savedId);
      } catch (error) {
        console.warn(`[Mercado Livre stock] 订单 ${orderId} 库存对账失败，不影响订单同步`, error);
      }
      saved += 1;
    }
    if (!results.length || results.length < 50) break;
    offset += results.length;
  }
  await prisma.mercadoLivreAccount.update({ where: { id: accountId }, data: { lastSyncAt: new Date() } });
  return { accountId, userId: account.userId, startDate: start.toISOString(), endDate: end.toISOString(), listed, saved };
}

export async function syncMercadoLivreOrders(input: { accountId?: string; startDate?: string; endDate?: string; days?: number } = {}) {
  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(input.accountId ? { id: input.accountId } : {}) },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const results: unknown[] = [];
  const errors: Array<{ accountId: string; error: string }> = [];
  for (const account of accounts) {
    try {
      results.push(await syncMercadoLivreAccountOrders(account.id, input));
    } catch (error) {
      errors.push({ accountId: account.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { accounts: accounts.length, results, errors };
}
