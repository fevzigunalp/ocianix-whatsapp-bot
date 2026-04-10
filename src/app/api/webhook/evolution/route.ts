import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis, tenantKey } from '@/lib/redis'
import { publishSSE } from '@/lib/sse'
import { formatPhone } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // === DEBUG: log every incoming webhook ===
    const event = body.event
    const instanceName = body.instance || body.instanceName || body.data?.instance
    console.log('[Webhook] ← event:', event, '| instance:', instanceName, '| keys:', Object.keys(body).join(','))

    if (!instanceName) {
      console.log('[Webhook] No instance name in payload. Full body keys:', JSON.stringify(Object.keys(body)))
      // Try to extract from nested data
      console.log('[Webhook] Body preview:', JSON.stringify(body).substring(0, 500))
      return NextResponse.json({ ok: true, skipped: 'no instance' })
    }

    // Find instance and tenant
    const instance = await db.whatsappInstance.findFirst({
      where: { instanceName },
    })
    if (!instance) {
      console.log('[Webhook] Instance not found in DB:', instanceName)
      return NextResponse.json({ error: 'Instance not found', instanceName }, { status: 404 })
    }

    const tenantId = instance.tenantId
    console.log('[Webhook] Matched tenant:', tenantId, '| instance DB id:', instance.id)

    switch (event) {
      case 'messages.upsert':
      case 'MESSAGES_UPSERT':
        await handleMessageUpsert(body.data || body, tenantId, instance.id)
        break

      case 'messages.update':
      case 'MESSAGES_UPDATE':
        await handleMessageUpdate(body.data || body, tenantId)
        break

      case 'connection.update':
      case 'CONNECTION_UPDATE':
        await handleConnectionUpdate(body.data || body, instance.id, tenantId)
        break

      case 'qrcode.updated':
      case 'QRCODE_UPDATED':
        await handleQrCodeUpdate(body.data || body, instance.id)
        break

      default:
        console.log('[Webhook] Unknown event:', event)
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[Webhook] Error:', error.message, error.stack?.split('\n')[1])
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function handleMessageUpsert(
  data: any,
  tenantId: string,
  instanceId: string
) {
  console.log('[Webhook:msg] Data type:', typeof data, Array.isArray(data) ? 'array' : 'object')
  console.log('[Webhook:msg] Data keys:', Object.keys(data || {}).join(','))
  console.log('[Webhook:msg] Data preview:', JSON.stringify(data).substring(0, 300))

  // v1.8.x sends array directly, v2.x sends {key, message, ...}
  // Also handle nested structures
  let msgs: any[] = []
  if (Array.isArray(data)) {
    msgs = data
  } else if (data?.messages && Array.isArray(data.messages)) {
    msgs = data.messages
  } else if (data?.key) {
    msgs = [data]
  } else if (data?.data) {
    // Double-nested
    return handleMessageUpsert(data.data, tenantId, instanceId)
  } else {
    console.log('[Webhook:msg] Cannot parse message structure')
    return
  }

  for (const msg of msgs) {
    console.log('[Webhook:msg] Processing msg keys:', Object.keys(msg).join(','))

    if (!msg?.key) {
      console.log('[Webhook:msg] No key in message, skipping')
      continue
    }

    const whatsappMsgId = msg.key.id
    const isFromMe = msg.key.fromMe
    const remoteJid = msg.key.remoteJid
    console.log('[Webhook:msg] msgId:', whatsappMsgId, '| fromMe:', isFromMe, '| jid:', remoteJid)

    if (!remoteJid || remoteJid === 'status@broadcast') {
      console.log('[Webhook:msg] Skipping: no jid or status broadcast')
      continue
    }

    if (!msg.message && !msg.body) {
      console.log('[Webhook:msg] No message content, skipping (might be receipt)')
      continue
    }

    // Idempotency check
    const idempotencyKey = tenantKey(tenantId, 'msg_idem', whatsappMsgId)
    const isNew = await redis.set(idempotencyKey, '1', 'EX', 3600, 'NX')
    if (!isNew) {
      console.log('[Webhook:msg] Duplicate, skipping:', whatsappMsgId)
      continue
    }

    // Extract phone number
    const phone = formatPhone(remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', ''))
    console.log('[Webhook:msg] Phone:', phone)

    // Extract message content
    const { body, contentType, mediaUrl } = extractMessageContent(msg.message || msg)
    console.log('[Webhook:msg] Content:', contentType, '| body:', body?.substring(0, 80))

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
    console.log('[Webhook:msg] Contact:', contact.id, contact.name || contact.phone)

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
      console.log('[Webhook:msg] Created conversation:', conversation.id)
    } else {
      console.log('[Webhook:msg] Found conversation:', conversation.id)
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
    console.log('[Webhook:msg] Stored message:', message.id, '| direction:', message.direction)

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
    console.log('[Webhook:msg] SSE published | DONE')
  }
}

async function handleMessageUpdate(data: any, tenantId: string) {
  const updates = Array.isArray(data) ? data : data?.messages || [data]

  for (const update of updates) {
    if (!update?.key?.id) continue
    const status = update.update?.status || update.status
    if (!status) continue

    const statusMap: Record<number, string> = { 0: 'pending', 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read' }
    const newStatus = statusMap[status]
    if (!newStatus) continue

    await db.message.updateMany({
      where: { whatsappMsgId: update.key.id, tenantId },
      data: { status: newStatus },
    })
  }
}

async function handleConnectionUpdate(data: any, instanceId: string, tenantId: string) {
  const state = data?.state || data?.status || data?.connection
  console.log('[Webhook:conn] State:', state, '| data:', JSON.stringify(data).substring(0, 200))

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
  console.log('[Webhook:conn] Instance updated to:', newStatus)
}

async function handleQrCodeUpdate(data: any, instanceId: string) {
  const qr = data?.qrcode || data?.qr
  if (qr) {
    await db.whatsappInstance.update({
      where: { id: instanceId },
      data: { qrCode: typeof qr === 'string' ? qr : JSON.stringify(qr) },
    })
  }
}

function extractMessageContent(message: any): {
  body: string | null
  contentType: string
  mediaUrl: string | null
} {
  if (!message) return { body: null, contentType: 'text', mediaUrl: null }
  if (message.conversation) return { body: message.conversation, contentType: 'text', mediaUrl: null }
  if (message.extendedTextMessage) return { body: message.extendedTextMessage.text, contentType: 'text', mediaUrl: null }
  if (message.imageMessage) return { body: message.imageMessage.caption || null, contentType: 'image', mediaUrl: message.imageMessage.url || null }
  if (message.videoMessage) return { body: message.videoMessage.caption || null, contentType: 'video', mediaUrl: message.videoMessage.url || null }
  if (message.audioMessage) return { body: null, contentType: 'audio', mediaUrl: message.audioMessage.url || null }
  if (message.documentMessage) return { body: message.documentMessage.fileName || null, contentType: 'document', mediaUrl: message.documentMessage.url || null }
  if (message.stickerMessage) return { body: null, contentType: 'sticker', mediaUrl: null }
  if (message.locationMessage) return { body: `${message.locationMessage.degreesLatitude},${message.locationMessage.degreesLongitude}`, contentType: 'location', mediaUrl: null }
  // v1.8.x might send body directly
  if (typeof message.body === 'string') return { body: message.body, contentType: 'text', mediaUrl: null }
  return { body: null, contentType: 'text', mediaUrl: null }
}
