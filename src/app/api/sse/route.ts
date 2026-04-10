import { auth } from '@/lib/auth'
import { createSSEStream } from '@/lib/sse'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const tenantId = (session.user as any).tenantId
  const stream = createSSEStream(tenantId)

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
