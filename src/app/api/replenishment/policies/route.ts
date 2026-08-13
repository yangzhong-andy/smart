import { NextRequest, NextResponse } from "next/server"
import { Platform, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireApiUser } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

const editableRoles = ["SUPER_ADMIN", "ADMIN", "MANAGER", "OPERATIONS"]

function integer(value: unknown, name: string, min: number, max: number, optional = false) {
  if (optional && (value == null || value === "")) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name}必须是 ${min}-${max} 的整数`)
  return parsed
}

function decimal(value: unknown, name: string, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name}必须在 ${min}-${max} 之间`)
  return parsed
}

function serialize(row: any) {
  return { ...row, demandMultiplier: Number(row.demandMultiplier) }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request)
  if (auth.response) return auth.response
  try {
    const country = String(request.nextUrl.searchParams.get("country") || "BR").trim().toUpperCase()
    const includeHistory = request.nextUrl.searchParams.get("history") === "1"
    const now = new Date()
    const policies = await prisma.replenishmentPolicyConfig.findMany({
      where: {
        platform: Platform.TIKTOK,
        country,
        ...(includeHistory ? {} : { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] }),
      },
      include: {
        variant: { select: { skuId: true, product: { select: { name: true } } } },
        changes: includeHistory ? { orderBy: { changedAt: "desc" }, take: 20 } : false,
      },
      orderBy: { effectiveFrom: "desc" },
    })
    return NextResponse.json({ policies: policies.map(serialize) })
  } catch (error: any) {
    console.error("[replenishment-policies] GET failed", error)
    return NextResponse.json({ error: error?.message || "读取补货参数失败" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: editableRoles })
  if (auth.response) return auth.response
  try {
    const body = await request.json()
    const country = String(body?.country || "BR").trim().toUpperCase()
    const shopId = String(body?.shopId || "").trim() || null
    const variantId = String(body?.variantId || "").trim() || null
    const reason = String(body?.reason || "").trim()
    if (!reason) return NextResponse.json({ error: "请填写本次参数调整原因" }, { status: 400 })
    const [variantExists, shopExists] = await Promise.all([
      variantId ? prisma.productVariant.count({ where: { id: variantId } }) : Promise.resolve(1),
      shopId ? prisma.tikTokShopSetting.count({ where: { shopId, region: country, status: "active" } }) : Promise.resolve(1),
    ])
    if (!variantExists) return NextResponse.json({ error: "SKU不存在" }, { status: 404 })
    if (!shopExists) return NextResponse.json({ error: "店铺不存在或国家不匹配" }, { status: 404 })
    const data = {
      salesWindowDays: integer(body.salesWindowDays, "销量窗口", 7, 30)!,
      targetCoverageDays: integer(body.targetCoverageDays, "目标覆盖", 7, 180)!,
      safetyStockDays: integer(body.safetyStockDays, "安全库存", 0, 90)!,
      supplierLeadTimeDays: integer(body.supplierLeadTimeDays, "生产周期", 1, 180, true),
      domesticCollectionDays: integer(body.domesticCollectionDays, "国内集货", 0, 60)!,
      oceanTransitDays: integer(body.oceanTransitDays, "海运时效", 1, 180)!,
      customsClearanceDays: integer(body.customsClearanceDays, "清关入仓", 0, 60)!,
      demandMultiplier: new Prisma.Decimal(decimal(body.demandMultiplier, "活动放量系数", 0.1, 10)),
      moqOverride: integer(body.moqOverride, "MOQ覆盖", 1, 10000000, true),
      cartonQtyOverride: integer(body.cartonQtyOverride, "装箱数覆盖", 1, 1000000, true),
    }
    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      const scopeKey = `replenishment-policy:${country}:${shopId || "*"}:${variantId || "*"}`
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${scopeKey}))`
      const previous = await tx.replenishmentPolicyConfig.findFirst({
        where: { platform: Platform.TIKTOK, country, shopId, variantId, effectiveTo: null },
        orderBy: { effectiveFrom: "desc" },
      })
      if (previous) await tx.replenishmentPolicyConfig.update({ where: { id: previous.id }, data: { effectiveTo: now } })
      const created = await tx.replenishmentPolicyConfig.create({
        data: {
          platform: Platform.TIKTOK, country, shopId, variantId, ...data,
          effectiveFrom: now, reason, createdBy: auth.user.name,
        },
      })
      await tx.replenishmentPolicyChange.create({
        data: {
          policyId: created.id,
          action: previous ? "REPLACE" : "CREATE",
          before: previous ? JSON.parse(JSON.stringify(previous)) : Prisma.JsonNull,
          after: JSON.parse(JSON.stringify(created)),
          changedBy: auth.user.name,
        },
      })
      return created
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 })
    return NextResponse.json({ success: true, policy: serialize(result) }, { status: 201 })
  } catch (error: any) {
    console.error("[replenishment-policies] POST failed", error)
    const message = String(error?.message || "")
    const status = /必须|之间|整数/.test(message) ? 400 : 500
    return NextResponse.json({ error: error?.message || "保存补货参数失败" }, { status })
  }
}
