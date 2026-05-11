import { describe, expect, it, vi } from 'vitest'

vi.mock('bullmq', () => ({
  Worker: class {
    name: string

    constructor(name: string) {
      this.name = name
    }

    on() {}
    close() {
      return Promise.resolve()
    }
  },
}))

vi.mock('../lib/redis', () => ({
  redis: {},
}))

vi.mock('../lib/db', () => ({
  prisma: {},
}))

vi.mock('../lib/queues', () => ({
  enqueueSync: vi.fn(),
  syncQueueName: (platform: string) => `stock-sync-${platform}`,
}))

vi.mock('../lib/platforms/trendyol', () => ({
  getTrendyolClient: vi.fn(),
}))

vi.mock('../lib/platforms/shopify', () => ({
  getShopifyClient: vi.fn(),
}))

vi.mock('../lib/platforms/hepsiburada', () => ({
  getHepsiburadaClient: vi.fn(),
}))

vi.mock('../lib/encrypt', () => ({
  decryptJSON: vi.fn(),
}))

describe('availableStock', () => {
  it('pushes only sellable stock and never goes below zero', async () => {
    const { availableStock } = await import('./sync-worker')

    expect(availableStock(10, 2)).toBe(8)
    expect(availableStock(10, 0)).toBe(10)
    expect(availableStock(3, 8)).toBe(0)
  })
})
