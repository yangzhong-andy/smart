import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 允许写入的 StoreOrderSettlement 字段（不含 id、createdAt） */
const SETTLEMENT_FIELDS = new Set([
  "storeId", "statementDate", "statementId", "paymentId", "status", "currency", "type",
  "orderAdjustmentId", "skuId", "quantity", "productName", "skuName", "orderCreatedDate",
  "orderShipmentDate", "orderDeliveryDate", "totalSettlementAmount", "netSales", "grossSales",
  "grossSalesRefund", "sellerDiscount", "sellerDiscountRefund", "shipping", "tiktokShopShippingFee",
  "fulfilledByTiktokShopShippingFee", "signatureConfirmationServiceFee", "shippingInsuranceFee",
  "customerpaidShippingFee", "customerpaidShippingFeeRefund", "tiktokShopShippingIncentive",
  "tiktokShopShippingIncentiveRefund", "shippingFeeSubsidy", "returnShippingFee", "fbtFulfillmentFee",
  "customerShippingFeeOffset", "shippingFeeDiscount", "returnShippingLabelFee",
  "fbtFulfillmentFeeReimbursement", "returnShippingFeePaidByCustomers", "returnShippingFeeReimbursement",
  "fees", "transactionFee", "referralFee", "refundAdministrationFee", "affiliateCommission",
  "affiliatePartnerCommission", "affiliateShopAdsCommission", "tiktokShopPartnerCommission",
  "cofundedPromotionSellerfunded", "smartPromotionFeeTax", "cofundedCreatorBonus",
  "affiliateCommissionDeposit", "affiliateCommissionRefund", "affiliatePartnerShopAdsCommission",
  "campaignServiceFee", "campaignResourceFee", "salesTaxOnReferralFees", "smartPromotionFee",
  "adjustmentAmount", "adjustmentReason", "relatedOrderId", "col60", "customerPayment", "customerRefund",
  "sellerCofundedVoucherDiscount", "sellerCofundedVoucherDiscountRefund", "platformDiscounts",
  "platformDiscountsRefund", "platformCofundedVoucherDiscounts", "platformCofundedVoucherDiscountsRefund",
  "adsReferralFeeDiscount", "salesTaxPayment", "salesTaxRefund", "retailDeliveryFeePayment",
  "retailDeliveryFeeRefund", "customerpaidShippingFeeBeforeDiscounts", "sellerShippingFeeDiscount",
  "tiktokShopShippingFeeDiscountToCustomer", "modeOfTiktokShopShippingFeeDiscountToCustomer",
  "returnShippingFeePaidByCustomers2", "estimatedChargeablePackageWeight", "chargeablePackageWeight",
  "fbtChargeableGoodsWeight", "collectionMethods", "deliveryOption", "signatureConfirmationServiceFeeType",
  "col85", "col86", "col87", "col88", "col89", "col90", "col91", "col92", "col93", "col94", "col95",
  "col96", "col97", "col98", "col99", "col100", "col101", "col102", "col103", "col104", "col105",
  "col106", "col107", "col108", "col109", "col110", "col111", "col112", "col113", "col114", "col115",
  "col116", "col117", "col118", "col119", "col120", "col121", "col122", "col123", "col124", "col125",
  "col126", "col127", "col128", "col129", "col130", "col131", "col132", "col133", "col134", "col135",
  "col136", "col137", "col138", "col139", "col140", "col141", "col142", "col143", "col144", "col145",
  "col146", "col147", "col148", "col149", "col150", "col151", "col152", "col153", "col154", "col155",
  "col156", "col157", "col158", "col159", "col160", "col161", "col162", "col163", "col164", "col165",
  "col166", "col167", "col168", "col169", "col170", "col171", "sourceFileName",
]);

