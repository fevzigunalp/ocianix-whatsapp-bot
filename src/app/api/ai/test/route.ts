/**
 * POST /api/ai/test
 *
 * Minimal brain-check endpoint. Calls the Anthropic provider directly —
 * no RAG, no policy engine, no sales state. If ANTHROPIC_API_KEY is
 * missing, returns a mock response so the endpoint is never unreachable.
 *
 * Auth-gated (admin session) so it cannot be abused publicly.
 */

import { auth } from '@/lib/auth'
import { callAI } from '@/lib/ai/provider'
import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are a friendly WhatsApp sales assistant.
Reply in Turkish unless the user writes in another language.
Keep answers short (1-3 sentences). Be warm and helpful.`

export async function POST(req: NextRequest) {
  const started = Date.now()

  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let message: string
  try {
    ;({ message } = await req.json())
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const ai = await callAI(SYSTEM_PROMPT, [{ role: 'user', content: message }])

  const responseText =
    ai?.text?.trim() ||
    'Merhaba! Test yanitiyim. Gerçek AI şu anda cevap vermedi, ama boru hattı çalışıyor.'

  return NextResponse.json({
    success: true,
    data: {
      decision: 'answer',
      confidence: ai ? 80 : 50,
      intent: 'TEST',
      response: responseText,
      actionName: null,
      sourcesUsed: [],
      latencyMs: ai?.latencyMs ?? Date.now() - started,
    },
  })
}
