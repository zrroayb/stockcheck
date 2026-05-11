import { Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/db'
import { QUEUES, scheduleHepsiburadaPollingForCompany, type PollJobData } from '../lib/queues'
import { getHepsiburadaClient } from '../lib/platforms/hepsiburada'
import { decryptJSON } from '../lib/encrypt'
import type { HepsiburadaCredentials } from '../lib/platforms/types'
import { processIncomingOrder } from '../lib/webhooks/process-order'

/**
 * Hepsiburada webhooks are unreliable, so we poll every 60s for any orders
 * we haven't seen yet. processIncomingOrder is idempotent on
 * (companyId, platform, platformOrderId), so duplicates are safe.
 */
export const pollWorker = new Worker<PollJobData>(
  QUEUES.POLL_HEPSIBURADA,
  async (job) => {
    const { companyId } = job.data
    const cred = await prisma.platformCredential.findUnique({
      where: { companyId_platform: { companyId, platform: 'hepsiburada' } },
    })
    if (!cred) return { skipped: 'no_credentials' }

    const client = getHepsiburadaClient(decryptJSON<HepsiburadaCredentials>(cred.encryptedData))
    const recent = await client.getRecentOrders(50)

    const items = (recent.items ?? []) as Array<{
      orderId?: string
      id?: string
      items?: Array<{ sku?: string; merchantSku?: string; quantity?: number }>
    }>

    let inserted = 0
    let skipped = 0
    for (const o of items) {
      const platformOrderId = String(o.orderId ?? o.id ?? '').trim()
      if (!platformOrderId) continue

      const lineItems = (o.items ?? [])
        .map((it) => ({
          platformSku: String(it.sku ?? it.merchantSku ?? '').trim(),
          quantity: Number(it.quantity ?? 0),
        }))
        .filter((it) => it.platformSku.length > 0 && it.quantity > 0)

      if (lineItems.length === 0) continue

      const result = await processIncomingOrder({
        companyId,
        platform: 'hepsiburada',
        platformOrderId,
        items: lineItems,
      })
      if (result.skipped === 'duplicate') skipped += 1
      else inserted += 1
    }

    return { inserted, skipped, total: items.length }
  },
  { connection: redis, concurrency: 2 }
)

pollWorker.on('failed', (job, err) => {
  console.error(`[poll-worker] job ${job?.id} failed:`, err.message)
})

/**
 * Schedule per-company polling jobs with a recurring repeat. Idempotent:
 * BullMQ's repeat job key includes the cron pattern + jobId, so re-running
 * this on each worker boot won't duplicate scheduled jobs.
 */
export async function scheduleHepsiburadaPolling(): Promise<void> {
  const companies = await prisma.platformCredential.findMany({
    where: { platform: 'hepsiburada' },
    select: { companyId: true },
  })

  for (const c of companies) {
    await scheduleHepsiburadaPollingForCompany(c.companyId)
  }
}
