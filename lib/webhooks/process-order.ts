import { prisma } from '@/lib/db'
import {
  deductStock,
  markOrderCancelledForInsufficientStock,
  triggerPlatformSync,
} from '@/lib/stock-engine'
import { enqueueCancel, type Platform } from '@/lib/queues'
import { InsufficientStockError } from '@/lib/errors'

const FINAL_STATUSES = new Set(['received', 'fulfilled', 'cancelled', 'partially_cancelled'])
const PROCESSING_STALE_MS = 5 * 60 * 1000

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
    cancelReference?: string
  }>
}

export type ProcessResult = {
  orderId: string
  skipped?: 'duplicate'
  itemsProcessed: number
  itemsCancelled: number
  itemsUnknownSku: number
}

type NormalisedLine = {
  platformSku: string
  quantity: number
  cancelReference?: string
}

/**
 * Idempotent. Completed orders are ignored on duplicate delivery, failed
 * orders can be retried, and a still-processing duplicate is skipped so two
 * webhook deliveries do not deduct the same stock in parallel.
 */
export async function processIncomingOrder(
  order: NormalisedOrder
): Promise<ProcessResult> {
  const orderKey = {
    companyId: order.companyId,
    platform: order.platform,
    platformOrderId: order.platformOrderId,
  }
  const items = normaliseOrderItems(order.items)

  const existing = await prisma.order.findUnique({
    where: { companyId_platform_platformOrderId: orderKey },
    select: { id: true, status: true, updatedAt: true },
  })

  const reusable = await prepareOrderForProcessing(existing)
  if (reusable?.skipped) {
    return duplicateResult(reusable.id)
  }

  let created: { id: string }
  if (reusable) {
    created = { id: reusable.id }
  } else {
    try {
      created = await prisma.order.create({
        data: {
          companyId: order.companyId,
          platform: order.platform,
          platformOrderId: order.platformOrderId,
          status: 'processing',
          processingError: null,
        },
        select: { id: true },
      })
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        const duplicate = await prisma.order.findUniqueOrThrow({
          where: { companyId_platform_platformOrderId: orderKey },
          select: { id: true, status: true, updatedAt: true },
        })
        const prepared = await prepareOrderForProcessing(duplicate)
        if (prepared?.skipped) return duplicateResult(prepared.id)
        created = { id: prepared?.id ?? duplicate.id }
      } else {
        throw err
      }
    }
  }

  try {
    const counts = await processOrderItems(created.id, order, items)
    const status =
      counts.cancelled > 0
        ? counts.processed > 0
          ? 'partially_cancelled'
          : 'cancelled'
        : 'received'

    await prisma.order.update({
      where: { id: created.id },
      data: { status, processingError: null },
    })

    return {
      orderId: created.id,
      itemsProcessed: counts.processed,
      itemsCancelled: counts.cancelled,
      itemsUnknownSku: counts.unknown,
    }
  } catch (err) {
    await prisma.order.update({
      where: { id: created.id },
      data: {
        status: 'failed',
        processingError: explainProcessingError(err),
      },
    }).catch(() => undefined)
    throw err
  }
}

async function prepareOrderForProcessing(
  existing: { id: string; status: string; updatedAt?: Date | null } | null
): Promise<{ id: string; skipped?: true } | null> {
  if (!existing) return null
  if (FINAL_STATUSES.has(existing.status)) return { id: existing.id, skipped: true }
  if (existing.status === 'processing' && !isStale(existing.updatedAt)) {
    return { id: existing.id, skipped: true }
  }

  await prisma.order.update({
    where: { id: existing.id },
    data: { status: 'processing', processingError: null },
  })
  return { id: existing.id }
}

