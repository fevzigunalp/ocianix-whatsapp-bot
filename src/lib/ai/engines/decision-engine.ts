import { db } from '@/lib/db'
import { redis, tenantKey } from '@/lib/redis'
import { evaluatePolicies, type PolicyResult } from './policy-engine'
import { executeAction, type ActionResult } from './action-engine'
import { retrieveKnowledge } from './knowledge-engine'
import { buildSystemPrompt } from '../prompt-builder'

export interface AIDecision {
  decision: 'answer' | 'ask' | 'collect' | 'refuse' | 'escalate' | 'action'
  confidence: number
  intent: string
  responseText: string
  actionName: string | null
  actionParams: Record<string, any> | null
  collectFields: string[] | null
  escalationReason: string | null
  sourcesUsed: string[]
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number
}

interface DecisionContext {
  tenantId: string
  conversationId: string
  contactId: string
  messageId: string
  message: string
  conversationHistory: Array<{ role: string; content: string }>
}

/**
 * AI Decision Engine — 5-stage pipeline:
 * [1] Policy pre-check
 * [2] FAQ exact match
 * [3] RAG + Claude
 * [4] Post-policy check
 * [5] Confidence gate
 */
export async function processMessage(ctx: DecisionContext): Promise<AIDecision> {
  const startTime = Date.now()

  // Load client pack
  const pack = await db.clientPack.findFirst({
    where: { tenantId: ctx.tenantId, status: 'active' },
    orderBy: { version: 'desc' },
  })

  const confidenceThreshold = pack?.confidenceThreshold || 60

  // [1] POLICY PRE-CHECK (no AI — rules only)
  const preCheck = await evaluatePolicies(ctx.message, 'pre_response', null, ctx.tenantId)

  if (preCheck.outcome === 'block') {
    return makeDecision('refuse', 95, 'POLICY', preCheck.responseOverride || '', null, null, null, null, [], startTime)
  }
  if (preCheck.outcome === 'escalate') {
    return makeDecision('escalate', 95, 'ESCALATION', preCheck.responseOverride || '', null, null, null, 'Policy triggered', [], startTime)
  }
  if (preCheck.outcome === 'collect') {
    const collectMsg = buildCollectMessage(preCheck.collectFields || [])
    return makeDecision('collect', 90, 'COLLECT', collectMsg, null, null, preCheck.collectFields || null, null, [], startTime)
  }

  // [2] FAQ EXACT MATCH (vector similarity — high threshold)
  const knowledge = await retrieveKnowledge(ctx.message, ctx.tenantId, 5)
  const faqMatch = knowledge.find(k => k.category === 'faq' && k.finalScore > 0.92 * 1.3) // FAQ with very high score
  if (faqMatch) {
    const answer = faqMatch.content.split('\nA: ')[1] || faqMatch.content
    return makeDecision('answer', 95, 'FAQ', answer, null, null, null, null, [faqMatch.pageTitle || ''], startTime)
  }

  // [3] RAG + CLAUDE (full AI pipeline)
  const knowledgeContext = knowledge.map(k => k.content).join('\n\n---\n\n')
  const sourcesUsed = knowledge.map(k => k.pageTitle || k.source.sourceName).filter(Boolean)

  // Load action definitions for tool use
  const actions = await db.actionDefinition.findMany({
    where: { tenantId: ctx.tenantId, isEnabled: true },
  })

  const prompt = buildSystemPrompt(
    pack ? {
      businessName: pack.businessName, industry: pack.industry, websiteUrl: pack.websiteUrl,
      tonePreset: pack.tonePreset, formality: pack.formality, useEmoji: pack.useEmoji,
      maxResponseLen: pack.maxResponseLen, customInstructions: pack.customInstructions,
      language: pack.language,
    } : null,
    { contactName: null, contactPhone: '', recentMessages: [] }
  )

  // Call Claude API
  let aiDecision: AIDecision
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Fallback without API key
      aiDecision = makeDecision('answer', 50, 'OTHER', 'AI sistemi şu anda yapılandırılıyor. Lütfen daha sonra tekrar deneyin.', null, null, null, null, [], startTime)
    } else {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: prompt,
          messages: [
            ...ctx.conversationHistory.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
            { role: 'user', content: ctx.message },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`)
      }

      const result = await response.json()
      const text = result.content?.[0]?.text || ''
      const usage = result.usage || {}

      // Try to parse structured decision from Claude
      const parsed = parseDecision(text)

      aiDecision = {
        ...parsed,
        sourcesUsed,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        latencyMs: Date.now() - startTime,
      }
    }
  } catch (error: any) {
    console.error('[AI Decision Engine] Claude error:', error)
    aiDecision = makeDecision('answer', 30, 'OTHER', 'Bir hata oluştu. Sizi bir temsilcimize aktarıyorum.', null, null, null, null, sourcesUsed, startTime)
  }

  // [4] POST-POLICY CHECK (on AI response)
  const postCheck = await evaluatePolicies(ctx.message, 'post_response', aiDecision.responseText, ctx.tenantId)
  if (postCheck.outcome === 'block') {
    aiDecision.responseText = postCheck.responseOverride || 'Bu konuda size yardımcı olamıyorum.'
    aiDecision.decision = 'refuse'
  }
  if (postCheck.outcome === 'modify' && postCheck.policyType === 'inform') {
    // Append disclaimer (would load from policy rule text)
  }

  // [5] CONFIDENCE GATE
  if (aiDecision.confidence < confidenceThreshold) {
    aiDecision.responseText = 'Bu konuda size daha iyi yardımcı olabilmem için bir temsilcimize aktarıyorum.'
    aiDecision.decision = 'escalate'
    aiDecision.escalationReason = `Low confidence: ${aiDecision.confidence}`
  }

  // Execute action if decided
  if (aiDecision.decision === 'action' && aiDecision.actionName) {
    const actionResult = await executeAction(
      aiDecision.actionName,
      aiDecision.actionParams || {},
      {
        tenantId: ctx.tenantId,
        conversationId: ctx.conversationId,
        contactId: ctx.contactId,
      }
    )
    if (actionResult.status !== 'success') {
      aiDecision.responseText += '\n(İşlem gerçekleştirilemedi, temsilcimiz size yardımcı olacak.)'
    }
  }

  // Log AI decision
  await db.aiLog.create({
    data: {
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      intent: aiDecision.intent,
      confidence: aiDecision.confidence,
      decision: aiDecision.decision,
      actionName: aiDecision.actionName,
      inputTokens: aiDecision.inputTokens,
      outputTokens: aiDecision.outputTokens,
      latencyMs: aiDecision.latencyMs,
      packVersion: pack?.version,
      sourcesUsed: aiDecision.sourcesUsed,
    },
  })

  // Log cost
  if (aiDecision.inputTokens || aiDecision.outputTokens) {
    await db.costEvent.create({
      data: {
        tenantId: ctx.tenantId,
        eventType: 'ai_call',
        tokensInput: aiDecision.inputTokens || 0,
        tokensOutput: aiDecision.outputTokens || 0,
        estimatedCostUsd: calculateCost(aiDecision.inputTokens || 0, aiDecision.outputTokens || 0),
        metadata: { model: 'claude-sonnet-4', intent: aiDecision.intent },
      },
    })
  }

  return aiDecision
}

function makeDecision(
  decision: AIDecision['decision'],
  confidence: number,
  intent: string,
  responseText: string,
  actionName: string | null,
  actionParams: Record<string, any> | null,
  collectFields: string[] | null,
  escalationReason: string | null,
  sourcesUsed: string[],
  startTime: number
): AIDecision {
  return {
    decision,
    confidence,
    intent,
    responseText,
    actionName,
    actionParams,
    collectFields,
    escalationReason,
    sourcesUsed,
    latencyMs: Date.now() - startTime,
  }
}

function parseDecision(text: string): Omit<AIDecision, 'sourcesUsed' | 'inputTokens' | 'outputTokens' | 'latencyMs'> {
  // Try to parse JSON from Claude response
  try {
    const jsonMatch = text.match(/\{[\s\S]*"decision"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        decision: parsed.decision || 'answer',
        confidence: parsed.confidence || 70,
        intent: parsed.intent || 'OTHER',
        responseText: parsed.response || parsed.response_text || text,
        actionName: parsed.action?.name || null,
        actionParams: parsed.action?.params || null,
        collectFields: parsed.collect_fields || null,
        escalationReason: parsed.escalation_reason || null,
      }
    }
  } catch {
    // Not JSON — use as plain text response
  }

  return {
    decision: 'answer',
    confidence: 70,
    intent: 'OTHER',
    responseText: text,
    actionName: null,
    actionParams: null,
    collectFields: null,
    escalationReason: null,
  }
}

function buildCollectMessage(fields: string[]): string {
  const fieldNames: Record<string, string> = {
    name: 'adınız',
    phone: 'telefon numaranız',
    email: 'email adresiniz',
    city: 'şehriniz',
  }
  const fieldList = fields.map(f => fieldNames[f] || f).join(' ve ')
  return `Size yardımcı olabilmem için ${fieldList} bilgisini paylaşır mısınız?`
}

function calculateCost(inputTokens: number, outputTokens: number): number {
  // Claude Sonnet 4 pricing
  return (inputTokens * 0.003 + outputTokens * 0.015) / 1000
}
