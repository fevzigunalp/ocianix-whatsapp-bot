import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'

export const PATCH = withAuth(async (req, { params, tenantId }) => {
  const body = await parseBody<{
    stageId?: string
    status?: string
    value?: number
    title?: string
  }>(req)

  if (!body) return apiError('Body required')

  const existing = await db.deal.findFirst({ where: { id: params.id, tenantId } })
  if (!existing) return apiError('Not found', 404)

  const data: any = { ...body }
  if (body.status === 'won' || body.status === 'lost') {
    data.closedAt = new Date()
  }

  const deal = await db.deal.update({
    where: { id: params.id },
    data,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      stage: { select: { name: true, color: true } },
    },
  })

  return apiSuccess({ deal })
})
