import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis, tenantKey } from '@/lib/redis'
import { publishSSE } from '@/lib/sse'
import { formatPhone } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const event = body.event
    const instanceName = body.instance

    // Find instance and tenant
    const instance = await db.whatsappInstance.findFirst({
      where: { instanceName },
    })
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    const tenantId = instance.tenantId

    switch (event) {
      case 'messages.upsert':
        await handleMessageUpsert(body.data, tenantId, instance.id)
        break

      case 'messages.update':
        await handleMessageUpdate(body.data, tenantId)
        break

      case 'connection.update':
        await handleConnectionUpdate(body.data, instance.id, tenantId)
        break

      case 'qrcode.updated':
        await handleQrCodeUpdate(body.data, instance.id)
        break
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function handleMessageUpsert(
  data: any,
  tenantId: string,
  instanceId: string
) {
  const msg = Array.isArray(data) ? data[0] : data
  if (!msg?.key || !msg?.message) return

  const whatsappMsgId = msg.key.id
  const isFromMe = msg.key.fromMe
  const remoteJid = msg.key.remoteJid
  if (!remoteJid || remoteJid === 'status@broadcast') return

  // Idempotency check
  const idempotencyKey = tenantKey(tenantId, 'msg_idem', whatsappMsgId)
  const exists = await redis.set(idempotencyKey, '1', 'EX', 3600, 'NX')
  if (!exists) return // Already processed

  // Extract phone number
  const phone = formatPhone(remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', ''))

  // Extract message content
  const { body, contentType, mediaUrl } = extractMessageContent(msg.message)

  // Upsert contact
  const contact = await db.contact.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    update: {
      lastSeenAt: new Date(),
      name: msg.pushName || undefined,
    },
    create: {
      tenantId,
      phone,
      name: msg.pushName || null,
    },
  })

  // Find or create conversation
  let conversation = await db.conversation.findFirst({
    where: {
      tenantId,
      contactId: contact.id,
      status: { in: ['open', 'pending'] },
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        tenantId,
        contactId: contact.id,
        instanceId,
        status: 'open',
        handlerType: 'ai',
        aiEnabled: true,
      },
    })
  }

  // Store message
  const message = await db.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      direction: isFromMe ? 'outbound' : 'inbound',
      sender: isFromMe ? 'ai' : 'customer',
      contentType,
      body,
      mediaUrl,
      whatsappMsgId,
      status: 'delivered',
    },
  })

  // Update conversation
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      unreadCount: isFromMe ? undefined : { increment: 1 },
    },
  })

  // Publish SSE event
  await publishSSE({
    type: 'message',
    tenantId,
    data: {
      message: {
        ...message,
        conversation: { id: conversation.id, contactId: contact.id },
        contact: { id: contact.id, name: contact.name, phone: contact.phone },
      },
    },
  })

  // If inbound message and AI enabled, trigger AI processing
  if (!isFromMe && conversation.aiEnabled) {
    await publishSSE({
      type: 'notification',
      tenantId,
      data: {
        type: 'ai_processing',
        conversationId: conversation.id,
        messageId: message.id,
      },
    })
    // AI processing will be handled by the n8n workflow or direct API call (Phase 5)
  }
}

async function handleMessageUpdate(data: any, tenantId: string) {
  const updates = Array.isArray(data) ? data : [data]

  for (const update of updates) {
    if (!update?.key?.id) continue

    const status = update.update?.status
    if (!status) continue

    const statusMap: Record<number, string> = {
      0: 'pending',
      1: 'sent',
      2: 'delivered',
      3: 'read',
      4: 'read',
    }

    const newStatus = statusMap[status]
    if (!newStatus) continue

    await db.message.updateMany({
      where: { whatsappMsgId: update.key.id, tenantId },
      data: { status: newStatus },
    })

    await publishSSE({
      type: 'status_update',
      tenantId,
      data: { whatsappMsgId: update.key.id, status: newStatus },
    })
  }
}

async function handleConnectionUpdate(data: any, instanceId: string, tenantId: string) {
  const state = data?.state || data?.status
  const statusMap: Record<string, string> = {
    open: 'connected',
    close: 'disconnected',
    connecting: 'connecting',
  }
  const newStatus = statusMap[state] || 'disconnected'

  await db.whatsappInstance.update({
    where: { id: instanceId },
    data: {
      status: newStatus,
      lastConnectedAt: newStatus === 'connected' ? new Date() : undefined,
    },
  })

  await publishSSE({
    type: 'notification',
    tenantId,
    data: { type: 'connection_update', instanceId, status: newStatus },
  })
}

async function handleQrCodeUpdate(data: any, instanceId: string) {
  if (data?.qrcode) {
    await db.whatsappInstance.update({
      where: { id: instanceId },
      data: { qrCode: data.qrcode },
    })
  }
}

function extractMessageContent(message: any): {
  body: string | null
  contentType: string
  mediaUrl: string | null
} {
  if (message.conversation) {
    return { body: message.conversation, contentType: 'text', mediaUrl: null }
  }
  if (message.extendedTextMessage) {
    return { body: message.extendedTextMessage.text, contentType: 'text', mediaUrl: null }
  }
  if (message.imageMessage) {
    return {
      body: message.imageMessage.caption || null,
      contentType: 'image',
      mediaUrl: message.imageMessage.url || null,
    }
  }
  if (message.videoMessage) {
    return {
      body: message.videoMessage.caption || null,
      contentType: 'video',
      mediaUrl: message.videoMessage.url || null,
    }
  }
  if (message.audioMessage) {
    return { body: null, contentType: 'audio', mediaUrl: message.audioMessage.url || null }
  }
  if (message.documentMessage) {
    return {
      body: message.documentMessage.fileName || null,
      contentType: 'document',
      mediaUrl: message.documentMessage.url || null,
    }
  }
  if (message.stickerMessage) {
    return { body: null, contentType: 'sticker', mediaUrl: null }
  }
  if (message.locationMessage) {
    return {
      body: `${message.locationMessage.degreesLatitude},${message.locationMessage.degreesLongitude}`,
      contentType: 'location',
      mediaUrl: null,
    }
  }
  return { body: null, contentType: 'text', mediaUrl: null }
}
