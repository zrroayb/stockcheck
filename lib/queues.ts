import { Queue, type QueueOptions } from 'bullmq'
import { redis } from './redis'

// BullMQ disallows `:` in queue names — use kebab-case.
export const QUEUES = {
  STOCK_SYNC: 'stock-sync',
  ORDER_CANCEL: 'order-cancel',
  ALERT_CHECK: 'alert-check',
  POLL_HEPSIBURADA: 'poll-hepsiburada',
} as const

export type Platform = 'trendyol' | 'shopify' | 'hepsiburada'

export type SyncJobData = {
  productId: string
  companyId: string
  platform: Platform
  listingId: string
}

export type CancelJobData = {
  orderId: string
  companyId: string
  platform: Platform
  platformOrderId: string
  reason: string
}

export type AlertCheckJobData = {
  productId: string
  newStockCount: number
}

export type PollJobData = {
  companyId: string
}

// ---------------------------------------------------------------------------
// Queues are constructed lazily on first use.
//
// Why: BullMQ's Queue constructor preloads Lua scripts onto Redis, which
// triggers an immediate connection. During `next build`'s "collect page data"
// phase Next imports every route module, so eager Queue construction would
// fail any build environment that doesn't have Redis available (CI, Docker
// build step, etc.). Lazy construction keeps build-time imports cheap and
// only opens a connection in the runtime path that actually needs the queue.
// ---------------------------------------------------------------------------

const queueCache = new Map<string, Queue>()

function getQueue<T>(name: string, defaultJobOptions?: QueueOptions['defaultJobOptions']): Queue<T> {
  const cached = queueCache.get(name) as Queue<T> | undefined
  if (cached) return cached
  const queue = new Queue<T>(name, {
    connection: redis,
    defaultJobOptions,
  })
  queueCache.set(name, queue)
  return queue
}

export function syncQueue() {
  return getQueue<SyncJobData>(QUEUES.STOCK_SYNC, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 25s, 125s
    removeOnComplete: 100,
    removeOnFail: 500,
  })
}

export function cancelQueue() {
  return getQueue<CancelJobData>(QUEUES.ORDER_CANCEL, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  })
}

export function alertQueue() {
  return getQueue<AlertCheckJobData>(QUEUES.ALERT_CHECK, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  })
}

export function pollQueue() {
  return getQueue<PollJobData>(QUEUES.POLL_HEPSIBURADA, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  })
}

/**
 * Enqueue a stock sync for one (product, platform) listing.
 *
 * The jobId is deterministic so that if a sync is already queued for the same
 * listing it gets de-duplicated — we don't want to spam the marketplace API
 * with redundant identical pushes when many events happen quickly.
 */
export async function enqueueSync(data: SyncJobData) {
  await syncQueue().add(`sync:${data.platform}:${data.productId}`, data, {
    jobId: `sync:${data.platform}:${data.listingId}`,
  })
}

export async function enqueueCancel(data: CancelJobData) {
  await cancelQueue().add(`cancel:${data.platform}:${data.platformOrderId}`, data, {
    jobId: `cancel:${data.platform}:${data.platformOrderId}`,
  })
}

export async function enqueueAlertCheck(data: AlertCheckJobData) {
  await alertQueue().add(`alert:${data.productId}`, data)
}
