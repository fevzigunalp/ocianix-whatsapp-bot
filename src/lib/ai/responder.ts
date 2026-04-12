/**
 * AI Auto Reply Engine v1
 *
 * Triggered by webhook after an inbound message is stored.
 * Decides whether to respond, builds prompt, calls AI, sends reply.
 *
 * Flow:
 *   inbound msg stored → shouldRespond() → acquireLock() → debounce()
 *   → loadContext() → buildPrompt() → callAI() → sendReply() → logResult()
 */

import { db } from '@/lib/db'
import { redis, tenantKey } from '@/lib/redis'
import { evolutionAPI } from '@/lib/evolution'
import { publishSSE } from '@/lib/sse'
import { callAI, type AIResponse } from './provider'
import {
  buildStructuredSystemPrompt,
  buildMessages,
  parseStructuredResponse,
  type StructuredAIResponse,
} from './prompt-builder'
import { evaluatePolicies } from './engines/policy-engine'
import { executeAction, ensureDefaultActions } from './engines/action-engine'
import { retrieveKnowledgeWithMeta } from './engines/knowledge-engine'
import { validateResponse, buildStrictCorrection, type FaithfulnessResult } from './faithfulness-check'
import {
  INITIAL_SALES_FLOW,
  classifySignal,
  advanceState,
  buildSalesGuidance,
  isReadyForLead,
  buildLeadParams,
  type SalesFlow,
} from './sales/sales-engine'
import { formatPhone } from '@/lib/utils'

const DEBOUNCE_MS = 2000 // Wait 2s after last message before responding
const LOCK_TTL_S = 30 // Lock expires after 30s (safety net)
const HISTORY_LIMIT = 10 // Last N messages for context

const FALLBACK_REPLY = 'Mesajiniz alindi. Size en kisa surede donecegiz. Tesekkurler.'

interface TriggerInput {
  tenantId: string
  conversationId: string
  contactId: string
  messageId: string
  messageBody: string
  instanceId: string
}

/**
 * Main entry point — called from webhook after inbound message is stored.
 * Runs in background (non-blocking to webhook response).
 */
