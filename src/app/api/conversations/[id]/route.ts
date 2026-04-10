import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { publishSSE } from '@/lib/sse'

// GET /api/conversations/[id]
export const GET = withAuth(async (req, { params, tenantId }) => {
  const conversation = await db.conversation.findFirst({
    where: { id: params.id, tenantId },
    include: {
      contact: true,
      agent: { select: { id: true, name: true, email: true } },
      instance: { select: { id: true, instanceName: true, status: true } },
    },
  })

  if (!conversation) return apiError('Not found', 404)

  // Reset unread count when viewed
  if (conversation.unreadCount > 0) {
    await db.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    })
  }

  return apiSuccess({ conversation })
})

// PATCH /api/conversations/[id] — update status, assignment, AI toggle
export const PATCH = withAuth(async (req, { params, tenantId }) => {
  const body = await parseBody<{
    status?: string
    assignedTo?: string | null
    aiEnabled?: boolean
    handlerType?: string
  }>(req)

  if (!body) return apiError('Request body required')

  const existing = await db.conversation.findFirst({
    where: { id: params.id, tenantId },
  })
  if (!existing) return apiError('Not found', 404)

  const data: any = {}
  if (body.status !== undefined) data.status = body.status
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo
  if (body.aiEnabled !== undefined) data.aiEnabled = body.aiEnabled
  if (body.handlerType !== undefined) data.handlerType = body.handlerType

  const updated = await db.conversation.update({
    where: { id: params.id },
    data,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
    },
  })

  await publishSSE({
    type: 'conversation_update',
    tenantId,
    data: { conversation: updated },
  })

  return apiSuccess({ conversation: updated })
})
