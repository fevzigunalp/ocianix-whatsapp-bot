/**
 * Prompt Builder v1 — builds system prompt from client pack + conversation context.
 * Practical, stable, no over-engineering.
 */

interface PackContext {
  businessName: string | null
  industry: string | null
  websiteUrl: string | null
  tonePreset: string
  formality: string
  useEmoji: boolean
  maxResponseLen: number
  customInstructions: string | null
  language: string
}

interface ConversationContext {
  contactName: string | null
  contactPhone: string
  recentMessages: Array<{
    direction: string
    sender: string
    body: string | null
    createdAt: Date
  }>
}

const TONE_MAP: Record<string, string> = {
  friendly: 'Samimi, sicak ve konuskan bir tonda yaz. Yardimci ve pozitif ol.',
  professional: 'Profesyonel, kibar ve bilgilendirici bir tonda yaz. Is odakli ol.',
  luxury: 'Zarif, ozenli ve rafine bir dilde yaz. Premium hizmet algisi yarat.',
  sales: 'Enerjik, ikna edici ve cozum odakli yaz. Faydaya odaklan.',
}

export function buildSystemPrompt(
  pack: PackContext | null,
  conversation: ConversationContext
): string {
  const parts: string[] = []

  // Identity
  const biz = pack?.businessName || 'the business'
  parts.push(`You are a WhatsApp customer service assistant for ${biz}.`)
  if (pack?.websiteUrl) parts.push(`Website: ${pack.websiteUrl}`)
  if (pack?.industry) parts.push(`Industry: ${pack.industry}`)

  // Language
  const lang = pack?.language === 'en' ? 'English' : 'Turkish'
  parts.push(`\nAlways respond in ${lang}.`)

  // Tone
  const tone = TONE_MAP[pack?.tonePreset || 'professional'] || TONE_MAP.professional
  parts.push(tone)
  if (pack?.formality === 'sen') {
    parts.push('Use informal "sen" form.')
  } else {
    parts.push('Use formal "siz" form.')
  }
  if (pack?.useEmoji) {
    parts.push('You may use emojis sparingly.')
  } else {
    parts.push('Do not use emojis.')
  }

  // Response format
  const maxLen = pack?.maxResponseLen || 4
  parts.push(`\nKeep responses under ${maxLen} sentences. Be concise and helpful.`)

  // Custom instructions
  if (pack?.customInstructions) {
    parts.push(`\nAdditional instructions: ${pack.customInstructions}`)
  }

  // Safety rules
  parts.push(`
IMPORTANT RULES:
- Only answer based on verified information about this business. If unsure, say so.
- Never invent prices, dates, stock, addresses, hours, or policies. If the fact is not given to you, state that you will check and have a colleague follow up.
- Never share competitor information or speculate about third parties.
- If the customer is upset, mentions legal issues, asks for a refund, or requests a human, offer to connect them to a representative.
- Prefer ONE focused question over multiple. Never ask more than one question per message.
- Keep answers tight. Avoid filler, apologies, and restating the question.`)

  // Contact context
  if (conversation.contactName) {
    parts.push(`\nYou are speaking with: ${conversation.contactName}`)
  }

  return parts.join('\n')
}

/**
 * Build the messages array for Claude from recent conversation history.
 * Returns alternating user/assistant messages.
 */
export function buildMessages(
  conversation: ConversationContext,
  currentMessage: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const msgs: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Add recent history (last N messages, skip internal notes)
  for (const m of conversation.recentMessages) {
    if (!m.body) continue
    if (m.direction === 'inbound') {
      msgs.push({ role: 'user', content: m.body })
    } else if (m.sender === 'ai' || m.sender === 'agent') {
      msgs.push({ role: 'assistant', content: m.body })
    }
  }

  // Add current message
  msgs.push({ role: 'user', content: currentMessage })

  // Claude requires alternating roles — merge consecutive same-role messages
  const merged: typeof msgs = []
  for (const m of msgs) {
    if (merged.length > 0 && merged[merged.length - 1].role === m.role) {
      merged[merged.length - 1].content += '\n' + m.content
    } else {
      merged.push({ ...m })
    }
  }

  // Claude requires first message to be 'user'
  if (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift()
  }

  return merged
}

// ─── Phase 2: Structured Output ──────────────────────────────────
//
// Request AI to return a JSON envelope so we can route on intent,
// confidence, and suggested actions — without losing plain-text UX.

const STRUCTURED_INSTRUCTIONS = `
RESPONSE FORMAT — STRICT:
Reply ONLY with a single JSON object, no prose before or after. Schema:
{
  "intent": "info" | "booking" | "pricing" | "complaint" | "greeting" | "unclear" | "off_topic" | "handoff_request",
  "confidence": 0-100,
  "response": "the exact message to send to the customer (same language as customer, obeying tone/length rules)",
  "action_hint": null | {
    "name": "create_lead" | "request_date" | "escalate_to_agent",
    "params": { ...relevant fields you were able to gather (name, phone, date, topic, reason) }
  },
  "needs_info": [] | ["name" | "phone" | "email" | "date" | "topic"]
}
Rules:
- "response" must NOT contain the JSON itself. Keep it natural.
- Set confidence honestly: low (<50) when you are unsure or lack info; high (>80) only for clear, well-grounded answers.
- Set action_hint only when the conversation clearly warrants it (booking → request_date, qualified lead → create_lead, frustrated/legal/refund → escalate_to_agent).
- If the customer's request is outside scope or data, set intent to "off_topic" or "unclear" and ask ONE clarifying question in "response".`

export function buildStructuredSystemPrompt(
  pack: PackContext | null,
  conversation: ConversationContext,
  knowledgeSnippets?: string[],
): string {
  let base = buildSystemPrompt(pack, conversation)
  if (knowledgeSnippets && knowledgeSnippets.length > 0) {
    base += `\n\nKNOWN FACTS (use only these for business-specific answers; if a fact is not here, say you'll check):\n- ${knowledgeSnippets.slice(0, 6).join('\n- ')}`
  }
  return base + '\n' + STRUCTURED_INSTRUCTIONS
}

export interface StructuredAIResponse {
  intent: string
  confidence: number
  response: string
  action_hint: { name: string; params: Record<string, any> } | null
  needs_info: string[]
}

export function parseStructuredResponse(raw: string): StructuredAIResponse | null {
  if (!raw) return null
  // Find first {...} block tolerantly
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const obj = JSON.parse(match[0])
    if (typeof obj.response !== 'string' || !obj.response.trim()) return null
    return {
      intent: typeof obj.intent === 'string' ? obj.intent : 'unclear',
      confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(100, obj.confidence)) : 50,
      response: obj.response.trim(),
      action_hint: obj.action_hint && typeof obj.action_hint.name === 'string'
        ? { name: obj.action_hint.name, params: obj.action_hint.params || {} }
        : null,
      needs_info: Array.isArray(obj.needs_info) ? obj.needs_info.filter((x: any) => typeof x === 'string') : [],
    }
  } catch {
    return null
  }
}