export async function triggerAIResponse(input: TriggerInput): Promise<void> {
  const tag = `[AI:${input.conversationId.slice(0, 8)}]`

  try {
    // 1. Check eligibility
    const eligible = await shouldRespond(input)
    if (!eligible.ok) {
      console.log(tag, 'Skip:', eligible.reason)
      return
    }

    // 2. Acquire lock (prevent duplicate AI runs)
    const lockKey = tenantKey(input.tenantId, 'ai_lock', input.conversationId)
    const locked = await redis.set(lockKey, '1', 'EX', LOCK_TTL_S, 'NX')
    if (!locked) {
      console.log(tag, 'Skip: already processing')
      return
    }

    // 3. Debounce — wait for burst messages to settle
    await new Promise(r => setTimeout(r, DEBOUNCE_MS))

    // Check if newer messages arrived during debounce
    const newestMsg = await db.message.findFirst({
      where: { conversationId: input.conversationId, direction: 'inbound' },
      orderBy: { createdAt: 'desc' },
    })
    if (newestMsg && newestMsg.id !== input.messageId) {
      console.log(tag, 'Skip: newer inbound arrived, that one will trigger AI')
      await redis.del(lockKey)
      return
    }

    console.log(tag, 'Processing...')

    // 4. Load context
    const context = await loadContext(input)
    if (!context) {
      console.log(tag, 'Skip: failed to load context')
      await redis.del(lockKey)
      return
    }

    // 5. PRE-RESPONSE POLICY CHECK (Phase 2)
    const preCheck = await evaluatePolicies(input.messageBody, 'pre_response', null, input.tenantId)
    if (preCheck.outcome !== 'pass') {
      console.log(tag, 'Policy pre-check:', preCheck.outcome, preCheck.policyType)
      const override = await handlePolicyOutcome(input, preCheck, tag)
      if (override.handled) {
        await logAIResult(
          input, null, override.replyText,
          override.outcome === 'escalate' ? 'error' : 'fallback',
          `policy_${preCheck.policyType}`, context.packVersion,
          { intent: 'POLICY', confidence: 95, decision: override.outcome, actionName: override.actionName }
        )
        await redis.del(lockKey)
        console.log(tag, 'Done (policy)')
        return
      }
    }

    // 6a. Knowledge retrieval (Phase 2.3/2.4 — vector-first RAG)
    const retrieval = await retrieveKnowledgeWithMeta(input.messageBody, input.tenantId, 5).catch(err => {
      console.error(tag, 'Knowledge retrieval failed:', err.message)
      return { chunks: [], meta: { type: 'none' as const, scores: [] } }
    })
    const knowledge = retrieval.chunks
    const retrievalType = retrieval.meta.type
    const similarityScores = retrieval.meta.scores
    const snippets = knowledge.map(k => ({
      id: k.id,
      kind: (k.category === 'faq' ? 'faq' : 'chunk') as 'faq' | 'chunk',
      title: k.pageTitle,
      content: k.content,
      score: k.finalScore,
    }))
    const sourcesUsed = knowledge.map(k => k.pageTitle || k.source.sourceName).filter(Boolean) as string[]
    const faqIds = snippets.filter(s => s.kind === 'faq').map(s => s.id)
    const chunkIds = snippets.filter(s => s.kind === 'chunk').map(s => s.id)
    if (snippets.length > 0) {
      console.log(tag, `Knowledge[${retrievalType}]: ${faqIds.length} FAQ + ${chunkIds.length} chunks (top sim ${similarityScores[0]?.toFixed(3)})`)
    } else {
      console.log(tag, `Knowledge[${retrievalType}]: no matches — strict grounding mode`)
    }

    // 6a'. FAQ SHORT-CIRCUIT (Step 2 — pipeline lock; patched for safety).
    //
    // Two modes, strictly different rules:
    //   - retrievalType === 'vector': a genuine cosine score is available,
    //     so "similarity >= 0.88" is trustworthy.
    //   - retrievalType === 'text': similarity is a *placeholder* (0.9 for
    //     FAQs in the fallback path), so it would short-circuit on any
    //     first-word hit. That's too risky. In this mode we ONLY allow the
    //     short-circuit when the user's message normalizes to exactly the
    //     same string as the matched FAQ question.
    //   - retrievalType === 'none': never short-circuit.
    const FAQ_SHORTCIRCUIT_THRESHOLD = 0.88
    const topK = knowledge[0]
    const topSim = similarityScores[0] ?? 0
    const normalized = normalizeForLexicalMatch(input.messageBody)
    const faqQuestionNormalized = topK?.pageTitle ? normalizeForLexicalMatch(topK.pageTitle) : null
    const faqExactLexical = !!(
      topK && topK.category === 'faq' && faqQuestionNormalized && normalized === faqQuestionNormalized
    )
    let faqShortReason: 'vector_high_sim' | 'text_exact_lexical' | null = null
    if (topK && topK.category === 'faq') {
      if (retrievalType === 'vector' && topSim >= FAQ_SHORTCIRCUIT_THRESHOLD) {
        faqShortReason = 'vector_high_sim'
      } else if (retrievalType === 'text' && faqExactLexical) {
        faqShortReason = 'text_exact_lexical'
      }
    }
    const faqShort = faqShortReason !== null
    const faqShortInfo = faqShort && topK
      ? {
          faqId: topK.id,
          similarity: retrievalType === 'vector' ? Number(topSim.toFixed(4)) : null,
          title: topK.pageTitle,
          reason: faqShortReason,
          retrievalType,
        }
      : null
    if (faqShort) {
      console.log(tag, `FAQ short-circuit ALLOWED (${faqShortReason}, mode=${retrievalType}): id=${topK!.id} — skipping AI call`)
    } else if (topK && topK.category === 'faq') {
      const why =
        retrievalType === 'vector'
          ? `sim=${topSim.toFixed(3)} < ${FAQ_SHORTCIRCUIT_THRESHOLD}`
          : retrievalType === 'text'
            ? 'no exact lexical match (text fallback requires normalized equality)'
            : 'retrieval=none'
      console.log(tag, `FAQ short-circuit DENIED (mode=${retrievalType}): ${why}`)
    }

    // 6b. Sales flow state (Phase 3.0)
    const prevFlow: SalesFlow = readSalesFlow(context.conversationMetadata)
    const signal = classifySignal(input.messageBody, prevFlow)
    const nextFlow = advanceState(prevFlow, signal)
    const salesGuidance = buildSalesGuidance(nextFlow)
    if (signal.type !== 'knowledge' && signal.type !== 'unclear') {
      console.log(tag, `Sales signal=${signal.type} stage=${prevFlow.stage}->${nextFlow.stage}`)
    }

    // 6c. Build prompt (structured output + grounded facts + sales guidance)
    // Skipped entirely on FAQ short-circuit.
    let systemPrompt = ''
    const messages = buildMessages(context.conversation, input.messageBody)

    let replyText: string
    let status: 'success' | 'fallback' | 'error'
    let errorMsg: string | null = null
    let structured: StructuredAIResponse | null = null
    let aiResult: AIResponse | null = null

    if (faqShort && topK) {
      // Serve the FAQ answer verbatim. Content is stored as "Q: ...\nA: ...".
      replyText = extractFaqAnswer(topK.content)
      status = 'success'
      console.log(tag, `FAQ answer: ${replyText.substring(0, 80)}`)
    } else {
      systemPrompt = buildStructuredSystemPrompt(
        context.pack,
        context.conversation,
        snippets,
        salesGuidance,
      )

      // 7. Call AI
      aiResult = await callAI(systemPrompt, messages)

      if (aiResult && aiResult.text.trim()) {
        structured = parseStructuredResponse(aiResult.text)
        if (structured) {
          replyText = structured.response
          status = 'success'
          console.log(tag, `AI [${structured.intent} ${structured.confidence}%]:`, replyText.substring(0, 80))
        } else {
          // Model didn't follow JSON format — use raw text as fallback so user still gets a reply
          replyText = aiResult.text.trim()
          status = 'success'
          console.log(tag, 'AI (unstructured):', replyText.substring(0, 80))
        }
      } else {
        replyText = FALLBACK_REPLY
        status = aiResult ? 'fallback' : 'error'
        errorMsg = aiResult ? 'Empty AI response' : 'AI provider unavailable'
        console.log(tag, 'Using fallback:', errorMsg)
      }
    }

    // 8. POST-RESPONSE POLICY CHECK (Phase 2)
    const postCheck = await evaluatePolicies(input.messageBody, 'post_response', replyText, input.tenantId)
    if (postCheck.outcome === 'block') {
      console.log(tag, 'Policy post-check blocked response')
      replyText = postCheck.responseOverride || FALLBACK_REPLY
      status = 'fallback'
      errorMsg = `post_policy_${postCheck.policyType}`
    }

    // 8b. Faithfulness guardrail (Phase 2.7) — only inspect genuine AI replies.
    // Skipped on FAQ short-circuit: the reply IS the verified source.
    let faithfulness: FaithfulnessResult = { pass: true, violations: [], unsupportedNumbers: [], unsupportedUrls: [], unsupportedPhones: [] }
    let retried = false
    if (!faqShort && status === 'success' && structured) {
      const sourceTexts = knowledge.map(k => k.content)
      faithfulness = validateResponse(replyText, sourceTexts)
      if (!faithfulness.pass) {
        console.log(tag, 'Faithfulness FAIL:', faithfulness.violations, {
          n: faithfulness.unsupportedNumbers, u: faithfulness.unsupportedUrls, p: faithfulness.unsupportedPhones,
        })
        // One strict retry with correction addendum
        retried = true
        const correctedPrompt = systemPrompt + '\n\n' + buildStrictCorrection(faithfulness)
        const retryResult = await callAI(correctedPrompt, messages)
        const retryStructured = retryResult && retryResult.text.trim() ? parseStructuredResponse(retryResult.text) : null
        const retryText = retryStructured?.response || retryResult?.text?.trim() || ''
        if (retryText) {
          const retryCheck = validateResponse(retryText, sourceTexts)
          if (retryCheck.pass) {
            replyText = retryText
            structured = retryStructured || structured
            faithfulness = retryCheck
            console.log(tag, 'Faithfulness retry OK')
          } else {
            // Still unsafe → escalate with canned reply and human handoff
            console.log(tag, 'Faithfulness retry FAIL → escalate')
            faithfulness = retryCheck
            replyText = 'Bu bilgiyi kontrol edip en kısa sürede bir temsilcimiz sizi arayacak. Tesekkurler.'
            status = 'fallback'
            errorMsg = 'faithfulness_violation'
            await db.conversation.update({
              where: { id: input.conversationId },
              data: { handlerType: 'human', aiEnabled: false },
            }).catch(() => {})
          }
        } else {
          console.log(tag, 'Faithfulness retry empty → escalate')
          replyText = 'Bu bilgiyi kontrol edip en kısa sürede bir temsilcimiz sizi arayacak. Tesekkurler.'
          status = 'fallback'
          errorMsg = 'faithfulness_retry_empty'
          await db.conversation.update({
            where: { id: input.conversationId },
            data: { handlerType: 'human', aiEnabled: false },
          }).catch(() => {})
        }
      }
    }

    // 9. Apply confidence gate + action execution (Phase 2.2)
    // On FAQ short-circuit: decision is a deterministic "answer"; actions are skipped.
    const actionHint = structured?.action_hint || null
    const threshold = context.pack?.confidenceThreshold ?? 60
    const decision = faqShort ? 'answer' : resolveDecision(structured, status, actionHint, threshold)
    let executedActionName: string | null = null

    if (!faqShort && actionHint && status === 'success' && structured) {
      const conf = structured.confidence
      if (conf < Math.max(threshold, 60)) {
        console.log(tag, `Action skipped (low confidence ${conf} < ${threshold}):`, actionHint.name)
      } else {
        const dedupKey = tenantKey(input.tenantId, 'action_done', input.messageId, actionHint.name)
        const first = await redis.set(dedupKey, '1', 'EX', 600, 'NX')
        if (!first) {
          console.log(tag, 'Action skipped (duplicate):', actionHint.name)
        } else {
          await ensureDefaultActions(input.tenantId)
          console.log(tag, 'Executing action:', actionHint.name, actionHint.params)
          const result = await executeAction(actionHint.name, actionHint.params || {}, {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            contactId: input.contactId,
          })
          console.log(tag, 'Action result:', result.status, result.error || '')
          if (result.status === 'success') {
            executedActionName = actionHint.name
          } else {
            await redis.del(dedupKey).catch(() => {})
          }
        }
      }
    }

    // If decision escalates but no handoff action was executed, still flip conversation to human
    if (decision === 'escalate' && status === 'success' && executedActionName !== 'escalate_to_agent' && executedActionName !== 'handoff') {
      await db.conversation.update({
        where: { id: input.conversationId },
        data: { handlerType: 'human', aiEnabled: false },
      }).catch(() => {})
    }

    // 10. Send reply via existing outbound pipeline
    await sendReply(input, replyText, tag)

    // 10b. Persist updated sales flow on the conversation (Phase 3.0)
    if (nextFlow !== prevFlow) {
      const mergedMetadata = { ...(context.conversationMetadata || {}), salesFlow: nextFlow as any }
      await db.conversation.update({
        where: { id: input.conversationId },
        data: { metadata: mergedMetadata as any },
      }).catch(err => console.error(tag, 'Sales state persist failed:', err.message))
    }

    // 10c. Lead-ready → fire create_lead via existing action engine (once per conversation)
    if (isReadyForLead(nextFlow) && status === 'success') {
      const leadDedup = tenantKey(input.tenantId, 'sales_lead', input.conversationId)
      const first = await redis.set(leadDedup, '1', 'EX', 86400, 'NX')
      if (first) {
        await ensureDefaultActions(input.tenantId)
        const leadParams = buildLeadParams(nextFlow, context.contactName)
        const leadResult = await executeAction('create_lead', leadParams, {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          contactId: input.contactId,
        })
        console.log(tag, 'Sales lead action:', leadResult.status, leadResult.error || '')
        if (leadResult.status !== 'success') {
          await redis.del(leadDedup).catch(() => {})
        } else if (!executedActionName) {
          executedActionName = 'create_lead'
        }
      } else {
        console.log(tag, 'Sales lead skipped (already created for this conversation)')
      }
    }

    // 11. Log with intent/decision/action
    await logAIResult(input, aiResult, replyText, status, errorMsg, context.packVersion, {
      intent: faqShort ? 'FAQ' : (structured?.intent || null),
      confidence: faqShort
        ? 95
        : (structured?.confidence ?? (status === 'success' ? 70 : status === 'fallback' ? 30 : 0)),
      decision,
      actionName: executedActionName || actionHint?.name || null,
      needsInfo: structured?.needs_info || [],
      sourcesUsed,
      faqIdsUsed: faqIds,
      chunkIdsUsed: chunkIds,
      retrievalType,
      similarityScores,
      faithfulnessPass: faithfulness.pass,
      faithfulnessViolations: faithfulness.violations,
      faithfulnessRetried: retried,
      salesStage: nextFlow.stage,
      salesSignal: signal.type,
      shortCircuit: faqShort ? 'faq' : null,
      shortCircuitInfo: faqShortInfo,
    })

    // 9. Release lock
    await redis.del(lockKey)
    console.log(tag, 'Done')

  } catch (err: any) {
    console.error(tag, 'Unhandled error:', err.message)
    // Release lock on error
    const lockKey = tenantKey(input.tenantId, 'ai_lock', input.conversationId)
    await redis.del(lockKey).catch(() => {})
    // Log error
    await logAIResult(input, null, '', 'error', err.message, null).catch(() => {})
  }
}

