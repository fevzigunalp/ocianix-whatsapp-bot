import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { params, tenantId }) => {
  const contact = await db.contact.findFirst({
    where: { id: params.id, tenantId },
    include: {
      conversations: {
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
      deals: {
        include: { stage: { select: { name: true, color: true } } },
      },
      tasks: { orderBy: { createdAt: 'desc' }, take: 5 },
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { author: { select: { name: true } } },
      },
    },
  })

  if (!contact) return apiError('Not found', 404)
  return apiSuccess({ contact })
})

export const PATCH = withAuth(async (req, { params, tenantId }) => {
  const body = await parseBody<{
    name?: string
    email?: string
    tags?: string[]
    metadata?: Record<string, any>
  }>(req)

  if (!body) return apiError('Body required')

  const existing = await db.contact.findFirst({ where: { id: params.id, tenantId } })
  if (!existing) return apiError('Not found', 404)

  const updated = await db.contact.update({
    where: { id: params.id },
    data: body,
  })

  return apiSuccess({ contact: updated })
})
