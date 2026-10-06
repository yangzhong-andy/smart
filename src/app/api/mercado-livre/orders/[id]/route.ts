import { NextRequest, NextResponse } from "next/server";
import {
  getMercadoLivreShipment,
  getMercadoLivreShipmentCosts,
  getMercadoPagoPayment,
  type MercadoLivreShipment,
  type MercadoLivreShipmentCosts,
  type MercadoPagoPayment,
} from "@/lib/mercado-livre-api";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";
import { mercadoLivrePaymentFeeBreakdown } from "@/lib/mercado-livre-payment-fees";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;
type ApiResult<T> = { value: T | null; warning: string | null };

const FEE_LABELS: Record<string, string> = {
  ml_sale_fee: "平台销售佣金",
  mp_processing_fee: "支付处理费",
  mp_financing_fee: "分期融资费",
  mp_financing_1x_fee: "分期融资费（1期）",
  financing_fee: "融资费",
  financing_transfer: "融资转移",
  shp_cross_docking: "卖家物流费",
  "cashback-crypto": "平台返现 / 补贴",
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0);
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "未知错误")).replace(/\s+/g, " ").trim();
}

function isUnauthorized(error: unknown) {
  return Number(record(error).status) === 401;
}

async function optionalCall<T>(label: string, call: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    return { value: await call(), warning: null };
  } catch (error) {
    if (isUnauthorized(error)) throw error;
    return { value: null, warning: `${label}读取失败：${errorMessage(error)}` };
  }
}

function paymentIds(rawOrder: JsonRecord) {
  return Array.from(new Set(array(rawOrder.payments)
    .map((value) => text(record(value).id))
    .filter((value): value is string => Boolean(value))));
}

function chargeAmount(charge: JsonRecord) {
  const amounts = record(charge.amounts);
  return number(amounts.original) ?? number(charge.amount) ?? number(charge.value) ?? 0;
}

function refundedChargeAmount(charge: JsonRecord) {
  return number(record(charge.amounts).refunded) ?? number(charge.refunded_amount) ?? 0;
}

function chargeCode(charge: JsonRecord) {
  const metadata = record(charge.metadata);
  return text(charge.name) || text(metadata.reason) || text(charge.type) || "other";
}

function normalizeCharge(paymentId: string, value: unknown) {
  const charge = record(value);
  const code = chargeCode(charge);
  return {
    id: text(charge.id) || `${paymentId}-${code}`,
    paymentId,
    code,
    label: FEE_LABELS[code] || code,
    amount: chargeAmount(charge),
    refundedAmount: refundedChargeAmount(charge),
    type: text(charge.type),
  };
}

function transactionValue(payment: MercadoPagoPayment, key: string) {
  return number(record(payment.transaction_details)[key]);
}

function shippingOptionValue(shipment: MercadoLivreShipment | null, key: string) {
  return number(record(shipment?.shipping_option)[key]);
}

