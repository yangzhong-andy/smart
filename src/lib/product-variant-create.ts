import type { PrismaClient } from '@prisma/client'

export class ProductVariantCreateError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = 'INVALID_VARIANT_INPUT') {
    super(message)
    this.name = 'ProductVariantCreateError'
  }
}

type Input = Record<string, any>

function isRecord(value: unknown): value is Input {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalNumber(value: unknown, label: string, options: { required?: boolean; positive?: boolean; integer?: boolean } = {}): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    if (options.required) throw new ProductVariantCreateError(`${label}必填`)
    return null
  }
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric) || (options.positive ? numeric <= 0 : numeric < 0) || (options.integer && !Number.isSafeInteger(numeric))) {
    throw new ProductVariantCreateError(`${label}必须是${options.positive ? '大于 0' : '不小于 0'}的有效${options.integer ? '整数' : '数字'}`)
  }
  return numeric
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new ProductVariantCreateError(`${label}必须是文本`)
  return value.trim() || null
}

/** Validate the entire batch before any database work; never discard an incomplete row. */
export function normalizeProductVariantRows(body: Input, input: unknown) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ProductVariantCreateError('至少需要一个有效的 SKU 编码')
  }
  const seen = new Set<string>()
  return input.map((row: unknown, index: number) => {
    const label = `第 ${index + 1} 行`
    if (!isRecord(row)) throw new ProductVariantCreateError(`${label}变体数据无效`)
    const skuId = optionalText(row.sku_id, `${label} SKU 编码`)
    if (!skuId) throw new ProductVariantCreateError(`${label} SKU 编码必填`)
    if (seen.has(skuId)) throw new ProductVariantCreateError(`变体 SKU 编码不能重复：${skuId}`)
    seen.add(skuId)
    const effective = (field: string) => row[field] !== undefined ? row[field] : body[field]
    const currency = optionalText(effective('currency'), `${label}币种`) ?? 'CNY'
    if (!/^[a-z]{3}$/i.test(currency)) throw new ProductVariantCreateError(`${label}币种必须是三位货币代码`)
    return {
      skuId,
      color: optionalText(row.color, `${label}颜色`),
      size: optionalText(row.size, `${label}规格`),
      barcode: optionalText(row.barcode, `${label}条码`),
      costPrice: optionalNumber(row.cost_price ?? row.unitPrice, `${label}成本价`, { required: true })!,
      currency: currency.toUpperCase(),
      weightKg: optionalNumber(effective('weight_kg'), `${label}重量`),
      lengthCm: optionalNumber(effective('length'), `${label}长度`, { positive: true }),
      widthCm: optionalNumber(effective('width'), `${label}宽度`, { positive: true }),
      heightCm: optionalNumber(effective('height'), `${label}高度`, { positive: true }),
      targetRoi: optionalNumber(effective('target_roi'), `${label}目标 ROI`),
      volumetricDivisor: optionalNumber(effective('volumetric_divisor'), `${label}体积系数`, { positive: true, integer: true }),
      // New variants never inherit source IDs, inventory balances or platform mappings.
      stockQuantity: 0,
      atFactory: 0,
      atDomestic: 0,
      inTransit: 0,
    }
  })
}

function normalizeSuppliers(body: Input, firstCost: number) {
  const input = Array.isArray(body.suppliers) && body.suppliers.length > 0
    ? body.suppliers
    : body.factory_id
      ? [{ id: body.factory_id, name: body.factory_name || '', price: firstCost, moq: body.moq, lead_time: body.lead_time, isPrimary: true }]
      : []
  return input.map((supplier: unknown, index: number) => {
    if (!isRecord(supplier)) throw new ProductVariantCreateError(`第 ${index + 1} 个供应商无效`)
    const id = optionalText(supplier.id, '供应商 ID')
    if (!id) throw new ProductVariantCreateError(`第 ${index + 1} 个供应商 ID 必填`)
    return {
      id,
      name: optionalText(supplier.name, '供应商名称') ?? '',
      price: optionalNumber(supplier.price, '供应商价格'),
      moq: optionalNumber(supplier.moq, '供应商起订量', { integer: true }),
      lead_time: optionalNumber(supplier.lead_time, '供应商交期', { integer: true }),
      isPrimary: supplier.isPrimary === true,
    }
  })
}

