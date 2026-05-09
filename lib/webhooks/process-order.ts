import { prisma } from '@/lib/db'
import {
  deductStock,
  markOrderCancelledForInsufficientStock,
  triggerPlatformSync,
} from '@/lib/stock-engine'
import { enqueueCancel, type Platform } from '@/lib/queues'
import { InsufficientStockError } from '@/lib/errors'

/**
 * Normalised order payload — every webhook handler converts the platform's
 * native shape into this and hands it off here. That way the deduct-and-sync
 * logic lives in exactly one place.
 */
export type NormalisedOrder = {
  companyId: string
  platform: Platform
  platformOrderId: string
  items: Array<{
    platformSku: string
    quantity: number
  }>
}

export type ProcessResult = {
  orderId: string
  skipped?: 'duplicate'
  itemsProcessed: number
  itemsCancelled: number
  itemsUnknownSku: number
}

/**
 * Idempotent. Calling this twice with the same (companyId, platform, platformOrderId)
 * does nothing on the second call.
 *
 * Returns counts so the caller (route handler) can return useful info.
 */
export async function processIncomingOrder(
  order: NormalisedOrder
): Promise<ProcessResult> {
  const existing = await prisma.order.findUnique({
    where: {
      companyId_platform_platformOrderId: {
        companyId: order.companyId,
        platform: order.platform,
        platformOrderId: order.platformOrderId,
      },
    },
  })

  if (existing) {
    return {
      orderId: existing.id,
      skipped: 'duplicate',
      itemsProcessed: 0,
      itemsCancelled: 0,
      itemsUnknownSku: 0,
    }
  }

  const created = await prisma.order.create({
    data: {
      companyId: order.companyId,
      platform: order.platform,
      platformOrderId: order.platformOrderId,
      status: 'received',
    },
  })

  let processed = 0
  let cancelled = 0
  let unknown = 0
  let anyCancelled = false

  for (const item of order.items) {
    const listing = await prisma.platformListing.findFirst({
      where: {
        platform: order.platform,
        platformSku: item.platformSku,
        product: { companyId: order.companyId },
      },
    })

    if (!listing) {
      unknown += 1
      continue
    }

    await prisma.orderItem.create({
      data: {
        orderId: created.id,
        productId: listing.productId,
        quantity: item.quantity,
        platformSku: item.platformSku,
      },
    })

    try {
      await deductStock({
        productId: listing.productId,
        quantity: item.quantity,
        orderId: created.id,
        sourcePlatform: order.platform,
      })
      await triggerPlatformSync(listing.productId, order.companyId)
      processed += 1
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        cancelled += 1
        anyCancelled = true
        await markOrderCancelledForInsufficientStock({
          orderId: created.id,
          productId: listing.productId,
          sourcePlatform: order.platform,
        })
        await enqueueCancel({
          orderId: created.id,
          companyId: order.companyId,
          platform: order.platform,
          platformOrderId: order.platformOrderId,
          reason: 'insufficient_stock',
        })
        // Don't break — still record other line items so the audit trail is complete.
      } else {
        // Re-throw — the webhook returns 500 and the marketplace will retry.
        throw err
      }
    }
  }

  if (anyCancelled && processed > 0) {
    await prisma.order.update({
      where: { id: created.id },
      data: { status: 'partially_cancelled' },
    })
  }

  return {
    orderId: created.id,
    itemsProcessed: processed,
    itemsCancelled: cancelled,
    itemsUnknownSku: unknown,
  }
}
