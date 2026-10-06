import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { GET, POST } from '../app/api/products/route'
import { prisma } from './prisma'

const stamp = new Date('2026-09-19T00:00:00.000Z')
const product = {
  id: 'SPU-1', name: '产品', spuCode: 'P001', mainImage: 'data:image/png;base64,abc',
  status: 'ACTIVE', category: null, _count: { variants: 2 }, createdAt: stamp,
  defaultSupplier: { id: 'S1', name: '默认供应商' },
  productSuppliers: [{ supplier: { id: 'S1', name: '默认供应商' } }, { supplier: { id: 'S2', name: '备用供应商' } }],
  suppliers: [{ id: 'old', name: '过期 JSON 供应商' }],
  variants: [
    { skuId: 'SKU-1', color: '蓝色', size: null, costPrice: null, currency: 'USD', weightKg: null, lengthCm: null, widthCm: null, heightCm: null },
    { skuId: 'SKU-2', color: null, size: 'M', costPrice: '0.00', currency: 'CNY', weightKg: '0.000', lengthCm: '12.50', widthCm: '8.00', heightCm: '2.00' },
  ],
}

// Prisma delegates use proxy properties rather than native own methods.
function stubDelegate(context: { after: (callback: () => void) => void }, delegate: any, method: string, implementation: (...args: any[]) => Promise<any>) {
  const original = delegate[method]
  delegate[method] = implementation
  context.after(() => { delegate[method] = original })
}

test('workspace list adds searchable SKU/supplier fields without confusing missing and zero cost', async (context) => {
  stubDelegate(context, prisma.product, 'findMany', async (args: any) => {
    assert.equal(args.select.variants.select.skuId, true)
    assert.equal(args.select.variants.select.platformSkuMapping, undefined)
    return [product] as any
  })
  stubDelegate(context, prisma.productVariant, 'aggregate', async () => ({ _avg: { costPrice: 0 }, _count: { id: 2 } }))
  const response = await GET(new NextRequest('http://localhost/api/products?list=spu&workspace=true&noCache=true'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.list[0].createdAt, stamp.toISOString())
  assert.equal(body.list[0].mainImage, '[base64]')
  assert.deepEqual(body.list[0].suppliers, [{ id: 'S1', name: '默认供应商' }, { id: 'S2', name: '备用供应商' }])
  assert.equal(body.list[0].skuIndex[0].cost_price, null)
  assert.equal(body.list[0].skuIndex[1].cost_price, 0)
  assert.equal(body.list[0].skuIndex[1].weight_kg, 0)
  assert.equal(body.list[0].skuIndex[1].length, 12.5)
  assert.deepEqual(body.summary, { totalCount: 1, onSaleCount: 1, offSaleCount: 0, avgCost: 0, skuCount: 2 })
})

test('legacy list response and image opt-in stay unchanged and do not fetch SKU relations', async (context) => {
  stubDelegate(context, prisma.product, 'findMany', async (args: any) => {
    assert.equal(args.select.variants, undefined)
    assert.equal(args.select.productSuppliers, undefined)
    return [product] as any
  })
  stubDelegate(context, prisma.productVariant, 'aggregate', async () => ({ _avg: { costPrice: 0 }, _count: { id: 2 } }))
  const response = await GET(new NextRequest('http://localhost/api/products?list=spu&includeImages=true&noCache=true'))
  const body = await response.json()
  assert.equal(body.list[0].mainImage, product.mainImage)
  assert.equal(body.list[0].skuIndex, undefined)
  assert.equal(body.list[0].suppliers, undefined)
  assert.equal(body.summary.skuCount, undefined)
})

test('workspace list falls back to legacy JSON-only suppliers', async (context) => {
  stubDelegate(context, prisma.product, 'findMany', async () => [{ ...product, defaultSupplier: null, productSuppliers: [], suppliers: JSON.stringify([{ id: 'legacy', name: '旧供应商' }]) }])
  stubDelegate(context, prisma.productVariant, 'aggregate', async () => ({ _avg: { costPrice: 0 }, _count: { id: 2 } }))
  const response = await GET(new NextRequest('http://localhost/api/products?list=spu&workspace=true&noCache=true'))
  assert.deepEqual((await response.json()).list[0].suppliers, [{ id: 'legacy', name: '旧供应商' }])
})

test('batch POST returns first-row compatibility plus created count and SKU IDs', async (context) => {
  const redisUrl = process.env.REDIS_URL
  process.env.REDIS_URL = '' // Never connect to external caches in a route unit test.
  context.after(() => { if (redisUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = redisUrl })
  context.mock.method(prisma, '$transaction', async (callback: any) => callback({
    product: { findFirst: async () => null, create: async ({ data }: any) => ({ ...data, id: 'created-spu' }) },
    productVariant: {
      findMany: async () => [],
      create: async ({ data }: any) => ({ ...data, id: `id-${data.skuId}`, createdAt: stamp, updatedAt: stamp }),
    },
  }))
  const response = await POST(new NextRequest('http://localhost/api/products', {
    method: 'POST', body: JSON.stringify({ name: '新产品', creation_mode: 'new', variants: [{ sku_id: 'ONE', cost_price: 0 }, { sku_id: 'TWO', cost_price: 12 }] }),
  }))
  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.sku_id, 'ONE')
  assert.equal(body.product_id, 'created-spu')
  assert.equal(body.variant_id, 'id-ONE')
  assert.equal(body.cost_price, 0)
  assert.equal(body.createdCount, 2)
  assert.deepEqual(body.createdSkuIds, ['ONE', 'TWO'])
})

test('batch POST exposes validation and duplicate errors as actionable 400/409 responses', async (context) => {
  let transactions = 0
  context.mock.method(prisma, '$transaction', async (callback: any) => {
    transactions += 1
    return callback({ productVariant: { findMany: async () => [{ skuId: 'TAKEN' }] } })
  })
  const post = (variants: unknown) => POST(new NextRequest('http://localhost/api/products', { method: 'POST', body: JSON.stringify({ name: '产品', variants }) }))
  for (const variants of [[], {}, [{ sku_id: 'EMPTY' }], [{ sku_id: 'ONE', cost_price: 1 }, { sku_id: '', cost_price: 2 }]]) {
    const response = await post(variants)
    assert.equal(response.status, 400)
    assert.equal((await response.json()).code, 'INVALID_VARIANT_INPUT')
  }
  assert.equal(transactions, 0)
  const conflict = await post([{ sku_id: 'TAKEN', cost_price: 1 }])
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).code, 'SKU_ALREADY_EXISTS')
})
