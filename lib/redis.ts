import IORedis, { type Redis } from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis?: Redis
  redisUnavailableUntil?: number
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'
const REDIS_HEALTHCHECK_TIMEOUT_MS = 700
const REDIS_UNAVAILABLE_COOLDOWN_MS = 5_000

export const redis: Redis =
  globalForRedis.redis ??
  new IORedis(redisUrl, {
    // BullMQ requires this to be null so commands aren't dropped between reconnects.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // Don't connect at module-load. Important for `next build` which imports
    // route modules to collect page data and would otherwise fail with
    // ECONNREFUSED in environments without Redis.
    lazyConnect: true,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Redis healthcheck timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (err) => {
        clearTimeout(timeout)
        reject(err)
      }
    )
  })
}

export async function ensureRedisAvailable(): Promise<boolean> {
  if (redis.status === 'ready') return true

  const now = Date.now()
  if ((globalForRedis.redisUnavailableUntil ?? 0) > now) return false

  try {
    if (redis.status === 'wait' || redis.status === 'end') {
      await withTimeout(redis.connect(), REDIS_HEALTHCHECK_TIMEOUT_MS)
    }
    await withTimeout(redis.ping(), REDIS_HEALTHCHECK_TIMEOUT_MS)
    return true
  } catch {
    globalForRedis.redisUnavailableUntil = Date.now() + REDIS_UNAVAILABLE_COOLDOWN_MS
    redis.disconnect()
    return false
  }
}
