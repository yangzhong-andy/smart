import assert from 'node:assert/strict'
import test from 'node:test'
import { createProductVariantBatch, normalizeProductVariantRows, ProductVariantCreateError } from './product-variant-create'

const variant = (sku_id = 'SKU-1', extra: Record<string, unknown> = {}) => ({ sku_id, cost_price: 12, ...extra })

test('batch validation trims SKUs, permits zero cost and supports the legacy unitPrice alias', () => {
  const rows = normalizeProductVariantRows({}, [{ sku_id: ' SKU-1 ', cost_price: 0 }, { sku_id: 'SKU-2', unitPrice: '15.5' }])
  assert.equal(rows[0].skuId, 'SKU-1')
  assert.equal(rows[0].costPrice, 0)
  assert.equal(rows[1].costPrice, 15.5)
})

test('batch validation rejects every incomplete row instead of silently skipping it', () => {
  for (const row of [null, {}, { sku_id: '' }, { sku_id: '  ', cost_price: 8 }, { sku_id: 123, cost_price: 8 }]) {
    assert.throws(() => normalizeProductVariantRows({}, [variant(), row]), ProductVariantCreateError)
  }
  assert.throws(() => normalizeProductVariantRows({}, []), ProductVariantCreateError)
  assert.throws(() => normalizeProductVariantRows({}, [variant(), variant(' SKU-1 ')]), /不能重复/)
})

test('cost validation rejects missing, blank, nonfinite, negative, boolean and malformed numeric values', () => {
  for (const cost_price of [undefined, null, '', ' ', NaN, Infinity, -1, '-0.1', true, [], '10oops']) {
    assert.throws(() => normalizeProductVariantRows({}, [variant('SKU-1', { cost_price })]), /成本价/)
  }
})

test('optional numeric fields are validated and dimensions must be strictly positive', () => {
  for (const field of ['weight_kg', 'length', 'width', 'height', 'target_roi', 'volumetric_divisor']) {
    for (const value of [-1, Infinity, 'broken', true]) {
      assert.throws(() => normalizeProductVariantRows({}, [variant('SKU-1', { [field]: value })]), ProductVariantCreateError)
    }
  }
  for (const field of ['length', 'width', 'height', 'volumetric_divisor']) {
    assert.throws(() => normalizeProductVariantRows({}, [variant('SKU-1', { [field]: 0 })]), ProductVariantCreateError)
  }
  assert.throws(() => normalizeProductVariantRows({}, [variant('SKU-1', { volumetric_divisor: 2.5 })]), /整数/)
})

test('row fields override body defaults without losing zero, and explicit blanks clear optional values', () => {
  const rows = normalizeProductVariantRows({ currency: 'CNY', weight_kg: 3, length: 9, width: 8, height: 7, target_roi: 1, volumetric_divisor: 6000 }, [
    variant(),
    variant('SKU-2', { currency: 'usd', weight_kg: 0, length: 11, width: '', height: null, target_roi: 0, volumetric_divisor: 5000 }),
  ])
  assert.deepEqual([rows[0].currency, rows[0].weightKg, rows[0].lengthCm, rows[0].widthCm, rows[0].heightCm], ['CNY', 3, 9, 8, 7])
  assert.deepEqual([rows[1].currency, rows[1].weightKg, rows[1].lengthCm, rows[1].widthCm, rows[1].heightCm, rows[1].targetRoi, rows[1].volumetricDivisor], ['USD', 0, 11, null, null, 0, 5000])
})

test('creation only emits new zero-stock variants and never copies identity or mappings', () => {
  const [row] = normalizeProductVariantRows({}, [variant('NEW', {
    id: 'old-variant', variant_id: 'old-variant', productId: 'old-product', stock_quantity: 99,
    stockQuantity: 99, at_factory: 20, atFactory: 20, atDomestic: 30, inTransit: 40,
    platformSkuMapping: { old: true }, platform_sku_mapping: { old: true },
  })])
  assert.deepEqual([row.stockQuantity, row.atFactory, row.atDomestic, row.inTransit], [0, 0, 0, 0])
  for (const key of ['id', 'variant_id', 'productId', 'platformSkuMapping', 'platform_sku_mapping']) assert.equal(key in row, false)
})