// ─── Eligibility ───────────────────────────────────────────────

async function shouldRespond(input: TriggerInput): Promise<{ ok: boolean; reason?: string }> {
  const conversation = await db.conversation.findFirst({
    where: { id: input.conversationId },
  })

  if (!conversation) return { ok: false, reason: 'conversation not found' }
  if (!conversation.aiEnabled) return { ok: false, reason: 'ai_enabled=false' }
  if (conversation.handlerType === 'human') return { ok: false, reason: 'handler=human' }
  if (conversation.status === 'resolved' || conversation.status === 'closed') {
    return { ok: false, reason: `status=${conversation.status}` }
  }

  // Check cooldown — don't respond more than once per 8 seconds
  const cooldownKey = tenantKey(input.tenantId, 'ai_cooldown', input.conversationId)
  const onCooldown = await redis.get(cooldownKey)
  if (onCooldown) return { ok: false, reason: 'cooldown active' }
  await redis.set(cooldownKey, '1', 'EX', 8)

  return { ok: true }
}

// ─── Context Loading ───────────────────────────────────────────

async function loadContext(input: TriggerInput) {
  // Load client pack
  const pack = await db.clientPack.findFirst({
    where: { tenantId: input.tenantId, status: 'active' },
    orderBy: { version: 'desc' },
  })

  // Load contact
  const contact = await db.contact.findUnique({
    where: { id: input.contactId },
  })

  // Load conversation metadata (carries salesFlow)
  const conversationRow = await db.conversation.findUnique({
    where: { id: input.conversationId },
    select: { metadata: true },
  })

  // Load recent messages
  const recentMessages = await db.message.findMany({
    where: {
      conversationId: input.conversationId,
      isInternal: false,
    },
    orderBy: { createdAt: 'asc' },
    take: HISTORY_LIMIT,
    select: { direction: true, sender: true, body: true, createdAt: true },
  })

  return {
    pack: pack ? {
      businessName: pack.businessName,
      industry: pack.industry,
      websiteUrl: pack.websiteUrl,
      tonePreset: pack.tonePreset,
      formality: pack.formality,
      useEmoji: pack.useEmoji,
      maxResponseLen: pack.maxResponseLen,
      customInstructions: pack.customInstructions,
      language: pack.language,
      confidenceThreshold: pack.confidenceThreshold,
    } : null,
    conversation: {
      contactName: contact?.name || null,
      contactPhone: contact?.phone || '',
      recentMessages,
    },
    conversationMetadata: (conversationRow?.metadata as Record<string, any>) || {},
    contactName: contact?.name || null,
    packVersion: pack?.version || null,
  }
}

