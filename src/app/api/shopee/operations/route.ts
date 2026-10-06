import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseShopeePackages } from "@/lib/shopee-fulfillment";
import {
  getShopeeShippingParameter,
  handleShopeeBuyerCancellation,
  setShopeeOrderNote,
  shipShopeeOrder,
  splitShopeeOrder,
  unsplitShopeeOrder,
} from "@/lib/shopee-open-api";
import { syncShopeeOrderBySn, withFreshShopeeToken } from "@/lib/shopee-order-sync";

export const dynamic = "force-dynamic";
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Shopee operation failed");
}

type OperationItem = {
  key: string;
  itemId: string;
  modelId: string;
  orderItemId: string | null;
  promotionGroupId: string | null;
  name: string | null;
  modelName: string | null;
  sku: string | null;
  quantity: number;
};

function orderItems(rawData: unknown): OperationItem[] {
  const raw = rawData && typeof rawData === "object" ? rawData as Record<string, any> : {};
  const rows = Array.isArray(raw.item_list) ? raw.item_list : [];
  return rows.map((item: any, index: number) => ({
    key: String(item.order_item_id || `${item.item_id || 0}-${item.model_id || 0}-${index}`),
    itemId: String(item.item_id || ""),
    modelId: String(item.model_id || "0"),
    orderItemId: item.order_item_id ? String(item.order_item_id) : null,
    promotionGroupId: item.promotion_group_id ? String(item.promotion_group_id) : null,
    name: item.item_name || null,
    modelName: item.model_name || null,
    sku: item.model_sku || item.item_sku || null,
    quantity: Number(item.model_quantity_purchased || 0),
  }));
}

function safeShopeeId(value: string, field: string) {
  if (!/^\d+$/.test(value)) throw new Error(`订单商品缺少有效的 ${field}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${field} 超出安全整数范围，已停止拆包`);
  return number;
}

