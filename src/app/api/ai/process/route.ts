import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processMessage } from '@/lib/ai/engines/decision-engine'
import { evolutionAPI } from '@/lib/evolution'
import { publishSSE } from '@/lib/sse'
import { formatPhone } from '@/lib/utils'

/**
 * POST /api/ai/process
 * Called by webhook handler or n8n workflow to process an inbound message through the AI pipeline.
 * Expects: { tenantId, conversationId, contactId, messageId, message }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tenantId, conversationId, contactId, messageId, message } = body

    if (!tenantId || !conversationId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Load conversation history (last 10 messages)
    const history = await db.message.findMany({
      where: { conversationId, isInternal: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    const conversationHistory = history.reverse().map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body || '',
    }))

    // Run through Decision Engine
    const decision = await processMessage({
      tenantId,
      conversationId,
      contactId,
      messageId,
      message,
      conversationHistory,
    })

    // Save AI response as message
    const aiMessage = await db.message.create({
      data: {
        tenantId,
        conversationId,
        direction: 'outbound',
        sender: 'ai',
        contentType: 'text',
        body: decision.responseText,
        status: 'pending',
        metadata: {
          intent: decision.intent,
          confidence: decision.confidence,
          decision: decision.decision,
        },
      },
    })

    // Send via WhatsApp
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId },
      include: { contact: true, instance: true },
    })

    if (conversation?.instance?.instanceName && conversation.contact) {
      try {
        const result = await evolutionAPI.sendText(
          conversation.instance.instanceName,
          formatPhone(conversation.contact.phone),
          decision.responseText
        )

        await db.message.update({
          where: { id: aiMessage.id },
          data: {
            status: 'sent',
            whatsappMsgId: result?.key?.id || null,
          },
        })
      } catch (err) {
        console.error('[AI Process] Failed to send via WhatsApp:', err)
        await db.message.update({
          where: { id: aiMessage.id },
          data: { status: 'failed' },
        })
      }
    }

    // Handle escalation
    if (decision.decision === 'escalate') {
      await db.conversation.update({
        where: { id: conversationId },
        data: {
          aiEnabled: false,
          handlerType: 'human',
          status: 'pending',
        },
      })
    }

    // Update conversation timestamp
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    })

    // Publish SSE
    await publishSSE({
      type: 'message',
      tenantId,
      data: { message: aiMessage },
    })

    return NextResponse.json({
      success: true,
      data: {
        decision: decision.decision,
        confidence: decision.confidence,
        intent: decision.intent,
        messageId: aiMessage.id,
      },
    })
  } catch (error: any) {
    console.error('[AI Process] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