/**
 * Knowledge-engine stores FAQ content as "Q: <question>\nA: <answer>".
 * Extract the answer portion for short-circuit replies; fall back to full
 * content if the format is unexpected.
 */
/**
 * Normalize a string for deterministic FAQ-question matching:
 * lowercase, fold Turkish diacritics, strip punctuation, collapse whitespace.
 * Used only by the text-fallback short-circuit path where cosine similarity
 * is a placeholder and we require an exact lexical match instead.
 */
function normalizeForLexicalMatch(s: string): string {
  // NFKD + strip combining marks handles ü/ö/ç/ş/ğ/İ (İ -> I + U+0307).
  // Explicit ı -> i is still needed because dotless i is a base letter,
  // not a decomposable form.
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractFaqAnswer(content: string): string {
  const idx = content.indexOf('\nA: ')
  if (idx >= 0) return content.slice(idx + 4).trim()
  return content.trim()
}

function readSalesFlow(metadata: Record<string, any>): SalesFlow {
  const raw = metadata?.salesFlow
  if (!raw || typeof raw !== 'object') return { ...INITIAL_SALES_FLOW }
  return {
    stage: raw.stage || 'idle',
    categoryId: raw.categoryId ?? null,
    offerId: raw.offerId ?? null,
    collected: raw.collected && typeof raw.collected === 'object' ? raw.collected : {},
    askedFor: Array.isArray(raw.askedFor) ? raw.askedFor : [],
    updatedAt: raw.updatedAt || new Date(0).toISOString(),
  }
}

// ─── Send Reply ────────────────────────────────────────────────

async function sendReply(input: TriggerInput, text: string, tag: string) {
  // 1. Find connected instance
  const instance = await db.whatsappInstance.findFirst({
    where: { tenantId: input.tenantId, status: 'connected' },
  })

  // 2. Find contact phone
  const contact = await db.contact.findUnique({ where: { id: input.contactId } })
  if (!contact) throw new Error('Contact not found')

  const phone = formatPhone(contact.phone)

  // 3. Save outbound message to DB
  const message = await db.message.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      direction: 'outbound',
      sender: 'ai',
      contentType: 'text',
      body: text,
      status: 'pending',
    },
  })

  // 4. Send via Evolution API if instance available
  if (instance?.instanceName) {
    try {
      const result = await evolutionAPI.sendText(instance.instanceName, phone, text)
      await db.message.update({
        where: { id: message.id },
        data: { status: 'sent', whatsappMsgId: result?.key?.id || null },
      })
      console.log(tag, 'Sent via WA, msgId:', result?.key?.id)
    } catch (err: any) {
      console.error(tag, 'WA send failed:', err.message)
      await db.message.update({ where: { id: message.id }, data: { status: 'failed' } })
    }
  } else {
    console.log(tag, 'No connected instance — message saved but not sent via WA')
    await db.message.update({ where: { id: message.id }, data: { status: 'delivered' } })
  }

  // 5. Update conversation
  await db.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: new Date() },
  })

  // 6. Publish SSE
  await publishSSE({
    type: 'message',
    tenantId: input.tenantId,
    data: { message },
  })
}