function sellerShipping(shipmentCosts: MercadoLivreShipmentCosts | null, sellerId: string) {
  const sender = array(shipmentCosts?.senders)
    .map(record)
    .find((value) => text(value.user_id) === sellerId);
  return {
    cost: number(sender?.cost),
    saving: number(sender?.save),
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const order = await prisma.mercadoLivreOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      externalOrderId: true,
      status: true,
      substatus: true,
      currency: true,
      totalAmount: true,
      paidAmount: true,
      buyerNickname: true,
      shippingId: true,
      packId: true,
      dateCreated: true,
      lastUpdated: true,
      dateClosed: true,
      syncedAt: true,
      rawData: true,
      account: { select: { id: true, userId: true, nickname: true, country: true, currency: true } },
      items: {
        select: {
          id: true,
          itemId: true,
          variationId: true,
          sellerSku: true,
          title: true,
          quantity: true,
          unitPrice: true,
          fullUnitPrice: true,
          saleFee: true,
        },
        orderBy: { title: "asc" },
      },
    },
  });

  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const rawOrder = record(order.rawData);
  const ids = paymentIds(rawOrder);
  const warnings: string[] = [];
  let payments: MercadoPagoPayment[] = [];
  let shipment: MercadoLivreShipment | null = null;
  let shipmentCosts: MercadoLivreShipmentCosts | null = null;

  try {
    const live = await withFreshMercadoLivreToken(order.account.id, async (token) => {
      const [paymentResults, shipmentResult, shipmentCostsResult] = await Promise.all([
        Promise.all(ids.map((id) => optionalCall(`支付 ${id}`, () => getMercadoPagoPayment(token, id)))),
        order.shippingId
          ? optionalCall("物流详情", () => getMercadoLivreShipment(token, order.shippingId!))
          : Promise.resolve<ApiResult<MercadoLivreShipment>>({ value: null, warning: null }),
        order.shippingId
          ? optionalCall("物流成本", () => getMercadoLivreShipmentCosts(token, order.shippingId!))
          : Promise.resolve<ApiResult<MercadoLivreShipmentCosts>>({ value: null, warning: null }),
      ]);
      return { paymentResults, shipmentResult, shipmentCostsResult };
    });
    payments = live.paymentResults.flatMap((result) => result.value ? [result.value] : []);
    warnings.push(...live.paymentResults.flatMap((result) => result.warning ? [result.warning] : []));
    shipment = live.shipmentResult.value;
    shipmentCosts = live.shipmentCostsResult.value;
    if (live.shipmentResult.warning) warnings.push(live.shipmentResult.warning);
    if (live.shipmentCostsResult.warning) warnings.push(live.shipmentCostsResult.warning);
  } catch (error) {
    warnings.push(`实时接口读取失败：${errorMessage(error)}`);
  }

  const normalizedPayments = payments.map((payment) => ({
    id: text(payment.id),
    status: text(payment.status),
    statusDetail: text(payment.status_detail),
    currency: text(payment.currency_id) || order.currency || order.account.currency,
    transactionAmount: number(payment.transaction_amount),
    totalPaidAmount: transactionValue(payment, "total_paid_amount"),
    netReceivedAmount: transactionValue(payment, "net_received_amount"),
    refundedAmount: number(payment.transaction_amount_refunded),
    couponAmount: number(payment.coupon_amount),
    shippingAmount: number(payment.shipping_amount),
    taxesAmount: number(payment.taxes_amount),
    installments: number(payment.installments),
    paymentMethodId: text(payment.payment_method_id),
    paymentTypeId: text(payment.payment_type_id),
    dateCreated: text(payment.date_created),
    dateApproved: text(payment.date_approved),
    moneyReleaseDate: text(payment.money_release_date),
    moneyReleaseStatus: text(payment.money_release_status),
  }));
  const charges = payments.flatMap((payment) => {
    const id = text(payment.id) || "payment";
    return array(payment.charges_details).map((charge) => normalizeCharge(id, charge));
  });
  const paymentFees = mercadoLivrePaymentFeeBreakdown(payments);
  const itemSaleFee = sum(order.items.map((item) => number(item.saleFee)));
  const senderShipping = sellerShipping(shipmentCosts, order.account.userId);
  const cancellation = record(rawOrder.cancel_detail);
  const rawBuyer = record(rawOrder.buyer);

  return NextResponse.json({
    order: {
      id: order.id,
      externalOrderId: order.externalOrderId,
      status: order.status,
      substatus: order.substatus,
      currency: order.currency || order.account.currency,
      totalAmount: number(order.totalAmount),
      paidAmount: number(order.paidAmount),
      shippingId: order.shippingId,
      packId: order.packId,
      dateCreated: order.dateCreated,
      lastUpdated: order.lastUpdated,
      dateClosed: order.dateClosed,
      syncedAt: order.syncedAt,
      account: {
        userId: order.account.userId,
        nickname: order.account.nickname,
        country: order.account.country,
        currency: order.account.currency,
      },
    },
    buyer: {
      id: text(rawBuyer.id),
      nickname: order.buyerNickname || text(rawBuyer.nickname),
    },
    items: order.items.map((item) => {
      const unitPrice = number(item.unitPrice);
      const fullUnitPrice = number(item.fullUnitPrice);
      return {
        id: item.id,
        itemId: item.itemId,
        variationId: item.variationId,
        sellerSku: item.sellerSku,
        title: item.title,
        quantity: item.quantity,
        unitPrice,
        fullUnitPrice,
        lineTotal: unitPrice === null ? null : unitPrice * item.quantity,
        originalTotal: fullUnitPrice === null ? null : fullUnitPrice * item.quantity,
        discountAmount: unitPrice === null || fullUnitPrice === null ? null : Math.max(0, (fullUnitPrice - unitPrice) * item.quantity),
        saleFee: number(item.saleFee),
      };
    }),
    payments: normalizedPayments,
    financialSummary: {
      gmv: number(order.totalAmount),
      paidAmount: normalizedPayments.length
        ? sum(normalizedPayments.map((payment) => payment.totalPaidAmount ?? payment.transactionAmount))
        : number(order.paidAmount),
      netReceivedAmount: normalizedPayments.length ? sum(normalizedPayments.map((payment) => payment.netReceivedAmount)) : null,
      refundedAmount: normalizedPayments.length ? sum(normalizedPayments.map((payment) => payment.refundedAmount)) : null,
      saleCommission: paymentFees.hasSaleCommission ? paymentFees.saleCommission : itemSaleFee,
      paymentProcessingFee: paymentFees.processingFee,
      financingFee: paymentFees.financingFee,
      sellerShippingFee: paymentFees.hasSellerShipping ? paymentFees.sellerShipping : senderShipping.cost,
      charges,
    },
    shipment: order.shippingId ? {
      id: text(shipment?.id) || order.shippingId,
      status: text(shipment?.status),
      substatus: text(shipment?.substatus),
      mode: text(shipment?.mode),
      logisticType: text(shipment?.logistic_type),
      trackingNumber: text(shipment?.tracking_number),
      trackingMethod: text(shipment?.tracking_method),
      serviceId: text(shipment?.service_id),
      dateCreated: text(shipment?.date_created),
      lastUpdated: text(shipment?.last_updated),
      dateFirstPrinted: text(shipment?.date_first_printed),
      buyerShippingCost: shippingOptionValue(shipment, "cost"),
      listedShippingCost: shippingOptionValue(shipment, "list_cost"),
      sellerShippingCost: senderShipping.cost,
      sellerShippingSaving: senderShipping.saving,
      grossShippingCost: number(shipmentCosts?.gross_amount),
    } : null,
    cancellation: Object.keys(cancellation).length ? {
      reason: text(cancellation.reason),
      description: text(cancellation.description),
      date: text(cancellation.date),
      type: text(cancellation.type),
    } : null,
    warnings,
  });
}
