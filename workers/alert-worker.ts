import { Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { QUEUES, type AlertCheckJobData } from '../lib/queues'
import { checkAlertRules } from '../lib/alerts/checker'

export const alertWorker = new Worker<AlertCheckJobData>(
  QUEUES.ALERT_CHECK,
  async (job) => {
    await checkAlertRules(job.data.productId, job.data.newStockCount)
    return { ok: true }
  },
  { connection: redis, concurrency: 5 }
)

alertWorker.on('failed', (job, err) => {
  console.error(`[alert-worker] job ${job?.id} failed:`, err.message)
})