// ─── Logging ───────────────────────────────────────────────────

interface LogExtras {
  intent?: string | null
  confidence?: number
  decision?: string
  actionName?: string | null
  needsInfo?: string[]
  sourcesUsed?: string[]
  faqIdsUsed?: string[]
  chunkIdsUsed?: string[]
  retrievalType?: 'vector' | 'text' | 'none'
  similarityScores?: number[]
  faithfulnessPass?: boolean
  faithfulnessViolations?: string[]
  faithfulnessRetried?: boolean
  salesStage?: string
  salesSignal?: string
  shortCircuit?: 'faq' | null
  shortCircuitInfo?: {
    faqId: string
    similarity: number | null
    title: string | null
    reason: 'vector_high_sim' | 'text_exact_lexical' | null
    retrievalType: 'vector' | 'text' | 'none'
  } | null
}

async function logAIResult(
  input: TriggerInput,
  aiResult: AIResponse | null,
  replyText: string,
  status: 'success' | 'fallback' | 'error',
  errorMessage: string | null,
  packVersion: number | null,
  extras: LogExtras = {},
) {
  try {
    await db.aiLog.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        intent: extras.intent ?? null,
        confidence: extras.confidence ?? (status === 'success' ? 70 : status === 'fallback' ? 30 : 0),
        decision: extras.decision ?? (status === 'success' ? 'answer' : status === 'fallback' ? 'answer' : 'escalate'),
        actionName: extras.actionName ?? null,
        inputTokens: aiResult?.inputTokens || null,
        outputTokens: aiResult?.outputTokens || null,
        latencyMs: aiResult?.latencyMs || null,
        packVersion,
        sourcesUsed: extras.sourcesUsed || [],
        metadata: {
          status,
          model: aiResult?.model || null,
          errorMessage,
          replyLength: replyText.length,
          needsInfo: extras.needsInfo || [],
          faqIdsUsed: extras.faqIdsUsed || [],
          chunkIdsUsed: extras.chunkIdsUsed || [],
          knowledgeCount: (extras.faqIdsUsed?.length || 0) + (extras.chunkIdsUsed?.length || 0),
          retrievalType: extras.retrievalType || 'none',
          similarityScores: extras.similarityScores || [],
          faithfulnessPass: extras.faithfulnessPass ?? true,
          faithfulnessViolations: extras.faithfulnessViolations || [],
          faithfulnessRetried: extras.faithfulnessRetried ?? false,
          salesStage: extras.salesStage || null,
          salesSignal: extras.salesSignal || null,
          shortCircuit: extras.shortCircuit || null,
          shortCircuitInfo: extras.shortCircuitInfo || null,
        },
      },
    })

    // Log cost if tokens available
    if (aiResult?.inputTokens || aiResult?.outputTokens) {
      await db.costEvent.create({
        data: {
          tenantId: input.tenantId,
          eventType: 'ai_call',
          tokensInput: aiResult.inputTokens,
          tokensOutput: aiResult.outputTokens,
          estimatedCostUsd: (aiResult.inputTokens * 0.003 + aiResult.outputTokens * 0.015) / 1000,
          metadata: {
            model: aiResult.model,
            conversationId: input.conversationId,
            status,
          },
        },
      })
    }
  } catch (err: any) {
    console.error('[AI Log] Failed to save:', err.message)
  }
}

