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
    db.message.findMany({ where: { tenantId, conversationId }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    db.message.count({ where: { tenantId, conversationId } }),
  ])

  return apiSuccess({ messages: messages.reverse(), total, page, limit })
})

// POST /api/messages — send a message
export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    conversationId: string
    body: string
    contentType?: string
    isInternal?: boolean
  }>(req)

  if (!body?.conversationId || !body?.body) return apiError('conversationId and body required')

  const conversation = await db.conversation.findFirst({
    where: { id: body.conversationId, tenantId },
    include: { contact: true, instance: true },
  })
  if (!conversation) return apiError('Conversation not found', 404)

  // Internal notes — just save
  if (body.isInternal) {
    const message = await db.message.create({
      data: {
        tenantId, conversationId: conversation.id,
        direction: 'outbound', sender: 'agent', contentType: 'text',
        body: body.body, isInternal: true, status: 'delivered',
      },
    })
    await publishSSE({ type: 'message', tenantId, data: { message } })
    return apiSuccess({ message })
  }

  // Resolve WhatsApp instance — use conversation's instance, or tenant's connected instance
  let instanceName = conversation.instance?.instanceName
  if (!instanceName) {
    const connectedInstance = await db.whatsappInstance.findFirst({
      where: { tenantId, status: 'connected' },
    })
    if (connectedInstance) {
      instanceName = connectedInstance.instanceName
      // Link conversation to this instance
      await db.conversation.update({
        where: { id: conversation.id },
        data: { instanceId: connectedInstance.id },
      })
      console.log('[Messages] Linked conversation to instance:', instanceName)
    }
  }

  if (!instanceName) return apiError('No connected WhatsApp instance')

  const phone = formatPhone(conversation.contact.phone)
  console.log('[Messages] Sending to', phone, 'via', instanceName)

  // Create pending message
  const message = await db.message.create({
    data: {
      tenantId, conversationId: conversation.id,
      direction: 'outbound', sender: 'agent',
      contentType: body.contentType || 'text',
      body: body.body, status: 'pending',
    },
  })

  try {
    const result = await evolutionAPI.sendText(instanceName, phone, body.body)
    console.log('[Messages] Sent OK, waId:', result?.key?.id)

    await db.message.update({
      where: { id: message.id },
      data: { status: 'sent', whatsappMsgId: result?.key?.id || null },
    })

    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    })

    await publishSSE({
      type: 'message', tenantId,
      data: { message: { ...message, status: 'sent', whatsappMsgId: result?.key?.id } },
    })

    return apiSuccess({ message: { ...message, status: 'sent' } })
  } catch (error: any) {
    console.error('[Messages] Send failed:', error.message)
    await db.message.update({ where: { id: message.id }, data: { status: 'failed' } })
    return apiError(`Failed to send: ${error.message}`, 500)
  }
})
