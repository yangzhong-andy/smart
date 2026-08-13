import { NextRequest, NextResponse } from "next/server"
import { Prisma, Platform, PurchaseOrderStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireApiUser } from "@/lib/api-auth"
import { calculateReplenishment, type ReplenishmentPolicy } from "@/lib/replenishment"

export const dynamic = "force-dynamic"

const DEFAULT_POLICY: ReplenishmentPolicy = {
  salesWindowDays: 30,
  targetCoverageDays: 45,
  safetyStockDays: 15,
  leadTimeDays: 30,
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase()
}

function lineQuantity(item: any) {
  const value = number(item?.quantity ?? item?.qty ?? item?.item_quantity)
  return Math.max(1, Math.floor(value || 1))
}

function isDemandOrder(order: { status: string | null; orderStatus: string | null; rawData: unknown }) {
  const status = order.orderStatus || order.status || ""
  const raw = order.rawData as any
  return !["CANCELLED", "UNPAID", "ON_HOLD"].includes(status)
    && raw?.is_sample_order !== true
}

function startDate(days: number) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - days + 1)
  return date
}

function makePolicy(request: NextRequest): ReplenishmentPolicy {
  const query = request.nextUrl.searchParams
  return {
    salesWindowDays: integerParam(query.get("salesWindowDays"), DEFAULT_POLICY.salesWindowDays, 7, 30),
    targetCoverageDays: integerParam(query.get("targetCoverageDays"), DEFAULT_POLICY.targetCoverageDays, 7, 180),
    safetyStockDays: integerParam(query.get("safetyStockDays"), DEFAULT_POLICY.safetyStockDays, 0, 90),
    leadTimeDays: integerParam(query.get("leadTimeDays"), DEFAULT_POLICY.leadTimeDays, 1, 180),
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request)
  if (auth.response) return auth.response

  try {
    const query = request.nextUrl.searchParams
    const selectedShopId = query.get("shopId") || ""
    const country = String(query.get("country") || "BR").trim().toUpperCase()
    const policy = makePolicy(request)
    const shops = await prisma.tikTokShopSetting.findMany({
      where: { status: "active", region: country, ...(selectedShopId ? { shopId: selectedShopId } : {}) },
      select: { shopId: true, shopName: true, region: true, storeId: true },
      orderBy: { shopName: "asc" },
    })
    const shopIds = shops.map((shop) => shop.shopId)
    const since = startDate(30)

    const [switchWarehouseIds, mappedWarehouseIds] = await Promise.all([
      prisma.profitWarehouseSwitchRule.findMany({
        where: { platform: "TIKTOK", region: country, shopId: { in: shopIds } },
        distinct: ["warehouseId"], select: { warehouseId: true },
      }),
      prisma.tikTokWarehouseMapping.findMany({
        where: { OR: [{ tiktokShopId: { in: shopIds } }, { tiktokShopId: null }] },
        distinct: ["warehouseId"], select: { warehouseId: true },
      }),
    ])
    const warehouseIds = [...new Set([...switchWarehouseIds, ...mappedWarehouseIds].map((row) => row.warehouseId))]
    const [variants, mappings, profitMappings, stocks, orders, transitItems] = await Promise.all([
      prisma.productVariant.findMany({
        select: {
          id: true, skuId: true, costPrice: true, atDomestic: true, atFactory: true,
          product: {
            select: {
              name: true,
              defaultSupplier: { select: { id: true, name: true, moq: true, defaultLeadTime: true } },
              productSuppliers: {
                where: { isPrimary: true },
                select: { supplierId: true, price: true, moq: true, leadTime: true, supplier: { select: { id: true, name: true, moq: true, defaultLeadTime: true } } },
              },
            },
          },
        },
        orderBy: { skuId: "asc" },
      }),
      prisma.tikTokSkuMapping.findMany({
        where: { ...(shopIds.length ? { tiktokShopId: { in: shopIds } } : {}) },
        select: { tiktokShopId: true, sellerSku: true, variantId: true },
      }),
      prisma.profitSkuMapping.findMany({
        where: { platform: "TIKTOK", enabled: true, ...(shopIds.length ? { shopId: { in: shopIds } } : {}) },
        select: { shopId: true, sellerSku: true, components: { select: { variantId: true, quantity: true } } },
      }),
      prisma.stock.findMany({
        where: { warehouse: { type: "OVERSEAS" }, ...(warehouseIds.length ? { warehouseId: { in: warehouseIds } } : { warehouseId: "__NO_CONFIGURED_WAREHOUSE__" }) },
        select: { variantId: true, qty: true, availableQty: true, reservedQty: true, warehouseId: true, warehouse: { select: { id: true, name: true, code: true } } },
      }),
      shopIds.length ? prisma.tikTokOrder.findMany({
        where: { shopId: { in: shopIds }, createTime: { gte: since } },
        select: { shopId: true, status: true, orderStatus: true, createTime: true, rawData: true },
      }) : Promise.resolve([]),
      prisma.outboundBatchItem.findMany({
        where: { outboundBatch: { arrivalConfirmedAt: null, OR: [{ destinationCountry: country }, { warehouseId: { in: warehouseIds } }] } },
        select: { variantId: true, qty: true },
      }),
    ])

    const variantById = new Map(variants.map((variant) => [variant.id, variant]))
    const demandMap = new Map<string, { sales7: number; sales14: number; sales30: number; shops: Map<string, number>; orders: number }>()
    const unresolved = new Map<string, { shopId: string; count: number }>()
    const profitMap = new Map(profitMappings.map((mapping) => [
      `${mapping.shopId}\u0000${normalize(mapping.sellerSku)}`,
      mapping.components,
    ]))
    const directMap = new Map(mappings.map((mapping) => [
      `${mapping.tiktokShopId}\u0000${normalize(mapping.sellerSku)}`,
      mapping.variantId,
    ]))
    const addDemand = (variantId: string, quantity: number, shopId: string, ageDays: number) => {
      if (!variantById.has(variantId)) return
      const current = demandMap.get(variantId) || { sales7: 0, sales14: 0, sales30: 0, shops: new Map<string, number>(), orders: 0 }
      current.sales30 += quantity
      if (ageDays < 14) current.sales14 += quantity
      if (ageDays < 7) current.sales7 += quantity
      current.shops.set(shopId, (current.shops.get(shopId) || 0) + quantity)
      demandMap.set(variantId, current)
    }

    for (const order of orders) {
      if (!isDemandOrder(order)) continue
      const raw = order.rawData as any
      const created = order.createTime || (raw?.create_time ? new Date(number(raw.create_time) * 1000) : new Date())
      const ageDays = Math.max(0, (Date.now() - created.getTime()) / (24 * 60 * 60 * 1000))
      const lines = Array.isArray(raw?.line_items) ? raw.line_items : []
      const seenVariants = new Set<string>()
      for (const line of lines) {
        const sellerSku = normalize(line?.seller_sku || line?.sku_id)
        if (!sellerSku) continue
        const mappedComponents = profitMap.get(`${order.shopId}\u0000${sellerSku}`)
        const components = mappedComponents?.length
          ? mappedComponents
          : (directMap.has(`${order.shopId}\u0000${sellerSku}`) ? [{ variantId: directMap.get(`${order.shopId}\u0000${sellerSku}`)!, quantity: 1 }] : null)
        if (!components) {
          const current = unresolved.get(sellerSku) || { shopId: order.shopId, count: 0 }
          current.count += lineQuantity(line)
          unresolved.set(sellerSku, current)
          continue
        }
        for (const component of components) addDemand(component.variantId, lineQuantity(line) * component.quantity, order.shopId, ageDays)
        for (const component of components) seenVariants.add(component.variantId)
      }
      for (const variantId of seenVariants) {
        const current = demandMap.get(variantId)
        if (current) current.orders += 1
      }
    }

    const stockMap = new Map<string, { overseasAvailable: number; warehouseQty: Array<{ warehouseId: string; warehouseName: string; qty: number }> }>()
    for (const stock of stocks) {
      const current = stockMap.get(stock.variantId) || { overseasAvailable: 0, warehouseQty: [] }
      current.overseasAvailable += Math.max(0, stock.availableQty ?? stock.qty - stock.reservedQty)
      current.warehouseQty.push({ warehouseId: stock.warehouseId, warehouseName: stock.warehouse.name, qty: stock.qty })
      stockMap.set(stock.variantId, current)
    }
    const inTransitMap = new Map<string, number>()
    for (const item of transitItems) if (item.variantId) inTransitMap.set(item.variantId, (inTransitMap.get(item.variantId) || 0) + item.qty)
    const shopName = new Map(shops.map((shop) => [shop.shopId, shop.shopName]))
    const rows = variants.map((variant) => {
      const demand = demandMap.get(variant.id) || { sales7: 0, sales14: 0, sales30: 0, shops: new Map<string, number>(), orders: 0 }
      const stock = stockMap.get(variant.id) || { overseasAvailable: 0, warehouseQty: [] }
      const supplier = variant.product.productSuppliers[0]?.supplier || variant.product.defaultSupplier
      const productSupplier = variant.product.productSuppliers[0]
      const result = calculateReplenishment({
        sales7: demand.sales7, sales14: demand.sales14, sales30: demand.sales30,
        overseasAvailable: stock.overseasAvailable, domesticReady: variant.atDomestic,
        factoryReady: variant.atFactory, inTransit: inTransitMap.get(variant.id) || 0,
        moq: productSupplier?.moq ?? supplier?.moq, cartonQty: null, today: new Date(),
      }, policy)
      return {
        variantId: variant.id, sku: variant.skuId, productName: variant.product.name,
        country: shops[0]?.region || "UNSET", warehouseQty: stock.warehouseQty,
        overseasAvailable: stock.overseasAvailable, domesticReady: variant.atDomestic,
        factoryReady: variant.atFactory, inTransit: inTransitMap.get(variant.id) || 0,
        sales7: demand.sales7, sales14: demand.sales14, sales30: demand.sales30,
        orderCount: demand.orders,
        shopSales: [...demand.shops].map(([shopId, units]) => ({ shopId, shopName: shopName.get(shopId) || shopId, units })),
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        unitCost: productSupplier?.price != null ? number(productSupplier.price) : number(variant.costPrice),
        ...result,
      }
    })

    const summary = {
      skuCount: rows.length,
      urgentCount: rows.filter((row) => row.urgency === "OUT_OF_STOCK" || row.urgency === "URGENT").length,
      suggestedUnits: rows.reduce((sum, row) => sum + row.suggestedQty, 0),
      unresolvedSkuCount: unresolved.size,
    }
    return NextResponse.json({ generatedAt: new Date().toISOString(), policy, summary, shops, rows, unresolved: [...unresolved].map(([sellerSku, item]) => ({ sellerSku, ...item })) })
  } catch (error: any) {
    console.error("[replenishment] GET failed", error)
    return NextResponse.json({ error: error?.message || "备货建议读取失败" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "OPERATIONS"] })
  if (auth.response) return auth.response
  try {
    const body = await request.json()
    if (body?.confirm !== true) return NextResponse.json({ error: "必须明确确认后才能生成采购建议单" }, { status: 400 })
    const variantId = String(body?.variantId || "").trim()
    const quantity = Math.floor(number(body?.quantity))
    const shopId = String(body?.shopId || "").trim()
    if (!variantId || quantity < 1 || !shopId) return NextResponse.json({ error: "缺少店铺、SKU或补货数量" }, { status: 400 })
    const [variant, shop] = await Promise.all([
      prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true, skuId: true, costPrice: true, product: { select: { name: true } } } }),
      prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { shopId: true, shopName: true, storeId: true } }),
    ])
    if (!variant || !shop) return NextResponse.json({ error: "SKU或店铺不存在" }, { status: 404 })
    const unitPrice = number(body?.unitPrice) || number(variant.costPrice)
    const orderNumber = `PO-RESTOCK-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const policySnapshot = body?.policy && typeof body.policy === "object" ? body.policy : DEFAULT_POLICY
    const order = await prisma.purchaseOrder.create({
      data: {
        uid: `RESTOCK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        orderNumber,
        createdBy: auth.user.name,
        platform: Platform.TIKTOK,
        storeId: shop.storeId,
        storeName: shop.shopName,
        sku: variant.skuId,
        skuId: variant.id,
        productName: variant.product.name,
        quantity,
        expectedDeliveryDate: new Date(Date.now() + number(policySnapshot.leadTimeDays || DEFAULT_POLICY.leadTimeDays) * 86400000),
        urgency: body?.urgency || "紧急",
        notes: `来源：备货补货建议\n建议快照：${JSON.stringify({ ...policySnapshot, suggestedQty: quantity })}`,
        status: PurchaseOrderStatus.PENDING_RISK,
        riskControlStatus: "待评估",
        approvalStatus: "待审批",
        items: { create: [{ sku: variant.skuId, skuId: variant.id, skuName: variant.product.name, quantity, unitPrice: new Prisma.Decimal(unitPrice), totalAmount: new Prisma.Decimal(unitPrice * quantity) }] },
      },
      select: { id: true, orderNumber: true, status: true, quantity: true, sku: true, storeName: true },
    })
    return NextResponse.json({ success: true, order })
  } catch (error: any) {
    console.error("[replenishment] POST failed", error)
    return NextResponse.json({ error: error?.message || "生成采购建议单失败" }, { status: 500 })
  }
}