// ─── Phase 2: Policy & Decision Helpers ────────────────────────

interface PolicyOutcomeResult {
  handled: boolean
  replyText: string
  outcome: 'refuse' | 'escalate' | 'collect' | 'answer'
  actionName: string | null
}

async function handlePolicyOutcome(
  input: TriggerInput,
  policy: { outcome: string; responseOverride?: string; collectFields?: string[] },
  tag: string,
): Promise<PolicyOutcomeResult> {
  if (policy.outcome === 'block') {
    const text = policy.responseOverride || 'Bu konuda size yardimci olamiyorum.'
    await sendReply(input, text, tag)
    return { handled: true, replyText: text, outcome: 'refuse', actionName: null }
  }

  if (policy.outcome === 'escalate') {
    const text = policy.responseOverride || 'Sizi yetkili bir temsilcimize aktariyorum.'
    await sendReply(input, text, tag)
    // Handoff hook (prepared — real action engine will own this later)
    await db.conversation.update({
      where: { id: input.conversationId },
      data: { handlerType: 'human', aiEnabled: false },
    }).catch(() => {})
    return { handled: true, replyText: text, outcome: 'escalate', actionName: 'escalate_to_agent' }
  }

  if (policy.outcome === 'collect') {
    const fields = policy.collectFields || []
    const text = buildCollectPrompt(fields)
    await sendReply(input, text, tag)
    return { handled: true, replyText: text, outcome: 'collect', actionName: null }
  }

  // 'modify' outcomes apply only post-response — no pre-response handling needed
  return { handled: false, replyText: '', outcome: 'answer', actionName: null }
}

