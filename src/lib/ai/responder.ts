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
import { buildSystemPrompt, buildMessages } from './prompt-builder'
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

    // 5. Build prompt
    const systemPrompt = buildSystemPrompt(context.pack, context.conversation)
    const messages = buildMessages(context.conversation, input.messageBody)

    // 6. Call AI
    const aiResult = await callAI(systemPrompt, messages)

    let replyText: string
    let status: 'success' | 'fallback' | 'error'
    let errorMsg: string | null = null

    if (aiResult && aiResult.text.trim()) {
      replyText = aiResult.text.trim()
      status = 'success'
      console.log(tag, 'AI replied:', replyText.substring(0, 80))
    } else {
      replyText = FALLBACK_REPLY
      status = aiResult ? 'fallback' : 'error'
      errorMsg = aiResult ? 'Empty AI response' : 'AI provider unavailable'
      console.log(tag, 'Using fallback:', errorMsg)
    }

    // 7. Send reply via existing outbound pipeline
    await sendReply(input, replyText, tag)

    // 8. Log
    await logAIResult(input, aiResult, replyText, status, errorMsg, context.packVersion)

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
    } : null,
    conversation: {
      contactName: contact?.name || null,
      contactPhone: contact?.phone || '',
      recentMessages,
    },
    packVersion: pack?.version || null,
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

async function logAIResult(
  input: TriggerInput,
  aiResult: AIResponse | null,
  replyText: string,
  status: 'success' | 'fallback' | 'error',
  errorMessage: string | null,
  packVersion: number | null,
) {
  try {
    await db.aiLog.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        intent: null, // v1 doesn't classify intent
        confidence: status === 'success' ? 80 : status === 'fallback' ? 30 : 0,
        decision: status === 'success' ? 'answer' : status === 'fallback' ? 'answer' : 'escalate',
        actionName: null,
        inputTokens: aiResult?.inputTokens || null,
        outputTokens: aiResult?.outputTokens || null,
        latencyMs: aiResult?.latencyMs || null,
        packVersion,
        sourcesUsed: [],
        metadata: {
          status,
          model: aiResult?.model || null,
          errorMessage,
          replyLength: replyText.length,
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
