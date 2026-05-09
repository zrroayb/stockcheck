import { Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/db'
import { QUEUES, type Platform, type SyncJobData } from '../lib/queues'
import { getTrendyolClient } from '../lib/platforms/trendyol'
import { getShopifyClient } from '../lib/platforms/shopify'
import { getHepsiburadaClient } from '../lib/platforms/hepsiburada'
import { decryptJSON } from '../lib/encrypt'
import {
  type TrendyolCredentials,
  type ShopifyCredentials,
  type HepsiburadaCredentials,
} from '../lib/platforms/types'

// One worker per platform → each gets its own concurrency + rate limiter so
// a slow platform can't block the others. We filter inside the handler so all
// three workers can share the QUEUES.STOCK_SYNC queue name.
const PLATFORM_RATE_LIMITS: Record<Platform, { max: number; duration: number }> = {
  trendyol: { max: 10, duration: 1000 },
  shopify: { max: 35, duration: 1000 },
  hepsiburada: { max: 5, duration: 1000 },
}

const PLATFORMS: Platform[] = ['trendyol', 'shopify', 'hepsiburada']

const workers: Worker[] = []

for (const platform of PLATFORMS) {
  const worker = new Worker<SyncJobData>(
    QUEUES.STOCK_SYNC,
    async (job) => {
      // Each worker only processes its own platform — others are no-ops so
      // they don't grab another platform's job and idle on the wrong limiter.
      if (job.data.platform !== platform) return { skipped: true, reason: 'wrong_worker' }

      const { productId, companyId, listingId } = job.data

      const [product, listing, cred] = await Promise.all([
        prisma.product.findUniqueOrThrow({ where: { id: productId } }),
        prisma.platformListing.findUniqueOrThrow({ where: { id: listingId } }),
        prisma.platformCredential.findUniqueOrThrow({
          where: { companyId_platform: { companyId, platform } },
        }),
      ])

      // No-op short-circuit: stock already matches what we last pushed.
      if (listing.stockOnPlatform === product.stockCount) {
        await prisma.platformListing.update({
          where: { id: listingId },
          data: { syncStatus: 'ok', lastSyncedAt: new Date(), errorMessage: null },
        })
        return { skipped: true, reason: 'stock_unchanged' }
      }

      // Snapshot the value we're about to push so post-push update is correct
      // even if stockCount changes again before we get back.
      const stockToPush = product.stockCount

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
          syncStatus: 'ok',
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

export { workers as syncWorkers }