async function processOrderItems(
  orderId: string,
  order: NormalisedOrder,
  items: NormalisedLine[]
): Promise<{ processed: number; cancelled: number; unknown: number }> {
  let processed = 0
  let cancelled = 0
  let unknown = 0

  for (const item of items) {
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

    const alreadyRecorded = await prisma.orderItem.findUnique({
      where: { orderId_platformSku: { orderId, platformSku: item.platformSku } },
    })

    if (alreadyRecorded?.status === 'processed') {
      processed += 1
      continue
    }
    if (alreadyRecorded?.status === 'cancelled') {
      cancelled += 1
      continue
    }
    if (alreadyRecorded) {
      const recovered = await prisma.stockEvent.findFirst({
        where: {
          orderId,
          productId: alreadyRecorded.productId,
          note: orderLineNote(item.platformSku),
          eventType: { in: ['order_deduct', 'cancelled'] },
        },
        orderBy: { occurredAt: 'desc' },
      })
      if (recovered?.eventType === 'order_deduct') {
        await prisma.orderItem.update({
          where: { orderId_platformSku: { orderId, platformSku: item.platformSku } },
          data: { status: 'processed', processedAt: new Date() },
        })
        processed += 1
        continue
      }
      if (recovered?.eventType === 'cancelled') {
        await prisma.orderItem.update({
          where: { orderId_platformSku: { orderId, platformSku: item.platformSku } },
          data: { status: 'cancelled', processedAt: new Date() },
        })
        cancelled += 1
        continue
      }
    }

    if (!alreadyRecorded) {
      await prisma.orderItem.create({
        data: {
          orderId,
          productId: listing.productId,
          quantity: item.quantity,
          platformSku: item.platformSku,
          cancelReference: item.cancelReference,
        },
      })
    }

    try {
      await deductStock({
        productId: listing.productId,
        quantity: item.quantity,
        orderId,
        sourcePlatform: order.platform,
        note: orderLineNote(item.platformSku),
      })
      await triggerPlatformSync(listing.productId, order.companyId)
      await prisma.orderItem.update({
        where: { orderId_platformSku: { orderId, platformSku: item.platformSku } },
        data: { status: 'processed', processedAt: new Date() },
      })
      processed += 1
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        cancelled += 1
        await markOrderCancelledForInsufficientStock({
          orderId,
          productId: listing.productId,
          sourcePlatform: order.platform,
          note: orderLineNote(item.platformSku),
        })
        await enqueueCancel({
          orderId,
          companyId: order.companyId,
          platform: order.platform,
          platformOrderId: item.cancelReference ?? order.platformOrderId,
          reason: 'insufficient_stock',
        })
        await prisma.orderItem.update({
          where: { orderId_platformSku: { orderId, platformSku: item.platformSku } },
          data: { status: 'cancelled', processedAt: new Date() },
        })
      } else {
        throw err
      }
    }
  }

  return { processed, cancelled, unknown }
}

function normaliseOrderItems(items: NormalisedOrder['items']): NormalisedLine[] {
  const bySku = new Map<string, NormalisedLine>()
  for (const item of items) {
    const platformSku = item.platformSku.trim()
    if (!platformSku || item.quantity <= 0) continue

    const existing = bySku.get(platformSku)
    if (existing) {
      existing.quantity += item.quantity
      existing.cancelReference ??= item.cancelReference
    } else {
      bySku.set(platformSku, {
        platformSku,
        quantity: item.quantity,
        cancelReference: item.cancelReference,
      })
    }
  }
  return Array.from(bySku.values())
}

function orderLineNote(platformSku: string): string {
  return `order-line:${platformSku}`
}

function isStale(updatedAt?: Date | null): boolean {
  if (!updatedAt) return true
  return Date.now() - updatedAt.getTime() > PROCESSING_STALE_MS
}

function duplicateResult(orderId: string): ProcessResult {
  return {
    orderId,
    skipped: 'duplicate',
    itemsProcessed: 0,
    itemsCancelled: 0,
    itemsUnknownSku: 0,
  }
}

function explainProcessingError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
