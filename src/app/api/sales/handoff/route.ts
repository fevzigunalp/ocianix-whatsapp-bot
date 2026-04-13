/**
 * POST /api/sales/handoff
 *
 * Manual human takeover. Flips the given conversation to human-mode
 * via the shared handoff primitive. Used by dashboards / agent UI.
 *
 * Request:
 *   { conversationId: string, reason?: string }
 */

import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { db } from '@/lib/db'
import { performHandoff, isHumanLocked } from '@/lib/ai/handoff'

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{ conversationId: string; reason?: string }>(req)
  if (!body?.conversationId) return apiError('conversationId required')

  // Confirm conversation belongs to the caller's tenant (multi-tenant safety)
  const convo = await db.conversation.findFirst({
    where: { id: body.conversationId, tenantId },
    select: { id: true, handlerType: true, aiEnabled: true },
  })
  if (!convo) return apiError('conversation not found', 404)

  const reason = body.reason || 'manual_takeover'
  await performHandoff(tenantId, convo.id, reason, { by: 'manual' }, '[api:handoff]')

  const locked = await isHumanLocked(convo.id)
  return apiSuccess({
    conversationId: convo.id,
    handoffReason: reason,
    humanLocked: !!locked,
    lockSignal: locked,
  })
})
