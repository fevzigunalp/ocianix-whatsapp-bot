import { auth } from '@/lib/auth'
import { processMessage } from '@/lib/ai/engines/decision-engine'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await req.json()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const tenantId = (session.user as any).tenantId

  const decision = await processMessage({
    tenantId,
    conversationId: 'test',
    contactId: 'test',
    messageId: 'test',
    message,
    conversationHistory: [],
  })

  return NextResponse.json({
    success: true,
    data: {
      decision: decision.decision,
      confidence: decision.confidence,
      intent: decision.intent,
      response: decision.responseText,
      actionName: decision.actionName,
      sourcesUsed: decision.sourcesUsed,
      latencyMs: decision.latencyMs,
    },
  })
}
