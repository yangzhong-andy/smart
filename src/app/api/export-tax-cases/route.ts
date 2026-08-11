import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { money, decimalValue, textValue, serializeExportTaxCase } from "@/lib/export-tax-server";
import { calculateExportTaxLine } from "@/lib/export-tax-calculation";

export const dynamic = "force-dynamic";

function createCaseNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toISOString().slice(11, 19).replaceAll(":", "");
  return `ETR-${date}-${time}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const keyword = searchParams.get("keyword")?.trim();
    const deliveryOrderId = searchParams.get("deliveryOrderId");
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(searchParams.get("pageSize") || "20", 10) || 20));

    const where: Prisma.ExportTaxCaseWhereInput = {};
    if (status && status !== "all") where.status = status;
    if (deliveryOrderId) where.deliveryOrderId = deliveryOrderId;
    if (keyword) {
      where.OR = [
        { caseNumber: { contains: keyword, mode: "insensitive" } },
        { deliveryNumber: { contains: keyword, mode: "insensitive" } },
        { contractNumber: { contains: keyword, mode: "insensitive" } },
        { supplierName: { contains: keyword, mode: "insensitive" } },
        { customsDeclarationNumber: { contains: keyword, mode: "insensitive" } },
        { items: { some: { sku: { contains: keyword, mode: "insensitive" } } } },
      ];
    }

    const [rows, total, totals] = await prisma.$transaction([
      prisma.exportTaxCase.findMany({
        where,
        include: { items: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.exportTaxCase.count({ where }),
      prisma.exportTaxCase.aggregate({
        where: { ...where, status: status && status !== "all" ? status : { not: "CANCELLED" } },
        _sum: {
          declarationAmount: true,
          invoiceAmount: true,
          taxPointPaidAmount: true,
          refundReceivedAmount: true,
        },
      }),
    ]);

    return NextResponse.json({
      data: rows.map((row) => serializeExportTaxCase(row, { includeVouchers: false })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      totals: {
        declarationAmount: Number(totals._sum.declarationAmount || 0),
        invoiceAmount: Number(totals._sum.invoiceAmount || 0),
        taxPointPaidAmount: Number(totals._sum.taxPointPaidAmount || 0),
        refundReceivedAmount: Number(totals._sum.refundReceivedAmount || 0),
      },
    });
  } catch (error) {
    console.error("获取出口退税业务单失败:", error);
    return NextResponse.json({ error: "获取出口退税业务单失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const deliveryOrderId = String(body.deliveryOrderId || "").trim();
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!deliveryOrderId || requestedItems.length === 0) {
      return NextResponse.json({ error: "请选择拿货单和需要办理的货品" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: { contract: { include: { supplier: true, items: { include: { variant: true } } } } },
      });
      if (!order) throw new Error("SOURCE_NOT_FOUND");

      const activeItems = await tx.exportTaxCaseItem.findMany({
        where: {
          exportTaxCase: { deliveryOrderId, status: { not: "CANCELLED" } },
        },
      });
      const used = new Map<string, { invoice: number; refund: number }>();
      for (const item of activeItems) {
        const current = used.get(item.contractItemId) || { invoice: 0, refund: 0 };
        if (item.needsInvoice) current.invoice += item.qty;
        if (item.needsTaxRefund) current.refund += item.qty;
        used.set(item.contractItemId, current);
      }

      const qtyMap = order.itemQtys && typeof order.itemQtys === "object" && !Array.isArray(order.itemQtys)
        ? order.itemQtys as Record<string, unknown>
        : null;
      const firstItemId = order.contract.items[0]?.id;
      const contractItems = new Map(order.contract.items.map((item) => [item.id, item]));
      const defaultTaxPointRate = decimalValue(body.taxPointRate ?? order.contract.supplier?.invoicePoint);
      const defaultRefundRate = decimalValue(body.refundRate);
      let hasInvoice = false;
      let hasRefund = false;

      const items = requestedItems.map((input: any) => {
        const contractItemId = String(input.contractItemId || "");
        const source = contractItems.get(contractItemId);
        if (!source) throw new Error("INVALID_SOURCE_ITEM");

        const deliveryQty = qtyMap
          ? Math.max(0, Math.trunc(Number(qtyMap[contractItemId]) || 0))
          : order.contract.items.length === 1 || contractItemId === firstItemId
            ? order.qty
            : 0;
        const qty = Math.trunc(Number(input.qty));
        const needsInvoice = input.needsInvoice === true;
        const needsTaxRefund = input.needsTaxRefund === true;
        if (!Number.isFinite(qty) || qty <= 0 || (!needsInvoice && !needsTaxRefund)) {
          throw new Error("INVALID_ITEM_SELECTION");
        }

        const itemUsed = used.get(contractItemId) || { invoice: 0, refund: 0 };
        if (needsInvoice && itemUsed.invoice + qty > deliveryQty) throw new Error("INVOICE_QTY_EXCEEDED");
        if (needsTaxRefund && itemUsed.refund + qty > deliveryQty) throw new Error("REFUND_QTY_EXCEEDED");
        if (needsInvoice) hasInvoice = true;
        if (needsTaxRefund) hasRefund = true;

        const purchaseUnitPrice = Number(source.unitPrice);
        const declarationUnitPrice = Math.max(0, Number(input.declarationUnitPrice ?? purchaseUnitPrice) || 0);
        const invoiceUnitPrice = Math.max(0, Number(input.invoiceUnitPrice ?? purchaseUnitPrice) || 0);
        const itemRefundRate = decimalValue(input.refundRate ?? defaultRefundRate);
        const { purchaseAmount, declarationAmount, invoiceAmount, estimatedRefundAmount } = calculateExportTaxLine({
          qty,
          purchaseUnitPrice,
          declarationUnitPrice,
          invoiceUnitPrice: needsInvoice ? invoiceUnitPrice : null,
          needsInvoice,
          needsTaxRefund,
          refundRate: itemRefundRate,
        });

        return {
          contractItemId,
          sku: source.variant?.skuId || source.sku,
          skuName: source.skuName,
          spec: source.spec,
          qty,
          needsInvoice,
          needsTaxRefund,
          purchaseUnitPrice,
          purchaseAmount,
          declarationUnitPrice,
          declarationAmount,
          invoiceUnitPrice: needsInvoice ? invoiceUnitPrice : null,
          invoiceAmount,
          taxRate: decimalValue(input.taxRate),
          refundRate: itemRefundRate,
          estimatedRefundAmount,
          hsCode: textValue(input.hsCode),
          customsName: textValue(input.customsName),
        };
      });

      const declarationAmount = money(items.reduce((sum: number, item: { declarationAmount: number }) => sum + item.declarationAmount, 0));
      const invoiceAmount = money(items.reduce((sum: number, item: { invoiceAmount: number }) => sum + item.invoiceAmount, 0));
      const refundClaimAmount = money(items.reduce((sum: number, item: { estimatedRefundAmount: number }) => sum + item.estimatedRefundAmount, 0));
      const taxPointAmount = hasInvoice && defaultTaxPointRate != null
        ? money(invoiceAmount * defaultTaxPointRate / 100)
        : 0;

      return tx.exportTaxCase.create({
        data: {
          caseNumber: createCaseNumber(),
          deliveryOrderId: order.id,
          deliveryNumber: order.deliveryNumber,
          contractId: order.contractId,
          contractNumber: order.contractNumber,
          supplierId: order.contract.supplierId,
          supplierName: order.contract.supplierName,
          exporterId: textValue(body.exporterId),
          exporterName: textValue(body.exporterName),
          destinationCountry: textValue(body.destinationCountry),
          status: "DRAFT",
          declarationCurrency: String(body.declarationCurrency || "CNY").toUpperCase(),
          declarationAmount,
          invoiceStatus: hasInvoice ? "PENDING" : "NOT_REQUIRED",
          invoiceCurrency: String(body.invoiceCurrency || "CNY").toUpperCase(),
          invoiceAmount,
          taxPointStatus: hasInvoice ? "PENDING" : "NOT_REQUIRED",
          taxPointRate: defaultTaxPointRate,
          taxPointAmount,
          refundStatus: hasRefund ? "PENDING" : "NOT_REQUIRED",
          refundCurrency: String(body.refundCurrency || "CNY").toUpperCase(),
          refundRate: defaultRefundRate,
          refundClaimAmount,
          notes: textValue(body.notes),
          createdBy: textValue(body.createdBy) || "当前用户",
          items: { create: items },
        },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(serializeExportTaxCase(created), { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      SOURCE_NOT_FOUND: "拿货单不存在",
      INVALID_SOURCE_ITEM: "所选货品不属于该拿货单",
      INVALID_ITEM_SELECTION: "货品数量必须大于 0，并至少选择开票或退税",
      INVOICE_QTY_EXCEEDED: "开票数量超过该拿货单剩余可开票数量",
      REFUND_QTY_EXCEEDED: "退税数量超过该拿货单剩余可退税数量",
    };
    if (messages[code]) return NextResponse.json({ error: messages[code] }, { status: 400 });
    console.error("创建出口退税业务单失败:", error);
    return NextResponse.json({ error: "创建失败，请稍后重试" }, { status: 500 });
  }
}