function buildCollectPrompt(fields: string[]): string {
  const labels: Record<string, string> = {
    name: 'adiniz',
    phone: 'telefon numaraniz',
    email: 'e-posta adresiniz',
    city: 'sehriniz',
    date: 'uygun tarih',
  }
  if (!fields.length) return 'Size daha iyi yardimci olabilmem icin birkac bilgiye ihtiyacim var. Adiniz ve iletisim bilginizi paylasir misiniz?'
  const list = fields.map(f => labels[f] || f).join(' ve ')
  return `Size yardimci olabilmem icin ${list} bilgisini paylasir misiniz?`
}

function resolveDecision(
  structured: StructuredAIResponse | null,
  status: 'success' | 'fallback' | 'error',
  actionHint: { name: string; params: Record<string, any> } | null,
  confidenceThreshold: number | undefined,
): string {
  if (status === 'error') return 'escalate'
  if (status === 'fallback') return 'answer'
  if (!structured) return 'answer'

  const threshold = confidenceThreshold ?? 60
  if (structured.confidence < threshold) return 'escalate'

  if (actionHint) {
    if (actionHint.name === 'escalate_to_agent') return 'escalate'
    return 'action'
  }

  if (structured.needs_info && structured.needs_info.length > 0) return 'collect'
  if (structured.intent === 'unclear' || structured.intent === 'off_topic') return 'ask'

  return 'answer'
}
