import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { evolutionAPI } from '@/lib/evolution'
import { publishSSE } from '@/lib/sse'
import { withAuth, apiSuccess, apiError, parseBody, parseQuery } from '@/lib/api/middleware'
import { formatPhone } from '@/lib/utils'

// GET /api/messages?conversationId=xxx
export const GET = withAuth(async (req, { tenantId }) => {
  const query = parseQuery(req)
  const conversationId = query.get('conversationId')

  if (!conversationId) return apiError('conversationId required')

  const { page, limit, skip } = query.getPage()

  const [messages, total] = await Promise.all([
    db.message.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.message.count({ where: { tenantId, conversationId } }),
  ])

  return apiSuccess({ messages: messages.reverse(), total, page, limit })
})

// POST /api/messages — send a message
export const POST = withAuth(async (req, { tenantId, userId }) => {
  const body = await parseBody<{
    conversationId: string
    body: string
    contentType?: string
    isInternal?: boolean
  }>(req)

  if (!body?.conversationId || !body?.body) {
    return apiError('conversationId and body required')
  }

  // Get conversation with contact and instance
  const conversation = await db.conversation.findFirst({
    where: { id: body.conversationId, tenantId },
    include: {
      contact: true,
      instance: true,
    },
  })

  if (!conversation) return apiError('Conversation not found', 404)

  // For internal notes, just save to DB
  if (body.isInternal) {
    const message = await db.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: 'outbound',
        sender: 'agent',
        contentType: 'text',
        body: body.body,
        isInternal: true,
        status: 'delivered',
      },
    })

    await publishSSE({
      type: 'message',
      tenantId,
      data: { message },
    })

    return apiSuccess({ message })
  }

  // Send via WhatsApp
  const instanceName = conversation.instance?.instanceName
  if (!instanceName) return apiError('No WhatsApp instance connected')

  const phone = formatPhone(conversation.contact.phone)

  // Create message in DB first (pending)
  const message = await db.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      direction: 'outbound',
      sender: 'agent',
      contentType: body.contentType || 'text',
      body: body.body,
      status: 'pending',
    },
  })

  try {
    // Send via Evolution API
    const result = await evolutionAPI.sendText(instanceName, phone, body.body)

    // Update message status
    await db.message.update({
      where: { id: message.id },
      data: {
        status: 'sent',
        whatsappMsgId: result?.key?.id || null,
      },
    })

    // Update conversation
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    })

    // Publish SSE
    await publishSSE({
      type: 'message',
      tenantId,
      data: {
        message: { ...message, status: 'sent', whatsappMsgId: result?.key?.id },
      },
    })

    return apiSuccess({ message: { ...message, status: 'sent' } })
  } catch (error: any) {
    // Update message as failed
    await db.message.update({
      where: { id: message.id },
      data: { status: 'failed' },
    })

    return apiError(`Failed to send: ${error.message}`, 500)
  }
})
