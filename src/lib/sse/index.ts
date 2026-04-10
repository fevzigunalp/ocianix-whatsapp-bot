import { redis, tenantKey, createPubSubClient } from '@/lib/redis'

export type SSEEvent = {
  type: 'message' | 'conversation_update' | 'status_update' | 'notification'
  data: any
  tenantId: string
}

/**
 * Publish an SSE event to all connected clients of a tenant
 */
export async function publishSSE(event: SSEEvent) {
  const channel = tenantKey(event.tenantId, 'sse')
  await redis.publish(channel, JSON.stringify(event))
}

/**
 * Create an SSE stream for a specific tenant
 */
export function createSSEStream(tenantId: string): ReadableStream {
  const subscriber = createPubSubClient()
  const channel = tenantKey(tenantId, 'sse')

  const encoder = new TextEncoder()
  let heartbeatInterval: NodeJS.Timeout

  return new ReadableStream({
    async start(controller) {
      // Subscribe to tenant channel
      await subscriber.subscribe(channel)

      subscriber.on('message', (_ch: string, message: string) => {
        try {
          const event = JSON.parse(message) as SSEEvent
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        } catch {
          // Skip malformed messages
        }
      })

      // Heartbeat every 30s
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          // Stream closed
        }
      }, 30000)

      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ tenantId })}\n\n`)
      )
    },

    cancel() {
      clearInterval(heartbeatInterval)
      subscriber.unsubscribe(channel)
      subscriber.disconnect()
    },
  })
}
