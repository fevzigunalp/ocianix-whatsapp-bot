/**
 * AI Provider — Anthropic Claude wrapper with timeout, error handling, fallback.
 * Never crashes the system. Returns null on failure.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 512
const TIMEOUT_MS = 15000

export interface AIResponse {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
  latencyMs: number
}

export async function callAI(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<AIResponse | null> {
  if (!API_KEY) {
    console.log('[AI Provider] No ANTHROPIC_API_KEY — skipping AI call')
    return null
  }

  const start = Date.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[AI Provider] API error', res.status, errBody.substring(0, 200))
      return null
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const latencyMs = Date.now() - start

    console.log('[AI Provider] OK |', latencyMs, 'ms |', data.usage?.input_tokens, 'in |', data.usage?.output_tokens, 'out')

    return {
      text,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      model: data.model || MODEL,
      latencyMs,
    }
  } catch (err: any) {
    const latencyMs = Date.now() - start
    if (err.name === 'AbortError') {
      console.error('[AI Provider] Timeout after', TIMEOUT_MS, 'ms')
    } else {
      console.error('[AI Provider] Error:', err.message)
    }
    return null
  }
}
