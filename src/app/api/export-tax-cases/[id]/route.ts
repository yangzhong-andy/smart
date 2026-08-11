import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EXPORT_TAX_STATUSES } from "@/lib/export-tax";
import { calculateExportTaxLine } from "@/lib/export-tax-calculation";
import {
  dateValue,
  decimalValue,
  money,
  serializeExportTaxCase,
  textValue,
  voucherValue,
} from "@/lib/export-tax-server";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const row = await prisma.exportTaxCase.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return NextResponse.json({ error: "业务单不存在" }, { status: 404 });
    return NextResponse.json(serializeExportTaxCase(row));
  } catch (error) {
    console.error("获取出口退税业务单详情失败:", error);
    return NextResponse.json({ error: "获取详情失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const existing = await prisma.exportTaxCase.findUnique({
      where: { id: params.id },
      include: { items: true },
    });
    if (!existing) return NextResponse.json({ error: "业务单不存在" }, { status: 404 });

    const status = String(body.status || existing.status);
    if (!EXPORT_TAX_STATUSES.includes(status as any)) {
      return NextResponse.json({ error: "业务状态无效" }, { status: 400 });
    }

    const itemInputs = Array.isArray(body.items) ? body.items : [];
    const inputsById = new Map(itemInputs.map((item: any) => [String(item.id || ""), item]));
    const updated = await prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        const input: any = inputsById.get(item.id);
        if (!input) continue;
        const declarationUnitPrice = Math.max(0, Number(input.declarationUnitPrice ?? item.declarationUnitPrice) || 0);
        const invoiceUnitPrice = input.invoiceUnitPrice === "" || input.invoiceUnitPrice == null
          ? null
          : Math.max(0, Number(input.invoiceUnitPrice) || 0);
        const refundRate = decimalValue(input.refundRate);
        const line = calculateExportTaxLine({
          qty: item.qty,
          purchaseUnitPrice: Number(item.purchaseUnitPrice),
          declarationUnitPrice,
          invoiceUnitPrice,
          needsInvoice: item.needsInvoice,
          needsTaxRefund: item.needsTaxRefund,
          refundRate,
        });
        await tx.exportTaxCaseItem.update({
          where: { id: item.id },
          data: {
            declarationUnitPrice,
            declarationAmount: line.declarationAmount,
            invoiceUnitPrice,
            invoiceAmount: line.invoiceAmount,
            taxRate: decimalValue(input.taxRate),
            refundRate,
            estimatedRefundAmount: line.estimatedRefundAmount,
            hsCode: textValue(input.hsCode),
            customsName: textValue(input.customsName),
          },
        });
      }

      return tx.exportTaxCase.update({
        where: { id: params.id },
        data: {
          status,
          exporterId: textValue(body.exporterId),
          exporterName: textValue(body.exporterName),
          destinationCountry: textValue(body.destinationCountry),
          declarationCurrency: String(body.declarationCurrency || existing.declarationCurrency).toUpperCase(),
          declarationAmount: money(body.declarationAmount, Number(existing.declarationAmount)),
          customsDeclarationNumber: textValue(body.customsDeclarationNumber),
          declarationDate: dateValue(body.declarationDate),
          declarationVouchers: voucherValue(body.declarationVouchers),
          invoiceStatus: String(body.invoiceStatus || existing.invoiceStatus),
          invoiceCurrency: String(body.invoiceCurrency || existing.invoiceCurrency).toUpperCase(),
          invoiceAmount: money(body.invoiceAmount, Number(existing.invoiceAmount)),
          invoiceNumber: textValue(body.invoiceNumber),
          invoiceDate: dateValue(body.invoiceDate),
          invoiceReceivedDate: dateValue(body.invoiceReceivedDate),
          invoiceVouchers: voucherValue(body.invoiceVouchers),
          taxPointStatus: String(body.taxPointStatus || existing.taxPointStatus),
          taxPointRate: decimalValue(body.taxPointRate),
          taxPointAmount: money(body.taxPointAmount, Number(existing.taxPointAmount)),
          taxPointPaidAmount: money(body.taxPointPaidAmount, Number(existing.taxPointPaidAmount)),
          taxPointPaidDate: dateValue(body.taxPointPaidDate),
          taxPointVouchers: voucherValue(body.taxPointVouchers),
          refundStatus: String(body.refundStatus || existing.refundStatus),
          refundCurrency: String(body.refundCurrency || existing.refundCurrency).toUpperCase(),
          refundRate: decimalValue(body.refundRate),
          refundClaimAmount: money(body.refundClaimAmount, Number(existing.refundClaimAmount)),
          refundReceivedAmount: money(body.refundReceivedAmount, Number(existing.refundReceivedAmount)),
          refundApplicationDate: dateValue(body.refundApplicationDate),
          refundReceivedDate: dateValue(body.refundReceivedDate),
          refundVouchers: voucherValue(body.refundVouchers),
          notes: textValue(body.notes),
        },
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
    });

    return NextResponse.json(serializeExportTaxCase(updated));
  } catch (error) {
    console.error("更新出口退税业务单失败:", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
