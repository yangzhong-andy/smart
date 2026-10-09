import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { KwaiError, kwaiId, kwaiRead } from "@/lib/kwai-api";
import { kwaiAdmin, kwaiSafeError, usableKwaiShop } from "@/lib/kwai-service";
import { extractKwaiOrderDetails, kwaiPage, normalizeKwaiOrder, normalizeKwaiProduct, normalizeKwaiSkus } from "@/lib/kwai-records";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = await kwaiAdmin(request); if (auth.response) return auth.response;
    const shopId = request.nextUrl.searchParams.get("shopId") || "";
    const kind = request.nextUrl.searchParams.get("kind") === "products" ? "products" : "orders";
    const page = kwaiPage(request.nextUrl.searchParams.get("page"));
    const where = { shopId, kind };
    const [rows, total] = await prisma.$transaction([
      prisma.kwaiRecord.findMany({ where, orderBy: [{ fetchedAt: "desc" }, { externalId: "asc" }], take: 50, skip: (page - 1) * 50, select: { externalId: true, payload: true, fetchedAt: true } }),
      prisma.kwaiRecord.count({ where }),
    ]);
    return NextResponse.json({ rows, total, page }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: kwaiSafeError(error) }, { status: 400 }); }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await kwaiAdmin(request, true); if (auth.response) return auth.response;
    const input = await request.json();
    if (typeof input.shopId !== "string" || !["orders", "products", "skus"].includes(input.kind)) throw new KwaiError("请选择店铺和查询类型");
    const page = kwaiPage(input.page);
    const fetchedAt = new Date();
    const { shop, credentials, token } = await usableKwaiShop(input.shopId);
    if (!token.scopes.split(",").includes(input.kind === "orders" ? "merchant_order" : "merchant_item")) throw new KwaiError("当前店铺未授予对应权限，请重新授权");
    const read = (path: string, body?: string, query?: Record<string,string>) => kwaiRead(shop.app.appKey, credentials.signSecret, token, path, body, query);
    let records: Array<{ externalId: string; payload: Prisma.InputJsonObject }> = [];
    let total = 0, count = 0;
    if (input.kind === "orders") {
      const from = Number(input.timeFrom), to = Number(input.timeTo);
      if (![from,to].every(Number.isSafeInteger) || from <= 0 || to <= from || to - from > 31 * 86400000 || to > Date.now() + 60000) throw new KwaiError("订单时间范围必须有效且不超过 31 天");
      const list = await read("/rest/open/api/trade/queryOrderList", JSON.stringify({ page, size: 50, timeFrom: from, timeTo: to, timeRangeField: "UPDATE_TIME" }));
      total = Number(list?.total);
      const entries = list?.orderList ?? (total === 0 ? [] : null);
      if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(entries) || entries.length > 50) throw new KwaiError("订单列表响应不完整");
      const ids = entries.map((e: any) => kwaiId(e.orderId));
      if (new Set(ids).size !== ids.length) throw new KwaiError("官方订单分页包含重复编号，请稍后重试");
      if (ids.length) {
        const details = extractKwaiOrderDetails(await read("/rest/open/api/trade/queryOrderDetails", `{"orderList":[${ids.join(",")}]}`), ids.length);
        records = details.map((row: any) => { const payload = normalizeKwaiOrder(row); if (!ids.includes(payload.orderId)) throw new KwaiError("订单详情身份不匹配"); return { externalId: payload.orderId, payload }; });
        if (new Set(records.map((r) => r.externalId)).size !== ids.length) throw new KwaiError("订单详情存在重复编号，本页未写入");
      }
      count = ids.length;
    } else if (input.kind === "products") {
      const list = await read("/rest/open/api/product/listItem", JSON.stringify({ currentPage: page, pageSize: 50, sort: 0 }));
      total = Number(list?.totalCount);
      const entries = list?.itemList ?? (total === 0 ? [] : null);
      if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(entries) || entries.length > 50) throw new KwaiError("商品列表响应不完整");
      records = entries.map((row: any) => { const payload = normalizeKwaiProduct(row); return { externalId: payload.itemId, payload }; });
      if (new Set(records.map((r) => r.externalId)).size !== records.length) throw new KwaiError("官方商品分页包含重复编号，请稍后重试");
      count = records.length;
    } else {
      const itemId = kwaiId(input.itemId);
      const skus = normalizeKwaiSkus(await read("/rest/open/api/product/getSkuList", undefined, { itemId }), itemId);
      const record = await prisma.kwaiRecord.findUnique({ where: { shopId_kind_externalId: { shopId: shop.id, kind: "products", externalId: itemId } } });
      if (!record) throw new KwaiError("请先读取商品列表");
      records = [{ externalId: itemId, payload: { skus } }];
      total = count = skus.length;
    }
    const kind = input.kind === "orders" ? "orders" : "products";
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "KwaiShopSetting" WHERE "id" = ${shop.id} FOR UPDATE`;
      const current = await tx.kwaiShopSetting.findUnique({ where: { id: shop.id }, select: { status: true, tokenCipher: true } });
      if (current?.status !== "active") throw new KwaiError("授权状态已变化，请重试");
      for (const record of records) {
        const where = { shopId_kind_externalId: { shopId: shop.id, kind, externalId: record.externalId } };
        const previous = await tx.kwaiRecord.findUnique({ where });
        if (previous && previous.fetchedAt > fetchedAt) continue;
        const payload = { ...(previous?.payload as Prisma.InputJsonObject ?? {}), ...record.payload };
        await tx.kwaiRecord.upsert({ where, create: { shopId: shop.id, kind, externalId: record.externalId, payload, fetchedAt }, update: { payload, fetchedAt } });
      }
      await tx.kwaiShopSetting.update({ where: { id: shop.id }, data: { lastReadAt: new Date() } });
    });
    return NextResponse.json({ success: true, count, total, page, hasMore: input.kind !== "skus" && page * 50 < total, message: "本页已读取；未操作平台库存、发货或财务入账" });
  } catch (error) { return NextResponse.json({ error: kwaiSafeError(error) }, { status: error instanceof KwaiError ? 400 : 500 }); }
}
