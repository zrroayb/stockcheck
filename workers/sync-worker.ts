import { Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/db'
import { enqueueSync, syncQueueName, type Platform, type SyncJobData } from '../lib/queues'
import { getTrendyolClient } from '../lib/platforms/trendyol'
import { getShopifyClient } from '../lib/platforms/shopify'
import { getHepsiburadaClient } from '../lib/platforms/hepsiburada'
import { decryptJSON } from '../lib/encrypt'
import {
  type TrendyolCredentials,
  type ShopifyCredentials,
  type HepsiburadaCredentials,
} from '../lib/platforms/types'

// One queue + worker per platform → each gets its own concurrency + rate
// limiter, and a worker can never consume another platform's job.
const PLATFORM_RATE_LIMITS: Record<Platform, { max: number; duration: number }> = {
  trendyol: { max: 10, duration: 1000 },
  shopify: { max: 35, duration: 1000 },
  hepsiburada: { max: 5, duration: 1000 },
}

const PLATFORMS: Platform[] = ['trendyol', 'shopify', 'hepsiburada']
const PENDING_SWEEP_INTERVAL_MS = 60_000

const workers: Worker[] = []

for (const platform of PLATFORMS) {
  const worker = new Worker<SyncJobData>(
    syncQueueName(platform),
    async (job) => {
      const { productId, companyId, listingId } = job.data

      const [product, listing, cred] = await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: productId } }),
        prisma.platformListing.findUniqueOrThrow({ where: { id: listingId } }),
        prisma.platformCredential.findUniqueOrThrow({
          where: { companyId_platform: { companyId, platform } },
        }),
      ])

      const stockToPush =
        typeof job.data.overrideStock === 'number'
          ? job.data.overrideStock
          : availableStock(product.stockCount, product.reservedStock)

      // No-op short-circuit: stock already matches what we last pushed.
      if (listing.stockOnPlatform === stockToPush) {
        await prisma.platformListing.update({
          where: { id: listingId },
          data: {
            syncStatus: job.data.pauseAfterSync ? 'paused' : 'ok',
            lastSyncedAt: new Date(),
            errorMessage: null,
          },
        })
        return { skipped: true, reason: 'stock_unchanged' }
      }

      try {
        await pushStockToPlatform(platform, listing.platformProductId, stockToPush, cred.encryptedData)
      } catch (err) {
        await prisma.platformListing.update({
          where: { id: listingId },
          data: {
            syncStatus: 'error',
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        })
        throw err
      }

      await prisma.platformListing.update({
        where: { id: listingId },
        data: {
          stockOnPlatform: stockToPush,
          syncStatus: job.data.pauseAfterSync ? 'paused' : 'ok',
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      })

      return { pushed: stockToPush }
    },
    {
      connection: redis,
      concurrency: 5,
      limiter: PLATFORM_RATE_LIMITS[platform],
    }
  )

  worker.on('failed', (job, err) => {
    console.error(`[sync-worker:${platform}] job ${job?.id} failed:`, err.message)
  })
  worker.on('error', (err) => {
    console.error(`[sync-worker:${platform}] worker error:`, err)
  })

  workers.push(worker)
}

async function pushStockToPlatform(
  platform: Platform,
  platformProductId: string,
  newStock: number,
  encryptedCredentials: string
): Promise<void> {
  switch (platform) {
    case 'trendyol': {
      const cred = decryptJSON<TrendyolCredentials>(encryptedCredentials)
      const client = getTrendyolClient(cred)
      await client.updateStock(platformProductId, newStock)
      return
    }
    case 'shopify': {
      const cred = decryptJSON<ShopifyCredentials>(encryptedCredentials)
      const client = getShopifyClient(cred)
      await client.setInventoryLevel(platformProductId, newStock)
      return
    }
    case 'hepsiburada': {
      const cred = decryptJSON<HepsiburadaCredentials>(encryptedCredentials)
      const client = getHepsiburadaClient(cred)
      await client.updateStock(platformProductId, newStock)
      return
    }
  }
}

export function availableStock(stockCount: number, reservedStock: number): number {
  return Math.max(0, stockCount - reservedStock)
}

export async function enqueuePendingSyncs(): Promise<{ queued: number; failed: number }> {
  const listings = await prisma.platformListing.findMany({
    where: {
      syncStatus: { in: ['pending', 'error'] },
      product: { status: { not: 'archived' } },
    },
    select: {
      id: true,
      platform: true,
      productId: true,
      product: { select: { companyId: true } },
    },
  })

  let queued = 0
  let failed = 0
  for (const listing of listings) {
    try {
      await enqueueSync({
        productId: listing.productId,
        companyId: listing.product.companyId,
        listingId: listing.id,
        platform: listing.platform as Platform,
      })
      queued += 1
    } catch (err) {
      failed += 1
      await prisma.platformListing.update({
        where: { id: listing.id },
        data: {
          syncStatus: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }

  return { queued, failed }
}

export function schedulePendingSyncSweep(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void enqueuePendingSyncs().catch((err) => {
      console.error('[sync-worker] pending sync sweep failed:', err)
    })
  }, PENDING_SWEEP_INTERVAL_MS)
  timer.unref()
  return timer
}

export { workers as syncWorkers }