function mockDatabase(options: { existingProduct?: boolean; failVariant?: number; supplierFailure?: boolean; existingSku?: string; uniqueConflict?: boolean } = {}) {
  const initialProduct = { id: 'existing-product', name: '同名产品' }
  const state = {
    products: options.existingProduct ? [initialProduct] : [] as any[],
    variants: [] as any[],
    suppliers: [] as any[],
    transactions: 0,
    nameLookups: 0,
  }
  const db = {
    async $transaction(callback: (tx: any) => Promise<unknown>) {
      state.transactions += 1
      const snapshot = { products: [...state.products], variants: [...state.variants], suppliers: [...state.suppliers] }
      let variantCalls = 0
      const tx = {
        product: {
          async findUnique({ where }: any) { return state.products.find((product) => product.id === where.id) ?? null },
          async findFirst({ where }: any) { state.nameLookups += 1; return state.products.find((product) => product.name === where.name) ?? null },
          async create({ data }: any) { const product = { ...data, id: 'new-product' }; state.products.push(product); return product },
        },
        productVariant: {
          async findMany() { return options.existingSku ? [{ skuId: options.existingSku }] : [] },
          async create({ data }: any) {
            variantCalls += 1
            if (options.uniqueConflict) throw { code: 'P2002' }
            if (variantCalls === options.failVariant) throw new Error('injected variant write failure')
            const row = { ...data, id: `variant-${variantCalls}` }
            state.variants.push(row)
            return row
          },
        },
        productSupplier: {
          async upsert({ create }: any) {
            if (options.supplierFailure) throw { code: 'P2003' }
            state.suppliers.push(create)
            return create
          },
        },
      }
      try { return await callback(tx) } catch (error) {
        Object.assign(state, snapshot)
        throw error
      }
    },
  } as unknown as Parameters<typeof createProductVariantBatch>[0]
  return { db, state }
}

test('invalid rows fail before starting a transaction', async () => {
  const { db, state } = mockDatabase()
  await assert.rejects(createProductVariantBatch(db, { name: '产品' }, [variant(), { sku_id: 'SKU-2' }]), /成本价/)
  assert.equal(state.transactions, 0)
})

test('new mode creates a distinct SPU even with the same name; legacy mode keeps name grouping', async () => {
  const fresh = mockDatabase({ existingProduct: true })
  const created = await createProductVariantBatch(fresh.db, { name: '同名产品', creation_mode: 'new' }, [variant()])
  assert.equal(created.product.id, 'new-product')
  assert.equal(fresh.state.products.length, 2)
  assert.equal(fresh.state.nameLookups, 0)
  const legacy = mockDatabase({ existingProduct: true })
  const reused = await createProductVariantBatch(legacy.db, { name: '同名产品' }, [variant()])
  assert.equal(reused.product.id, 'existing-product')
  assert.equal(legacy.state.products.length, 1)
})

test('unknown explicit product_id fails without falling back to an existing same-name SPU', async () => {
  const { db, state } = mockDatabase({ existingProduct: true })
  await assert.rejects(createProductVariantBatch(db, { name: '同名产品', product_id: 'missing' }, [variant()]), (error: any) => error.code === 'PRODUCT_NOT_FOUND')
  assert.equal(state.nameLookups, 0)
  assert.equal(state.variants.length, 0)
  assert.equal(state.products.length, 1)
})

test('explicit product_id appends variants without changing product identity', async () => {
  const { db, state } = mockDatabase({ existingProduct: true })
  const result = await createProductVariantBatch(db, { name: '新的显示名称', product_id: 'existing-product' }, [variant(), variant('SKU-2')])
  assert.equal(result.product.name, '同名产品')
  assert.equal(state.products.length, 1)
  assert.equal(state.nameLookups, 0)
  assert.deepEqual(state.variants.map((row) => row.productId), ['existing-product', 'existing-product'])
})

test('failure on a later variant rolls back the new SPU and earlier variants', async () => {
  const { db, state } = mockDatabase({ failVariant: 2 })
  await assert.rejects(createProductVariantBatch(db, { name: '产品' }, [variant(), variant('SKU-2')]), /injected/)
  assert.deepEqual([state.products, state.variants, state.suppliers], [[], [], []])
  assert.equal(state.transactions, 1)
})

test('supplier relation failures roll back the entire creation and return an actionable error', async () => {
  const { db, state } = mockDatabase({ supplierFailure: true })
  await assert.rejects(createProductVariantBatch(db, { name: '产品', suppliers: [{ id: 'gone' }] }, [variant()]), (error: any) => error.code === 'RELATED_RECORD_NOT_FOUND' && error.status === 400)
  assert.deepEqual([state.products, state.variants, state.suppliers], [[], [], []])
})

test('each supplier keeps its own terms within the same transaction', async () => {
  const { db, state } = mockDatabase()
  const result = await createProductVariantBatch(db, { name: '产品', suppliers: [{ id: 'S1', price: 10, moq: 100 }, { id: 'S2', price: 12, moq: 25 }] }, [variant(), variant('SKU-2')])
  assert.equal(result.createdVariants.length, 2)
  assert.deepEqual(state.suppliers.map((supplier) => [supplier.supplierId, supplier.price, supplier.moq]), [['S1', 10, 100], ['S2', 12, 25]])
})

test('preflight duplicates and racing unique conflicts return 409 without partial writes', async () => {
  for (const options of [{ existingSku: 'SKU-1' }, { uniqueConflict: true }]) {
    const { db, state } = mockDatabase(options)
    await assert.rejects(createProductVariantBatch(db, { name: '产品' }, [variant()]), (error: any) => error.code === 'SKU_ALREADY_EXISTS' && error.status === 409 && error.message.includes('SKU-1'))
    assert.deepEqual([state.products, state.variants], [[], []])
  }
})
