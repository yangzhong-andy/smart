import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError } from "@/lib/api-response";
import { requireApiUser } from "@/lib/api-auth";
import { calculateProfitEstimate, isProfitEstimatePlatform, isShopeeFeeMode, type ProfitEstimateInput } from "@/lib/profit-estimate";

export const dynamic = "force-dynamic";

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const platform = request.nextUrl.searchParams.get("platform");
    if (platform && !isProfitEstimatePlatform(platform)) return badRequest("平台无效");
    const rows = await prisma.profitCalculation.findMany({
      where: platform ? { platform } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        product: {
          select: { skuId: true },
        },
      },
    });

    return NextResponse.json(
      rows.map((row) => {
        const salePriceBrl = Number(row.salePriceBrl);
        const exchangeRate = Number(row.exchangeRate);
        const qty = row.quantity;
        // 与测算页一致：营业额(BRL) = 有效售价(BRL)×件数
        const grossRevenueBrl = salePriceBrl * qty;
        // 与测算页一致：营业额(CNY) = 有效售价(BRL)×件数×汇率
        const grossRevenueCny = salePriceBrl * qty * exchangeRate;
        return {
          id: row.id,
          platform: row.platform,
          selectionItemId: row.selectionItemId,
          inputSnapshot: row.inputSnapshot,
          productId: row.productId,
          productName: row.productName,
          skuId: row.product?.skuId ?? null,
          purchaseCostCny: Number(row.purchaseCostCny),
          weightKg: row.weightKg == null ? null : Number(row.weightKg),
          firstLegShippingCny: Number(row.firstLegShippingCny),
          adCostCny: Number(row.adCostCny),
          salePriceBrl,
          exchangeRate,
          quantity: qty,
          shippingMode: row.shippingMode,
          isCommissionFree: row.isCommissionFree,
          warehouseFeeBrl: Number(row.warehouseFeeBrl),
          targetRoi: row.targetRoi == null ? null : Number(row.targetRoi),
          settlementBrl: Number(row.settlementBrl),
          grossRevenueBrl,
          grossRevenueCny,
          netProfitCny: Number(row.netProfitCny),
          roi: Number(row.roi),
          breakEvenRoi: Number(row.breakEvenRoi),
          expectedProfitCny: row.expectedProfitCny == null ? null : Number(row.expectedProfitCny),
          createdAt: row.createdAt.toISOString(),
        };
      })
    );
  } catch (error) {
    return serverError("获取利润测算历史失败", error, { includeDetailsInDev: true });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const productName = String(body.productName || "").trim();

    if (!productName || productName.length > 200) {
      return badRequest("请填写有效的商品名称");
    }
    if (!isProfitEstimatePlatform(body.platform)) return badRequest("请选择有效平台");
    if (body.platform === "SHOPEE" && body.shopeeFeeMode != null && !isShopeeFeeMode(body.shopeeFeeMode)) {
      return badRequest("虾皮店铺费率方案无效");
    }
    const required = ["salePriceBrl", "exchangeRate", "purchaseCostCny", "firstLegCny", "adCostCny"];
    if (required.some((key) => !Number.isFinite(Number(body[key])) || Number(body[key]) < 0)
      || Number(body.salePriceBrl) <= 0 || Number(body.exchangeRate) <= 0
      || Number(body.quantity) < 1 || Number(body.quantity) > 10000) {
      return badRequest("售价、汇率、数量及成本必须是有效的非负数字");
    }
    const selectionItemId = body.selectionItemId ? String(body.selectionItemId) : null;
    const selected = selectionItemId ? await prisma.profitSelectionItem.findUnique({ where: { id: selectionItemId } }) : null;
    if (selectionItemId && (!selected || selected.platform !== body.platform)) return badRequest("选品商品与平台不匹配");
    const productId = body.productId ? String(body.productId) : null;
    if (productId && !(await prisma.productVariant.findUnique({ where: { id: productId }, select: { id: true } }))) return badRequest("商品 SKU 不存在");
    if (selected && productId !== selected.productVariantId) return badRequest("商品 SKU 与选品记录不匹配");
    const optionalNumber = (value: unknown) => value == null || value === "" ? 0 : Number(value);
    const input: ProfitEstimateInput = {
      platform: body.platform,
      shopeeFeeMode: body.platform === "SHOPEE" ? body.shopeeFeeMode || "MANUAL" : undefined,
      quantity: Number(body.quantity), salePriceBrl: Number(body.salePriceBrl),
      discountSalePriceBrl: optionalNumber(body.discountSalePriceBrl),
      exchangeRate: Number(body.exchangeRate), purchaseCostCny: Number(body.purchaseCostCny),
      firstLegCny: Number(body.firstLegCny), adCostCny: Number(body.adCostCny),
      weightKg: optionalNumber(body.weightKg), warehouseFeeBrl: optionalNumber(body.warehouseFeeBrl),
      platformFeePercent: body.platform === "TIKTOK" || body.platform === "SHOPEE" && body.shopeeFeeMode === "CNPJ_LOCAL" ? 0 : optionalNumber(body.platformFeePercent),
      fulfillmentFeeBrl: optionalNumber(body.fulfillmentFeeBrl),
      lastMileFeeBrl: optionalNumber(body.lastMileFeeBrl), affiliateFeeBrl: optionalNumber(body.affiliateFeeBrl),
      taxPercent: optionalNumber(body.taxPercent),
      invoiceFeePercent: optionalNumber(body.invoiceFeePercent),
      remittanceFeePercent: optionalNumber(body.remittanceFeePercent),
      isCommissionFree: false, targetRoi: optionalNumber(body.targetRoi),
    };
    if (Object.values(input).some((value) => typeof value === "number" && (!Number.isFinite(value) || value < 0))) {
      return badRequest("费用、费率和目标 ROI 必须是有效的非负数字");
    }
    const result = calculateProfitEstimate(input);

    const created = await prisma.profitCalculation.create({
      data: {
        platform: input.platform,
        selectionItemId,
        inputSnapshot: { version: 2, basis: "ESTIMATE", inputs: input, result },
        productId,
        productName,
        purchaseCostCny: input.purchaseCostCny,
        weightKg: body.weightKg == null || body.weightKg === "" ? null : toNum(body.weightKg),
        firstLegShippingCny: input.firstLegCny,
        adCostCny: input.adCostCny,
        salePriceBrl: result.effectiveSale,
        exchangeRate: input.exchangeRate,
        quantity: result.quantity,
        shippingMode: body.shippingMode === "WAREHOUSE_3PL" ? "WAREHOUSE_3PL" : "SFP",
        isCommissionFree: input.isCommissionFree,
        warehouseFeeBrl: result.warehouseFeeBrl,
        targetRoi: input.targetRoi || null,
        settlementBrl: result.settlementBrl,
        netProfitCny: result.netProfitCny,
        roi: result.adRoi,
        breakEvenRoi: result.breakEvenRoi,
        expectedProfitCny: result.expectedProfitCny,
      },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return serverError("保存利润测算失败", error, { includeDetailsInDev: true });
  }
}
