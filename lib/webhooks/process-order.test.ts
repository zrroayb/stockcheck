import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InsufficientStockError } from '@/lib/errors'

const orderFindUnique = vi.fn()
const orderFindUniqueOrThrow = vi.fn()
const orderCreate = vi.fn()
const orderUpdate = vi.fn()
const platformListingFindFirst = vi.fn()
const orderItemFindUnique = vi.fn()
const orderItemCreate = vi.fn()
const orderItemUpdate = vi.fn()
const stockEventFindFirst = vi.fn()
const deductStock = vi.fn()
const triggerPlatformSync = vi.fn()
const markOrderCancelledForInsufficientStock = vi.fn()
const enqueueCancel = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findUnique: orderFindUnique,
      findUniqueOrThrow: orderFindUniqueOrThrow,
      create: orderCreate,
      update: orderUpdate,
    },
    platformListing: {
      findFirst: platformListingFindFirst,
    },
    orderItem: {
      findUnique: orderItemFindUnique,
      create: orderItemCreate,
      update: orderItemUpdate,
    },
    stockEvent: {
      findFirst: stockEventFindFirst,
    },
  },
}))

vi.mock('@/lib/stock-engine', () => ({
  deductStock,
  triggerPlatformSync,
  markOrderCancelledForInsufficientStock,
}))

vi.mock('@/lib/queues', () => ({
  enqueueCancel,
}))

describe('processIncomingOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orderFindUnique.mockResolvedValue(null)
    orderCreate.mockResolvedValue({ id: 'order-1' })
    orderUpdate.mockResolvedValue({ id: 'order-1' })
    platformListingFindFirst.mockResolvedValue({ productId: 'product-1' })
    orderItemFindUnique.mockResolvedValue(null)
    orderItemCreate.mockResolvedValue({})
    orderItemUpdate.mockResolvedValue({})
    stockEventFindFirst.mockResolvedValue(null)
    deductStock.mockResolvedValue(9)
    triggerPlatformSync.mockResolvedValue(undefined)
    markOrderCancelledForInsufficientStock.mockResolvedValue(undefined)
    enqueueCancel.mockResolvedValue(undefined)
  })

  it('skips already-seen completed orders without deducting stock', async () => {
    const { processIncomingOrder } = await import('./process-order')
    orderFindUnique.mockResolvedValue({
      id: 'order-1',
      status: 'received',
      updatedAt: new Date(),
    })

    const result = await processIncomingOrder({
      companyId: 'company-1',
      platform: 'shopify',
      platformOrderId: 'platform-order-1',
      items: [{ platformSku: 'SKU-1', quantity: 1 }],
    })

    expect(result).toEqual({
      orderId: 'order-1',
      skipped: 'duplicate',
      itemsProcessed: 0,
      itemsCancelled: 0,
      itemsUnknownSku: 0,
    })
    expect(deductStock).not.toHaveBeenCalled()
  })

  it('treats unique constraint races as duplicate webhooks', async () => {
    const { processIncomingOrder } = await import('./process-order')
    orderCreate.mockRejectedValue({ code: 'P2002' })
    orderFindUniqueOrThrow.mockResolvedValue({
      id: 'order-1',
      status: 'received',
      updatedAt: new Date(),
    })

    const result = await processIncomingOrder({
      companyId: 'company-1',
      platform: 'shopify',
      platformOrderId: 'platform-order-1',
      items: [{ platformSku: 'SKU-1', quantity: 1 }],
    })

    expect(result.skipped).toBe('duplicate')
    expect(result.orderId).toBe('order-1')
    expect(deductStock).not.toHaveBeenCalled()
  })

  it('retries failed orders without creating duplicate order items', async () => {
    const { processIncomingOrder } = await import('./process-order')
    orderFindUnique.mockResolvedValue({
      id: 'order-1',
      status: 'failed',
      updatedAt: new Date(),
    })
    orderItemFindUnique.mockResolvedValue({
      id: 'item-1',
      productId: 'product-1',
      status: 'pending',
    })

    const result = await processIncomingOrder({
      companyId: 'company-1',
      platform: 'shopify',
      platformOrderId: 'platform-order-1',
      items: [{ platformSku: 'SKU-1', quantity: 1 }],
    })

    expect(result.itemsProcessed).toBe(1)
    expect(orderItemCreate).not.toHaveBeenCalled()
    expect(deductStock).toHaveBeenCalledOnce()
    expect(orderItemUpdate).toHaveBeenCalledWith({
      where: { orderId_platformSku: { orderId: 'order-1', platformSku: 'SKU-1' } },
      data: { status: 'processed', processedAt: expect.any(Date) },
    })
  })

  it('uses line cancel references for insufficient stock cancellations', async () => {
    const { processIncomingOrder } = await import('./process-order')
    deductStock.mockRejectedValue(new InsufficientStockError('product-1', 0, 2))

    const result = await processIncomingOrder({
      companyId: 'company-1',
      platform: 'trendyol',
      platformOrderId: 'order-1',
      items: [{ platformSku: 'SKU-1', quantity: 2, cancelReference: 'line-99' }],
    })

    expect(result.itemsCancelled).toBe(1)
    expect(enqueueCancel).toHaveBeenCalledWith({
      orderId: 'order-1',
      companyId: 'company-1',
      platform: 'trendyol',
      platformOrderId: 'line-99',
      reason: 'insufficient_stock',
    })
    expect(orderItemUpdate).toHaveBeenCalledWith({
      where: { orderId_platformSku: { orderId: 'order-1', platformSku: 'SKU-1' } },
      data: { status: 'cancelled', processedAt: expect.any(Date) },
    })
  })
})
