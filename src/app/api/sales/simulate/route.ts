/**
 * POST /api/sales/simulate
 *
 * Simulates an inbound customer message on an existing conversation and
 * runs it through the real `triggerAIResponse` pipeline. Used to verify
 * that the Phase 6 human-lock guard actually blocks AI processing when
 * a conversation is in human-mode.
 *
 * Writes the message to DB (direction=inbound, sender=customer), invokes
 * the responder, and returns whether the AI produced an outbound reply.
 *
 * Request:
 *   { conversationId: string, message: string }
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       humanLocked: "handler_type_human" | null,
 *       aiRan: boolean,
 *       inboundMessageId: string,
 *       aiReplyMessageId: string | null,
 *       aiReplyText: string | null,
 *       conversationHandlerType: "ai" | "human",
 *     }
 *   }
 */

import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { db } from '@/lib/db'
import { triggerAIResponse } from '@/lib/ai/responder'
import { isHumanLocked } from '@/lib/ai/handoff'

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{ conversationId: string; message: string }>(req)
  if (!body?.conversationId || !body?.message?.trim()) {
    return apiError('conversationId and message required')
  }

  const convo = await db.conversation.findFirst({
    where: { id: body.conversationId, tenantId },
    select: { id: true, contactId: true, instanceId: true, handlerType: true, aiEnabled: true },
  })
  if (!convo) return apiError('conversation not found', 404)

  const lockBefore = await isHumanLocked(convo.id)

  // Store inbound message like webhook would
  const inbound = await db.message.create({
    data: {
      tenantId,
      conversationId: convo.id,
      contactId: convo.contactId,
      direction: 'inbound',
      sender: 'customer',
      contentType: 'text',
      body: body.message,
      status: 'delivered',
    },
  })

  // Count outbound messages BEFORE we call the responder
  const outboundBefore = await db.message.count({
    where: { conversationId: convo.id, direction: 'outbound' },
  })

  // Run responder synchronously (normally webhook fires it async)
  await triggerAIResponse({
    tenantId,
    conversationId: convo.id,
    contactId: convo.contactId,
    messageId: inbound.id,
    messageBody: body.message,
    instanceId: convo.instanceId ?? '',
  })

  const newReply = await db.message.findFirst({
    where: { conversationId: convo.id, direction: 'outbound', createdAt: { gte: inbound.createdAt } },
    orderBy: { createdAt: 'desc' },
  })
  const outboundAfter = await db.message.count({
    where: { conversationId: convo.id, direction: 'outbound' },
  })
  const aiRan = outboundAfter > outboundBefore

  const after = await db.conversation.findUnique({
    where: { id: convo.id },
    select: { handlerType: true, aiEnabled: true },
  })

  return apiSuccess({
    humanLockedBefore: lockBefore,
    aiRan,
    inboundMessageId: inbound.id,
    aiReplyMessageId: newReply?.id ?? null,
    aiReplyText: newReply?.body ?? null,
    conversationHandlerType: after?.handlerType ?? 'unknown',
    conversationAiEnabled: after?.aiEnabled ?? null,
  })
})
