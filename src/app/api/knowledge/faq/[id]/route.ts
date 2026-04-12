import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { embedFaq } from '@/lib/ai/embedding'

export const PATCH = withAuth(async (req, { tenantId, params }) => {
  const id = params.id
  const body = await parseBody<{
    question?: string
    answer?: string
    category?: string | null
    isActive?: boolean
  }>(req)
  if (!body) return apiError('body required')

  const existing = await db.faqPair.findFirst({ where: { id, tenantId } })
  if (!existing) return apiError('not found', 404)

  const updated = await db.faqPair.update({
    where: { id },
    data: {
      question: body.question ?? existing.question,
      answer: body.answer ?? existing.answer,
      category: body.category ?? existing.category,
      isActive: body.isActive ?? existing.isActive,
    },
  })

  const textChanged =
    (body.question !== undefined && body.question !== existing.question) ||
    (body.answer !== undefined && body.answer !== existing.answer)
  if (textChanged) {
    embedFaq(updated.id, updated.question, updated.answer).catch(err =>
      console.error('[FAQ] re-embed failed:', err.message)
    )
  }

  return apiSuccess({ faq: updated })
})

export const DELETE = withAuth(async (_req, { tenantId, params }) => {
  const id = params.id
  const existing = await db.faqPair.findFirst({ where: { id, tenantId } })
  if (!existing) return apiError('not found', 404)
  await db.faqPair.delete({ where: { id } })
  return apiSuccess({ deleted: true })
})
