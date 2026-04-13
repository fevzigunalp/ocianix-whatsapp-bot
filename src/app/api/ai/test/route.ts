/**
 * POST /api/ai/test
 *
 * Minimal brain-check endpoint. Calls the Anthropic provider directly —
 * no RAG, no policy engine, no sales state. If ANTHROPIC_API_KEY is
 * missing or the call fails, returns a mock response so the endpoint
 * is never unreachable.
 *
 * Uses the same `withAuth` wrapper every other dashboard API route uses,
 * so an authenticated dashboard session is accepted identically.
 */

import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { callAI } from '@/lib/ai/provider'

const SYSTEM_PROMPT = `You are a friendly WhatsApp sales assistant.
Reply in Turkish unless the user writes in another language.
Keep answers short (1-3 sentences). Be warm and helpful.`

export const POST = withAuth(async (req) => {
  const started = Date.now()

  const body = await parseBody<{ message: string }>(req)
  if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
    return apiError('message required')
  }

  const ai = await callAI(SYSTEM_PROMPT, [
    { role: 'user', content: body.message },
  ])

  const responseText =
    ai?.text?.trim() ||
    'Merhaba! Test yanitiyim. Gerçek AI şu anda cevap vermedi, ama boru hattı çalışıyor.'

  return apiSuccess({
    decision: 'answer',
    confidence: ai ? 80 : 50,
    intent: 'TEST',
    response: responseText,
    actionName: null,
    sourcesUsed: [],
    latencyMs: ai?.latencyMs ?? Date.now() - started,
  })
})