/** 表头转驼峰并校验是否允许 */
function headerToField(header: string): string | null {
  const t = header.trim();
  if (!t) return null;
  const colMatch = /^列?(\d+)$/i.exec(t);
  if (colMatch) {
    const n = parseInt(colMatch[1], 10);
    if (n === 60 || (n >= 85 && n <= 171)) return `col${n}`;
    return null;
  }
  const alreadyCamel = t.charAt(0).toLowerCase() + t.slice(1);
  if (SETTLEMENT_FIELDS.has(alreadyCamel)) return alreadyCamel;
  const camel = t
    .replace(/\s*\/\s*/g, " ")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part, i) =>
      i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join("");
  const normalized = camel.charAt(0).toLowerCase() + camel.slice(1);
  return SETTLEMENT_FIELDS.has(normalized) ? normalized : null;
}

/** 单行 sheet 数据转为入库记录 */
function rowToRecord(
  row: Record<string, unknown>,
  headerToFieldMap: Map<string, string>,
  storeId: string | null,
  sourceFileName: string | null
): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    storeId: storeId ?? null,
    sourceFileName: sourceFileName ?? null,
    statementDate: "",
    statementId: "",
    paymentId: "",
    status: "",
    currency: "",
    type: "",
    orderAdjustmentId: "",
    productName: "",
    totalSettlementAmount: "",
    quantity: 0,
  };

  for (const [header, value] of Object.entries(row)) {
    const field = headerToFieldMap.get(header.trim());
    if (!field) continue;
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (field === "quantity") {
      const n = parseInt(str.replace(/,/g, ""), 10);
      rec.quantity = Number.isNaN(n) ? 0 : n;
    } else {
      (rec as Record<string, string>)[field] = str;
    }
  }
  return rec;
}

const BATCH_SIZE = 300;

/** 用「结算单号 + 订单/调整号 + SKU」判断是否同一条结算明细，与库中已有数据去重 */
function dedupeKey(rec: Record<string, unknown>): string {
  const a = String(rec.statementId ?? "").trim();
  const b = String(rec.orderAdjustmentId ?? "").trim();
  const c = String(rec.skuId ?? "").trim();
  return `${a}\t${b}\t${c}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, sourceFileName, rows } = body as {
      storeId?: string | null;
      sourceFileName?: string | null;
      rows?: Record<string, unknown>[];
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "请提供非空的 rows 数组（Order details 行数据）" },
        { status: 400 }
      );
    }

    const allHeaders = new Set<string>();
    for (const row of rows) {
      if (row && typeof row === "object") {
        Object.keys(row).forEach((h) => allHeaders.add(h));
      }
    }
    const headerToFieldMap = new Map<string, string>();
    for (const h of allHeaders) {
      const field = headerToField(h);
      if (field) headerToFieldMap.set(h, field);
    }

    const records: Record<string, unknown>[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = rowToRecord(
        row as Record<string, unknown>,
        headerToFieldMap,
        storeId ?? null,
        sourceFileName ?? null
      );
      records.push(rec);
    }

    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE) as Record<string, unknown>[];
      const keys = batch.map(dedupeKey);
      const uniqueTriples = Array.from(
        new Map(keys.map((k) => k.split("\t")).map(([a, b, c]) => [`${a}\t${b}\t${c}`, { a, b, c }])).values()
      );

      if (uniqueTriples.length > 0) {
        const existing = await prisma.storeOrderSettlement.findMany({
          where: {
            OR: uniqueTriples.map(({ a, b, c }) => ({
              statementId: a,
              orderAdjustmentId: b,
              skuId: c || null,
            })),
          },
          select: { statementId: true, orderAdjustmentId: true, skuId: true },
        });
        const existingSet = new Set(
          existing.map((r) => `${r.statementId}\t${r.orderAdjustmentId}\t${String(r.skuId ?? "")}`)
        );
        const toInsert: Record<string, unknown>[] = [];
        for (const rec of batch) {
          const k = dedupeKey(rec);
          if (existingSet.has(k)) {
            skipped += 1;
          } else {
            existingSet.add(k);
            toInsert.push(rec);
          }
        }
        if (toInsert.length > 0) {
          await prisma.storeOrderSettlement.createMany({
            data: toInsert as Prisma.StoreOrderSettlementCreateManyInput[],
          });
          imported += toInsert.length;
        }
      }
    }

    return NextResponse.json({
      message: `已导入 ${imported} 条到店铺订单结算表${skipped > 0 ? `，跳过重复 ${skipped} 条` : ""}`,
      imported,
      skipped,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
