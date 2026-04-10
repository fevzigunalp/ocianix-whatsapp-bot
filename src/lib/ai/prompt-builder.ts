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
- Only answer based on what you know about this business.
- If you don't have specific information, say so honestly. Suggest the customer contact a representative for details.
- Never invent prices, dates, or facts you don't know.
- Never share competitor information.
- If the customer seems upset or mentions legal issues, politely offer to connect them with a human representative.
- If you cannot help after 2 attempts, suggest human assistance.`)

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