/** Inject the client so atomicity and input behavior can be tested without a live database. */
export async function createProductVariantBatch(db: Pick<PrismaClient, '$transaction'>, body: Input, variantsInput: unknown) {
  const name = optionalText(body.name, '产品名称')
  if (!name) throw new ProductVariantCreateError('产品名称必填')
  const productId = optionalText(body.product_id, '产品 ID')
  if (body.product_id !== undefined && !productId) throw new ProductVariantCreateError('产品 ID 无效，请刷新产品列表后重试')
  if (body.creation_mode === 'new' && productId) throw new ProductVariantCreateError('新建产品不能同时指定已有产品 ID')
  const rows = normalizeProductVariantRows(body, variantsInput)
  const suppliers = normalizeSuppliers(body, rows[0].costPrice)

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.productVariant.findMany({
        where: { skuId: { in: rows.map((row) => row.skuId) } },
        select: { skuId: true },
      })
      if (existing.length > 0) {
        throw new ProductVariantCreateError(`SKU 已存在：${existing.map((row) => row.skuId).join(', ')}，请修改编码后重试`, 409, 'SKU_ALREADY_EXISTS')
      }

      // An explicit identity is authoritative: never resolve a failed ID by name.
      let product = productId
        ? await tx.product.findUnique({ where: { id: productId } })
        : body.creation_mode === 'new'
          ? null
          : await tx.product.findFirst({ where: { name } })
      if (productId && !product) {
        throw new ProductVariantCreateError('未找到对应的产品，请刷新产品列表后重试', 400, 'PRODUCT_NOT_FOUND')
      }
      if (!product) {
        const createData: any = {
          spuCode: body.spu_code || null,
          name,
          category: body.category || null,
          brand: body.brand || null,
          description: body.description || null,
          mainImage: body.main_image || null,
          galleryImages: Array.isArray(body.gallery_images) && body.gallery_images.length > 0 ? JSON.parse(JSON.stringify(body.gallery_images)) : null,
          material: body.material || null,
          customsNameCN: body.customs_name_cn || null,
          customsNameEN: body.customs_name_en || null,
          defaultSupplierId: body.default_supplier_id || null,
          status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          suppliers: suppliers.length > 0 ? JSON.parse(JSON.stringify(suppliers)) : null,
        }
        if (body.spec_description) createData.specDescription = body.spec_description
        product = await tx.product.create({ data: createData })
      }

      const createdVariants = []
      for (const row of rows) {
        createdVariants.push(await tx.productVariant.create({ data: { productId: product.id, ...row } }))
      }
      for (const supplier of suppliers) {
        await tx.productSupplier.upsert({
          where: { productId_supplierId: { productId: product.id, supplierId: supplier.id } },
          create: {
            productId: product.id,
            supplierId: supplier.id,
            price: supplier.price,
            moq: supplier.moq,
            leadTime: supplier.lead_time,
            isPrimary: supplier.isPrimary,
          },
          // Adding variants must not overwrite the existing product's supplier terms.
          update: {},
        })
      }
      return { product, createdVariants }
    }, { maxWait: 5000, timeout: 30000 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      throw new ProductVariantCreateError(`SKU 编码已被使用（${rows.map((row) => row.skuId).join(', ')}），请刷新产品列表并修改重复编码后重试`, 409, 'SKU_ALREADY_EXISTS')
    }
    if (error?.code === 'P2003') {
      throw new ProductVariantCreateError('产品或供应商已不存在，请刷新列表后重新选择', 400, 'RELATED_RECORD_NOT_FOUND')
    }
    if (error?.code === 'P2020') {
      throw new ProductVariantCreateError('成本价、重量或尺寸超出允许范围，请检查后重试')
    }
    throw error
  }
}
