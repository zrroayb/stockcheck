import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
}))

vi.mock('bullmq', () => ({
  Queue: class {
    name: string
    add = addMock

    constructor(name: string) {
      this.name = name
    }
  },
}))

vi.mock('./redis', () => ({
  redis: {},
}))

describe('stock sync queues', () => {
  beforeEach(() => {
    addMock.mockReset()
  })

  it('routes each platform to a distinct queue name', async () => {
    const { syncQueueName } = await import('./queues')

    expect(syncQueueName('trendyol')).toBe('stock-sync-trendyol')
    expect(syncQueueName('shopify')).toBe('stock-sync-shopify')
    expect(syncQueueName('hepsiburada')).toBe('stock-sync-hepsiburada')
  })

  it('keeps platform-specific job ids when enqueueing sync work', async () => {
    const { enqueueSync } = await import('./queues')

    await enqueueSync({
      productId: 'product-1',
      companyId: 'company-1',
      platform: 'shopify',
      listingId: 'listing-1',
    })

    expect(addMock).toHaveBeenCalledWith(
      'sync:shopify:product-1',
      expect.objectContaining({ platform: 'shopify', listingId: 'listing-1' }),
      { jobId: 'sync:shopify:listing-1' }
    )
  })
})
