/**
 * Human-handoff primitive.
 *
 * One public function — `performHandoff(tenantId, conversationId, reason)` —
 * is the single source of truth for "escalate this conversation to a human".
 * It flips the DB flags, stamps conversation.metadata.handoff, sets an
 * explicit `human_mode: true` bit (redundant but unambiguous for callers
 * that don't want to read three flags), and publishes an SSE notification.
 *
 * Plus `isHumanLocked(conversationId)` — a cheap read the responder uses
 * as its hard guard before touching anything AI-related.
 */

import { db } from '@/lib/db'
import { publishSSE } from '@/lib/sse'

export interface HandoffOptions {
  by?: 'system' | 'policy' | 'confidence' | 'faithfulness' | 'action' | 'manual'
  agentId?: string | null
}

export async function performHandoff(
  tenantId: string,
  conversationId: string,
  reason: string,
  opts: HandoffOptions = {},
  tag: string = '[handoff]',
): Promise<void> {
  const by = opts.by || 'system'
  const at = new Date().toISOString()
  console.log(tag, `HANDOFF: ${reason} (by=${by})`)

  try {
    const existing = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    })
    const merged = {
      ...(((existing?.metadata as Record<string, any>) || {})),
      handoff: { reason, at, by },
      human_mode: true,
    }
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        handlerType: 'human',
        aiEnabled: false,
        assignedTo: opts.agentId ?? null,
        metadata: merged as any,
      },
    })
  } catch (err: any) {
    console.error(tag, 'Handoff DB update failed:', err.message)
  }

  try {
    await publishSSE({
      type: 'notification',
      tenantId,
      data: { kind: 'handoff', conversationId, reason, at, by },
    })
  } catch (err: any) {
    console.error(tag, 'Handoff SSE failed:', err.message)
  }
}

/**
 * Strict read-side guard. Returns reasons if the conversation is locked
 * against AI handling; returns null if AI may proceed. Used by the
 * responder as the very first check.
 */
export async function isHumanLocked(conversationId: string): Promise<string | null> {
  const c = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { handlerType: true, aiEnabled: true, status: true, metadata: true },
  })
  if (!c) return 'conversation_not_found'
  if (c.handlerType === 'human') return 'handler_type_human'
  if (c.aiEnabled === false) return 'ai_enabled_false'
  if (c.status === 'resolved' || c.status === 'closed') return `status_${c.status}`
  const meta = (c.metadata as Record<string, any>) || {}
  if (meta.human_mode === true) return 'metadata_human_mode'
  return null
}