function buildSplitPackages(items: OperationItem[], assignments: unknown) {
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
    throw new Error("请选择每个商品所属的包裹");
  }
  const assignmentMap = assignments as Record<string, unknown>;
  const expectedKeys = new Set(items.map((item) => item.key));
  if (Object.keys(assignmentMap).some((key) => !expectedKeys.has(key))) {
    throw new Error("拆包商品与当前订单不一致，请刷新后重试");
  }

  const groups = new Map<number, Array<Record<string, number>>>();
  for (const item of items) {
    const packageIndex = Number(assignmentMap[item.key]);
    if (!Number.isInteger(packageIndex) || packageIndex < 1 || packageIndex > 10) {
      throw new Error("每个商品都必须分配到有效包裹");
    }
    const payloadItem: Record<string, number> = {
      item_id: safeShopeeId(item.itemId, "item_id"),
      model_id: safeShopeeId(item.modelId || "0", "model_id"),
    };
    if (item.orderItemId) payloadItem.order_item_id = safeShopeeId(item.orderItemId, "order_item_id");
    if (item.promotionGroupId) payloadItem.promotion_group_id = safeShopeeId(item.promotionGroupId, "promotion_group_id");
    groups.set(packageIndex, [...(groups.get(packageIndex) || []), payloadItem]);
  }

  if (groups.size < 2) throw new Error("拆包至少需要两个非空包裹");
  return Array.from(groups.entries())
    .sort(([left], [right]) => left - right)
    .map(([, itemList]) => ({ item_list: itemList }));
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request); if (auth.response) return auth.response;
  const orderSn = new URL(request.url).searchParams.get("orderSn")?.trim(); if (!orderSn) return NextResponse.json({ error: "请输入 Shopee 订单号" }, { status: 400 });
  const shopId = new URL(request.url).searchParams.get("shopId")?.trim();
  const order = await prisma.shopeeOrder.findFirst({
    where: { orderSn, ...(shopId ? { shopId } : {}) },
    include: { shopSetting: { select: { id: true, shopId: true, shopName: true, status: true } } },
  });
  if (!order) return NextResponse.json({ error: "未找到该 Shopee 订单" }, { status: 404 });
  let shippingParameter: Record<string, any> | null = null; let parameterError: string | null = null;
  if (["READY_TO_SHIP", "PROCESSED"].includes(order.status || "")) { try { shippingParameter = await withFreshShopeeToken(order.shopSettingId, (credentials) => getShopeeShippingParameter({ ...credentials, orderSn: order.orderSn })); } catch (error) { parameterError = errorMessage(error); } }
  const logs = await prisma.shopeeOperationLog.findMany({
    where: { shopId: order.shopId, orderSn: order.orderSn },
    select: { id: true, action: true, status: true, actorName: true, error: true, createdAt: true, completedAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({
    order: {
      id: order.id,
      orderSn: order.orderSn,
      status: order.status,
      shopId: order.shopId,
      shopName: order.shopSetting.shopName,
      shopStatus: order.shopSetting.status,
      shippingCarrier: order.shippingCarrier,
      trackingNumber: order.trackingNumber,
      packages: parseShopeePackages(order.rawData),
      items: orderItems(order.rawData),
    },
    shippingParameter,
    parameterError,
    logs,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request); if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({})); if (body.confirmation !== "CONFIRM_SHOPEE_OPERATION") return NextResponse.json({ error: "操作未确认" }, { status: 400 });
  const orderSn = String(body.orderSn || "").trim(); const action = String(body.action || "").trim();
  const order = await prisma.shopeeOrder.findFirst({
    where: { orderSn, ...(body.shopId ? { shopId: String(body.shopId) } : {}) },
    select: { id: true, orderSn: true, shopId: true, shopSettingId: true, status: true, rawData: true },
  });
  if (!order) return NextResponse.json({ error: "未找到该 Shopee 订单" }, { status: 404 });
  const requestData = {
    action,
    orderSn,
    packageNumber: body.packageNumber || null,
    pickup: body.pickup || null,
    splitAssignments: body.splitAssignments || null,
    noteLength: typeof body.note === "string" ? body.note.length : null,
  } as Prisma.InputJsonValue;
  const log = await prisma.shopeeOperationLog.create({ data: { shopSettingId: order.shopSettingId, shopId: order.shopId, orderSn, action, status: "running", actorId: auth.user.id, actorName: auth.user.name || auth.user.email, requestData } });
  try {
    const response = await withFreshShopeeToken(order.shopSettingId, (credentials) => {
      if (action === "set_note") { const note = String(body.note || "").trim(); if (!note || note.length > 500) throw new Error("订单备注需为 1 至 500 个字符"); return setShopeeOrderNote({ ...credentials, orderSn, note }); }
      if (action === "accept_cancellation" || action === "reject_cancellation") { if (order.status !== "IN_CANCEL") throw new Error("只有取消中的订单可以处理买家取消申请"); return handleShopeeBuyerCancellation({ ...credentials, orderSn, operation: action === "accept_cancellation" ? "ACCEPT" : "REJECT" }); }
      if (action === "ship_pickup") {
        if (!["READY_TO_SHIP", "PROCESSED"].includes(order.status || "")) throw new Error("当前订单状态不允许预约发货");
        const addressId = Number(body.pickup?.address_id);
        const pickupTimeId = String(body.pickup?.pickup_time_id || "").trim();
        if (!Number.isSafeInteger(addressId) || !pickupTimeId) throw new Error("请选择有效的揽收地址和时间");
        return shipShopeeOrder({
          ...credentials,
          orderSn,
          packageNumber: body.packageNumber ? String(body.packageNumber) : undefined,
          pickup: { address_id: addressId, pickup_time_id: pickupTimeId },
        });
      }
      if (action === "split") {
        if (order.status !== "READY_TO_SHIP") throw new Error("只有待发货订单可以拆包");
        const items = orderItems(order.rawData);
        if (items.length < 2) throw new Error("当前订单没有足够的商品行用于拆包");
        return splitShopeeOrder({
          ...credentials,
          orderSn,
          packageList: buildSplitPackages(items, body.splitAssignments),
        });
      }
      if (action === "merge") {
        if (order.status !== "READY_TO_SHIP") throw new Error("只有待发货订单可以恢复整单");
        return unsplitShopeeOrder({ ...credentials, orderSn });
      }
      throw new Error("不支持的 Shopee 操作");
    });
    await prisma.shopeeOperationLog.update({ where: { id: log.id }, data: { status: "success", responseData: response as Prisma.InputJsonValue, completedAt: new Date() } });
    try { await syncShopeeOrderBySn({ shopSettingId: order.shopSettingId, orderSn }); } catch (refreshError) { console.error("[Shopee operation] order refresh failed", refreshError); }
    return NextResponse.json({ success: true, response });
  } catch (error) { const message = errorMessage(error); await prisma.shopeeOperationLog.update({ where: { id: log.id }, data: { status: "failed", error: message, completedAt: new Date() } }); return NextResponse.json({ error: message }, { status: 400 }); }
}
