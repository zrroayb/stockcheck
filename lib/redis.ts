import IORedis, { type Redis } from 'ioredis'

const globalForRedis = globalThis as unknown as { redis?: Redis }

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

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
