import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis = globalForRedis.redis ?? new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

/**
 * Tenant-scoped Redis key
 */
export function tenantKey(tenantId: string, ...parts: string[]): string {
  return `t:${tenantId}:${parts.join(':')}`
}

/**
 * Pub/sub publisher — separate connection required for pub/sub
 */
export function createPubSubClient() {
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
  })
}
