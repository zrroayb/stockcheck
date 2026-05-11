import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { enqueueAlertCheck, enqueueSync, type Platform } from './queues'
import { InsufficientStockError } from './errors'

type DeductParams = {
  productId: string
  quantity: number
  orderId?: string
  sourcePlatform: 'trendyol' | 'shopify' | 'hepsiburada' | 'manual' | 'system'
  note?: string
}

type CreditParams = DeductParams

type SetStockParams = {
  productId: string
  stockCount: number
  sourcePlatform: 'trendyol' | 'shopify' | 'hepsiburada' | 'manual' | 'system'
  eventType?: 'manual_adjust' | 'import' | 'correction'
  note?: string
}

type StockRow = {
  id: string
  stock_count: number
  reserved_stock: number
  company_id: string
}

/**
 * Deduct stock atomically using a Postgres row-level lock.
 *
 * Why SELECT FOR UPDATE: when two webhooks race for the last unit of stock,
 * we MUST serialise the read+check+write. Without a lock, both transactions
 * would read the same value, both would pass the availability check, and
 * we'd over-sell. The lock forces them to queue.
 *
 * Throws InsufficientStockError if requested > available — the webhook
 * handler can catch this and trigger an order cancellation.
 */
export async function deductStock(params: DeductParams): Promise<number> {
  const { productId, quantity, orderId, sourcePlatform, note } = params

  if (quantity <= 0) {
    throw new Error(`deductStock requires quantity > 0 (got ${quantity})`)
  }

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<StockRow[]>`
      SELECT id, "stockCount" AS stock_count, "reservedStock" AS reserved_stock, "companyId" AS company_id
      FROM "Product"
      WHERE id = ${productId}
      FOR UPDATE
    `

    const row = rows[0]
    if (!row) throw new Error(`Product not found: ${productId}`)

    const available = row.stock_count - row.reserved_stock
    if (available < quantity) {
      throw new InsufficientStockError(productId, available, quantity)
    }

    const newCount = row.stock_count - quantity

    await tx.product.update({
      where: { id: productId },
      data: { stockCount: newCount },
    })

    await tx.stockEvent.create({
      data: {
        productId,
        orderId,
        sourcePlatform,
        eventType: 'order_deduct',
        quantityDelta: -quantity,
        note,
      },
    })

    return { newCount, companyId: row.company_id }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  })

  await queueAlertCheckSafely(productId, result.newCount)
  return result.newCount
}

/**
 * Add stock back. Used for returns, manual additions, and corrections.
 */
export async function creditStock(params: CreditParams): Promise<number> {
  const { productId, quantity, orderId, sourcePlatform, note } = params

  if (quantity <= 0) {
    throw new Error(`creditStock requires quantity > 0 (got ${quantity})`)
  }

  const eventType =
    sourcePlatform === 'manual' ? 'manual_adjust' : 'return_credit'

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: productId },
      data: { stockCount: { increment: quantity } },
    })

    await tx.stockEvent.create({
      data: {
        productId,
        orderId,
        sourcePlatform,
        eventType,
        quantityDelta: quantity,
        note,
      },
    })

    return product
  })

  await queueAlertCheckSafely(productId, updated.stockCount)
  return updated.stockCount
}

/**
 * Manual adjustment — supports positive or negative deltas in a single call.
 * Negative deltas use deductStock (will throw on insufficient stock).
 */
export async function adjustStock(params: {
  productId: string
  delta: number
  note?: string
}): Promise<number> {
  if (params.delta === 0) {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: params.productId } })
    return product.stockCount
  }

  if (params.delta > 0) {
    return creditStock({
      productId: params.productId,
      quantity: params.delta,
      sourcePlatform: 'manual',
      note: params.note,
    })
  }

  return deductStock({
    productId: params.productId,
    quantity: Math.abs(params.delta),
    sourcePlatform: 'manual',
    note: params.note,
  })
}

/**
 * Set an absolute stock count through the stock engine.
 *
 * Use this for convergence flows like marketplace import where the user picks
 * the new master value. It still writes a delta StockEvent so the audit ledger
 * remains reconcilable with Product.stockCount.
 */
