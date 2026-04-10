import type { ClientPack, ActionDefinition } from '@prisma/client'

/**
 * Build the system prompt from Client Pack configuration
 * Assembles: identity, tone, knowledge context, actions, and decision instructions
 */
export function buildPrompt(
  pack: ClientPack | null,
  knowledgeContext: string,
  actions: ActionDefinition[],
  conversationHistory: Array<{ role: string; content: string }>
): string {
  if (pack?.compiledPrompt) return pack.compiledPrompt

  const sections: string[] = []

  // 1. Identity
  sections.push(`# Identity
You are an AI assistant for ${pack?.businessName || 'the business'}.
${pack?.websiteUrl ? `Website: ${pack.websiteUrl}` : ''}
Industry: ${pack?.industry || 'general'}
Language: ${pack?.language === 'tr' ? 'Turkish (Türkçe)' : 'English'}`)

  // 2. Tone & Style
  const toneInstructions: Record<string, string> = {
    friendly: 'Be warm, approachable, and conversational. Use a casual but respectful tone.',
    professional: 'Be polite, concise, and informative. Maintain a business-appropriate tone.',
    luxury: 'Be elegant, refined, and attentive. Use sophisticated language that reflects premium service.',
    sales: 'Be enthusiastic, persuasive, and solution-oriented. Focus on benefits and value.',
  }

  sections.push(`# Tone & Style
${toneInstructions[pack?.tonePreset || 'professional']}
- Address the customer using "${pack?.formality === 'sen' ? 'sen' : 'siz'}" form
- ${pack?.useEmoji ? 'Use emojis sparingly to add warmth' : 'Do not use emojis'}
- Keep responses under ${pack?.maxResponseLen || 4} sentences
${pack?.customInstructions ? `\nAdditional instructions: ${pack.customInstructions}` : ''}`)

  // 3. Knowledge Context
  if (knowledgeContext) {
    sections.push(`# Knowledge Base
Use the following information to answer questions. Only use this knowledge — do not make up information.
If you don't know the answer, say so honestly.

${knowledgeContext}`)
  }

  // 4. Available Actions
  if (actions.length > 0) {
    const actionList = actions.map(a =>
      `- ${a.name}: ${a.description || a.displayName || a.name}`
    ).join('\n')

    sections.push(`# Available Actions
You can trigger these actions when appropriate:
${actionList}

To trigger an action, include it in your JSON decision response.`)
  }

  // 5. Decision Format
  sections.push(`# Response Format
You MUST respond with a JSON object in this format:
{
  "decision": "answer" | "ask" | "collect" | "refuse" | "escalate" | "action",
  "confidence": 0-100,
  "intent": "FAQ" | "PRICING" | "PRODUCT" | "APPOINTMENT" | "COMPLAINT" | "GREETING" | "OTHER",
  "response": "your response text to the customer",
  "action": { "name": "action_name", "params": {} } or null
}

Decision rules:
- "answer": if you found relevant info and confidence > 60
- "ask": if the question is ambiguous and you need 1 clarification
- "collect": if you need customer information before proceeding
- "refuse": if the question violates business policies
- "escalate": if you cannot help after the conversation context shows multiple attempts
- "action": if the customer's request maps to an available action`)

  return sections.join('\n\n')
}

/**
 * Build Claude tool definitions from action registry
 */
export function buildToolDefinitions(actions: ActionDefinition[]): Array<{
  name: string
  description: string
  input_schema: any
}> {
  return actions.map(a => ({
    name: a.name,
    description: a.description || a.displayName || a.name,
    input_schema: a.parameterSchema as any,
  }))
}
