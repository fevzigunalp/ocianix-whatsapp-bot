import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    contactId: string
    stageId: string
    title: string
    value?: number
    currency?: string
  }>(req)

  if (!body?.contactId || !body?.stageId || !body?.title) {
    return apiError('contactId, stageId, and title required')
  }

  const deal = await db.deal.create({
    data: {
      tenantId,
      contactId: body.contactId,
      stageId: body.stageId,
      title: body.title,
      value: body.value || 0,
      currency: body.currency || 'TRY',
    },
  })

  return apiSuccess({ deal }, 201)
})