export async function setStockCount(params: SetStockParams): Promise<number> {
  const { productId, stockCount, sourcePlatform, eventType = 'correction', note } = params

  if (stockCount < 0) {
    throw new Error(`setStockCount requires stockCount >= 0 (got ${stockCount})`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<StockRow[]>`
      SELECT id, "stockCount" AS stock_count, "reservedStock" AS reserved_stock, "companyId" AS company_id
      FROM "Product"
      WHERE id = ${productId}
      FOR UPDATE
    `

    const row = rows[0]
    if (!row) throw new Error(`Product not found: ${productId}`)
    if (stockCount < row.reserved_stock) {
      throw new InsufficientStockError(
        productId,
        row.stock_count - row.reserved_stock,
        row.stock_count - stockCount
      )
    }

    const delta = stockCount - row.stock_count
    if (delta === 0) {
      return { newCount: row.stock_count }
    }

    await tx.product.update({
      where: { id: productId },
      data: { stockCount },
    })

    await tx.stockEvent.create({
      data: {
        productId,
        sourcePlatform,
        eventType,
        quantityDelta: delta,
        note,
      },
    })

    return { newCount: stockCount }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  })

  await queueAlertCheckSafely(productId, updated.newCount)
  return updated.newCount
}

async function queueAlertCheckSafely(productId: string, newStockCount: number): Promise<void> {
  try {
    await enqueueAlertCheck({ productId, newStockCount })
  } catch (err) {
    console.warn(
      `[stock-engine] failed to enqueue alert check for product ${productId}:`,
      err
    )
  }
}

/**
 * After a stock change, fan out a sync job to every active platform listing.
 *
 * The sync worker's first check is "did the stock actually change since the
 * last push?" — so even if nothing has changed for a particular platform,
 * the round trip is cheap (one DB read, no API call).
 */
export async function triggerPlatformSync(productId: string, companyId: string): Promise<void> {
  const listings = await prisma.platformListing.findMany({
    where: {
      productId,
      syncStatus: { notIn: ['disabled', 'paused'] },
    },
  })

  await Promise.all(
    listings.map(async (listing) => {
      await prisma.platformListing.update({
        where: { id: listing.id },
        data: { syncStatus: 'pending', errorMessage: null },
      })

      try {
        await enqueueSync({
          productId,
          companyId,
          listingId: listing.id,
          platform: listing.platform as Platform,
        })
      } catch (err) {
        await prisma.platformListing.update({
          where: { id: listing.id },
          data: {
            syncStatus: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        })
      }
    })
  )
}

export async function pausePlatformListings(productId: string, companyId: string): Promise<void> {
  const listings = await prisma.platformListing.findMany({
    where: { productId, syncStatus: { not: 'disabled' } },
  })

  await Promise.all(
    listings.map(async (listing) => {
      await prisma.platformListing.update({
        where: { id: listing.id },
        data: { syncStatus: 'pending', errorMessage: null },
      })

      try {
        await enqueueSync({
          productId,
          companyId,
          listingId: listing.id,
          platform: listing.platform as Platform,
          overrideStock: 0,
          pauseAfterSync: true,
        })
      } catch (err) {
        await prisma.platformListing.update({
          where: { id: listing.id },
          data: {
            syncStatus: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        })
      }
    })
  )
}

/**
 * Mark an order as cancelled and write a zero-delta event for the audit trail.
 * The actual marketplace cancellation is handled by the cancel-worker.
 */
export async function markOrderCancelledForInsufficientStock(params: {
  orderId: string
  productId: string
  sourcePlatform: string
  note?: string
}): Promise<void> {
  await prisma.$transaction([
    prisma.order.update({
      where: { id: params.orderId },
      data: { status: 'cancelled' },
    }),
    prisma.stockEvent.create({
      data: {
        productId: params.productId,
        orderId: params.orderId,
        sourcePlatform: params.sourcePlatform,
        eventType: 'cancelled',
        quantityDelta: 0,
        note: params.note ?? 'Cancelled — insufficient stock at time of deduction',
      },
    }),
  ])
}
