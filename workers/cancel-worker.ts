import { Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/db'
import { QUEUES, type CancelJobData } from '../lib/queues'
import { getTrendyolClient } from '../lib/platforms/trendyol'
import { getShopifyClient } from '../lib/platforms/shopify'
import { getHepsiburadaClient } from '../lib/platforms/hepsiburada'
import { decryptJSON } from '../lib/encrypt'
import {
  type TrendyolCredentials,
  type ShopifyCredentials,
  type HepsiburadaCredentials,
} from '../lib/platforms/types'

export const cancelWorker = new Worker<CancelJobData>(
  QUEUES.ORDER_CANCEL,
  async (job) => {
    const { platform, platformOrderId, companyId, reason } = job.data

    const cred = await prisma.platformCredential.findUniqueOrThrow({
      where: { companyId_platform: { companyId, platform } },
    })

    switch (platform) {
      case 'shopify': {
        const client = getShopifyClient(decryptJSON<ShopifyCredentials>(cred.encryptedData))
        await client.cancelOrder(platformOrderId)
        break
      }
      case 'trendyol': {
        const client = getTrendyolClient(decryptJSON<TrendyolCredentials>(cred.encryptedData))
        await client.cancelOrder(platformOrderId)
        break
      }
      case 'hepsiburada': {
        const client = getHepsiburadaClient(decryptJSON<HepsiburadaCredentials>(cred.encryptedData))
        await client.cancelOrder(platformOrderId)
        break
      }
    }

    return { cancelled: platformOrderId, reason }
  },
  { connection: redis, concurrency: 3 }
)

cancelWorker.on('failed', (job, err) => {
  console.error(`[cancel-worker] job ${job?.id} failed:`, err.message)
})
