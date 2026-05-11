import { beforeEach, describe, expect, it, vi } from 'vitest'

const setStockCount = vi.fn()
const enqueueSync = vi.fn()
const pushInlineUpdateStock = vi.fn()
const platformCredentialFindMany = vi.fn()
const productFindUnique = vi.fn()
const productUpdate = vi.fn()
const productCreate = vi.fn()
const platformListingUpsert = vi.fn()
const stockEventCreate = vi.fn()
const platformListingFindUnique = vi.fn()
const platformListingUpdate = vi.fn()

const tx = {
  product: {
    findUnique: productFindUnique,
    update: productUpdate,
    create: productCreate,
  },
  platformListing: {
    upsert: platformListingUpsert,
  },
  stockEvent: {
    create: stockEventCreate,
  },
}

const transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx))

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: transaction,
    platformCredential: {
      findMany: platformCredentialFindMany,
    },
    platformListing: {
      findUnique: platformListingFindUnique,
      update: platformListingUpdate,
    },
  },
}))

vi.mock('@/lib/queues', () => ({
  enqueueSync,
}))

vi.mock('@/lib/stock-engine', () => ({
  setStockCount,
}))

vi.mock('@/lib/encrypt', () => ({
  decryptJSON: vi.fn(),
}))

vi.mock('@/lib/platforms/trendyol', () => ({
  getTrendyolClient: vi.fn(),
}))

vi.mock('@/lib/platforms/shopify', () => ({
  getShopifyClient: vi.fn(() => ({
    setInventoryLevel: pushInlineUpdateStock,
  })),
}))

vi.mock('@/lib/platforms/hepsiburada', () => ({
  getHepsiburadaClient: vi.fn(),
}))

describe('applyImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productFindUnique.mockResolvedValue({
      id: 'product-1',
      companyId: 'company-1',
      masterSku: 'SKU-1',
      stockCount: 10,
    })
    productUpdate.mockResolvedValue({ id: 'product-1' })
    platformCredentialFindMany.mockResolvedValue([
      { platform: 'shopify', encryptedData: 'encrypted-shopify' },
    ])
    platformListingFindUnique.mockResolvedValue({ id: 'listing-1' })
  })

  it('reconciles existing product stock through the stock engine', async () => {
    const { applyImport } = await import('./applier')

    await applyImport('company-1', {
      pushBack: false,
      items: [
        {
          sku: 'sku-1',
          rawSku: 'SKU-1',
          name: 'Demo',
          barcode: null,
          chosenStock: 7,
          existingProductId: 'product-1',
          snapshots: [
            {
              platform: 'shopify',
              platformProductId: 'inventory-1',
              platformSku: 'SKU-1',
            },
          ],
        },
      ],
    })

    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { name: 'Demo', barcode: null },
    })
    expect(stockEventCreate).not.toHaveBeenCalled()
    expect(setStockCount).toHaveBeenCalledWith({
      productId: 'product-1',
      stockCount: 7,
      sourcePlatform: 'manual',
      eventType: 'import',
      note: 'Imported from shopify',
    })
  })

  it('pushes available stock during inline import fallback', async () => {
    const { applyImport } = await import('./applier')
    enqueueSync.mockRejectedValue(new Error('redis unavailable'))

    await applyImport('company-1', {
      pushBack: true,
      items: [
        {
          sku: 'sku-1',
          rawSku: 'SKU-1',
          name: 'Demo',
          barcode: null,
          chosenStock: 10,
          reservedStock: 3,
          existingProductId: 'product-1',
          snapshots: [
            {
              platform: 'shopify',
              platformProductId: 'inventory-1',
              platformSku: 'SKU-1',
            },
          ],
        },
      ],
    })

    expect(pushInlineUpdateStock).toHaveBeenCalledWith('inventory-1', 7)
    expect(platformListingUpdate).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: {
        stockOnPlatform: 7,
        syncStatus: 'ok',
        lastSyncedAt: expect.any(Date),
        errorMessage: null,
      },
    })
  })
})
