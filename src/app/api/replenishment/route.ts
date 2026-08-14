import { NextRequest, NextResponse } from "next/server"
import { Prisma, Platform, PurchaseOrderStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireApiUser } from "@/lib/api-auth"
import {
  calculateReplenishment,
  normalizeReplenishmentQuantity,
  selectReplenishmentUnitCost,
} from "@/lib/replenishment"
import {
  DEFAULT_REPLENISHMENT_POLICY,
  resolveCartonQty,
  resolveMoq,
  selectPolicyRecord,
  toPolicy,
} from "@/lib/replenishment-policy"
import { createWarehouseResolver } from "@/lib/profit-warehouse-mapping"

export const dynamic = "force-dynamic"

const REPLENISHMENT_NOTE_PREFIX = "来源：备货补货建议"
const CLOSED_REPLENISHMENT_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.CONTRACT_CREATED,
  PurchaseOrderStatus.CANCELLED,
]

function number(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
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

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request)
  if (auth.response) return auth.response

  try {
    const query = request.nextUrl.searchParams
    const selectedShopId = query.get("shopId") || ""
    const selectedWarehouseId = query.get("warehouseId") || ""
    const requestedCountry = String(query.get("country") || "").trim().toUpperCase()
    const now = new Date()
    const allShops = await prisma.tikTokShopSetting.findMany({
      where: { status: "active" },
      select: { shopId: true, shopName: true, region: true, storeId: true },
      orderBy: { shopName: "asc" },
    })
    const countries = [...new Set(allShops.map((shop) => String(shop.region || "").trim().toUpperCase()).filter(Boolean))].sort()
    const selectedShop = selectedShopId ? allShops.find((shop) => shop.shopId === selectedShopId) : null
    if (selectedShopId && !selectedShop) return NextResponse.json({ error: "所选店铺不存在或已停用" }, { status: 400 })
    const country = requestedCountry || String(selectedShop?.region || countries[0] || "").trim().toUpperCase()
    if (requestedCountry && !countries.includes(requestedCountry)) return NextResponse.json({ error: "所选国家没有已启用店铺" }, { status: 400 })
    if (selectedShop && String(selectedShop.region || "").trim().toUpperCase() !== country) {
      return NextResponse.json({ error: "所选店铺与国家不匹配" }, { status: 400 })
    }
    const shops = allShops.filter((shop) => String(shop.region || "").trim().toUpperCase() === country)
    const shopIds = selectedShop ? [selectedShop.shopId] : shops.map((shop) => shop.shopId)
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
    const configuredWarehouseIds = [...new Set([...switchWarehouseIds, ...mappedWarehouseIds].map((row) => row.warehouseId))]
    const warehouseIds = selectedWarehouseId
      ? configuredWarehouseIds.filter((id) => id === selectedWarehouseId)
      : configuredWarehouseIds
    if (selectedWarehouseId && warehouseIds.length === 0) {
      return NextResponse.json({ error: "所选仓库未配置给当前店铺" }, { status: 400 })
    }
    const [variants, mappings, profitMappings, stocks, orders, transitItems, policyRecords, boxSpecs, warehouses, warehouseMappings, switchRules, latestOrders] = await Promise.all([
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
        select: { orderId: true, shopId: true, status: true, orderStatus: true, createTime: true, rawData: true },
      }) : Promise.resolve([]),
      prisma.outboundBatchItem.findMany({
        where: { outboundBatch: { arrivalConfirmedAt: null, warehouseId: { in: warehouseIds } } },
        select: { variantId: true, qty: true, outboundBatch: { select: { warehouseId: true } } },
      }),
      prisma.replenishmentPolicyConfig.findMany({
        where: {
          platform: Platform.TIKTOK,
          country,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
      prisma.boxSpec.findMany({
        where: { isDefault: true },
        select: { variantId: true, qtyPerBox: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.warehouse.findMany({
        where: { id: { in: warehouseIds }, type: "OVERSEAS", isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.tikTokWarehouseMapping.findMany({
        where: { OR: [{ tiktokShopId: { in: shopIds } }, { tiktokShopId: null }] },
        select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true },
      }),
      prisma.profitWarehouseSwitchRule.findMany({
        where: { platform: "TIKTOK", region: country, shopId: { in: shopIds } },
        select: { platform: true, region: true, shopId: true, externalWarehouseId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true },
        orderBy: { effectiveFrom: "desc" },
      }),
      shopIds.length ? prisma.tikTokOrder.findMany({
        where: { shopId: { in: shopIds }, createTime: { not: null } },
        distinct: ["shopId"],
        orderBy: [{ shopId: "asc" }, { createTime: "desc" }],
        select: { orderId: true, shopId: true, createTime: true, rawData: true },
      }) : Promise.resolve([]),
    ])

    const variantById = new Map(variants.map((variant) => [variant.id, variant]))
    const demandMap = new Map<string, { sales7: number; sales14: number; sales30: number; shops: Map<string, number>; orders: number }>()
    const unresolved = new Map<string, { shopId: string; count: number }>()
    const unresolvedWarehouses = new Map<string, { shopId: string; count: number; status: string }>()
    const profitMap = new Map(profitMappings.map((mapping) => [
      `${mapping.shopId}\u0000${normalize(mapping.sellerSku)}`,
      mapping.components,
    ]))
    const directMap = new Map(mappings.map((mapping) => [
      `${mapping.tiktokShopId}\u0000${normalize(mapping.sellerSku)}`,
      mapping.variantId,
    ]))
    const warehouseResolver = createWarehouseResolver(warehouseMappings, switchRules)
    const key = (warehouseId: string, variantId: string) => `${warehouseId}\u0000${variantId}`
    const addDemand = (warehouseId: string, variantId: string, quantity: number, shopId: string, ageDays: number) => {
      if (!variantById.has(variantId)) return
      const demandKey = key(warehouseId, variantId)
      const current = demandMap.get(demandKey) || { sales7: 0, sales14: 0, sales30: 0, shops: new Map<string, number>(), orders: 0 }
      current.sales30 += quantity
      if (ageDays < 14) current.sales14 += quantity
      if (ageDays < 7) current.sales7 += quantity
      current.shops.set(shopId, (current.shops.get(shopId) || 0) + quantity)
      demandMap.set(demandKey, current)
    }

    const latestWarehouseByShop = new Map<string, string>()
    for (const order of latestOrders) {
      const resolution = warehouseResolver(order.rawData, order.shopId, order.createTime, "TIKTOK", country, order.orderId)
      if (resolution.warehouseId) latestWarehouseByShop.set(order.shopId, resolution.warehouseId)
    }
    for (const shopId of shopIds) {
      if (!latestWarehouseByShop.has(shopId)) {
        const latestSwitch = switchRules.find((rule) => rule.shopId === shopId)
        if (latestSwitch) latestWarehouseByShop.set(shopId, latestSwitch.warehouseId)
      }
    }
    for (const order of [...orders].sort((left, right) => (right.createTime?.getTime() || 0) - (left.createTime?.getTime() || 0))) {
      if (!isDemandOrder(order)) continue
      const raw = order.rawData as any
      const created = order.createTime || (raw?.create_time ? new Date(number(raw.create_time) * 1000) : new Date())
      const ageDays = Math.max(0, (Date.now() - created.getTime()) / (24 * 60 * 60 * 1000))
      const resolution = warehouseResolver(raw, order.shopId, created, "TIKTOK", country, order.orderId)
      if (!resolution.warehouseId) {
        const current = unresolvedWarehouses.get(order.orderId) || { shopId: order.shopId, count: 0, status: resolution.status }
        current.count += 1
        unresolvedWarehouses.set(order.orderId, current)
        continue
      }
      if (!warehouseIds.includes(resolution.warehouseId)) continue
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
        for (const component of components) addDemand(resolution.warehouseId, component.variantId, lineQuantity(line) * component.quantity, order.shopId, ageDays)
        for (const component of components) seenVariants.add(component.variantId)
      }
      for (const variantId of seenVariants) {
        const current = demandMap.get(key(resolution.warehouseId, variantId))
        if (current) current.orders += 1
      }
    }

    const stockMap = new Map<string, { overseasAvailable: number; warehouseQty: Array<{ warehouseId: string; warehouseName: string; qty: number }> }>()
    for (const stock of stocks) {
      const stockKey = key(stock.warehouseId, stock.variantId)
      const current = stockMap.get(stockKey) || { overseasAvailable: 0, warehouseQty: [] }
      current.overseasAvailable += Math.max(0, stock.availableQty ?? stock.qty - stock.reservedQty)
      current.warehouseQty.push({ warehouseId: stock.warehouseId, warehouseName: stock.warehouse.name, qty: stock.qty })
      stockMap.set(stockKey, current)
    }
    const inTransitMap = new Map<string, number>()
    for (const item of transitItems) {
      if (!item.variantId || !item.outboundBatch.warehouseId) continue
      const transitKey = key(item.outboundBatch.warehouseId, item.variantId)
      inTransitMap.set(transitKey, (inTransitMap.get(transitKey) || 0) + item.qty)
    }
    const cartonQtyMap = new Map<string, number>()
    for (const spec of boxSpecs) if (!cartonQtyMap.has(spec.variantId)) cartonQtyMap.set(spec.variantId, spec.qtyPerBox)
    const shopName = new Map(shops.map((shop) => [shop.shopId, shop.shopName]))
    const rows = variants.flatMap((variant) => warehouses.map((warehouse) => {
      const rowKey = key(warehouse.id, variant.id)
      const demand = demandMap.get(rowKey) || { sales7: 0, sales14: 0, sales30: 0, shops: new Map<string, number>(), orders: 0 }
      const stock = stockMap.get(rowKey) || { overseasAvailable: 0, warehouseQty: [] }
      const supplier = variant.product.productSuppliers[0]?.supplier || variant.product.defaultSupplier
      const productSupplier = variant.product.productSuppliers[0]
      const policyRecord = selectPolicyRecord(policyRecords, selectedShopId || null, variant.id)
      const supplierLeadTime = productSupplier?.leadTime ?? supplier?.defaultLeadTime ?? 30
      const effectivePolicy = toPolicy(policyRecord, supplierLeadTime)
      const moq = resolveMoq(policyRecord, productSupplier?.moq ?? supplier?.moq)
      const cartonQty = resolveCartonQty(policyRecord, cartonQtyMap.get(variant.id))
      const result = calculateReplenishment({
        sales7: demand.sales7, sales14: demand.sales14, sales30: demand.sales30,
        overseasAvailable: stock.overseasAvailable, domesticReady: 0,
        factoryReady: 0, inTransit: inTransitMap.get(rowKey) || 0,
        moq, cartonQty, today: now,
      }, effectivePolicy)
      return {
        variantId: variant.id, sku: variant.skuId, productName: variant.product.name,
        country: shops[0]?.region || "UNSET", warehouse,
        overseasAvailable: stock.overseasAvailable, sharedDomesticReady: variant.atDomestic,
        sharedFactoryReady: variant.atFactory, inTransit: inTransitMap.get(rowKey) || 0,
        sales7: demand.sales7, sales14: demand.sales14, sales30: demand.sales30,
        orderCount: demand.orders,
        shopSales: [...demand.shops].map(([shopId, units]) => ({ shopId, shopName: shopName.get(shopId) || shopId, units })),
        suggestionShopId: [...latestWarehouseByShop.entries()].find(([, warehouseId]) => warehouseId === warehouse.id)?.[0] || null,
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        unitCost: selectReplenishmentUnitCost(variant.costPrice, productSupplier?.price),
        moq, cartonQty, policy: effectivePolicy,
        policySource: policyRecord ? { id: policyRecord.id, scope: policyRecord.variantId ? "SKU" : policyRecord.shopId ? "SHOP" : "GLOBAL" } : null,
        missingParameters: [
          ...(moq == null ? ["MOQ"] : []),
          ...(cartonQty == null ? ["装箱数"] : []),
          ...(selectReplenishmentUnitCost(variant.costPrice, productSupplier?.price) <= 0 ? ["采购成本"] : []),
          ...(!productSupplier?.leadTime && !supplier?.defaultLeadTime && policyRecord?.supplierLeadTimeDays == null ? ["生产周期"] : []),
          ...(!policyRecord ? ["国内集货", "海运时效", "清关入仓"] : []),
        ],
        ...result,
      }
    }))

    const summary = {
      skuCount: variants.length,
      warehouseCount: warehouses.length,
      urgentCount: rows.filter((row) => row.urgency === "OUT_OF_STOCK" || row.urgency === "URGENT").length,
      suggestedUnits: rows.reduce((sum, row) => sum + row.suggestedQty, 0),
      unresolvedSkuCount: unresolved.size,
      unresolvedWarehouseOrderCount: unresolvedWarehouses.size,
    }
    return NextResponse.json({ generatedAt: new Date().toISOString(), country, countries, defaultPolicy: DEFAULT_REPLENISHMENT_POLICY, summary, shops, warehouses, rows, unresolved: [...unresolved].map(([sellerSku, item]) => ({ sellerSku, ...item })), unresolvedWarehouses: [...unresolvedWarehouses].map(([orderId, item]) => ({ orderId, ...item })) })
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
    const warehouseId = String(body?.warehouseId || "").trim()
    const country = String(body?.country || "").trim().toUpperCase()
    if (!variantId || quantity < 1 || !shopId || !warehouseId || !country) return NextResponse.json({ error: "缺少国家、店铺、仓库、SKU或补货数量" }, { status: 400 })
    const now = new Date()
    const [variant, shop, policyRecords, defaultBoxSpec, warehouse, latestOrder, warehouseMappings, switchRules] = await Promise.all([
      prisma.productVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true, skuId: true, costPrice: true,
          product: { select: {
            name: true,
            defaultSupplier: { select: { moq: true, defaultLeadTime: true } },
            productSuppliers: { where: { isPrimary: true }, select: { price: true, moq: true, leadTime: true, supplier: { select: { moq: true, defaultLeadTime: true } } } },
          } },
        },
      }),
      prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { shopId: true, shopName: true, storeId: true, region: true, status: true } }),
      prisma.replenishmentPolicyConfig.findMany({
        where: { platform: Platform.TIKTOK, country, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        orderBy: { effectiveFrom: "desc" },
      }),
      prisma.boxSpec.findFirst({ where: { variantId, isDefault: true }, select: { qtyPerBox: true }, orderBy: { updatedAt: "desc" } }),
      prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, code: true, type: true, isActive: true } }),
      prisma.tikTokOrder.findFirst({
        where: { shopId, createTime: { not: null } },
        select: { orderId: true, shopId: true, createTime: true, rawData: true },
        orderBy: { createTime: "desc" },
      }),
      prisma.tikTokWarehouseMapping.findMany({
        where: { OR: [{ tiktokShopId: shopId }, { tiktokShopId: null }] },
        select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true },
      }),
      prisma.profitWarehouseSwitchRule.findMany({
        where: { platform: "TIKTOK", shopId },
        select: { platform: true, region: true, shopId: true, externalWarehouseId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true },
        orderBy: { effectiveFrom: "desc" },
      }),
    ])
    if (!variant || !shop) return NextResponse.json({ error: "SKU或店铺不存在" }, { status: 404 })
    if (shop.status !== "active" || String(shop.region || "").trim().toUpperCase() !== country) {
      return NextResponse.json({ error: "该店铺未启用或与所选国家不匹配，不能生成补货建议" }, { status: 400 })
    }
    if (!warehouse || warehouse.type !== "OVERSEAS" || !warehouse.isActive) {
      return NextResponse.json({ error: "目标海外仓不存在或已停用" }, { status: 400 })
    }
    const warehouseResolver = createWarehouseResolver(warehouseMappings, switchRules)
    const currentWarehouseId = (latestOrder
      ? warehouseResolver(latestOrder.rawData, shopId, latestOrder.createTime, "TIKTOK", shop.region, latestOrder.orderId).warehouseId
      : null) || switchRules[0]?.warehouseId || null
    if (!currentWarehouseId) return NextResponse.json({ error: "无法确认店铺当前发货仓，请先维护仓库映射或切仓记录" }, { status: 400 })
    if (currentWarehouseId !== warehouseId) return NextResponse.json({ error: "所选仓库不是该店铺当前发货仓，不能生成建议单" }, { status: 400 })
    const productSupplier = variant.product.productSuppliers[0]
    const supplier = productSupplier?.supplier || variant.product.defaultSupplier
    const policyRecord = selectPolicyRecord(policyRecords, shopId, variant.id)
    const effectivePolicy = toPolicy(policyRecord, productSupplier?.leadTime ?? supplier?.defaultLeadTime ?? 30)
    const moq = resolveMoq(policyRecord, productSupplier?.moq ?? supplier?.moq)
    const cartonQty = resolveCartonQty(policyRecord, defaultBoxSpec?.qtyPerBox)
    const unitPrice = selectReplenishmentUnitCost(variant.costPrice, productSupplier?.price)
    if (unitPrice <= 0) return NextResponse.json({ error: "该 SKU 未维护有效采购成本，不能生成建议单" }, { status: 400 })
    const normalizedQuantity = normalizeReplenishmentQuantity(quantity, moq ?? 0, cartonQty ?? 0)
    const orderNumber = `PO-RESTOCK-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const policySnapshot = {
      ...effectivePolicy,
      policyId: policyRecord?.id ?? null,
      policyScope: policyRecord?.variantId ? "SKU" : policyRecord?.shopId ? "SHOP" : "GLOBAL_DEFAULT",
      moq,
      cartonQty,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      requestedQty: quantity,
      suggestedQty: normalizedQuantity,
      capturedAt: now.toISOString(),
    }
    const order = await prisma.$transaction(async (tx) => {
      const duplicateLockKey = `replenishment:${shop.storeId || shop.shopId}:${variant.skuId}`
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${duplicateLockKey}))`
      const existing = await tx.purchaseOrder.findFirst({
        where: {
          platform: Platform.TIKTOK,
          sku: variant.skuId,
          status: { notIn: CLOSED_REPLENISHMENT_STATUSES },
          notes: { startsWith: REPLENISHMENT_NOTE_PREFIX },
          ...(shop.storeId ? { storeId: shop.storeId } : { storeName: shop.shopName }),
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, orderNumber: true, status: true, quantity: true, sku: true, storeName: true },
      })
      if (existing) return { duplicate: true as const, order: existing }

      const created = await tx.purchaseOrder.create({
        data: {
        uid: `RESTOCK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        orderNumber,
        createdBy: auth.user.name,
        platform: Platform.TIKTOK,
        storeId: shop.storeId,
        storeName: shop.shopName,
        sku: variant.skuId,
        skuId: variant.skuId,
        productName: variant.product.name,
        quantity: normalizedQuantity,
        expectedDeliveryDate: new Date(now.getTime() + effectivePolicy.leadTimeDays * 86400000),
        urgency: body?.urgency || "紧急",
        notes: `${REPLENISHMENT_NOTE_PREFIX}\n建议快照：${JSON.stringify(policySnapshot)}`,
        status: PurchaseOrderStatus.PENDING_RISK,
        riskControlStatus: "待评估",
        approvalStatus: "待审批",
        items: { create: [{ sku: variant.skuId, skuId: variant.skuId, skuName: variant.product.name, quantity: normalizedQuantity, unitPrice: new Prisma.Decimal(unitPrice), totalAmount: new Prisma.Decimal(unitPrice * normalizedQuantity) }] },
        },
        select: { id: true, orderNumber: true, status: true, quantity: true, sku: true, storeName: true },
      })
      return { duplicate: false as const, order: created }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (order.duplicate) {
      return NextResponse.json({
        error: `该店铺的 SKU ${variant.skuId} 已有未结束的备货建议单 ${order.order.orderNumber}`,
        existingOrder: order.order,
      }, { status: 409 })
    }
    return NextResponse.json({ success: true, order: order.order })
  } catch (error: any) {
    console.error("[replenishment] POST failed", error)
    return NextResponse.json({ error: error?.message || "生成采购建议单失败" }, { status: 500 })
  }
}
