import { beforeEach, describe, expect, it, vi } from 'vitest'

const enqueueAlertCheck = vi.fn()
const enqueueSync = vi.fn()

const productUpdate = vi.fn()
const stockEventCreate = vi.fn()
const productFindUniqueOrThrow = vi.fn()
const platformListingFindMany = vi.fn()
const platformListingUpdate = vi.fn()
const queryRaw = vi.fn()

const tx = {
  $queryRaw: queryRaw,
  product: {
    update: productUpdate,
  },
  stockEvent: {
    create: stockEventCreate,
  },
}

const transaction = vi.fn(async (cb: (arg: typeof tx) => unknown) => cb(tx))

vi.mock('./queues', () => ({
  enqueueAlertCheck,
  enqueueSync,
}))

vi.mock('./db', () => ({
  prisma: {
    $transaction: transaction,
    product: {
      findUniqueOrThrow: productFindUniqueOrThrow,
    },
    platformListing: {
      findMany: platformListingFindMany,
      update: platformListingUpdate,
    },
  },
}))

describe('stock-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryRaw.mockResolvedValue([
      { id: 'product-1', stock_count: 10, reserved_stock: 0, company_id: 'company-1' },
    ])
  })

  it('sets absolute stock by writing a delta event', async () => {
    const { setStockCount } = await import('./stock-engine')

    const newCount = await setStockCount({
      productId: 'product-1',
      stockCount: 7,
      sourcePlatform: 'manual',
      eventType: 'import',
      note: 'Import reconciliation',
    })

    expect(newCount).toBe(7)
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stockCount: 7 },
    })
    expect(stockEventCreate).toHaveBeenCalledWith({
      data: {
        productId: 'product-1',
        sourcePlatform: 'manual',
        eventType: 'import',
        quantityDelta: -3,
        note: 'Import reconciliation',
      },
    })
    expect(enqueueAlertCheck).toHaveBeenCalledWith({
      productId: 'product-1',
      newStockCount: 7,
    })
  })

  it('marks listings pending before enqueueing sync work', async () => {
    const { triggerPlatformSync } = await import('./stock-engine')
    platformListingFindMany.mockResolvedValue([
      { id: 'listing-1', productId: 'product-1', platform: 'shopify' },
    ])

    await triggerPlatformSync('product-1', 'company-1')

    expect(platformListingUpdate).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: { syncStatus: 'pending', errorMessage: null },
    })
    expect(enqueueSync).toHaveBeenCalledWith({
      productId: 'product-1',
      companyId: 'company-1',
      listingId: 'listing-1',
      platform: 'shopify',
    })
  })
})
